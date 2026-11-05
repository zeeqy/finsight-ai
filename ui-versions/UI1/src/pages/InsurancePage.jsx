import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { BarChart, Bar, XAxis, YAxis, Cell, ReferenceLine, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import {
  HeartPulse,
  Cigarette,
  CigaretteOff,
  ShieldCheck,
  AlertTriangle,
  Lightbulb,
  Loader2,
  History,
  Trash2,
  Info,
  Sparkles,
  FlaskConical,
} from 'lucide-react';

const TIER_STYLES = {
  Low: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  Medium: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  High: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
};
const TIER_COLOR = { Low: '#10B981', Medium: '#F59E0B', High: '#F43F5E' };

const BMI_STYLES = {
  Underweight: 'text-sky-300',
  Normal: 'text-emerald-400',
  Overweight: 'text-amber-300',
  Obese: 'text-rose-400',
};

const inputCls =
  'w-full bg-[#0E1118] border border-[#2D3547] rounded-xl px-3 py-2 text-sm text-white placeholder-[#475569] focus:outline-none focus:border-[#FFC80A]/60 font-mono';
const labelCls = 'block text-[11px] font-bold uppercase tracking-wider text-[#94A3B8] mb-1.5';
const cardCls = 'bg-[#141824]/90 border border-[#232A3B] rounded-2xl p-5 shadow-lg';

const pct = (p) => {
  const v = p * 100;
  if (v > 99.9) return '>99.9%';
  if (v < 0.1) return '<0.1%';
  return `${v.toFixed(1)}%`;
};
const sigmoid = (z) => 1 / (1 + Math.exp(-z));

function Field({ label, hint, children }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
      {hint && <p className="text-[10px] text-[#64748B] mt-1">{hint}</p>}
    </div>
  );
}

function TierBadge({ value }) {
  if (!value) return null;
  return (
    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border ${TIER_STYLES[value] || 'text-[#CBD5E1] border-[#2D3547]'}`}>
      {value} risk
    </span>
  );
}

/** Client-side BMI for the live hint; the server recomputes it for the prediction. */
function bmiOf(heightCm, weightKg) {
  const h = parseFloat(heightCm) / 100;
  const w = parseFloat(weightKg);
  if (!(h > 0) || !(w > 0)) return null;
  return Math.round((w / (h * h)) * 10) / 10;
}

function bmiLabel(bmi, bands) {
  if (bmi === null || !bands) return null;
  return bands.find((b) => b.max === null || bmi < b.max)?.label;
}

function ScoreGauge({ score, tier, thresholds }) {
  const pos = Math.min(100, Math.max(0, score * 100));
  return (
    <div>
      <div className="relative mx-2">
        <div className="relative h-3 rounded-full overflow-hidden bg-[#0E1118] border border-[#232A3B]">
          <div className="absolute inset-y-0 left-0 bg-emerald-500/20" style={{ width: `${thresholds.low_max * 100}%` }} />
          <div
            className="absolute inset-y-0 bg-amber-500/20"
            style={{ left: `${thresholds.low_max * 100}%`, width: `${(thresholds.high_min - thresholds.low_max) * 100}%` }}
          />
          <div className="absolute inset-y-0 right-0 bg-rose-500/20" style={{ left: `${thresholds.high_min * 100}%` }} />
        </div>
        {/* Marker sits outside the clipped track so it stays whole at 0% and 100% */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow transition-all duration-500"
          style={{ left: `calc(${pos}% - 8px)`, background: TIER_COLOR[tier] }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-[#64748B] mt-1.5 font-mono">
        <span>0%</span>
        <span>{thresholds.low_max * 100}% Low | Medium</span>
        <span>Medium | High {thresholds.high_min * 100}%</span>
        <span>100%</span>
      </div>
    </div>
  );
}

/** SHAP contributions as a diverging bar chart: red raises the score, green lowers it. */
function ShapChart({ contributions }) {
  const data = contributions.map((c) => ({
    name: c.feature,
    impact: c.impact,
    value: c.key === 'smoker' ? (c.value ? 'Yes' : 'No') : c.value,
  }));
  const max = Math.ceil(Math.max(1, ...data.map((d) => Math.abs(d.impact))));
  const step = max > 4 ? 2 : 1;
  const edge = Math.ceil(max / step) * step;
  const ticks = [];
  for (let t = -edge; t <= edge; t += step) ticks.push(t);
  return (
    <ResponsiveContainer width="100%" height={data.length * 46 + 30}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 50, left: 10, bottom: 5 }}>
        <XAxis
          type="number"
          domain={[-edge, edge]}
          ticks={ticks}
          tick={{ fill: '#64748B', fontSize: 10 }}
          axisLine={{ stroke: '#2D3547' }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={110}
          tick={({ x, y, payload }) => {
            const d = data.find((r) => r.name === payload.value);
            return (
              <g transform={`translate(${x},${y})`}>
                <text x={-6} y={-2} textAnchor="end" fill="#CBD5E1" fontSize={12} fontWeight={600}>
                  {payload.value}
                </text>
                <text x={-6} y={12} textAnchor="end" fill="#64748B" fontSize={10} fontFamily="monospace">
                  {d?.value}
                </text>
              </g>
            );
          }}
          axisLine={false}
          tickLine={false}
        />
        <ReferenceLine x={0} stroke="#64748B" />
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.03)' }}
          contentStyle={{ background: '#0E1118', border: '1px solid #2D3547', borderRadius: 12, fontSize: 12 }}
          labelStyle={{ color: '#F3F4F6', fontWeight: 700 }}
          itemStyle={{ color: '#CBD5E1' }}
          formatter={(v) => [`${v > 0 ? '+' : ''}${v} (log-odds)`, v > 0 ? 'Raises score' : 'Lowers score']}
        />
        <Bar dataKey="impact" radius={4} barSize={22}>
          {data.map((d) => (
            <Cell key={d.name} fill={d.impact > 0 ? '#F43F5E' : '#10B981'} fillOpacity={0.85} />
          ))}
          <LabelList
            dataKey="impact"
            position="right"
            formatter={(v) => `${v > 0 ? '+' : ''}${v}`}
            style={{ fill: '#94A3B8', fontSize: 11, fontFamily: 'monospace' }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function InsurancePage() {
  const { authFetch } = useAuth();
  const [config, setConfig] = useState(null);
  const [form, setForm] = useState({ age: '', height_cm: '170', weight_kg: '65', smoker: false, children: '0' });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await authFetch('/api/insurance/history');
      const data = await res.json();
      if (data.success) setHistory(data.data);
    } catch {
      /* history is optional */
    }
  }, [authFetch]);

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch('/api/insurance/config');
        const data = await res.json();
        if (data.success) {
          setConfig(data.data);
          if (data.data.profile.age) setForm((f) => ({ ...f, age: f.age || String(data.data.profile.age) }));
        }
      } catch {
        /* surfaced when the user runs an assessment */
      }
    })();
    loadHistory();
  }, [authFetch, loadHistory]);

  // Any input change invalidates the last result
  useEffect(() => {
    setResult(null);
  }, [form]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const runAssessment = async (e) => {
    e?.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await authFetch('/api/insurance/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      setResult(data.data);
      loadHistory();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteHistory = async (id) => {
    await authFetch(`/api/insurance/history/${id}`, { method: 'DELETE' });
    loadHistory();
  };

  const bmi = bmiOf(form.height_cm, form.weight_kg);
  const bmiCat = bmiLabel(bmi, config?.bmiBands);
  const ageRange = config?.ageRange || { min: 18, max: 64 };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div className="grid grid-cols-1 xl:grid-cols-[400px_1fr] gap-6">
        {/* ── Input form ── */}
        <form onSubmit={runAssessment} className={`${cardCls} space-y-5 h-fit`}>
          <div className="flex items-center gap-2 text-white font-extrabold">
            <HeartPulse className="w-4 h-4 text-[#FFC80A]" />
            <span>Your lifestyle profile</span>
          </div>

          <Field label="Age" hint={`The model was trained on ages ${ageRange.min}-${ageRange.max}.`}>
            <input
              name="age"
              type="number"
              min={ageRange.min}
              max={ageRange.max}
              value={form.age}
              onChange={set('age')}
              className={inputCls}
              placeholder="e.g. 28"
              required
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Height (cm)">
              <input name="height_cm" type="number" step="0.1" value={form.height_cm} onChange={set('height_cm')} className={inputCls} required />
            </Field>
            <Field label="Weight (kg)">
              <input name="weight_kg" type="number" step="0.1" value={form.weight_kg} onChange={set('weight_kg')} className={inputCls} required />
            </Field>
          </div>
          {bmi !== null && (
            <div className="-mt-2 text-xs text-[#94A3B8] flex items-center justify-between bg-[#0E1118] border border-[#232A3B] rounded-xl px-3 py-2">
              <span>
                BMI <span className="font-mono text-white font-bold">{bmi}</span>
              </span>
              {bmiCat && <span className={`font-bold ${BMI_STYLES[bmiCat]}`}>{bmiCat}</span>}
            </div>
          )}

          <Field label="Do you smoke or vape?">
            <div className="grid grid-cols-2 gap-2">
              {[
                { v: false, label: 'No', icon: CigaretteOff },
                { v: true, label: 'Yes', icon: Cigarette },
              ].map(({ v, label, icon: Icon }) => (
                <button
                  key={label}
                  type="button"
                  name={`smoker-${label.toLowerCase()}`}
                  onClick={() => setForm((f) => ({ ...f, smoker: v }))}
                  className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-bold transition ${
                    form.smoker === v
                      ? 'bg-[#FFC80A]/15 border-[#FFC80A]/50 text-[#FFC80A]'
                      : 'bg-[#0E1118] border-[#2D3547] text-[#94A3B8] hover:border-[#FFC80A]/30'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Number of children" hint="Children you would cover on a family medical plan.">
            <input name="children" type="number" min="0" max="10" value={form.children} onChange={set('children')} className={inputCls} />
          </Field>

          <button
            type="submit"
            disabled={loading || config?.modelAvailable === false}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#FFC80A] text-black text-sm font-extrabold hover:bg-[#FFD43B] disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            Assess my risk
          </button>
          {config?.modelAvailable === false && (
            <p className="text-xs text-amber-300 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              The risk model is offline (ML service not running), so assessments are unavailable right now.
            </p>
          )}
          {error && <p className="text-xs text-rose-400">{error}</p>}

          <p className="text-[10px] text-[#64748B] flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 shrink-0" />
            <span>
              BMI categories use Asian cut-offs, where healthy is 18.5-22.9 (source: {config?.bmiSource || 'Malaysian CPG on obesity'}).
              Gender and location are not asked: they add no accuracy in this model.
            </span>
          </p>
        </form>

        {/* ── Results ── */}
        <div className="space-y-6">
          {!result ? (
            <div className={`${cardCls} text-sm text-[#94A3B8] flex items-start gap-3`}>
              <ShieldCheck className="w-5 h-5 text-[#FFC80A] shrink-0" />
              <div>
                <p className="text-white font-bold mb-1">How this works</p>
                <p>
                  A Logistic Regression model scores how closely your lifestyle profile matches people with higher-than-median
                  medical costs. The chart then shows exactly how much each factor (age, BMI, smoking, children) raised or lowered
                  your score, so the result is never a black box.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className={cardCls}>
                <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8] mb-1">Risk score</div>
                    <div className="flex items-baseline gap-3">
                      <span className="text-4xl font-black font-mono" style={{ color: TIER_COLOR[result.risk_tier] }}>
                        {pct(result.risk_score)}
                      </span>
                      <TierBadge value={result.risk_tier} />
                    </div>
                    <p className="text-xs text-[#94A3B8] mt-2 max-w-xl">
                      Probability that your profile belongs to the higher-cost half of people in the training data. Higher scores
                      usually mean higher medical and life insurance premiums.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[11px] font-mono">
                    {[
                      `Age ${result.input.age}`,
                      <>
                        BMI {result.input.bmi}{' '}
                        <span className={BMI_STYLES[result.input.bmiCategory]}>{result.input.bmiCategory}</span>
                      </>,
                      result.input.smoker ? 'Smoker' : 'Non-smoker',
                      `${result.input.children} children`,
                    ].map((chip, i) => (
                      <span key={i} className="px-2 py-1 rounded-lg bg-[#0E1118] border border-[#232A3B] text-[#CBD5E1]">
                        {chip}
                      </span>
                    ))}
                  </div>
                </div>
                <ScoreGauge score={result.risk_score} tier={result.risk_tier} thresholds={result.thresholds} />
                {result.out_of_range?.length > 0 && (
                  <p className="mt-3 text-xs text-amber-300 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    {result.out_of_range.join(' and ')} is outside the range the model was trained on, so treat this score as a
                    rough guide.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 2xl:grid-cols-[1fr_380px] gap-6">
                <div className={cardCls}>
                  <div className="flex items-center gap-2 text-white font-extrabold mb-1">
                    <Sparkles className="w-4 h-4 text-[#FFC80A]" />
                    <span>Why you got this score (SHAP)</span>
                  </div>
                  <p className="text-xs text-[#94A3B8] mb-3">
                    Starting from a person with average age, BMI, children and smoking rate (score{' '}
                    {pct(sigmoid(result.base_value))}), each bar shows how much that factor pushed your score{' '}
                    <span className="text-rose-400 font-semibold">up</span> or{' '}
                    <span className="text-emerald-400 font-semibold">down</span>. The starting point plus the bars gives
                    exactly your score.
                  </p>
                  <ShapChart contributions={result.contributions} />
                  <p className="text-[10px] text-[#64748B] mt-1">Units are log-odds, the scale the model adds factors on.</p>
                </div>

                <div className="space-y-6">
                  {result.what_if.length > 0 && (
                    <div className={cardCls}>
                      <div className="flex items-center gap-2 text-white font-extrabold mb-3">
                        <FlaskConical className="w-4 h-4 text-[#FFC80A]" />
                        <span>What if?</span>
                      </div>
                      <div className="space-y-2">
                        {result.what_if.map((w) => {
                          const diff = (w.risk_score - result.risk_score) * 100;
                          return (
                            <div
                              key={w.scenario}
                              className="flex items-center justify-between gap-3 bg-[#0E1118] border border-[#232A3B] rounded-xl px-3 py-2.5"
                            >
                              <span className="text-sm text-[#CBD5E1]">{w.scenario}</span>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm text-white">{pct(w.risk_score)}</span>
                                <span
                                  className={`font-mono text-[11px] ${diff < -0.05 ? 'text-emerald-400' : 'text-[#64748B]'}`}
                                >
                                  {Math.abs(diff) < 0.05 ? 'no change' : `${diff > 0 ? '+' : ''}${diff.toFixed(1)} pts`}
                                </span>
                                <TierBadge value={w.risk_tier} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className={cardCls}>
                    <div className="flex items-center gap-2 text-white font-extrabold mb-3">
                      <Lightbulb className="w-4 h-4 text-[#FFC80A]" />
                      <span>Tips</span>
                    </div>
                    <ul className="space-y-2.5">
                      {result.tips.map((t) => (
                        <li key={t} className="text-sm text-[#CBD5E1] flex gap-2">
                          <span className="text-[#FFC80A]">•</span>
                          <span>{t}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-[#64748B] flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  {result.model.name} trained on the {result.model.dataset} (test ROC-AUC {result.model.test_roc_auc}, accuracy{' '}
                  {(result.model.test_accuracy * 100).toFixed(1)}%). The data is from the US, so the score ranks lifestyle risk; it
                  does not predict a Malaysian premium in ringgit.
                </span>
              </p>
            </>
          )}

          <p className="text-[11px] text-[#64748B] flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Estimates only, not financial or medical advice. Insurers use their own underwriting (medical history, occupation,
              health checks) to set premiums.
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
                  <th className="py-2 pr-3 text-right">Age</th>
                  <th className="py-2 pr-3 text-right">BMI</th>
                  <th className="py-2 pr-3">Smoker</th>
                  <th className="py-2 pr-3 text-right">Children</th>
                  <th className="py-2 pr-3 text-right">Score</th>
                  <th className="py-2 pr-3">Tier</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-t border-[#232A3B] text-[#CBD5E1]">
                    <td className="py-2 pr-3 font-mono">{new Date(h.predicted_at).toLocaleDateString('en-MY')}</td>
                    <td className="py-2 pr-3 text-right font-mono">{h.age}</td>
                    <td className="py-2 pr-3 text-right font-mono">{Number(h.bmi).toFixed(1)}</td>
                    <td className="py-2 pr-3">{h.smoker ? 'Yes' : 'No'}</td>
                    <td className="py-2 pr-3 text-right font-mono">{h.children}</td>
                    <td className="py-2 pr-3 text-right font-mono">{pct(h.risk_score)}</td>
                    <td className="py-2 pr-3">
                      <TierBadge value={h.risk_tier} />
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
