import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { AlertTriangle, ArrowRight, Calculator, CheckCircle2, Gauge, Info, PiggyBank, Scale, XCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useGoTo } from '../context/NavContext';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import Stamp from '../components/ui/Stamp';
import { RollingText } from '../components/ui/RollingNumber';
import { Reveal, RevealItem } from '../components/ui/Reveal';
import { Field, InfoTip, Loading, Meter, MoneyInput, Notice, Segmented } from '../components/ui/Controls';
import { COMMITMENTS_CHANGED } from '../components/CommitmentsModal';
import { EASE, bringIntoView } from '../lib/motion';

const fmtRM0 = (n) => `RM ${Math.round(Number(n || 0)).toLocaleString('en-MY')}`;
const BAND_TONE = { Healthy: 'ok', Coping: 'warn', Vulnerable: 'danger' };
const VERDICT = {
  Manageable: { tone: 'ok', note: 'Your plans can absorb this.' },
  Tight: { tone: 'warn', note: 'Doable, but it squeezes something. See why below.' },
  Risky: { tone: 'danger', note: 'This would leave you short. See why below.' },
};
const REASON_ICON = { danger: XCircle, warn: AlertTriangle, info: Info, ok: CheckCircle2 };
const REASON_TONE = { danger: 'text-danger', warn: 'text-warn', info: 'text-ink-3', ok: 'text-ok' };

/** The Financial Health Index with each part's score and the reason for it. */
function HealthIndexCard({ health, onEditSavings }) {
  if (health.score === null) {
    return (
      <Card icon={Gauge} tone="teal" title="Financial health index">
        <Notice tone="warn">{health.note}</Notice>
      </Card>
    );
  }
  return (
    <section className="card card-gold p-4 sm:p-5 min-w-0" aria-labelledby="health-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="health-title" className="t-section flex items-center gap-1">
          Financial health index
          <InfoTip label="how the health index is worked out">
            Four parts, 25 points each, after the Financial Health Network's Spend, Save, Borrow and Plan pillars, but scored from your own
            statements and saved figures rather than a survey. It is a guide built for FinSight, not an official score. A part with missing
            figures is left out and the rest are scaled to 100. 80 and above is Healthy, 40 to 79 Coping, below 40 Vulnerable.
          </InfoTip>
        </h2>
        <span className={`tag tag-${BAND_TONE[health.band]}`}>{health.band}</span>
      </div>
      <p className="t-figure text-5xl mt-2">
        <RollingText text={String(health.score)} />
        <span className="text-xl text-ink-2 font-semibold"> / 100</span>
      </p>
      <ul className="mt-4 space-y-3.5">
        {health.pillars.map((p) => (
          <li key={p.key} className="rounded-xl bg-surface p-3">
            <div className="flex items-baseline justify-between gap-3 text-sm mb-1.5">
              <span className="font-semibold">{p.label}</span>
              <span className="num font-semibold">
                {p.score} <span className="text-ink-3 font-normal">/ 25</span>
              </span>
            </div>
            <Meter value={(p.score / 25) * 100} tone={p.score >= 18 ? 'ok' : p.score >= 10 ? 'warn' : 'danger'} label={`${p.label} score`} />
            <p className="t-note mt-1.5">{p.reason}</p>
          </li>
        ))}
        {health.missing.includes('emergency_savings') && (
          <li className="rounded-xl border border-dashed border-line-strong bg-surface p-3 text-sm">
            <span className="font-semibold">Emergency savings</span> is not scored yet.{' '}
            <button type="button" onClick={onEditSavings} className="link">
              Add your savings
            </button>
          </li>
        )}
      </ul>
    </section>
  );
}

/** Emergency savings and household type, saved to the profile. */
function YourFiguresCard({ data, onSaved, savingsRef }) {
  const { authFetch } = useAuth();
  const [savings, setSavings] = useState(data.emergency_savings ?? '');
  const [household, setHousehold] = useState(data.household_type || '');
  const [status, setStatus] = useState(null);

  const save = async (e) => {
    e.preventDefault();
    setStatus({ tone: 'working', text: 'Saving...' });
    try {
      const res = await authFetch('/api/profile/finance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emergency_savings: savings === '' ? null : savings, household_type: household || null }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      setStatus({ tone: 'ok', text: 'Saved. Your index is updated.' });
      onSaved();
    } catch (err) {
      setStatus({ tone: 'danger', text: err.message || 'Could not save.' });
    }
  };

  return (
    <Card icon={PiggyBank} tone="green" title="Your figures" note="Two things your statements cannot tell us">
      <form onSubmit={save} className="space-y-3">
        <Field label="Savings you could use in an emergency" prefix="RM" hint="Cash and savings accounts you can reach within days. Leave out EPF and money saved for a goal.">
          <MoneyInput ref={savingsRef} min="0" value={savings} onChange={(e) => setSavings(e.target.value)} className="num" />
        </Field>
        <Field label="Your household" hint="Picks the EPF Belanjawanku budget used to check you still have enough to live on after a loan.">
          <select value={household} onChange={(e) => setHousehold(e.target.value)}>
            <option value="">Not set</option>
            {Object.entries(data.households).map(([key, h]) => (
              <option key={key} value={key}>
                {h.label} (RM {h.monthly.toLocaleString('en-MY')} a month)
              </option>
            ))}
          </select>
        </Field>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="t-note">Belanjawanku 2024/2025, Klang Valley figures.</p>
          <button type="submit" className="btn btn-accent">
            Save figures
          </button>
        </div>
        <Notice tone={status?.tone || 'info'} show={Boolean(status)}>
          {status?.text}
        </Notice>
      </form>
    </Card>
  );
}

const DECISIONS = [
  { value: 'loan', label: 'A loan' },
  { value: 'purchase', label: 'A big purchase' },
  { value: 'commitment', label: 'A monthly cost' },
  { value: 'pause_goal', label: 'Pause a goal' },
];

function DecisionForm({ type, form, set, goals }) {
  if (type === 'loan') {
    return (
      <div className="grid grid-cols-2 gap-3">
        <Field label="Loan for" className="col-span-2">
          <select value={form.loan_type} onChange={set('loan_type')}>
            <option value="car">A car</option>
            <option value="house">A house</option>
            <option value="personal">A personal loan</option>
          </select>
        </Field>
        <Field label={form.loan_type === 'personal' ? 'Amount to borrow' : 'Price'} prefix="RM">
          <MoneyInput min="0" value={form.item_price} onChange={set('item_price')} className="num" />
        </Field>
        {form.loan_type !== 'personal' && (
          <Field label="Down payment" prefix="RM" hint="Taken from your emergency savings.">
            <MoneyInput min="0" value={form.down_payment} onChange={set('down_payment')} className="num" />
          </Field>
        )}
        <Field label="Interest rate" hint="Effective % a year. Blank uses the example rate.">
          <input type="number" min="0" step="0.01" value={form.interest_rate} onChange={set('interest_rate')} className="num" placeholder="Example" />
        </Field>
        <Field label="Years">
          <input type="number" min="1" value={form.tenure_years} onChange={set('tenure_years')} className="num" />
        </Field>
      </div>
    );
  }
  if (type === 'purchase') {
    return (
      <Field label="How much it costs" prefix="RM" hint="Paid in one go from your emergency savings, for example a phone, a holiday or a wedding deposit.">
        <MoneyInput min="0" value={form.amount} onChange={set('amount')} className="num" />
      </Field>
    );
  }
  if (type === 'commitment') {
    return (
      <div className="space-y-3">
        <Field label="Monthly amount" prefix="RM" hint="For example rent, a gym, a phone plan or sending money home.">
          <MoneyInput min="0" value={form.monthly_amount} onChange={set('monthly_amount')} className="num" />
        </Field>
        <label className="flex items-center gap-2.5 text-sm cursor-pointer">
          <input type="checkbox" checked={form.is_debt} onChange={set('is_debt')} className="w-4 h-4 accent-[var(--accent)]" />
          It is a loan or card repayment (counts toward DSR)
        </label>
      </div>
    );
  }
  return goals.length ? (
    <Field label="Goal to pause">
      <select value={form.goal_id} onChange={set('goal_id')}>
        <option value="">Choose a goal</option>
        {goals.map((g) => (
          <option key={g.id} value={g.id}>
            {g.title}
          </option>
        ))}
      </select>
    </Field>
  ) : (
    <Notice>You have no active goals to pause.</Notice>
  );
}

function Row({ label, before, after, worse }) {
  return (
    <tr>
      <th scope="row" className="py-2 pr-3 text-left font-normal text-ink-2">
        {label}
      </th>
      <td className="py-2 px-2 text-right num">{before}</td>
      <td className={`py-2 pl-2 text-right num font-semibold ${worse ? 'text-danger' : ''}`}>{after}</td>
    </tr>
  );
}

function SimulationResult({ result }) {
  const goTo = useGoTo();
  const { before, after } = result;
  const v = VERDICT[result.verdict];
  const months = (x) => (x === null ? 'Not set' : `${x} mo`);
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <Stamp label={result.verdict} note="Your verdict" tone={v.tone} className="shrink-0 self-start sm:self-center" />
        <p className="text-sm min-w-0">
          {v.note} The table shows the effect of {result.decision.label}.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-ink-3 text-[0.8125rem] border-b border-line">
              <th scope="col" className="py-1.5 text-left font-medium">
                <span className="sr-only">Measure</span>
              </th>
              <th scope="col" className="py-1.5 px-2 text-right font-medium">
                Now
              </th>
              <th scope="col" className="py-1.5 pl-2 text-right font-medium">
                After
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            <Row label="Left each month" before={fmtRM0(before.surplus)} after={fmtRM0(after.surplus)} worse={after.surplus < 0} />
            <Row label="DSR" before={`${before.dsr ?? 0}%`} after={`${after.dsr ?? 0}%`} worse={after.dsr > 70} />
            <Row label="Emergency cover" before={months(before.emergency_months)} after={months(after.emergency_months)} worse={after.emergency_savings < 0} />
            <Row
              label="Health index"
              before={before.health.score ?? '-'}
              after={after.health.score === null ? '-' : `${after.health.score} ${after.health.band}`}
              worse={after.health.band === 'Vulnerable'}
            />
          </tbody>
        </table>
      </div>

      {result.reasons.length > 0 && (
        <div>
          <p className="t-label mb-1.5">Why</p>
          <ul className="space-y-2">
            {result.reasons.map((r) => {
              const Icon = REASON_ICON[r.tone];
              return (
                <li key={r.text} className="flex items-start gap-2 text-sm">
                  <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${REASON_TONE[r.tone]}`} aria-hidden="true" />
                  <span>{r.text}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {result.living && (
        <Notice tone={result.living.enough ? 'ok' : 'warn'}>
          After all loan repayments you would have {fmtRM0(result.living.left_for_living)} a month to live on.{' '}
          {result.living.enough ? 'That covers' : 'That is below'} the EPF Belanjawanku budget of {fmtRM0(result.living.budget)} ({result.living.budget_label}).
        </Notice>
      )}

      {result.decision.loan && (
        <button type="button" onClick={() => goTo('loan')} className="btn btn-soft">
          Full loan check with default risk
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
      <p className="t-note">An estimate from your own figures, not financial advice. Banks use their own criteria.</p>
    </div>
  );
}

/** "Can I afford this?" for a loan, a purchase, a monthly cost or pausing a goal. */
function SimulatorCard({ goals }) {
  const { authFetch } = useAuth();
  const [type, setType] = useState('loan');
  const [form, setForm] = useState({
    loan_type: 'car',
    item_price: '80000',
    down_payment: '8000',
    interest_rate: '',
    tenure_years: '9',
    amount: '5000',
    monthly_amount: '300',
    is_debt: false,
    goal_id: '',
  });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const resultRef = useRef(null);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const run = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = { type, ...form, loan_amount: form.item_price };
      const res = await authFetch('/api/profile/simulate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      setResult(json.data);
      bringIntoView(resultRef, 120);
    } catch (err) {
      setError(err.message || 'Could not run the check.');
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card icon={Scale} tone="teal" title="Can I afford this?" note="See the effect on your money, goals and health index first">
      <form onSubmit={run} className="space-y-4">
        <Segmented
          label="What are you thinking about"
          value={type}
          onChange={(v) => {
            setType(v);
            setResult(null);
          }}
          options={DECISIONS}
        />
        <DecisionForm type={type} form={form} set={set} goals={goals} />
        <button type="submit" disabled={busy} className="btn btn-primary w-full sm:w-auto">
          <Calculator className="w-4 h-4" aria-hidden="true" />
          {busy ? 'Checking...' : 'Check it'}
        </button>
        <Notice tone="danger" show={Boolean(error)}>
          {error}
        </Notice>
      </form>
      <div ref={resultRef} className="scroll-mt-4">
        <AnimatePresence>
          {result && (
            <m.div
              key={JSON.stringify(result.decision)}
              className="mt-5 pt-5 border-t border-line"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
            >
              <SimulationResult result={result} />
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </Card>
  );
}

/** The integration page: one health index from every module, and decisions tested against it. */
export default function HealthPage() {
  const { authFetch } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const savingsRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await authFetch('/api/profile/health');
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      setData(json.data);
      setError('');
    } catch (err) {
      setError(err.message || 'Could not load your health check.');
    }
  }, [authFetch]);

  useEffect(() => {
    load();
    window.addEventListener(COMMITMENTS_CHANGED, load);
    return () => window.removeEventListener(COMMITMENTS_CHANGED, load);
  }, [load]);

  if (!data && !error) return <Loading>Working out your health check...</Loading>;

  return (
    <div>
      <PageHeader module="health" />
      <div className="page space-y-4">
        <Notice tone="danger" show={Boolean(error)}>
          {error}
        </Notice>
        {data && (
          <>
            <Notice tone="info" show={data.notes.length > 0}>
              {data.notes.join(' ')}
            </Notice>
            <Reveal className="grid grid-cols-1 xl:grid-cols-12 gap-4">
              <RevealItem className="xl:col-span-5 min-w-0 space-y-4">
                <HealthIndexCard health={data.health} onEditSavings={() => savingsRef.current?.focus()} />
                <YourFiguresCard data={data} onSaved={load} savingsRef={savingsRef} />
              </RevealItem>
              <RevealItem className="xl:col-span-7 min-w-0">
                <SimulatorCard goals={data.goals} />
              </RevealItem>
            </Reveal>
          </>
        )}
      </div>
    </div>
  );
}
