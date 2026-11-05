import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import {
  Car,
  Home,
  Wallet,
  Calculator,
  ShieldCheck,
  AlertTriangle,
  Lightbulb,
  Loader2,
  Gauge,
  History,
  Trash2,
  ChevronDown,
  ChevronUp,
  Info,
  Sparkles,
} from 'lucide-react';

const fmtRM = (n) =>
  `RM ${Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtRM0 = (n) => `RM ${Number(n || 0).toLocaleString('en-MY', { maximumFractionDigits: 0 })}`;

const LOAN_TYPES = [
  { id: 'personal', label: 'Personal', icon: Wallet },
  { id: 'car', label: 'Car (Hire Purchase)', icon: Car },
  { id: 'house', label: 'House', icon: Home },
];

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

const BAND_STYLES = {
  Healthy: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  Moderate: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  High: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
  Low: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  Medium: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  Affordable: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  Caution: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  'Not Recommended': 'text-rose-400 bg-rose-500/10 border-rose-500/30',
};

const inputCls =
  'w-full bg-[#0E1118] border border-[#2D3547] rounded-xl px-3 py-2 text-sm text-white placeholder-[#475569] focus:outline-none focus:border-[#FFC80A]/60 font-mono';
const labelCls = 'block text-[11px] font-bold uppercase tracking-wider text-[#94A3B8] mb-1.5';
const cardCls = 'bg-[#141824]/90 border border-[#232A3B] rounded-2xl p-5 shadow-lg';

function Field({ label, hint, children }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
      {hint && <p className="text-[10px] text-[#64748B] mt-1">{hint}</p>}
    </div>
  );
}

function Badge({ value }) {
  if (!value) return null;
  return (
    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border ${BAND_STYLES[value] || 'text-[#CBD5E1] border-[#2D3547]'}`}>
      {value}
    </span>
  );
}

function DsrMeter({ dsr, bands, limit }) {
  const pct = Math.min(100, Math.max(0, dsr || 0));
  const color = dsr <= bands.healthyMax ? '#10B981' : dsr <= bands.moderateMax ? '#F59E0B' : '#F43F5E';
  return (
    <div>
      <div className="relative h-3 rounded-full overflow-hidden bg-[#0E1118] border border-[#232A3B]">
        <div className="absolute inset-y-0 left-0 bg-emerald-500/15" style={{ width: `${bands.healthyMax}%` }} />
        <div
          className="absolute inset-y-0 bg-amber-500/15"
          style={{ left: `${bands.healthyMax}%`, width: `${bands.moderateMax - bands.healthyMax}%` }}
        />
        <div className="absolute inset-y-0 right-0 bg-rose-500/15" style={{ left: `${bands.moderateMax}%` }} />
        <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
        <div className="absolute inset-y-0 w-0.5 bg-white/60" style={{ left: `${limit}%` }} title={`Typical bank limit ${limit}%`} />
      </div>
      <div className="flex justify-between text-[10px] text-[#64748B] mt-1.5 font-mono">
        <span>0%</span>
        <span>{bands.healthyMax}% healthy</span>
        <span>{bands.moderateMax}%</span>
        <span>{limit}% bank limit</span>
        <span>100%</span>
      </div>
    </div>
  );
}

export default function LoanPage() {
  const { user, authFetch } = useAuth();
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

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-6">
        {/* ── Input form ── */}
        <div className={`${cardCls} space-y-5 h-fit`}>
          <div className="flex items-center gap-2 text-white font-extrabold">
            <Calculator className="w-4 h-4 text-[#FFC80A]" />
            <span>Loan details</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {LOAN_TYPES.map((t) => {
              const Icon = t.icon;
              const active = form.loan_type === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => switchType(t.id)}
                  className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border text-[11px] font-bold transition ${
                    active
                      ? 'bg-[#FFC80A]/15 border-[#FFC80A]/50 text-[#FFC80A]'
                      : 'bg-[#0E1118] border-[#2D3547] text-[#94A3B8] hover:border-[#FFC80A]/30'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-center leading-tight">{t.label}</span>
                </button>
              );
            })}
          </div>
          {typeCfg && (
            <p className="text-[11px] text-[#94A3B8] flex items-start gap-1.5 -mt-2">
              <Info className="w-3.5 h-3.5 text-[#FFC80A] shrink-0 mt-0.5" />
              <span>
                Uses <b className="text-white">{typeCfg.method === 'flat' ? 'flat rate' : 'reducing balance'}</b> interest, max{' '}
                {typeCfg.maxTenureYears} years.
              </span>
            </p>
          )}

          {isPersonal ? (
            <Field label="Loan amount (RM)">
              <input type="number" min="0" className={inputCls} value={form.loan_amount} onChange={set('loan_amount')} />
            </Field>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label={form.loan_type === 'house' ? 'Property price (RM)' : 'Car price (RM)'}>
                <input type="number" min="0" className={inputCls} value={form.item_price} onChange={set('item_price')} />
              </Field>
              <Field label="Down payment (RM)" hint={`${downPct.toFixed(1)}% of price`}>
                <input type="number" min="0" className={inputCls} value={form.down_payment} onChange={set('down_payment')} />
              </Field>
              <div className="col-span-2 flex gap-2 -mt-1">
                {[0, 10, 20, 30].map((p) => (
                  <button
                    key={p}
                    onClick={() => setDownPct(p)}
                    className={`flex-1 text-[11px] font-mono py-1 rounded-lg border transition ${
                      Math.abs(downPct - p) < 0.05
                        ? 'border-[#FFC80A]/50 text-[#FFC80A] bg-[#FFC80A]/10'
                        : 'border-[#2D3547] text-[#94A3B8] hover:border-[#FFC80A]/30'
                    }`}
                  >
                    {p}%
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Interest rate (% p.a.)">
              <input type="number" min="0" step="0.05" className={inputCls} value={form.interest_rate} onChange={set('interest_rate')} />
            </Field>
            <Field label="Tenure (years)">
              <input
                type="number"
                min="1"
                max={typeCfg?.maxTenureYears}
                className={inputCls}
                value={form.tenure_years}
                onChange={set('tenure_years')}
              />
            </Field>
            <input
              type="range"
              min="1"
              max={typeCfg?.maxTenureYears || 35}
              value={form.tenure_years || 1}
              onChange={set('tenure_years')}
              className="col-span-2 accent-[#FFC80A]"
            />
          </div>

          <div className="border-t border-[#232A3B] pt-4 space-y-3">
            <Field label="Monthly net income (RM)" hint={user?.monthly_income ? 'Prefilled from your profile' : null}>
              <input type="number" min="0" className={inputCls} value={form.monthly_income} onChange={set('monthly_income')} />
            </Field>

            <button
              onClick={() => setShowCommitments((s) => !s)}
              className="w-full flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]"
            >
              <span>
                Existing monthly commitments{' '}
                <span className="text-[#FFC80A] font-mono normal-case">{fmtRM(totalCommitments)}</span>
              </span>
              {showCommitments ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showCommitments && (
              <div className="grid grid-cols-2 gap-2.5">
                {Object.entries(COMMITMENT_LABELS).map(([key, label]) => (
                  <div key={key}>
                    <label className="block text-[10px] text-[#64748B] mb-1">{label}</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      className={inputCls}
                      value={commitments[key] || ''}
                      onChange={(e) => setCommitments((c) => ({ ...c, [key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-[#232A3B] pt-4 grid grid-cols-2 gap-3">
            <Field label="Employment">
              <select className={inputCls} value={form.employment_type} onChange={set('employment_type')}>
                {Object.entries(EMPLOYMENT_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Years employed">
              <input type="number" min="0" step="0.5" className={inputCls} value={form.years_employed} onChange={set('years_employed')} />
            </Field>
            <Field label="Dependants">
              <input type="number" min="0" className={inputCls} value={form.dependants} onChange={set('dependants')} />
            </Field>
            <Field label="Age">
              <input type="number" min="18" className={inputCls} value={form.age} onChange={set('age')} />
            </Field>
          </div>

          {previewError && <p className="text-xs text-rose-400">{previewError}</p>}

          <button
            onClick={runAssessment}
            disabled={assessing || !preview}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#FFC80A] hover:bg-[#FFD43B] disabled:opacity-50 text-black font-extrabold text-sm shadow-lg shadow-[#FFC80A]/25 transition active:scale-[0.98]"
          >
            {assessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            <span>Run default risk assessment</span>
          </button>
          {assessError && <p className="text-xs text-rose-400">{assessError}</p>}
        </div>

        {/* ── Results ── */}
        <div className="space-y-6 min-w-0">
          {!result ? (
            <div className={`${cardCls} text-center py-20 text-[#64748B] text-sm`}>
              Enter your monthly income to see the loan breakdown.
            </div>
          ) : (
            <>
              {assessment && (
                <div className={`rounded-2xl border p-5 flex flex-wrap items-center justify-between gap-4 ${BAND_STYLES[assessment.verdict]}`}>
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider opacity-80">Overall verdict</div>
                    <div className="text-2xl font-black">{assessment.verdict}</div>
                    <div className="text-xs opacity-80 mt-0.5">The worse of your DSR band and the default risk level</div>
                  </div>
                  <div className="flex gap-3 text-xs">
                    <div className="text-right">
                      <div className="opacity-70">DSR band</div>
                      <div className="font-bold text-base">{assessment.dsrBand}</div>
                    </div>
                    <div className="text-right">
                      <div className="opacity-70">Default risk</div>
                      <div className="font-bold text-base">{assessment.risk.risk_level}</div>
                    </div>
                  </div>
                </div>
              )}

              {result.warnings?.map((w) => (
                <div key={w} className="flex items-start gap-2 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{w}</span>
                </div>
              ))}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { label: 'Monthly instalment', value: fmtRM(result.monthly), accent: 'text-[#FFC80A]' },
                  { label: 'Total payment', value: fmtRM(result.totalPayment), accent: 'text-white' },
                  { label: 'Total interest', value: fmtRM(result.totalInterest), accent: 'text-rose-300' },
                ].map((k) => (
                  <div key={k.label} className={cardCls}>
                    <div className="text-[#94A3B8] text-xs font-bold uppercase tracking-wider mb-2">{k.label}</div>
                    <div className={`text-2xl font-black tracking-tight ${k.accent}`}>{k.value}</div>
                    <div className="text-[11px] text-[#64748B] mt-1.5">
                      Loan {fmtRM0(result.loanAmount)} · {result.years} yrs · {result.interestMethod === 'flat' ? 'flat' : 'reducing'}{' '}
                      {result.annualRatePct}%
                    </div>
                  </div>
                ))}
              </div>

              <div className={cardCls}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2 text-white font-extrabold">
                    <Gauge className="w-4 h-4 text-[#FFC80A]" />
                    <span>Debt Service Ratio after this loan</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-black text-white font-mono">{result.dsr}%</span>
                    <Badge value={result.dsrBand} />
                  </div>
                </div>
                <DsrMeter dsr={result.dsr} bands={bands} limit={bankLimit} />
                <p className="text-[11px] text-[#64748B] mt-3">
                  ({fmtRM(result.existingCommitments)} existing + {fmtRM(result.monthly)} new) ÷ {fmtRM(form.monthly_income)} income.
                  Instalment alone is {result.instalmentToIncome}% of income.
                </p>
              </div>

              <div className={cardCls}>
                <div className="text-white font-extrabold mb-4">Repayment schedule</div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={result.schedule} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#232A3B" />
                      <XAxis dataKey="year" stroke="#64748B" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="left" stroke="#64748B" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        stroke="#64748B"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                      />
                      <Tooltip
                        contentStyle={{ background: '#0E1118', border: '1px solid #2D3547', borderRadius: 12, fontSize: 12 }}
                        labelFormatter={(y) => `Year ${y}`}
                        formatter={(v, name) => [fmtRM(v), name]}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar yAxisId="left" dataKey="principal_paid" name="Principal" stackId="a" fill="#FFC80A" />
                      <Bar yAxisId="left" dataKey="interest_paid" name="Interest" stackId="a" fill="#F43F5E" />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="remaining_balance"
                        name="Remaining balance"
                        stroke="#38BDF8"
                        strokeWidth={2}
                        dot={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {assessment ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className={cardCls}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2 text-white font-extrabold">
                        <Sparkles className="w-4 h-4 text-[#FFC80A]" />
                        <span>Default probability</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {assessment.risk.counts_toward_verdict === false && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8] border border-[#2D3547] rounded-full px-2 py-0.5">
                            Reference only
                          </span>
                        )}
                        <Badge value={assessment.risk.risk_level} />
                      </div>
                    </div>
                    <div className="text-4xl font-black text-white font-mono">
                      {(assessment.risk.default_probability * 100).toFixed(1)}%
                    </div>
                    <p className="text-[11px] text-[#94A3B8] mt-2 flex items-start gap-1.5">
                      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#FFC80A]" />
                      <span>{assessment.risk.note}</span>
                    </p>
                    {assessment.risk.top_factors?.length > 0 && (
                      <div className="mt-4 space-y-2">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">What drove the score</div>
                        {assessment.risk.top_factors.map((f) => (
                          <div key={f.feature} className="flex items-center gap-3 text-xs">
                            <span className="w-36 text-[#CBD5E1] truncate">{f.feature}</span>
                            <div className="flex-1 h-2 bg-[#0E1118] rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${f.impact > 0 ? 'bg-rose-400' : 'bg-emerald-400'}`}
                                style={{ width: `${Math.min(100, Math.abs(f.impact) * 60)}%` }}
                              />
                            </div>
                            <span className={`font-mono w-12 text-right ${f.impact > 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                              {f.impact > 0 ? '+' : ''}
                              {f.impact}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className={cardCls}>
                    <div className="flex items-center gap-2 text-white font-extrabold mb-3">
                      <Lightbulb className="w-4 h-4 text-[#FFC80A]" />
                      <span>Tips</span>
                    </div>
                    <ul className="space-y-2.5">
                      {assessment.tips.map((t) => (
                        <li key={t} className="text-sm text-[#CBD5E1] flex gap-2">
                          <span className="text-[#FFC80A]">•</span>
                          <span>{t}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <div className={`${cardCls} text-sm text-[#94A3B8] flex items-center gap-2`}>
                  <ShieldCheck className="w-4 h-4 text-[#FFC80A]" />
                  Run the default risk assessment to get a risk level, verdict and tips.
                </div>
              )}
            </>
          )}

          <p className="text-[11px] text-[#64748B] flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Estimates only, not financial advice. Banks apply their own criteria (credit history, CCRIS/CTOS, internal DSR
              limits) when approving loans.
            </span>
          </p>
        </div>
      </div>

      {history.length > 0 && (
        <div className={cardCls}>
          <div className="flex items-center gap-2 text-white font-extrabold mb-4">
            <History className="w-4 h-4 text-[#FFC80A]" />
            <span>Past assessments</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[#64748B] uppercase tracking-wider text-[10px]">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3 text-right">Loan</th>
                  <th className="py-2 pr-3 text-right">Monthly</th>
                  <th className="py-2 pr-3 text-right">DSR</th>
                  <th className="py-2 pr-3 text-right">Default p.</th>
                  <th className="py-2 pr-3">Verdict</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-t border-[#232A3B] text-[#CBD5E1]">
                    <td className="py-2 pr-3 font-mono">{new Date(h.predicted_at).toLocaleDateString('en-MY')}</td>
                    <td className="py-2 pr-3 capitalize">{h.loan_type}</td>
                    <td className="py-2 pr-3 text-right font-mono">{fmtRM0(h.loan_amount)}</td>
                    <td className="py-2 pr-3 text-right font-mono">{fmtRM(h.monthly_instalment)}</td>
                    <td className="py-2 pr-3 text-right font-mono">{Number(h.dsr).toFixed(1)}%</td>
                    <td className="py-2 pr-3 text-right font-mono">
                      {h.default_probability !== null ? `${(h.default_probability * 100).toFixed(1)}%` : '-'}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge value={h.overall_verdict} />
                    </td>
                    <td className="py-2 text-right">
                      <button onClick={() => deleteHistory(h.id)} className="text-[#64748B] hover:text-rose-400" title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
