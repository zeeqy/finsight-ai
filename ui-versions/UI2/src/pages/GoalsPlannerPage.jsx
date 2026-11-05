import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { CheckCircle2, ChevronDown, Loader2, Pause, Pencil, Play, Plus, Trash2, X } from 'lucide-react';
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import PageHero from '../components/ui/PageHero';
import Stamp from '../components/ui/Stamp';
import { Money } from '../components/ui/RollingNumber';
import { Reveal, RevealItem } from '../components/ui/Reveal';
import { Empty, Field, Loading, Meter, Notice } from '../components/ui/Controls';
import { Modal, useConfirm } from '../components/ui/Modal';
import { CHART } from '../components/ui/chartTheme';
import { EASE, SPRING, rise, stagger } from '../lib/motion';

const fmtRM = (n) =>
  `RM ${Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtRM0 = (n) => `RM ${Number(n || 0).toLocaleString('en-MY', { maximumFractionDigits: 0 })}`;
const fmtDate = (s) =>
  s ? new Date(`${s}T00:00:00`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';

const GOAL_META = {
  kahwin: { label: 'Kahwin', sub: 'Wedding' },
  children: { label: 'Children', sub: 'Raising a child' },
  haji: { label: 'Haji', sub: 'Pilgrimage' },
  house: { label: 'House', sub: 'Down payment + costs' },
  car: { label: 'Car', sub: 'Down payment + costs' },
  custom: { label: 'Custom', sub: 'Your own goal' },
};

/** API status values, in the words and tones the page shows them. */
const STATUS = {
  'On Track': { label: 'On track', tag: 'tag-ok', tone: 'ok' },
  'At Risk': { label: 'At risk', tag: 'tag-warn', tone: 'warn' },
  'Not Feasible': { label: 'Not feasible', tag: 'tag-danger', tone: 'danger' },
  Healthy: { label: 'Healthy', tag: 'tag-ok', tone: 'ok' },
  Moderate: { label: 'Moderate', tag: 'tag-warn', tone: 'warn' },
  High: { label: 'High', tag: 'tag-danger', tone: 'danger' },
  completed: { label: 'Completed', tag: 'tag-ok', tone: 'ok' },
  paused: { label: 'Paused', tag: 'tag-plain', tone: 'ink' },
};

function StatusTag({ value }) {
  if (!value) return null;
  return <span className={`tag ${STATUS[value]?.tag || 'tag-plain'}`}>{STATUS[value]?.label || value}</span>;
}

/** Gold price history + ARIMA forecast with its 80% interval (Module 4 AI component). */
function GoldForecastChart({ outlook }) {
  const data = [
    ...outlook.history.map((h) => ({ month: h.month, actual: h.price })),
    ...outlook.path.map((p) => ({ month: p.month, median: p.median, band: [p.lower80, p.upper80] })),
  ];
  return (
    <section aria-labelledby="gold-title" className="rule pt-5 min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-3">
        <h3 id="gold-title" className="t-section">
          Where might gold go?
        </h3>
        <p className="t-note">
          RM per gram. Last: <span className="num font-semibold text-ink">{fmtRM(outlook.last_actual.price)}</span> ({outlook.last_actual.month})
        </p>
      </div>
      <ResponsiveContainer width="100%" height={230}>
        <ComposedChart data={data} margin={{ top: 5, right: 0, left: -8, bottom: 0 }}>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="month" tick={CHART.tick} axisLine={CHART.axisLine} tickLine={false} minTickGap={48} />
          <YAxis tick={CHART.tick} axisLine={false} tickLine={false} width={48} domain={['auto', 'auto']} />
          <Tooltip
            {...CHART.tooltip}
            formatter={(v, name) => [Array.isArray(v) ? `${fmtRM(v[0])} to ${fmtRM(v[1])}` : fmtRM(v), name]}
          />
          <Legend wrapperStyle={CHART.legend} iconType="square" iconSize={10} />
          <Area dataKey="band" name="80% range" stroke="none" fill={CHART.jade} fillOpacity={0.14} {...CHART.animation} />
          <Line dataKey="actual" name="Actual" stroke={CHART.jade} strokeWidth={2} dot={false} {...CHART.animation} />
          <Line dataKey="median" name="Forecast" stroke={CHART.jade} strokeWidth={2} strokeDasharray="5 4" dot={false} {...CHART.animation} />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="t-note mt-2">
        {outlook.model.name}, World Bank gold prices × USD/MYR from the US Federal Reserve (FRED). Backtest error at 12 months:{' '}
        {outlook.model.backtest_mape_12m}% (vs {outlook.model.naive_mape_12m}% for "price stays the same").
      </p>
    </section>
  );
}

function plusMonths(months) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function useDebounced(fn, deps, delay = 350) {
  const ref = useRef(null);
  useEffect(() => {
    clearTimeout(ref.current);
    ref.current = setTimeout(fn, delay);
    return () => clearTimeout(ref.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** Form state for editing an existing goal (the list endpoint returns everything needed). */
function goalToForm(goal) {
  const price = goal.asset_price || 0;
  const down = goal.cost_items.find((i) => i.item_name === 'Down payment')?.estimated_cost || 0;
  return {
    items: goal.cost_items.length
      ? goal.cost_items.map((i) => ({ item_name: i.item_name, estimated_cost: String(i.estimated_cost), source: null }))
      : [{ item_name: 'Target amount', estimated_cost: String(goal.target_amount), source: null }],
    asset: {
      price: price ? String(price) : '',
      downPct: price ? String(Math.round((down / price) * 10000) / 100) : '10',
      rate: goal.loan_rate !== null && goal.loan_rate !== undefined ? String(goal.loan_rate) : '',
      tenureYears: goal.loan_tenure_months ? String(Math.round((goal.loan_tenure_months / 12) * 10) / 10) : '',
      commitments: '0', // not stored; only used for the live DSR check
    },
  };
}

/* New / edit goal dialog */

/** The six goal types as large words, like choosing a chapter of life. */
function ChapterChoice({ onPick }) {
  return (
    <m.ul className="flex flex-wrap gap-x-8 gap-y-5" variants={stagger(0.05)} initial="hidden" animate="show">
      {Object.entries(GOAL_META).map(([key, meta]) => (
        <m.li key={key} variants={rise}>
          <button type="button" onClick={() => onPick(key)} className="group block text-left">
            <span className="block font-display font-bold text-4xl sm:text-5xl leading-none tracking-tight transition-colors group-hover:text-jade group-focus-visible:text-jade">
              {meta.label}
            </span>
            <span
              className="block h-0.5 mt-2 bg-jade origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100 group-focus-visible:scale-x-100"
              aria-hidden="true"
            />
            <span className="block t-note mt-1">{meta.sub}</span>
          </button>
        </m.li>
      ))}
    </m.ul>
  );
}

/** Savings vehicles ranked by monthly saving; a wash slides to the chosen one. */
function VehicleList({ rows, ranked, vehicle, onChange }) {
  return (
    <div role="radiogroup" aria-labelledby="vehicle-title">
      <h3 id="vehicle-title" className="t-section">
        Where will you save?
      </h3>
      <p className="t-note mt-1">{ranked ? 'Compared for this goal, lowest monthly saving first.' : 'Enter a target amount to compare them.'}</p>
      <ul className="mt-3 divide-y divide-line">
        {rows.map((c) => {
          const active = vehicle === c.vehicle;
          return (
            <li key={c.vehicle}>
              <button
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onChange(c.vehicle)}
                className="relative w-full min-h-11 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 text-left rounded-control hover:bg-paper transition-colors"
              >
                {active && <m.span layoutId="vehicle-marker" className="absolute inset-0 rounded-control bg-jade-wash" transition={SPRING} />}
                <span className="relative min-w-0">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    {active && <CheckCircle2 className="w-4 h-4 text-jade shrink-0" aria-hidden="true" />}
                    <span className="font-semibold">{c.label}</span>
                    <span className="t-note num">{c.rate_pct}% p.a.</span>
                    {c.shariah && <span className="tag tag-plain">Shariah-compliant</span>}
                  </span>
                  {c.growth_earned > 0 && <span className="block t-note text-jade">+{fmtRM0(c.growth_earned)} growth earned</span>}
                  {c.forecast_rates && (
                    <span className="block t-note">
                      AI forecast: {c.forecast_rates.cautious}% cautious · {c.forecast_rates.expected}% expected ·{' '}
                      {c.forecast_rates.optimistic}% optimistic
                    </span>
                  )}
                  {c.note && !c.forecast_rates && <span className="block t-note text-warn">{c.note}</span>}
                </span>
                <span className="relative text-right shrink-0">
                  {c.required_monthly !== undefined && <span className="block num font-semibold">{fmtRM(c.required_monthly)}/mo</span>}
                  <StatusTag value={c.feasibility} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="t-note mt-3">
        Savings, Tabung Haji and ASB rates are placeholders and will be verified against the latest hibah and dividend
        announcements. Gold is planned at the cautious end of an ARIMA price forecast. Past returns do not guarantee future
        returns.
      </p>
    </div>
  );
}

function NewGoalModal({ config, goal = null, onClose, onSaved }) {
  const { authFetch } = useAuth();
  const editing = Boolean(goal);
  const initial = editing ? goalToForm(goal) : null;
  const [goalType, setGoalType] = useState(goal?.goal_type ?? null);
  const [title, setTitle] = useState(goal?.title ?? '');
  const [targetDate, setTargetDate] = useState(goal?.target_date ?? plusMonths(60));
  const [currentSaved, setCurrentSaved] = useState(goal ? String(goal.current_saved) : '0');
  const [vehicle, setVehicle] = useState(goal?.savings_vehicle ?? 'piggybank');
  const [items, setItems] = useState(initial?.items ?? []);
  const [templateGroup, setTemplateGroup] = useState(null);
  const [asset, setAsset] = useState(initial?.asset ?? { price: '', downPct: '10', rate: '', tenureYears: '', commitments: '0' });
  const [comparisons, setComparisons] = useState(null);
  const [goldOutlook, setGoldOutlook] = useState(null);
  const [loanCheck, setLoanCheck] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isAssetGoal = goalType === 'house' || goalType === 'car';
  const target = items.reduce((s, i) => s + (parseFloat(i.estimated_cost) || 0), 0);
  const downPayment = Math.round(((parseFloat(asset.price) || 0) * (parseFloat(asset.downPct) || 0)) / 100);

  const pickType = async (type) => {
    setGoalType(type);
    setTitle(type === 'custom' ? '' : GOAL_META[type].label);
    setError('');
    const loanCfg = config.loanTypes?.[type];
    const examplePrice = type === 'house' ? 400000 : 80000;
    const exampleDown = loanCfg ? Math.round((examplePrice * loanCfg.downPaymentPct) / 100) : 0;
    if (loanCfg) {
      setAsset({
        price: String(examplePrice),
        downPct: String(loanCfg.downPaymentPct),
        rate: String(loanCfg.defaultRatePct),
        tenureYears: String(loanCfg.defaultTenureYears),
        commitments: '0',
      });
    }
    if (type === 'haji') setVehicle('tabung_haji');
    if (type === 'custom') {
      setItems([{ item_name: 'Target amount', estimated_cost: '', source: null }]);
      return;
    }
    try {
      const group = config.profile.income_group ? `?income_group=${config.profile.income_group}` : '';
      const res = await authFetch(`/api/goals/templates/${type}${group}`);
      const data = await res.json();
      if (data.success) {
        setTemplateGroup(data.data.income_group);
        setItems(
          data.data.items.map((i) => ({
            item_name: i.item_name,
            estimated_cost: String(loanCfg && i.item_name === 'Down payment' ? exampleDown : i.default_cost),
            source: i.source,
          }))
        );
      }
    } catch (e) {
      setError(e.message);
    }
  };

  // Keep the "Down payment" line in sync with price x %
  useEffect(() => {
    if (!isAssetGoal) return;
    setItems((list) =>
      list.map((i) => (i.item_name === 'Down payment' ? { ...i, estimated_cost: String(downPayment) } : i))
    );
  }, [downPayment, isAssetGoal]);

  useDebounced(
    async () => {
      if (!goalType || !(target > 0) || !targetDate) return setComparisons(null);
      try {
        const res = await authFetch('/api/goals/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target_amount: target, current_saved: currentSaved, target_date: targetDate }),
        });
        const data = await res.json();
        setComparisons(data.success ? data.data.comparisons : null);
        setGoldOutlook(data.success ? data.data.gold_outlook : null);
        if (!data.success) setError(data.message);
        else setError('');
      } catch (e) {
        setError(e.message);
      }
    },
    [goalType, target, currentSaved, targetDate]
  );

  useDebounced(
    async () => {
      if (!isAssetGoal || !(parseFloat(asset.price) > 0) || !(parseFloat(asset.tenureYears) > 0)) return setLoanCheck(null);
      try {
        const res = await authFetch('/api/goals/loan-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            goal_type: goalType,
            asset_price: asset.price,
            down_payment: downPayment,
            loan_rate: asset.rate,
            tenure_years: asset.tenureYears,
            existing_commitments: asset.commitments,
          }),
        });
        const data = await res.json();
        setLoanCheck(data.success ? data.data : { error: data.message });
      } catch (e) {
        setLoanCheck({ error: e.message });
      }
    },
    [goalType, asset, downPayment]
  );

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await authFetch(editing ? `/api/goals/${goal.id}` : '/api/goals', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal_type: goalType,
          title,
          target_date: targetDate,
          current_saved: currentSaved,
          savings_vehicle: vehicle,
          cost_items: items,
          ...(isAssetGoal && {
            asset_price: asset.price,
            down_payment: downPayment,
            loan_rate: asset.rate,
            loan_tenure_months: Math.round((parseFloat(asset.tenureYears) || 0) * 12),
            existing_commitments: asset.commitments,
          }),
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const selected = comparisons?.find((c) => c.vehicle === vehicle);
  const vehicleRows = comparisons
    ? [...comparisons].sort((a, b) => a.required_monthly - b.required_monthly)
    : Object.entries(config.vehicles).map(([k, v]) => ({ vehicle: k, label: v.label, rate_pct: v.ratePct, shariah: v.shariah }));

  return (
    <Modal
      title={goalType ? `${editing ? 'Edit' : 'New'} ${GOAL_META[goalType].label} goal` : 'Which chapter of life are you saving for?'}
      onClose={onClose}
      width={goalType ? 'max-w-5xl' : 'max-w-2xl'}
    >
      {!goalType ? (
        <ChapterChoice onPick={pickType} />
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left: details + cost items */}
            <div className="lg:col-span-5 min-w-0 space-y-6">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Goal name" className="col-span-2">
                  <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Wedding 2030" />
                </Field>
                <Field label="Target date">
                  <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
                </Field>
                <Field label="Already saved" prefix="RM">
                  <input type="number" min="0" value={currentSaved} onChange={(e) => setCurrentSaved(e.target.value)} />
                </Field>
              </div>

              {isAssetGoal && (
                <section aria-labelledby="asset-title" className="rule pt-4 space-y-3">
                  <h3 id="asset-title" className="font-display font-semibold text-base">
                    {goalType === 'house' ? 'Property' : 'Car'} and loan
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Price" prefix="RM">
                      <input type="number" value={asset.price} onChange={(e) => setAsset({ ...asset, price: e.target.value })} />
                    </Field>
                    <Field label="Down payment %">
                      <input type="number" value={asset.downPct} onChange={(e) => setAsset({ ...asset, downPct: e.target.value })} />
                    </Field>
                    <Field label="Loan rate (% p.a.)">
                      <input type="number" step="0.05" value={asset.rate} onChange={(e) => setAsset({ ...asset, rate: e.target.value })} />
                    </Field>
                    <Field label="Tenure (years)">
                      <input type="number" value={asset.tenureYears} onChange={(e) => setAsset({ ...asset, tenureYears: e.target.value })} />
                    </Field>
                    <Field label="Existing monthly debt" prefix="RM" className="col-span-2">
                      <input type="number" value={asset.commitments} onChange={(e) => setAsset({ ...asset, commitments: e.target.value })} />
                    </Field>
                  </div>
                  {loanCheck &&
                    (loanCheck.error ? (
                      <Notice tone="danger">{loanCheck.error}</Notice>
                    ) : (
                      <div className="space-y-1.5 text-sm">
                        <div className="flex flex-wrap justify-between gap-x-3 text-ink-2">
                          <span>
                            Loan {fmtRM0(loanCheck.loan_amount)} ({loanCheck.interest_method === 'flat' ? 'flat rate' : 'reducing balance'})
                          </span>
                          <span className="num font-semibold text-ink">{fmtRM(loanCheck.monthly_instalment)}/mo</span>
                        </div>
                        {loanCheck.projected_dsr !== null && (
                          <div className="flex flex-wrap justify-between items-center gap-x-3 text-ink-2">
                            <span>Projected DSR after purchase</span>
                            <span className="flex items-center gap-2">
                              <span className="num font-semibold text-ink">{loanCheck.projected_dsr}%</span>
                              <StatusTag value={loanCheck.dsr_band} />
                            </span>
                          </div>
                        )}
                        <Notice tone="danger" show={Boolean(loanCheck.warning)}>
                          {loanCheck.warning}
                        </Notice>
                      </div>
                    ))}
                </section>
              )}

              <section aria-labelledby="costs-title" className="rule pt-4">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <h3 id="costs-title" className="font-display font-semibold text-base">
                    Cost breakdown
                    {templateGroup && templateGroup !== 'ALL' && <span className="t-note font-sans ml-2">({templateGroup} template)</span>}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setItems([...items, { item_name: '', estimated_cost: '', source: null }])}
                    className="btn btn-quiet btn-sm"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    Add item
                  </button>
                </div>
                <ul className="space-y-2">
                  {items.map((item, idx) => (
                    <li key={idx}>
                      <div className="flex gap-2">
                        <input
                          className="field flex-1 min-w-0"
                          aria-label={`Item ${idx + 1} name`}
                          value={item.item_name}
                          placeholder="Item"
                          onChange={(e) => setItems(items.map((it, i) => (i === idx ? { ...it, item_name: e.target.value } : it)))}
                        />
                        <input
                          type="number"
                          min="0"
                          className="field num w-28 shrink-0"
                          aria-label={`${item.item_name || `Item ${idx + 1}`} cost in RM`}
                          value={item.estimated_cost}
                          placeholder="0"
                          onChange={(e) => setItems(items.map((it, i) => (i === idx ? { ...it, estimated_cost: e.target.value } : it)))}
                        />
                        <button
                          type="button"
                          onClick={() => setItems(items.filter((_, i) => i !== idx))}
                          className="btn btn-icon shrink-0 hover:text-danger"
                          aria-label={`Remove ${item.item_name || `item ${idx + 1}`}`}
                        >
                          <X className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                      {item.source && <p className="t-note mt-0.5 ml-1 break-words">{item.source}</p>}
                    </li>
                  ))}
                </ul>
                <div className="flex justify-between items-baseline gap-3 mt-3 pt-3 rule">
                  <span className="t-label">Target amount</span>
                  <span className="t-figure text-2xl">{fmtRM(target)}</span>
                </div>
              </section>
            </div>

            {/* Right: savings vehicle comparison */}
            <div className="lg:col-span-7 min-w-0 space-y-6">
              <VehicleList rows={vehicleRows} ranked={Boolean(comparisons)} vehicle={vehicle} onChange={setVehicle} />

              <AnimatePresence initial={false}>
                {selected && (
                  <m.div
                    key="plan"
                    className="overflow-hidden"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: EASE }}
                  >
                    <div className="rule pt-5 pb-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
                      <div className="min-w-0 flex-1 basis-64">
                        <p className="t-label">With {selected.label}</p>
                        <p className="t-figure text-2xl mt-1">
                          Save {fmtRM(selected.required_monthly)} / month for {selected.months_left} months
                        </p>
                        <p className="t-note mt-1.5">Feasibility: {STATUS[selected.feasibility]?.label || selected.feasibility} against your monthly surplus</p>
                        {selected.required_monthly_expected !== undefined && (
                          <p className="t-note mt-1">
                            If gold grows as expected: {fmtRM(selected.required_monthly_expected)}/mo · optimistic:{' '}
                            {fmtRM(selected.required_monthly_optimistic)}/mo
                          </p>
                        )}
                      </div>
                      {STATUS[selected.feasibility] && (
                        <Stamp label={STATUS[selected.feasibility].label} tone={STATUS[selected.feasibility].tone} className="mx-2" />
                      )}
                    </div>
                  </m.div>
                )}
              </AnimatePresence>

              {vehicle === 'gold' && goldOutlook && <GoldForecastChart outlook={goldOutlook} />}
            </div>
          </div>

          <Notice tone="danger" show={Boolean(error)} className="mt-5">
            {error}
          </Notice>

          <div className="flex justify-end gap-2.5 mt-5">
            <button type="button" onClick={() => (editing ? onClose() : setGoalType(null))} className="btn btn-quiet">
              {editing ? 'Cancel' : 'Back'}
            </button>
            <button type="button" onClick={save} disabled={saving || !(target > 0)} className="btn btn-primary">
              {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              {saving ? 'Saving...' : editing ? 'Save changes' : 'Save goal'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

/* Goal row */

function GoalRow({ goal, vehicles, lead, onChanged, onEdit }) {
  const { authFetch } = useAuth();
  const confirm = useConfirm();
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgFailed, setMsgFailed] = useState(false);
  const meta = GOAL_META[goal.goal_type] || GOAL_META.custom;
  const isActive = goal.status === 'active';
  const status = isActive ? goal.feasibility : goal.status;
  const detailsId = `goal-details-${goal.id}`;

  const call = async (url, options) => {
    setBusy(true);
    setMsg('');
    setMsgFailed(false);
    try {
      const res = await authFetch(url, options);
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      if (data.message) setMsg(data.message);
      onChanged();
    } catch (e) {
      setMsg(e.message);
      setMsgFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const contribute = () =>
    call(`/api/goals/${goal.id}/contributions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount }),
    }).then(() => setAmount(''));

  const setStatus = (next) =>
    call(`/api/goals/${goal.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });

  const remove = async () => {
    if (await confirm({ title: `Delete "${goal.title}"?`, body: 'This removes its contributions too.' })) {
      call(`/api/goals/${goal.id}`, { method: 'DELETE' });
    }
  };

  const meterTone = STATUS[status]?.tone || 'ok';

  return (
    <article className={lead ? 'py-7 md:py-9' : 'py-5 md:py-6'}>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-10 gap-y-4 items-start">
        <div className={`min-w-0 ${lead ? 'lg:col-span-5' : 'lg:col-span-4'}`}>
          {lead && <p className="t-label text-jade mb-1">Needs you first</p>}
          <h3 className={`break-words ${lead ? 't-section text-3xl md:text-4xl' : 'font-display font-semibold text-xl'}`}>{goal.title}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="t-note">
              {meta.label} · by {fmtDate(goal.target_date)}
            </span>
            <StatusTag value={status} />
          </div>
        </div>

        <div className={`min-w-0 ${isActive ? 'lg:col-span-4' : lead ? 'lg:col-span-7' : 'lg:col-span-8'}`}>
          <div className="flex items-baseline justify-between gap-3 text-sm mb-1.5">
            <span className="text-ink-2 min-w-0">
              <span className="num font-semibold text-ink">{fmtRM0(goal.current_saved)}</span> of {fmtRM0(goal.target_amount)}
            </span>
            <span className="num font-semibold">{goal.progress_pct}%</span>
          </div>
          <Meter
            value={goal.progress_pct}
            tone={meterTone}
            height={lead ? 'h-3' : 'h-2'}
            label={`Saved towards ${goal.title}`}
          />
        </div>

        {isActive && (
          <dl className={`min-w-0 grid grid-cols-2 gap-4 ${lead ? 'lg:col-span-3' : 'lg:col-span-4'}`}>
            <div className="min-w-0">
              <dt className="t-label">Save monthly</dt>
              <dd className={lead ? 't-figure text-2xl mt-0.5' : 'num font-semibold text-base'}>{fmtRM(goal.required_monthly)}</dd>
              <dd className="t-note">{goal.months_left} months left</dd>
            </div>
            <div className="min-w-0">
              <dt className="t-label">Saving in</dt>
              <dd className="font-semibold break-words">{vehicles[goal.savings_vehicle]?.label || goal.savings_vehicle}</dd>
              <dd className="t-note num">
                {goal.rate_pct}% p.a. {goal.rate_note ? 'cautious forecast' : 'expected'}
              </dd>
            </div>
          </dl>
        )}
      </div>

      <div className="mt-4 space-y-2 empty:hidden">
        <Notice tone="danger" show={isActive && Boolean(goal.suggested_date)}>
          Not reachable by {fmtDate(goal.target_date)} on your current surplus. Saving your full surplus each month gets you there by{' '}
          <b>{fmtDate(goal.suggested_date)}</b>.
        </Notice>

        {goal.est_monthly_instalment !== null && (
          <p className="text-sm text-ink-2">
            Loan after down payment:{' '}
            <span className="num font-semibold text-ink">
              {fmtRM(goal.est_monthly_instalment)}/mo{goal.projected_dsr !== null && ` · DSR ${goal.projected_dsr}%`}
            </span>
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        {isActive && (
          <div className="flex items-end gap-2 w-full sm:w-80">
            <Field label="Add savings" prefix="RM" className="flex-1 min-w-0">
              <input type="number" min="0" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <button type="button" onClick={contribute} disabled={busy || !(parseFloat(amount) > 0)} className="btn btn-quiet shrink-0">
              {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              Add
            </button>
          </div>
        )}

        <div className="flex items-center gap-1 ml-auto">
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            aria-controls={detailsId}
            className="btn btn-icon px-3"
          >
            <m.span className="inline-flex" animate={{ rotate: expanded ? 180 : 0 }} transition={SPRING}>
              <ChevronDown className="w-4 h-4" aria-hidden="true" />
            </m.span>
            Breakdown and history
          </button>
          {goal.status !== 'completed' && (
            <button
              type="button"
              onClick={() => setStatus(isActive ? 'paused' : 'active')}
              className="btn btn-icon"
              aria-label={`${isActive ? 'Pause' : 'Resume'} ${goal.title}`}
              title={isActive ? 'Pause' : 'Resume'}
            >
              {isActive ? <Pause className="w-4 h-4" aria-hidden="true" /> : <Play className="w-4 h-4" aria-hidden="true" />}
            </button>
          )}
          <button type="button" onClick={() => onEdit(goal)} className="btn btn-icon" aria-label={`Edit ${goal.title}`} title="Edit">
            <Pencil className="w-4 h-4" aria-hidden="true" />
          </button>
          <button type="button" onClick={remove} className="btn btn-icon hover:text-danger" aria-label={`Delete ${goal.title}`} title="Delete">
            <Trash2 className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <Notice tone={msgFailed ? 'danger' : 'ok'} show={Boolean(msg)} className="mt-2">
        {msg}
      </Notice>

      <AnimatePresence initial={false}>
        {expanded && (
          <m.div
            key="details"
            id={detailsId}
            className="overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: EASE }}
          >
            <div className="pt-4 grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-5 text-sm">
              {goal.cost_items.length > 0 && (
                <div className="min-w-0">
                  <h4 className="t-label">What it costs</h4>
                  <ul className="mt-1.5 space-y-1">
                    {goal.cost_items.map((i) => (
                      <li key={i.item_name} className="flex justify-between gap-3">
                        <span className="min-w-0 break-words">{i.item_name}</span>
                        <span className="num shrink-0">{fmtRM0(i.estimated_cost)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="min-w-0">
                <h4 className="t-label">Recent contributions</h4>
                {goal.contributions.length ? (
                  <ul className="mt-1.5 space-y-1">
                    {goal.contributions.map((c) => (
                      <li key={c.id} className="flex justify-between gap-3">
                        <span className="num">{fmtDate(c.contributed_at)}</span>
                        <span className="num text-jade font-semibold">+{fmtRM(c.amount)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-ink-3 mt-1.5">None yet</p>
                )}
                {isActive && goal.rate_note && <p className="t-note mt-3">{goal.rate_note}</p>}
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </article>
  );
}

/* Timeline */

const dayMs = (s) => new Date(`${s}T00:00:00`).getTime();

/** Three thin strands around one line: the engraved rule the goals sit on. */
const strand = (phase) => {
  const points = [];
  for (let x = 0; x <= 1200; x += 12) points.push(`${x} ${(12 + 6 * Math.sin(x / 42 + phase)).toFixed(2)}`);
  return `M${points.join(' L')}`;
};
const STRANDS = [0, 2.1, 4.2].map(strand);

/** Places goals by target date as a % of the track, keeping neighbours far enough apart to read. */
function timelineLayout(goals) {
  const dated = goals
    .map((goal) => ({ goal, at: dayMs(goal.target_date) }))
    .filter((d) => Number.isFinite(d.at))
    .sort((a, b) => a.at - b.at);
  const n = dated.length;
  if (n < 2) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const now = today.getTime();
  const first = Math.min(now, dated[0].at);
  const span = Math.max(now, dated[n - 1].at) - first;

  // Labels alternate above and below, so a neighbour only needs half a label's width
  const gap = 56 / n;
  const pct = dated.map((d, i) => (span > 0 ? ((d.at - first) / span) * 100 : (i / (n - 1)) * 100));
  for (let i = 1; i < n; i++) pct[i] = Math.max(pct[i], pct[i - 1] + gap);
  pct[n - 1] = Math.min(100, pct[n - 1]);
  for (let i = n - 2; i >= 0; i--) pct[i] = Math.min(pct[i], pct[i + 1] - gap);

  return {
    todayPct: span > 0 ? ((now - first) / span) * 100 : 0,
    points: dated.map((d, i) => ({ goal: d.goal, pct: pct[i], above: i % 2 === 0 })),
  };
}

/** The goals as a line of life, read left to right. Scrolls inside its own box on phones. */
function GoalTimeline({ goals }) {
  const layout = timelineLayout(goals);
  if (!layout) return null;
  const { points, todayPct } = layout;

  return (
    <section aria-labelledby="timeline-title" className="page">
      <h2 id="timeline-title" className="t-section">
        When does each goal land?
      </h2>
      <div className="mt-2 overflow-x-auto" tabIndex={0} role="region" aria-labelledby="timeline-title">
        <div className="px-16" style={{ minWidth: `${points.length * 8 + 8}rem` }}>
          <div className="relative h-44">
            <m.div
              className="absolute -left-8 -right-8 top-1/2 -translate-y-1/2 h-6"
              initial={{ clipPath: 'inset(0 100% 0 0)' }}
              animate={{ clipPath: 'inset(0 0% 0 0)' }}
              transition={{ duration: 1.4, ease: EASE, delay: 0.15 }}
              aria-hidden="true"
            >
              <svg viewBox="0 0 1200 24" preserveAspectRatio="none" className="w-full h-full" fill="none">
                {STRANDS.map((d) => (
                  <path key={d} d={d} stroke="var(--jade)" strokeOpacity="0.45" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
                ))}
                <path d="M0 12 L1200 12" stroke="var(--jade)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              </svg>
            </m.div>

            <div className="absolute top-1/2 -translate-x-1/2" style={{ left: `${todayPct}%` }}>
              <span className="block mx-auto w-px h-4 -mt-2 bg-ink" aria-hidden="true" />
              <span className="block t-note mt-1">Today</span>
            </div>

            <m.ol className="absolute inset-0" variants={stagger(0.12, 0.3)} initial="hidden" animate="show">
              {points.map(({ goal, pct, above }) => (
                <m.li key={goal.id} variants={rise} className="absolute inset-y-0 w-32 -translate-x-1/2" style={{ left: `${pct}%` }}>
                  <span className={`absolute left-1/2 w-px h-6 bg-line-strong ${above ? 'bottom-1/2' : 'top-1/2'}`} aria-hidden="true" />
                  <span
                    className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-jade ${
                      goal.status === 'completed' ? 'bg-jade' : 'bg-paper'
                    }`}
                    aria-hidden="true"
                  />
                  <div className={`absolute inset-x-0 text-center ${above ? 'bottom-[calc(50%+1.625rem)]' : 'top-[calc(50%+1.625rem)]'}`}>
                    <p className="font-display font-semibold truncate leading-snug">{goal.title}</p>
                    <p className="t-note num">{fmtDate(goal.target_date)}</p>
                    {goal.status !== 'active' && <p className="t-note">{STATUS[goal.status]?.label || goal.status}</p>}
                  </div>
                </m.li>
              ))}
            </m.ol>
          </div>
        </div>
      </div>
    </section>
  );
}

/* Page */

const SEVERITY = { 'Not Feasible': 0, 'At Risk': 1, 'On Track': 2 };

/** Active goals first, the ones in most trouble on top, then soonest first. */
const byUrgency = (a, b) =>
  Number(b.status === 'active') - Number(a.status === 'active') ||
  (SEVERITY[a.feasibility] ?? 3) - (SEVERITY[b.feasibility] ?? 3) ||
  String(a.target_date).localeCompare(String(b.target_date));

function planLead(summary, hasGoals) {
  if (!hasGoals) return 'Start with Kahwin, Haji or a house down payment. Each goal is planned against your real spending.';
  const surplus = summary.monthly_surplus;
  const saved = `${fmtRM0(summary.total_saved)} saved of ${fmtRM0(summary.total_target)}.`;
  if (!summary.active_goals) return `No active goals. ${saved}`;
  if (!(surplus > 0)) return `Your monthly surplus is ${fmtRM0(surplus)}, so nothing is left over for these goals yet. ${saved}`;
  const left = surplus - summary.total_required_monthly;
  return `That is ${Math.round(summary.overall_ratio * 100)}% of your ${fmtRM0(surplus)} monthly surplus, ${
    left >= 0 ? `leaving ${fmtRM0(left)}` : `${fmtRM0(-left)} short`
  } each month. ${saved}`;
}

export default function GoalsPlannerPage() {
  const { authFetch } = useAuth();
  const [config, setConfig] = useState(null);
  const [goals, setGoals] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);

  const load = useCallback(async () => {
    try {
      const [cRes, gRes] = await Promise.all([authFetch('/api/goals/config'), authFetch('/api/goals')]);
      const [c, g] = await Promise.all([cRes.json(), gRes.json()]);
      if (!c.success) throw new Error(c.message);
      if (!g.success) throw new Error(g.message);
      setConfig(c.data);
      setGoals(g.data.goals);
      setSummary(g.data.summary);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  // Stable, because Modal re-runs its focus handling whenever onClose changes
  const closeModal = useCallback(() => {
    setShowNew(false);
    setEditingGoal(null);
  }, []);

  const setIncomeGroup = async (group) => {
    await authFetch('/api/goals/income-group', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ income_group: group || null }),
    });
    load();
  };

  if (loading) return <Loading>Loading your goals...</Loading>;

  if (error && !config) {
    return (
      <div className="page py-10">
        <Notice tone="danger">{error}</Notice>
      </div>
    );
  }

  const surplusPositive = summary.monthly_surplus > 0;
  const required = summary.total_required_monthly;
  const activeCount = summary.active_goals;
  const hasGoals = goals.length > 0;
  const energy = surplusPositive ? Math.max(0, Math.min(1, required / summary.monthly_surplus)) : required > 0 ? 1 : 0;
  const ordered = [...goals].sort(byUrgency);
  const urgentId = ordered.length > 1 && ordered[0].status === 'active' ? ordered[0].id : null;
  const newGoal = () => setShowNew(true);

  let title = 'What are you saving for?';
  if (hasGoals) title = 'No active goals right now';
  if (activeCount > 0) {
    title = (
      <>
        <Money value={required} decimals={0} /> a month across {activeCount} goal{activeCount === 1 ? '' : 's'}
      </>
    );
  }

  return (
    <div>
      <PageHero module="Life Goals Planner" title={title} lead={planLead(summary, hasGoals)} energy={energy}>
        {hasGoals && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <button type="button" onClick={newGoal} className="btn btn-primary">
              <Plus className="w-4 h-4" aria-hidden="true" />
              New goal
            </button>
            {activeCount > 0 && (
              <p className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
                Overall plan <StatusTag value={summary.overall_feasibility} />
                {summary.overall_ratio !== null && <span className="num">{Math.round(summary.overall_ratio * 100)}% of surplus</span>}
              </p>
            )}
          </div>
        )}
      </PageHero>

      {goals.length >= 2 && <GoalTimeline goals={goals} />}

      <div className="page space-y-10 md:space-y-14 mt-8 md:mt-10">
        <div className="rule pt-6 space-y-5">
          <Reveal className="grid grid-cols-1 md:grid-cols-[1.3fr_1fr_1fr] divide-y md:divide-y-0 md:divide-x divide-line">
            <RevealItem className="pb-4 md:pb-0 md:pr-6 min-w-0">
              <p className="t-label">Monthly surplus</p>
              <p className={`t-figure text-2xl md:text-[1.75rem] mt-1 ${surplusPositive ? 'text-jade' : 'text-danger'}`}>
                {fmtRM(summary.monthly_surplus)}
              </p>
              <p className="t-note mt-1.5">
                {summary.months_used
                  ? `Income ${fmtRM0(summary.monthly_income)} minus average spend ${fmtRM0(summary.avg_monthly_spending)} (${summary.months_used} mo)`
                  : `Income ${fmtRM0(summary.monthly_income)}, no spending data yet`}
              </p>
            </RevealItem>

            <RevealItem className="py-4 md:py-0 md:px-6 min-w-0">
              <p className="t-label">Saved so far</p>
              <p className="t-figure text-2xl md:text-[1.75rem] mt-1">{fmtRM0(summary.total_saved)}</p>
              <p className="t-note mt-1.5">of {fmtRM0(summary.total_target)}</p>
              {summary.total_target > 0 && (
                <div className="mt-2.5">
                  <Meter value={(summary.total_saved / summary.total_target) * 100} label="Saved across all goals" />
                </div>
              )}
            </RevealItem>

            <RevealItem className="pt-4 md:pt-0 md:pl-6 min-w-0">
              <Field label="Income group" hint="Used for Haji and child-cost templates">
                <select value={config.profile.income_group || ''} onChange={(e) => setIncomeGroup(e.target.value)}>
                  <option value="">Not set</option>
                  {config.incomeGroups.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </Field>
            </RevealItem>
          </Reveal>

          <Notice tone="warn" show={Boolean(summary.warning)}>
            {summary.warning}
          </Notice>
        </div>

        <section aria-labelledby="goals-title">
          <h2 id="goals-title" className="t-section">
            {urgentId ? 'Which goal needs you first?' : 'Your life goals'}
          </h2>
          <p className="t-note mt-1">Kahwin, children, Haji, house and car, planned against your real spending</p>

          {!hasGoals ? (
            <div className="mt-4 rule">
              <Empty
                title="No goals yet"
                action={
                  <button type="button" onClick={newGoal} className="btn btn-primary">
                    Create your first goal
                  </button>
                }
              >
                Start with Kahwin, Haji or a house down payment.
              </Empty>
            </div>
          ) : (
            <ul className="mt-4">
              <AnimatePresence initial={false}>
                {ordered.map((g) => (
                  <m.li
                    key={g.id}
                    className="rule"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                    transition={{ duration: 0.35, ease: EASE }}
                  >
                    <GoalRow goal={g} vehicles={config.vehicles} lead={g.id === urgentId} onChanged={load} onEdit={setEditingGoal} />
                  </m.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </section>

        <p className="t-note rule pt-4">
          Estimates only, not financial advice. Cost templates are midpoints of the cited ranges, and expected returns are not
          guaranteed.
        </p>
      </div>

      {(showNew || editingGoal) && (
        <NewGoalModal
          key={editingGoal?.id ?? 'new'}
          config={config}
          goal={editingGoal}
          onClose={closeModal}
          onSaved={() => {
            closeModal();
            load();
          }}
        />
      )}
    </div>
  );
}
