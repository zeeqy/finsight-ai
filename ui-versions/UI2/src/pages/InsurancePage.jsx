import React, { useState, useEffect, useCallback, useId, useRef } from 'react';
import { AnimatePresence, m, useInView } from 'motion/react';
import { ChevronDown, Loader2, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import PageHero from '../components/ui/PageHero';
import Stamp from '../components/ui/Stamp';
import { RollingText } from '../components/ui/RollingNumber';
import { Reveal, RevealItem } from '../components/ui/Reveal';
import { Field, Meter, Notice, Segmented } from '../components/ui/Controls';
import { useConfirm } from '../components/ui/Modal';
import { EASE } from '../lib/motion';

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
const DIAL_ARC = `M ${DIAL.cx - DIAL.r} ${DIAL.cy} A ${DIAL.r} ${DIAL.r} 0 0 1 ${DIAL.cx + DIAL.r} ${DIAL.cy}`;
// Shown on the empty dial only; a result brings its own thresholds
const RESTING_THRESHOLDS = { low_max: 0.3, high_min: 0.7 };
const NEEDLE_SPRING = { type: 'spring', stiffness: 70, damping: 10, mass: 0.9 };

/** Point on the dial at fraction t of the sweep, `r` from the centre. */
function dialPoint(t, r) {
  const angle = Math.PI * (1 - t);
  return { x: DIAL.cx + r * Math.cos(angle), y: DIAL.cy - r * Math.sin(angle) };
}

/** Half-circle gauge. With no score it rests at zero, and it swings when a result arrives. */
function RiskDial({ score, tier, thresholds }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const turn = inView ? Math.min(1, Math.max(0, score ?? 0)) : 0;
  const { low_max: low, high_min: high } = thresholds;

  // The gradient runs left to right, so a sweep fraction has to become a horizontal fraction
  const gradientStop = (t) => (1 - Math.cos(Math.PI * t)) / 2;
  const zones = [
    { name: 'Low', at: low / 2 },
    { name: 'Medium', at: (low + high) / 2 },
    { name: 'High', at: (1 + high) / 2 },
  ];
  const lowPct = Math.round(low * 100);
  const highPct = Math.round(high * 100);
  const summary = `Low is under ${lowPct}%, medium is ${lowPct}% to ${highPct}%, high is ${highPct}% and above.`;

  return (
    <svg
      ref={ref}
      viewBox="0 0 340 200"
      role="img"
      aria-label={score === null ? `Risk dial with no score yet. ${summary}` : `Risk dial at ${pct(score)}, ${tier} risk. ${summary}`}
      className="block w-full max-w-md mx-auto"
    >
      <defs>
        <linearGradient id="risk-dial-arc" gradientUnits="userSpaceOnUse" x1={DIAL.cx - DIAL.r} x2={DIAL.cx + DIAL.r} y1="0" y2="0">
          <stop offset={gradientStop(low)} style={{ stopColor: 'var(--jade)' }} />
          <stop offset={gradientStop((low + high) / 2)} style={{ stopColor: 'var(--gold-chart)' }} />
          <stop offset={gradientStop(high)} style={{ stopColor: 'var(--danger)' }} />
        </linearGradient>
      </defs>

      <path d={DIAL_ARC} fill="none" stroke="var(--paper-2)" strokeWidth={DIAL.stroke} />
      <m.path
        d={DIAL_ARC}
        fill="none"
        stroke="url(#risk-dial-arc)"
        strokeWidth={DIAL.stroke}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: turn }}
        transition={{ duration: 1.1, ease: EASE }}
      />

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

      {zones.map(({ name, at }) => {
        const p = dialPoint(at, DIAL.r + 26);
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

/** Lands the tier once the needle has swung, and only when it is on screen. */
function TierStamp({ tier }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const [landed, setLanded] = useState(false);

  useEffect(() => {
    if (!inView) return undefined;
    const timer = setTimeout(() => setLanded(true), 750);
    return () => clearTimeout(timer);
  }, [inView]);

  return (
    <div ref={ref} className="min-h-20 min-w-40 flex items-center justify-center">
      {landed && <Stamp label={`${tier} risk`} note="Not a premium quote" tone={TIER_TONE[tier]} />}
    </div>
  );
}

/** SHAP contributions as diverging bars: danger raises the score, jade lowers it. */
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
      <Reveal as="ul" className="space-y-5">
        {rows.map((d, i) => {
          const raises = d.impact > 0;
          const half = (Math.abs(d.impact) / edge) * 50;
          return (
            <RevealItem as="li" key={d.name}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span>
                  <span className="font-semibold">{d.name}</span> <span className="num text-ink-3">{d.value}</span>
                </span>
                <span className={`font-semibold ${raises ? 'text-danger' : 'text-jade'}`}>
                  {raises ? 'Raises your score' : 'Lowers your score'}{' '}
                  <span className="num">
                    {raises ? '+' : ''}
                    {d.impact}
                  </span>
                </span>
              </div>
              <div className="relative h-3 mt-1.5 rounded-control bg-paper-2">
                <m.div
                  className={`absolute inset-y-0 ${raises ? 'bg-danger origin-left rounded-r-control' : 'bg-jade origin-right rounded-l-control'}`}
                  style={raises ? { left: '50%', width: `${half}%` } : { right: '50%', width: `${half}%` }}
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.8, ease: EASE, delay: 0.15 + i * 0.08 }}
                />
                <span className="absolute left-1/2 -top-1 -bottom-1 w-px bg-ink" aria-hidden="true" />
              </div>
            </RevealItem>
          );
        })}
      </Reveal>
      <div className="grid grid-cols-3 mt-2 t-note num" aria-hidden="true">
        <span>-{edge}</span>
        <span className="text-center">0</span>
        <span className="text-right">+{edge}</span>
      </div>
    </div>
  );
}

function ModelFacts({ model }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="rule">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full min-h-11 items-center justify-between gap-3 py-2 text-sm font-semibold text-ink-2 hover:text-ink transition-colors"
      >
        About this model
        <m.span className="inline-flex" animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25, ease: EASE }}>
          <ChevronDown className="w-4 h-4" aria-hidden="true" />
        </m.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <m.div id={panelId} key="facts" {...SLIDE}>
            <div className="pb-4 space-y-2 text-sm text-ink-2 max-w-[70ch]">
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
    if (!(await confirm({ title: 'Delete this assessment?', body: 'This cannot be undone.' }))) return;
    await authFetch(`/api/insurance/history/${id}`, { method: 'DELETE' });
    loadHistory();
  };

  const bmi = bmiOf(form.height_cm, form.weight_kg);
  const bmiCat = bmiLabel(bmi, config?.bmiBands);
  const ageRange = config?.ageRange || { min: 18, max: 64 };

  return (
    <div>
      <PageHero
        module="Insurance Risk Predictor"
        title={
          result ? (
            <>
              Your risk score is <RollingText text={pct(result.risk_score)} />
            </>
          ) : (
            'How does your lifestyle shape your risk?'
          )
        }
        lead="See how age, BMI, smoking and children shape your insurance risk, and which factor moved it most. This is a risk score, not a premium quote."
        energy={result?.risk_score}
      />

      <div className="page space-y-10 md:space-y-14 pb-14">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          <form onSubmit={runAssessment} aria-labelledby="profile-title" className="lg:col-span-5 min-w-0 sheet p-5 sm:p-6 space-y-5">
            <h2 id="profile-title" className="t-section">
              Your lifestyle profile
            </h2>

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

          <section aria-labelledby="risk-title" className="lg:col-span-7 min-w-0 sheet-lift p-5 sm:p-7">
            <h2 id="risk-title" className="t-section mb-4">
              Where does your profile land?
            </h2>
            <RiskDial
              score={result ? result.risk_score : null}
              tier={result?.risk_tier}
              thresholds={result?.thresholds || RESTING_THRESHOLDS}
            />

            <AnimatePresence initial={false} mode="wait">
              {result ? (
                <m.div key="result" {...SLIDE}>
                  <div className="pt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                    <div>
                      <p className="t-label">Risk score</p>
                      <p className="t-figure text-4xl mt-1">{pct(result.risk_score)}</p>
                    </div>
                    <TierStamp tier={result.risk_tier} />
                  </div>
                  <p className="mt-4 text-ink-2">
                    Probability that your profile belongs to the higher-cost half of people in the training data. Higher scores usually mean
                    higher medical and life insurance premiums.
                  </p>
                  <p className="t-note mt-2">
                    Based on age <span className="num">{result.input.age}</span>, BMI <span className="num">{result.input.bmi}</span> (
                    {result.input.bmiCategory}), {result.input.smoker ? 'smoker' : 'non-smoker'}, <span className="num">{result.input.children}</span>{' '}
                    children.
                  </p>
                  <Notice tone="warn" show={result.out_of_range?.length > 0} className="mt-4">
                    {result.out_of_range?.join(' and ')} is outside the range the model was trained on, so treat this score as a rough guide.
                  </Notice>
                </m.div>
              ) : (
                <m.div key="intro" {...SLIDE}>
                  <h3 className="font-display font-semibold text-base pt-5">How this works</h3>
                  <p className="mt-1 text-ink-2">{HOW_IT_WORKS}</p>
                </m.div>
              )}
            </AnimatePresence>
          </section>
        </div>

        {result && (
          <>
            <section aria-labelledby="shap-title" className="rule pt-8 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12">
              <div className="lg:col-span-4 min-w-0">
                <h2 id="shap-title" className="t-section">
                  What pushed your score up or down?
                </h2>
                <p className="mt-2 text-ink-2">
                  Starting from a person with average age, BMI, children and smoking rate (score{' '}
                  <span className="num">{pct(sigmoid(result.base_value))}</span>), each bar shows how much that factor pushed your score{' '}
                  <span className="text-danger font-semibold">up</span> or <span className="text-jade font-semibold">down</span>. The starting point
                  plus the bars gives exactly your score.
                </p>
                <p className="t-note mt-2">These are SHAP values. Units are log-odds, the scale the model adds factors on.</p>
              </div>
              <div className="lg:col-span-8 min-w-0">
                <ShapBars contributions={result.contributions} />
              </div>
            </section>

            <div className="rule pt-8 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14">
              {result.what_if.length > 0 && (
                <section aria-labelledby="whatif-title" className="lg:col-span-7 min-w-0">
                  <h2 id="whatif-title" className="t-section">
                    What if you changed something?
                  </h2>
                  <p className="t-note mt-1">Each bar is the new score. The dark mark is your score now.</p>
                  <Reveal as="ul" gap={0.12} className="mt-2 divide-y divide-line">
                    {result.what_if.map((w) => {
                      const diff = (w.risk_score - result.risk_score) * 100;
                      const unchanged = Math.abs(diff) < 0.05;
                      return (
                        <RevealItem as="li" key={w.scenario} className="py-3.5">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                            <span className="font-semibold">{w.scenario}</span>
                            <span className={`text-sm font-semibold ${diff < -0.05 ? 'text-jade' : 'text-ink-3'}`}>
                              {unchanged ? (
                                'No change'
                              ) : (
                                <>
                                  <span className="num">{Math.abs(diff).toFixed(1)}</span> points {diff > 0 ? 'higher' : 'lower'}
                                </>
                              )}
                            </span>
                          </div>
                          <div className="my-2">
                            <Meter
                              value={w.risk_score * 100}
                              marker={result.risk_score * 100}
                              tone={TIER_TONE[w.risk_tier] || 'ink'}
                              label={`Score after: ${w.scenario}`}
                            />
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                            <span className="text-sm text-ink-2">
                              <span className="num">{pct(result.risk_score)}</span> now, <span className="num font-semibold text-ink">{pct(w.risk_score)}</span>{' '}
                              after
                            </span>
                            <TierTag value={w.risk_tier} />
                          </div>
                        </RevealItem>
                      );
                    })}
                  </Reveal>
                </section>
              )}

              <section aria-labelledby="tips-title" className={`min-w-0 ${result.what_if.length > 0 ? 'lg:col-span-5' : 'lg:col-span-7'}`}>
                <h2 id="tips-title" className="t-section">
                  What could you do next?
                </h2>
                <ul className="mt-2 divide-y divide-line">
                  {result.tips.map((t) => (
                    <li key={t} className="py-2.5 text-ink-2">
                      {t}
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <ModelFacts model={result.model} />
          </>
        )}

        <p className="t-note max-w-[72ch]">
          Estimates only, not financial or medical advice. Insurers use their own underwriting (medical history, occupation, health checks) to set
          premiums.
        </p>

        {history.length > 0 && (
          <section aria-labelledby="history-title">
            <h2 id="history-title" className="t-section mb-4">
              Past assessments
            </h2>
            <div className="sheet overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-ink-3 text-[0.8125rem]">
                    <th scope="col" className="py-2.5 pl-4 pr-3 font-medium">Date</th>
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
                        <td className="py-1.5 pl-4 pr-3 num text-ink-2">{when}</td>
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
          </section>
        )}
      </div>
    </div>
  );
}
