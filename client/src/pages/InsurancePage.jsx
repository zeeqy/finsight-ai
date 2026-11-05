import React, { useState, useEffect, useCallback, useId, useRef } from 'react';
import { AnimatePresence, m } from 'motion/react';
import {
  ChevronDown,
  ClipboardList,
  Gauge,
  History,
  Info,
  Lightbulb,
  Loader2,
  Minus,
  Scale,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import ProtectionCard from '../components/insurance/ProtectionCard';
import QuoteCompareCard from '../components/insurance/QuoteCompareCard';
import Stamp from '../components/ui/Stamp';
import { RollingText } from '../components/ui/RollingNumber';
import { Empty, Field, Meter, Notice, Segmented } from '../components/ui/Controls';
import { CHART } from '../components/ui/chartTheme';
import { useConfirm } from '../components/ui/Modal';
import { EASE, bringIntoView } from '../lib/motion';

const TIER_TONE = { Low: 'ok', Medium: 'warn', High: 'danger' };
const BMI_TAG = { Underweight: 'tag-warn', Normal: 'tag-ok', Overweight: 'tag-warn', Obese: 'tag-danger' };

const HOW_IT_WORKS =
  'A Logistic Regression model scores how closely your lifestyle profile matches people with higher-than-median medical costs. The chart then shows exactly how much each factor (age, BMI, smoking, children) raised or lowered your score, so the result is never a black box.';

const SMOKER_OPTIONS = [
  { value: false, label: 'No' },
  { value: true, label: 'Yes' },
];

const pct = (p) => {
  const v = p * 100;
  if (v > 99.9) return '>99.9%';
  if (v < 0.1) return '<0.1%';
  return `${v.toFixed(1)}%`;
};
const sigmoid = (z) => 1 / (1 + Math.exp(-z));

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

// Height slide. Overflow opens up once it finishes, so the stamp can land outside the box.
const SLIDE = {
  initial: { height: 0, opacity: 0, overflow: 'hidden' },
  animate: { height: 'auto', opacity: 1, transitionEnd: { overflow: 'visible' } },
  exit: { height: 0, opacity: 0, overflow: 'hidden' },
  transition: { duration: 0.35, ease: EASE },
};

function TierTag({ value }) {
  if (!value) return null;
  const tone = TIER_TONE[value];
  return <span className={`tag ${tone ? `tag-${tone}` : 'tag-plain'}`}>{value} risk</span>;
}

const DIAL = { cx: 170, cy: 172, r: 130, stroke: 18, needle: 114 };
const NEEDLE_SPRING = { type: 'spring', stiffness: 110, damping: 14, mass: 0.9 };

/** Point on the dial at fraction t of the sweep, `r` from the centre. */
function dialPoint(t, r) {
  const angle = Math.PI * (1 - t);
  return { x: DIAL.cx + r * Math.cos(angle), y: DIAL.cy - r * Math.sin(angle) };
}

/** The stretch of the dial between two fractions of the sweep. */
function dialArc(from, to) {
  const start = dialPoint(from, DIAL.r);
  const end = dialPoint(to, DIAL.r);
  return `M ${start.x} ${start.y} A ${DIAL.r} ${DIAL.r} 0 0 1 ${end.x} ${end.y}`;
}

/** Half-circle gauge for a real result: three flat bands from the API's thresholds and a needle that swings to the score. */
function RiskDial({ score, tier, thresholds }) {
  const turn = Math.min(1, Math.max(0, score));
  const { low_max: low, high_min: high } = thresholds;

  const bands = [
    { name: 'Low', from: 0, to: low, colour: CHART.ok },
    { name: 'Medium', from: low, to: high, colour: CHART.gold },
    { name: 'High', from: high, to: 1, colour: CHART.danger },
  ];
  const lowPct = Math.round(low * 100);
  const highPct = Math.round(high * 100);
  const summary = `Low is under ${lowPct}%, medium is ${lowPct}% to ${highPct}%, high is ${highPct}% and above.`;

  return (
    <svg
      viewBox="0 0 340 200"
      role="img"
      aria-label={`Risk dial at ${pct(score)}, ${tier} risk. ${summary}`}
      className="block w-full max-w-md mx-auto"
    >
      {bands.map(({ name, from, to, colour }) => (
        <path key={name} d={dialArc(from, to)} fill="none" stroke={colour} strokeWidth={DIAL.stroke} />
      ))}

      {[low, high].map((t) => {
        const inner = dialPoint(t, DIAL.r - 12);
        const outer = dialPoint(t, DIAL.r + 14);
        const text = dialPoint(t, DIAL.r + 27);
        return (
          <g key={t}>
            <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="var(--ink-2)" strokeWidth="1.5" />
            <text x={text.x} y={text.y} textAnchor="middle" dominantBaseline="middle" fontSize="12.5" fill="var(--ink-3)" className="num">
              {Math.round(t * 100)}%
            </text>
          </g>
        );
      })}

      {bands.map(({ name, from, to }) => {
        const p = dialPoint((from + to) / 2, DIAL.r + 26);
        return (
          <text
            key={name}
            x={p.x}
            y={p.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="14"
            fontWeight={tier === name ? 700 : 600}
            fill={tier === name ? 'var(--ink)' : 'var(--ink-3)'}
          >
            {name}
          </text>
        );
      })}

      <text x={DIAL.cx - DIAL.r} y={DIAL.cy + 20} textAnchor="middle" fontSize="12.5" fill="var(--ink-3)" className="num">
        0%
      </text>
      <text x={DIAL.cx + DIAL.r} y={DIAL.cy + 20} textAnchor="middle" fontSize="12.5" fill="var(--ink-3)" className="num">
        100%
      </text>

      {/* The unpainted circle centres this group's box on the pivot, so it rotates about the hub */}
      <m.g initial={{ rotate: 0 }} animate={{ rotate: turn * 180 }} transition={NEEDLE_SPRING}>
        <circle cx={DIAL.cx} cy={DIAL.cy} r={DIAL.needle} fill="none" />
        <path d={`M ${DIAL.cx} ${DIAL.cy - 3.5} L ${DIAL.cx - DIAL.needle} ${DIAL.cy} L ${DIAL.cx} ${DIAL.cy + 3.5} Z`} fill="var(--ink)" />
      </m.g>
      <circle cx={DIAL.cx} cy={DIAL.cy} r="8" fill="var(--ink)" />
    </svg>
  );
}

/** Lands the tier once the needle has swung. */
function TierStamp({ tier }) {
  const [landed, setLanded] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setLanded(true), 600);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-24 min-w-44 px-3 flex items-center justify-center rounded-xl bg-surface">
      {landed && <Stamp label={`${tier} risk`} note="Not a premium quote" tone={TIER_TONE[tier]} />}
    </div>
  );
}

/** SHAP contributions as diverging bars: danger raises the score, ok lowers it. */
function ShapBars({ contributions }) {
  const rows = contributions.map((c) => ({
    name: c.feature,
    impact: c.impact,
    value: c.key === 'smoker' ? (c.value ? 'Yes' : 'No') : c.value,
  }));
  const max = Math.ceil(Math.max(1, ...rows.map((d) => Math.abs(d.impact))));
  const step = max > 4 ? 2 : 1;
  const edge = Math.ceil(max / step) * step;

  return (
    <div>
      <ul className="space-y-5">
        {rows.map((d, i) => {
          const raises = d.impact > 0;
          const half = (Math.abs(d.impact) / edge) * 50;
          return (
            <li key={d.name}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span>
                  <span className="font-semibold">{d.name}</span> <span className="num text-ink-3">{d.value}</span>
                </span>
                <span className={`font-semibold ${raises ? 'text-danger' : 'text-ok'}`}>
                  {raises ? 'Raises your score' : 'Lowers your score'}{' '}
                  <span className="num">
                    {raises ? '+' : ''}
                    {d.impact}
                  </span>
                </span>
              </div>
              <div className="relative h-3 mt-1.5 rounded-control bg-paper-2">
                <m.div
                  className={`absolute inset-y-0 ${raises ? 'bg-danger origin-left rounded-r-control' : 'bg-ok origin-right rounded-l-control'}`}
                  style={raises ? { left: '50%', width: `${half}%` } : { right: '50%', width: `${half}%` }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.6, ease: EASE, delay: 0.1 + i * 0.05 }}
                />
                <span className="absolute left-1/2 -top-1 -bottom-1 w-px bg-ink" aria-hidden="true" />
              </div>
            </li>
          );
        })}
      </ul>
      <div className="grid grid-cols-3 mt-2 t-note num" aria-hidden="true">
        <span>-{edge}</span>
        <span className="text-center">0</span>
        <span className="text-right">+{edge}</span>
      </div>
    </div>
  );
}

function WhatIfRow({ scenario, current }) {
  const diff = (scenario.risk_score - current) * 100;
  const unchanged = Math.abs(diff) < 0.05;
  const lower = diff < -0.05;
  const Icon = unchanged ? Minus : lower ? TrendingDown : TrendingUp;
  const tone = unchanged ? 'gold' : lower ? 'green' : 'danger';

  return (
    <li className="rounded-xl border border-line p-3">
      <div className="flex items-center gap-3">
        <span className={`chip tone-${tone}`}>
          <Icon className="w-[1.125rem] h-[1.125rem]" aria-hidden="true" />
        </span>
        <div className="flex-1 min-w-0 flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="font-semibold">{scenario.scenario}</span>
          <span className={`text-sm font-semibold ${lower ? 'text-ok' : 'text-ink-3'}`}>
            {unchanged ? (
              'No change'
            ) : (
              <>
                <span className="num">{Math.abs(diff).toFixed(1)}</span> points {diff > 0 ? 'higher' : 'lower'}
              </>
            )}
          </span>
        </div>
      </div>
      <div className="my-2.5">
        <Meter
          value={scenario.risk_score * 100}
          marker={current * 100}
          tone={TIER_TONE[scenario.risk_tier] || 'ink'}
          label={`Score after: ${scenario.scenario}`}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-sm text-ink-2">
          <span className="num">{pct(current)}</span> now, <span className="num font-semibold text-ink">{pct(scenario.risk_score)}</span> after
        </span>
        <TierTag value={scenario.risk_tier} />
      </div>
    </li>
  );
}

function ModelFacts({ model }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <Card
      icon={Info}
      tone="blue"
      title="About this model"
      note="What the score is built on"
      flush
      action={
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="btn btn-quiet btn-sm"
        >
          {open ? 'Hide details' : 'Show details'}
          <m.span className="inline-flex" animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25, ease: EASE }}>
            <ChevronDown className="w-4 h-4" aria-hidden="true" />
          </m.span>
        </button>
      }
    >
      <div className="pb-2">
        <AnimatePresence initial={false}>
          {open && (
            <m.div id={panelId} key="facts" {...SLIDE}>
              <div className="px-4 sm:px-5 pb-3 space-y-2 text-sm text-ink-2 max-w-[70ch]">
                <p>
                  {model.name} trained on the {model.dataset} (test ROC-AUC <span className="num">{model.test_roc_auc}</span>, accuracy{' '}
                  <span className="num">{(model.test_accuracy * 100).toFixed(1)}%</span>).
                </p>
                <p>The data is from the US, so the score ranks lifestyle risk. It does not predict a Malaysian premium in ringgit.</p>
                <p>{HOW_IT_WORKS}</p>
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </Card>
  );
}

export default function InsurancePage() {
  const { authFetch } = useAuth();
  const confirm = useConfirm();
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

  const resultRef = useRef(null);

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
      bringIntoView(resultRef, 420); // after the empty state has slid away
      loadHistory();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteHistory = async (id) => {
    if (!(await confirm({ title: 'Delete this assessment?', body: 'This cannot be undone.' }))) return;
    await authFetch(`/api/insurance/history/${id}`, { method: 'DELETE' });
    loadHistory();
  };

  const bmi = bmiOf(form.height_cm, form.weight_kg);
  const bmiCat = bmiLabel(bmi, config?.bmiBands);
  const ageRange = config?.ageRange || { min: 18, max: 64 };

  return (
    <div>
      <PageHeader module="insurance" />

      <div className="page space-y-4">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className="xl:col-span-5 min-w-0">
            <Card icon={ClipboardList} tone="pink" title="Your lifestyle profile" note="The details the model looks at" className="h-full">
              <form onSubmit={runAssessment} aria-label="Your lifestyle profile" className="space-y-5">
                <p className="text-sm text-ink-2">
                  See how age, BMI, smoking and children shape your insurance risk, and which factor moved it most. This is a risk score, not a premium
                  quote.
                </p>

                <Field label="Age" hint={`The model was trained on ages ${ageRange.min} to ${ageRange.max}.`}>
                  <input
                    name="age"
                    type="number"
                    min={ageRange.min}
                    max={ageRange.max}
                    value={form.age}
                    onChange={set('age')}
                    placeholder="e.g. 28"
                    required
                  />
                </Field>

                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Height (cm)">
                      <input name="height_cm" type="number" step="0.1" value={form.height_cm} onChange={set('height_cm')} required />
                    </Field>
                    <Field label="Weight (kg)">
                      <input name="weight_kg" type="number" step="0.1" value={form.weight_kg} onChange={set('weight_kg')} required />
                    </Field>
                  </div>
                  {bmi !== null && (
                    <p className="text-sm text-ink-2" aria-live="polite">
                      Your BMI is <span className="num font-semibold text-ink">{bmi}</span>
                      {bmiCat && (
                        <>
                          , which is <span className={`tag ${BMI_TAG[bmiCat]}`}>{bmiCat}</span> on the Asian cut-offs
                        </>
                      )}
                    </p>
                  )}
                </div>

                <div>
                  <p className="t-label mb-1.5">Do you smoke or vape?</p>
                  <Segmented
                    label="Do you smoke or vape?"
                    name="smoker"
                    options={SMOKER_OPTIONS}
                    value={form.smoker}
                    onChange={(v) => setForm((f) => ({ ...f, smoker: v }))}
                  />
                </div>

                <Field label="Number of children" hint="Children you would cover on a family medical plan.">
                  <input name="children" type="number" min="0" max="10" value={form.children} onChange={set('children')} />
                </Field>

                <button type="submit" disabled={loading || config?.modelAvailable === false} className="btn btn-primary w-full">
                  {loading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                  {loading ? 'Assessing your risk...' : 'Assess my risk'}
                </button>

                <Notice tone="warn" show={config?.modelAvailable === false}>
                  The risk model is offline (ML service not running), so assessments are unavailable right now.
                </Notice>
                <Notice tone="danger" show={Boolean(error)}>
                  {error}
                </Notice>

                <p className="t-note">
                  BMI categories use Asian cut-offs, where healthy is 18.5 to 22.9 (source: {config?.bmiSource || 'Malaysian CPG on obesity'}). Gender
                  and location are not asked: they add no accuracy in this model.
                </p>
              </form>
            </Card>
          </div>

          <div ref={resultRef} className="xl:col-span-7 min-w-0 scroll-mt-20 md:scroll-mt-4">
            <AnimatePresence initial={false} mode="wait">
              {result ? (
                <m.div key="result" {...SLIDE}>
                  <div className="space-y-4">
                    <Card className="card-gold">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex-1 min-w-52">
                          <div className="flex items-center gap-3">
                            <span className="chip tone-gold !bg-surface">
                              <Gauge className="w-[1.125rem] h-[1.125rem]" aria-hidden="true" />
                            </span>
                            <h2 className="t-section">Risk score</h2>
                          </div>
                          <p className="t-figure text-4xl sm:text-5xl mt-3">
                            <RollingText text={pct(result.risk_score)} />
                          </p>
                          <p className="t-note mt-2">
                            Based on age <span className="num">{result.input.age}</span>, BMI <span className="num">{result.input.bmi}</span> (
                            {result.input.bmiCategory}), {result.input.smoker ? 'smoker' : 'non-smoker'},{' '}
                            <span className="num">{result.input.children}</span> children.
                          </p>
                        </div>
                        <TierStamp tier={result.risk_tier} />
                      </div>
                    </Card>

                    <Card icon={Gauge} tone="blue" title="Risk bands" note="Where your score sits">
                      <RiskDial score={result.risk_score} tier={result.risk_tier} thresholds={result.thresholds} />
                      <p className="mt-4 text-ink-2">
                        Probability that your profile belongs to the higher-cost half of people in the training data. Higher scores usually mean
                        higher medical and life insurance premiums.
                      </p>
                      <Notice tone="warn" show={result.out_of_range?.length > 0} className="mt-4">
                        {result.out_of_range?.join(' and ')} is outside the range the model was trained on, so treat this score as a rough guide.
                      </Notice>
                    </Card>
                  </div>
                </m.div>
              ) : (
                <m.div key="empty" className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                  <Card icon={Gauge} tone="gold" title="Your result" note="Appears here after your check" className="h-full">
                    <Empty icon={Gauge} title="No assessment yet">
                      Fill in your profile and press Assess my risk. You will see your risk score and tier, which factors raised or lowered it, and what
                      changing a habit would do.
                    </Empty>
                    <div className="rounded-xl bg-paper px-4 py-3">
                      <h3 className="font-display font-semibold text-base">How this works</h3>
                      <p className="mt-1 text-sm text-ink-2">{HOW_IT_WORKS}</p>
                    </div>
                  </Card>
                </m.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {result && (
            <m.div key="details" {...SLIDE}>
              <div className="space-y-4">
                <Card icon={Scale} tone="purple" title="Score breakdown" note="Which factors moved your score">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-8">
                    <div className="lg:col-span-4 min-w-0">
                      <p className="text-ink-2">
                        Your score is a starting point plus a push from each factor. We start from a person with average age, BMI, children and
                        smoking rate (score <span className="num">{pct(sigmoid(result.base_value))}</span>). Each bar shows how much that factor pushed
                        your score <span className="text-danger font-semibold">up</span> or <span className="text-ok font-semibold">down</span>, and a
                        longer bar is a bigger push. The starting point plus the bars gives exactly your score.
                      </p>
                      <p className="t-note mt-2">These are SHAP values. Units are log-odds, the scale the model adds factors on.</p>
                    </div>
                    <div className="lg:col-span-8 min-w-0">
                      <ShapBars contributions={result.contributions} />
                    </div>
                  </div>
                </Card>

                <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                  {result.what_if.length > 0 && (
                    <Card
                      icon={SlidersHorizontal}
                      tone="orange"
                      title="What-if scenarios"
                      note="Each bar is the new score. The dark mark is your score now."
                      className="xl:col-span-7"
                    >
                      <ul className="space-y-3">
                        {result.what_if.map((w) => (
                          <WhatIfRow key={w.scenario} scenario={w} current={result.risk_score} />
                        ))}
                      </ul>
                    </Card>
                  )}

                  <Card
                    icon={Lightbulb}
                    tone="green"
                    title="Next steps"
                    note="Tips based on your profile"
                    className={result.what_if.length > 0 ? 'xl:col-span-5' : 'xl:col-span-12'}
                  >
                    <ul className="divide-y divide-line">
                      {result.tips.map((t) => (
                        <li key={t} className="py-2.5 first:pt-0 last:pb-0 text-ink-2">
                          {t}
                        </li>
                      ))}
                    </ul>
                  </Card>
                </div>

                <ModelFacts model={result.model} />
              </div>
            </m.div>
          )}
        </AnimatePresence>

        <Card icon={ShieldAlert} tone="orange" title="Disclaimer">
          <p className="t-note max-w-[72ch]">
            Estimates only, not financial or medical advice. Insurers use their own underwriting (medical history, occupation, health checks) to set
            premiums.
          </p>
        </Card>

        <ProtectionCard defaultDependants={Number(form.children) || 0} />

        <QuoteCompareCard defaultDependants={Number(form.children) || 0} />

        {history.length > 0 && (
          <Card icon={History} tone="purple" title="Past assessments" note="Your saved checks" flush>
            <div className="overflow-x-auto pb-1">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-ink-3 text-[0.8125rem]">
                    <th scope="col" className="py-2.5 pl-4 sm:pl-5 pr-3 font-medium">Date</th>
                    <th scope="col" className="py-2.5 pr-3 text-right font-medium">Age</th>
                    <th scope="col" className="py-2.5 pr-3 text-right font-medium">BMI</th>
                    <th scope="col" className="py-2.5 pr-3 font-medium">Smoker</th>
                    <th scope="col" className="py-2.5 pr-3 text-right font-medium">Children</th>
                    <th scope="col" className="py-2.5 pr-3 text-right font-medium">Score</th>
                    <th scope="col" className="py-2.5 pr-3 font-medium">Tier</th>
                    <th scope="col" className="py-2.5 pr-2 w-12"><span className="sr-only">Delete</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {history.map((h) => {
                    const when = new Date(h.predicted_at).toLocaleDateString('en-MY');
                    return (
                      <tr key={h.id} className="whitespace-nowrap">
                        <td className="py-1.5 pl-4 sm:pl-5 pr-3 num text-ink-2">{when}</td>
                        <td className="py-1.5 pr-3 text-right num">{h.age}</td>
                        <td className="py-1.5 pr-3 text-right num">{Number(h.bmi).toFixed(1)}</td>
                        <td className="py-1.5 pr-3">{h.smoker ? 'Yes' : 'No'}</td>
                        <td className="py-1.5 pr-3 text-right num">{h.children}</td>
                        <td className="py-1.5 pr-3 text-right num font-semibold">{pct(h.risk_score)}</td>
                        <td className="py-1.5 pr-3">
                          <TierTag value={h.risk_tier} />
                        </td>
                        <td className="py-1.5 pr-2 text-right">
                          <button
                            type="button"
                            onClick={() => deleteHistory(h.id)}
                            className="btn btn-icon btn-sm !min-w-9 hover:!text-danger hover:!bg-danger-wash"
                            aria-label={`Delete the assessment from ${when}`}
                          >
                            <Trash2 className="w-4 h-4" aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
