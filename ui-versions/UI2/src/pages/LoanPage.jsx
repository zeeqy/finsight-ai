import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { ChevronDown, Loader2, Trash2 } from 'lucide-react';
import PageHero from '../components/ui/PageHero';
import Stamp from '../components/ui/Stamp';
import { Money, RollingText } from '../components/ui/RollingNumber';
import { Reveal } from '../components/ui/Reveal';
import { Empty, Field, Meter, Notice, Segmented } from '../components/ui/Controls';
import { useConfirm } from '../components/ui/Modal';
import { CHART, kFormat } from '../components/ui/chartTheme';
import { EASE } from '../lib/motion';

const fmtRM = (n) =>
  `RM ${Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtRM0 = (n) => `RM ${Number(n || 0).toLocaleString('en-MY', { maximumFractionDigits: 0 })}`;

const LOAN_TYPES = [
  { value: 'personal', label: 'Personal' },
  { value: 'car', label: 'Car (hire purchase)' },
  { value: 'house', label: 'House' },
];

const DOWN_PAYMENT_CHOICES = [0, 10, 20, 30].map((p) => ({ value: p, label: `${p}%` }));

const COMMITMENT_LABELS = {
  car_loan: 'Car loan',
  house_loan: 'House loan',
  ptptn: 'PTPTN',
  credit_card: 'Credit card',
  personal_loan: 'Personal loan',
  other: 'Other',
};

const EMPLOYMENT_LABELS = {
  permanent: 'Permanent',
  contract: 'Contract',
  self_employed: 'Self-employed',
  gig: 'Gig / freelance',
};

const METHOD_NOTES = {
  flat: 'Flat rate interest: charged on the full original amount for the whole tenure.',
  reducing: 'Reducing balance interest: charged on what you still owe, so it falls as you repay.',
};

const LEVEL_TAGS = {
  Healthy: 'tag-ok',
  Moderate: 'tag-warn',
  High: 'tag-danger',
  Low: 'tag-ok',
  Medium: 'tag-warn',
  Affordable: 'tag-ok',
  Caution: 'tag-warn',
  'Not Recommended': 'tag-danger',
};

const VERDICT_TONES = { Affordable: 'ok', Caution: 'warn', 'Not Recommended': 'danger' };

const sentenceCase = (s) => s.charAt(0) + s.slice(1).toLowerCase();

function LevelTag({ value, suffix = '' }) {
  if (!value) return null;
  return <span className={`tag ${LEVEL_TAGS[value] || 'tag-plain'}`}>{`${sentenceCase(value)}${suffix}`}</span>;
}

/** Opens and closes by height. Goes inside AnimatePresence when it also has to close smoothly. */
function Slide({ children, className = '' }) {
  return (
    <m.div
      className={`overflow-hidden ${className}`}
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
    >
      {children}
    </m.div>
  );
}

/** Meter with the band edges drawn on the track and named underneath. The dark mark is the bank limit. */
function DsrMeter({ dsr, band, bands, limit }) {
  const { healthyMax, moderateMax } = bands;
  const tone = dsr <= healthyMax ? 'ok' : dsr <= moderateMax ? 'warn' : 'danger';
  const ticks = [0, healthyMax, moderateMax, limit, 100];
  const names = ['Healthy', 'Moderate', 'High'];
  return (
    <div>
      <div className="relative">
        <Meter value={Math.min(100, Math.max(0, dsr || 0))} marker={limit} tone={tone} height="h-3" label="Debt service ratio after this loan" />
        {[healthyMax, moderateMax].map((edge) => (
          <span key={edge} className="absolute -top-0.5 -bottom-0.5 w-px bg-line-strong" style={{ left: `${edge}%` }} aria-hidden="true" />
        ))}
      </div>
      <div className="relative h-5 mt-1.5 t-note num">
        {ticks.map((t) => (
          <span
            key={t}
            className="absolute"
            style={{ left: `${t}%`, transform: `translateX(${t === 0 ? '0' : t === 100 ? '-100%' : '-50%'})` }}
          >
            {t}%
          </span>
        ))}
      </div>
      <div
        className="grid t-note"
        style={{ gridTemplateColumns: `${healthyMax}fr ${moderateMax - healthyMax}fr ${100 - moderateMax}fr` }}
      >
        {names.map((name) => (
          <span key={name} className={name === band ? 'font-bold text-ink' : ''}>
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}

function RepaymentChart({ schedule }) {
  return (
    <section aria-labelledby="repayment-title" className="min-w-0">
      <h2 id="repayment-title" className="t-section">
        How does the balance fall?
      </h2>
      <p className="t-note mt-1 mb-4">
        Bars show what you pay each year, on the left scale. The line shows what is left to pay, on the right scale.
      </p>
      <div role="img" aria-label="Repayment schedule by year: principal, interest and remaining balance">
        <ResponsiveContainer width="100%" height={288}>
          <ComposedChart data={schedule} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={CHART.grid} vertical={false} />
            <XAxis dataKey="year" tick={CHART.tick} axisLine={CHART.axisLine} tickLine={false} />
            <YAxis yAxisId="left" tick={CHART.tick} axisLine={false} tickLine={false} width={44} tickFormatter={kFormat} />
            <YAxis yAxisId="right" orientation="right" tick={CHART.tick} axisLine={false} tickLine={false} width={44} tickFormatter={kFormat} />
            <Tooltip
              cursor={CHART.cursor}
              {...CHART.tooltip}
              labelFormatter={(y) => `Year ${y}`}
              formatter={(v, name) => [fmtRM(v), name]}
            />
            <Legend wrapperStyle={CHART.legend} iconType="square" iconSize={10} />
            <Bar yAxisId="left" dataKey="principal_paid" name="Principal" stackId="a" fill={CHART.gold} maxBarSize={40} {...CHART.animation} />
            <Bar
              yAxisId="left"
              dataKey="interest_paid"
              name="Interest"
              stackId="a"
              fill={CHART.ink}
              fillOpacity={0.75}
              radius={[3, 3, 0, 0]}
              maxBarSize={40}
              {...CHART.animation}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="remaining_balance"
              name="Remaining balance"
              stroke={CHART.jade}
              strokeWidth={2.5}
              dot={false}
              {...CHART.animation}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function ScoreDrivers({ factors }) {
  return (
    <section aria-labelledby="drivers-title">
      <h2 id="drivers-title" className="t-section">
        What drove the score?
      </h2>
      <p className="t-note mt-1">A plus raises the score, a minus lowers it.</p>
      <ul className="mt-3 space-y-2.5">
        {factors.map((f) => (
          <li key={f.feature} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_3.25rem] items-center gap-2.5 text-sm">
            <span>{f.feature}</span>
            <Meter value={Math.min(100, Math.abs(f.impact) * 60)} tone={f.impact > 0 ? 'danger' : 'ok'} label={`${f.feature} effect on the score`} />
            <span className={`num text-right font-semibold ${f.impact > 0 ? 'text-danger' : 'text-jade'}`}>
              {f.impact > 0 ? '+' : ''}
              {f.impact}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HistoryTable({ history, onDelete }) {
  return (
    <Reveal>
      <section aria-labelledby="history-title">
        <h2 id="history-title" className="t-section mb-4">
          Past assessments
        </h2>
        <div className="sheet overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-ink-3 text-[0.8125rem]">
                <th scope="col" className="py-2.5 pl-4 pr-3 font-medium">Date</th>
                <th scope="col" className="py-2.5 pr-3 font-medium">Type</th>
                <th scope="col" className="py-2.5 pr-3 text-right font-medium">Loan</th>
                <th scope="col" className="py-2.5 pr-3 text-right font-medium">Monthly</th>
                <th scope="col" className="py-2.5 pr-3 text-right font-medium">DSR</th>
                <th scope="col" className="py-2.5 pr-3 text-right font-medium">Default probability</th>
                <th scope="col" className="py-2.5 pr-3 font-medium">Verdict</th>
                <th scope="col" className="py-2.5 pr-2 w-12"><span className="sr-only">Delete</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              <AnimatePresence initial={false}>
                {history.map((h) => (
                  <m.tr key={h.id} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.25, ease: EASE }}>
                    <td className="py-1.5 pl-4 pr-3 num whitespace-nowrap">{new Date(h.predicted_at).toLocaleDateString('en-MY')}</td>
                    <td className="py-1.5 pr-3 capitalize">{h.loan_type}</td>
                    <td className="py-1.5 pr-3 text-right num whitespace-nowrap">{fmtRM0(h.loan_amount)}</td>
                    <td className="py-1.5 pr-3 text-right num whitespace-nowrap">{fmtRM(h.monthly_instalment)}</td>
                    <td className="py-1.5 pr-3 text-right num">{Number(h.dsr).toFixed(1)}%</td>
                    <td className="py-1.5 pr-3 text-right num">
                      {h.default_probability !== null ? `${(h.default_probability * 100).toFixed(1)}%` : '-'}
                    </td>
                    <td className="py-1.5 pr-3">
                      <LevelTag value={h.overall_verdict} />
                    </td>
                    <td className="py-1.5 pr-2 text-right">
                      <button
                        type="button"
                        onClick={() => onDelete(h.id)}
                        className="btn btn-icon btn-sm !min-w-9 hover:!text-danger hover:!bg-danger-wash"
                        aria-label="Delete this assessment"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </td>
                  </m.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </section>
    </Reveal>
  );
}

export default function LoanPage() {
  const { user, authFetch } = useAuth();
  const confirm = useConfirm();
  const [config, setConfig] = useState(null);
  const [form, setForm] = useState({
    loan_type: 'car',
    item_price: '80000',
    down_payment: '8000',
    loan_amount: '20000',
    interest_rate: '3',
    tenure_years: '9',
    monthly_income: '',
    employment_type: 'permanent',
    years_employed: '2',
    dependants: '0',
    age: '',
  });
  const [commitments, setCommitments] = useState({});
  const [showCommitments, setShowCommitments] = useState(true);
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState('');
  const [assessment, setAssessment] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessError, setAssessError] = useState('');
  const [history, setHistory] = useState([]);
  const debounceRef = useRef(null);

  const loadHistory = useCallback(async () => {
    try {
      const res = await authFetch('/api/loan/history');
      const data = await res.json();
      if (data.success) setHistory(data.data);
    } catch {
      /* history is optional */
    }
  }, [authFetch]);

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch('/api/loan/config');
        const data = await res.json();
        if (data.success) {
          setConfig(data.data);
          setForm((f) => ({
            ...f,
            monthly_income: data.data.profile.monthly_income ? String(data.data.profile.monthly_income) : f.monthly_income,
            age: data.data.profile.age ? String(data.data.profile.age) : f.age,
          }));
        }
      } catch {
        /* surfaced by preview errors */
      }
    })();
    loadHistory();
  }, [authFetch, loadHistory]);

  const body = useCallback(
    () => ({ ...form, commitments }),
    [form, commitments]
  );

  // Live preview (maths only) while typing
  useEffect(() => {
    if (!form.monthly_income) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await authFetch('/api/loan/calculate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body()),
        });
        const data = await res.json();
        if (data.success) {
          setPreview(data.data);
          setPreviewError('');
        } else {
          setPreviewError(data.message);
        }
      } catch (e) {
        setPreviewError(e.message);
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [form, commitments, authFetch, body]);

  // Any input change invalidates the last risk assessment
  useEffect(() => {
    setAssessment(null);
  }, [form, commitments]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const switchType = (type) => {
    const cfg = config?.loanTypes?.[type];
    setForm((f) => {
      // Swap in a sensible example price when the current one doesn't fit the loan type
      let price = parseFloat(f.item_price) || 0;
      if (type === 'house' && price < 150000) price = 400000;
      if (type === 'car' && price > 300000) price = 80000;
      return {
        ...f,
        loan_type: type,
        item_price: String(price),
        interest_rate: cfg ? String(cfg.defaultRatePct) : f.interest_rate,
        tenure_years: cfg ? String(cfg.defaultTenureYears) : f.tenure_years,
        down_payment: cfg && type !== 'personal' ? String(Math.round((price * cfg.downPaymentPct) / 100)) : f.down_payment,
      };
    });
  };

  const setDownPct = (pct) => {
    const price = parseFloat(form.item_price) || 0;
    setForm((f) => ({ ...f, down_payment: String(Math.round((price * pct) / 100)) }));
  };

  const runAssessment = async () => {
    setAssessing(true);
    setAssessError('');
    try {
      const res = await authFetch('/api/loan/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body()),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      setAssessment(data.data);
      loadHistory();
    } catch (e) {
      setAssessError(e.message);
    } finally {
      setAssessing(false);
    }
  };

  const deleteHistory = async (id) => {
    if (!(await confirm({ title: 'Delete this assessment?', body: 'This cannot be undone.' }))) return;
    await authFetch(`/api/loan/history/${id}`, { method: 'DELETE' });
    loadHistory();
  };

  const typeCfg = config?.loanTypes?.[form.loan_type];
  const bands = config?.dsrBands || { healthyMax: 40, moderateMax: 60 };
  const bankLimit = config?.bankDsrLimit || 70;
  const result = assessment || preview;
  const isPersonal = form.loan_type === 'personal';
  const totalCommitments = Object.values(commitments).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const priceNum = parseFloat(form.item_price) || 0;
  const downPct = priceNum > 0 ? ((parseFloat(form.down_payment) || 0) / priceNum) * 100 : 0;

  const hasAmount = isPersonal ? parseFloat(form.loan_amount) > 0 : priceNum > 0;
  const heroTitle =
    result && hasAmount ? (
      <>
        <Money value={result.monthly} /> a month for {result.years} {Number(result.years) === 1 ? 'year' : 'years'}
      </>
    ) : (
      'What loan are you thinking about?'
    );
  const energy = result ? Math.max(0, Math.min(1, (result.dsr || 0) / 100)) : 0.3;
  const referenceOnly = assessment?.risk.counts_toward_verdict === false;
  const topFactors = assessment?.risk.top_factors || [];

  return (
    <div>
      <PageHero
        module="Loan Default Predictor"
        title={heroTitle}
        lead="See what a loan costs each month and how much of your income it takes, before you apply to a bank."
        energy={energy}
      >
        <div className="space-y-2">
          <div>
            <Segmented label="Loan type" options={LOAN_TYPES} value={form.loan_type} onChange={switchType} />
          </div>
          {typeCfg && (
            <p className="t-note max-w-[62ch]">
              {METHOD_NOTES[typeCfg.method]} Up to {typeCfg.maxTenureYears} years.
            </p>
          )}
        </div>
      </PageHero>

      <div className="page space-y-12 md:space-y-16 pb-24 lg:pb-16">
        <div className="rule pt-8 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14">
          {/* The form scrolls while the result stays in view on desktop */}
          <div className="lg:col-span-5 min-w-0 space-y-9">
            <section aria-labelledby="loan-details-title" className="space-y-4">
              <h2 id="loan-details-title" className="t-section">
                The loan
              </h2>

              {isPersonal ? (
                <Field label="Loan amount" prefix="RM">
                  <input type="number" min="0" className="num" value={form.loan_amount} onChange={set('loan_amount')} />
                </Field>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label={form.loan_type === 'house' ? 'Property price' : 'Car price'} prefix="RM">
                      <input type="number" min="0" className="num" value={form.item_price} onChange={set('item_price')} />
                    </Field>
                    <Field label="Down payment" prefix="RM" hint={`${downPct.toFixed(1)}% of price`}>
                      <input type="number" min="0" className="num" value={form.down_payment} onChange={set('down_payment')} />
                    </Field>
                  </div>
                  <Segmented
                    label="Down payment as a share of the price"
                    options={DOWN_PAYMENT_CHOICES}
                    value={DOWN_PAYMENT_CHOICES.find((c) => Math.abs(downPct - c.value) < 0.05)?.value}
                    onChange={setDownPct}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Interest rate (% a year)">
                  <input type="number" min="0" step="0.05" className="num" value={form.interest_rate} onChange={set('interest_rate')} />
                </Field>
                <Field label="Tenure (years)">
                  <input
                    type="number"
                    min="1"
                    max={typeCfg?.maxTenureYears}
                    className="num"
                    value={form.tenure_years}
                    onChange={set('tenure_years')}
                  />
                </Field>
                <input
                  type="range"
                  aria-label="Tenure in years"
                  min="1"
                  max={typeCfg?.maxTenureYears || 35}
                  value={form.tenure_years || 1}
                  onChange={set('tenure_years')}
                  className="col-span-2 h-8 accent-jade"
                />
              </div>
            </section>

            <section aria-labelledby="income-title" className="space-y-4">
              <h2 id="income-title" className="t-section">
                Your income and debts
              </h2>
              <Field label="Monthly net income" prefix="RM" hint={user?.monthly_income ? 'Prefilled from your profile' : null}>
                <input type="number" min="0" className="num" value={form.monthly_income} onChange={set('monthly_income')} />
              </Field>

              <div>
                <button
                  type="button"
                  onClick={() => setShowCommitments((s) => !s)}
                  aria-expanded={showCommitments}
                  aria-controls="loan-commitments"
                  className="w-full min-h-11 flex items-center justify-between gap-3 text-left"
                >
                  <span className="t-label">
                    Existing monthly commitments: <span className="num text-ink">{fmtRM(totalCommitments)}</span>
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 shrink-0 text-ink-2 transition-transform ${showCommitments ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                </button>
                <div id="loan-commitments">
                  <AnimatePresence initial={false}>
                    {showCommitments && (
                      <Slide key="commitments">
                        {/* Room for the focus ring, which the height animation would clip */}
                        <div className="grid grid-cols-2 gap-3 p-1 -mx-1">
                          {Object.entries(COMMITMENT_LABELS).map(([key, label]) => (
                            <Field key={key} label={label} prefix="RM">
                              <input
                                type="number"
                                min="0"
                                placeholder="0"
                                className="num"
                                value={commitments[key] || ''}
                                onChange={(e) => setCommitments((c) => ({ ...c, [key]: e.target.value }))}
                              />
                            </Field>
                          ))}
                        </div>
                      </Slide>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </section>

            <section aria-labelledby="about-title" className="space-y-4">
              <h2 id="about-title" className="t-section">
                About you
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Employment">
                  <select value={form.employment_type} onChange={set('employment_type')}>
                    {Object.entries(EMPLOYMENT_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Years employed">
                  <input type="number" min="0" step="0.5" className="num" value={form.years_employed} onChange={set('years_employed')} />
                </Field>
                <Field label="Dependants">
                  <input type="number" min="0" className="num" value={form.dependants} onChange={set('dependants')} />
                </Field>
                <Field label="Age">
                  <input type="number" min="18" className="num" value={form.age} onChange={set('age')} />
                </Field>
              </div>
            </section>

            <div className="space-y-3">
              <Notice tone="danger" show={Boolean(previewError)}>
                {previewError}
              </Notice>
              <button type="button" onClick={runAssessment} disabled={assessing || !preview} className="btn btn-primary w-full">
                {assessing && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                {assessing ? 'Running the default risk assessment...' : 'Check this loan'}
              </button>
              <p className="t-note text-center">
                {preview
                  ? 'Runs the default risk assessment and saves it to your past assessments.'
                  : 'Enter your monthly income first.'}
              </p>
              <Notice tone="danger" show={Boolean(assessError)}>
                {assessError}
              </Notice>
            </div>
          </div>

          <div className="lg:col-span-7 min-w-0 lg:sticky lg:top-24 lg:self-start">
            <section aria-label="Loan result" className="sheet-lift p-5 sm:p-7">
              {!result ? (
                <Empty title="Your income comes first">Enter your monthly income to see the loan breakdown.</Empty>
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
                    <div className="min-w-0">
                      <h2 className="t-label">Monthly instalment</h2>
                      <div className="t-figure text-[2.5rem] sm:text-5xl mt-1.5">
                        <Money value={result.monthly} />
                      </div>
                      <p className="t-note mt-2">
                        Loan <span className="num">{fmtRM0(result.loanAmount)}</span>, {result.years}{' '}
                        {Number(result.years) === 1 ? 'year' : 'years'}, {result.interestMethod === 'flat' ? 'flat rate' : 'reducing balance'}{' '}
                        <span className="num">{result.annualRatePct}%</span>
                      </p>
                    </div>
                    {assessment && (
                      <Stamp label={sentenceCase(assessment.verdict)} note="Overall verdict" tone={VERDICT_TONES[assessment.verdict]} className="shrink-0 mt-1" />
                    )}
                  </div>

                  <dl className="mt-5 flex flex-wrap gap-x-10 gap-y-3">
                    <div>
                      <dt className="t-label">Total payment</dt>
                      <dd className="t-figure text-xl mt-0.5">
                        <Money value={result.totalPayment} />
                      </dd>
                    </div>
                    <div>
                      <dt className="t-label">Total interest</dt>
                      <dd className="t-figure text-xl mt-0.5">
                        <Money value={result.totalInterest} />
                      </dd>
                    </div>
                  </dl>

                  <AnimatePresence initial={false}>
                    {assessment && (
                      <Slide key="verdict-basis">
                        <p className="t-note mt-3">
                          {referenceOnly
                            ? 'The verdict is normally the worse of your DSR band and the default risk level. Here it uses your DSR band only, because the default score is reference only.'
                            : 'The verdict is the worse of your DSR band and the default risk level.'}
                        </p>
                      </Slide>
                    )}
                  </AnimatePresence>

                  <Notice tone="danger" show={Boolean(result.warnings?.length)} className="mt-4">
                    {result.warnings?.map((w) => (
                      <p key={w}>{w}</p>
                    ))}
                  </Notice>

                  <div className="rule mt-5 pt-5">
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mb-3">
                      <h3 className="font-display font-semibold text-base">How much of your income goes to debt?</h3>
                      <div className="flex items-center gap-2.5">
                        <RollingText text={`${result.dsr}%`} className="t-figure text-2xl" />
                        <LevelTag value={result.dsrBand} />
                      </div>
                    </div>
                    <DsrMeter dsr={result.dsr} band={result.dsrBand} bands={bands} limit={bankLimit} />
                    <p className="t-note mt-2.5">
                      Debt service ratio (DSR) after this loan: <span className="num">{fmtRM(result.existingCommitments)}</span> existing plus{' '}
                      <span className="num">{fmtRM(result.monthly)}</span> new, divided by <span className="num">{fmtRM(form.monthly_income)}</span>{' '}
                      income. The instalment alone is <span className="num">{result.instalmentToIncome}%</span> of income. The dark mark is the
                      typical bank limit of <span className="num">{bankLimit}%</span>.
                    </p>
                  </div>

                  <div className="mt-5">
                    <Notice show={!assessment}>Check this loan to get a risk level, verdict and tips.</Notice>
                    <AnimatePresence initial={false}>
                      {assessment && (
                        <Slide key="default-risk">
                          <div className="rule pt-5">
                            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mb-2">
                              <h3 className="font-display font-semibold text-base">How likely is a default?</h3>
                              <div className="flex flex-wrap items-center gap-2.5">
                                <RollingText text={`${(assessment.risk.default_probability * 100).toFixed(1)}%`} className="t-figure text-2xl" />
                                <LevelTag value={assessment.risk.risk_level} suffix=" risk" />
                                {referenceOnly && <span className="tag tag-plain">Reference only</span>}
                              </div>
                            </div>
                            {referenceOnly ? (
                              <Notice tone="warn">
                                <strong className="font-semibold">This score is for reference only.</strong> {assessment.risk.note}
                              </Notice>
                            ) : (
                              <p className="t-note">{assessment.risk.note}</p>
                            )}
                          </div>
                        </Slide>
                      )}
                    </AnimatePresence>
                  </div>
                </>
              )}
            </section>

            <p className="t-note mt-4">
              Estimates only, not financial advice. Banks apply their own criteria (credit history, CCRIS/CTOS, internal DSR limits) when
              approving loans.
            </p>
          </div>
        </div>

        {result && (
          <div className="rule pt-8 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14">
            <div className={`min-w-0 ${assessment ? 'lg:col-span-7' : 'lg:col-span-12'}`}>
              <RepaymentChart schedule={result.schedule} />
            </div>
            {assessment && (
              <Slide className="lg:col-span-5 min-w-0">
                <div className="space-y-8">
                  {topFactors.length > 0 && <ScoreDrivers factors={topFactors} />}
                  <section aria-labelledby="tips-title">
                    <h2 id="tips-title" className="t-section">
                      Tips for this loan
                    </h2>
                    <ul className="mt-2 divide-y divide-line">
                      {assessment.tips.map((t) => (
                        <li key={t} className="py-2.5">
                          {t}
                        </li>
                      ))}
                    </ul>
                  </section>
                </div>
              </Slide>
            )}
          </div>
        )}

        {history.length > 0 && <HistoryTable history={history} onDelete={deleteHistory} />}
      </div>
    </div>
  );
}
