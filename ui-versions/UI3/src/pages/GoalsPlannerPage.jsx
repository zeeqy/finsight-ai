import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import {
  Baby,
  CalendarDays,
  Car,
  CheckCircle2,
  ChevronDown,
  Coins,
  Heart,
  Home,
  Loader2,
  Moon,
  Pause,
  Pencil,
  PiggyBank,
  Play,
  Plus,
  Star,
  Target,
  Trash2,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import Stamp from '../components/ui/Stamp';
import { Money } from '../components/ui/RollingNumber';
import { Reveal, RevealItem } from '../components/ui/Reveal';
import { Field, InfoTip, Loading, Meter, MoneyInput, Notice } from '../components/ui/Controls';
import { Modal, useConfirm } from '../components/ui/Modal';
import { CHART } from '../components/ui/chartTheme';
import CommitmentsModal, { COMMITMENTS_CHANGED } from '../components/CommitmentsModal';
import ZakatCard from '../components/goals/ZakatCard';
import DepositSuggestions from '../components/goals/DepositSuggestions';
import { EASE, SPRING, rise, stagger } from '../lib/motion';
import { fmtDuration, timeUntil } from '../lib/format';

const fmtRM = (n) =>
  `RM ${Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtRM0 = (n) => `RM ${Number(n || 0).toLocaleString('en-MY', { maximumFractionDigits: 0 })}`;
const fmtDate = (s) =>
  s ? new Date(`${s}T00:00:00`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';

const GOAL_META = {
  kahwin: { label: 'Kahwin', sub: 'Wedding', icon: Heart, tone: 'pink' },
  children: { label: 'Children', sub: 'Raising a child', icon: Baby, tone: 'blue' },
  haji: { label: 'Haji', sub: 'Pilgrimage', icon: Moon, tone: 'green' },
  house: { label: 'House', sub: 'Down payment + costs', icon: Home, tone: 'orange' },
  car: { label: 'Car', sub: 'Down payment + costs', icon: Car, tone: 'purple' },
  custom: { label: 'Custom', sub: 'Your own goal', icon: Star, tone: 'gold' },
};

/** One line on each savings vehicle, for someone choosing for the first time. */
const VEHICLE_HINT = {
  piggybank: 'Money you set aside yourself. It does not grow.',
  savings: 'A normal bank account. Easy to take out, low growth.',
  tabung_haji: 'Malaysian pilgrimage fund. Useful if you are saving for Haji.',
  asb: 'Unit trust fund open to Bumiputera investors.',
  gold: 'Rises and falls with the gold price, so it can lose value.',
};

function GoalChip({ type }) {
  const { icon: Icon, tone } = GOAL_META[type] || GOAL_META.custom;
  return (
    <span className={`chip tone-${tone}`}>
      <Icon className="w-[1.125rem] h-[1.125rem]" aria-hidden="true" />
    </span>
  );
}

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
    <Card
      icon={Coins}
      tone="gold"
      title="Gold price forecast"
      note={
        <>
          RM per gram. Last: <span className="num font-semibold text-ink">{fmtRM(outlook.last_actual.price)}</span> ({outlook.last_actual.month})
        </>
      }
    >
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
          <Area dataKey="band" name="80% range" stroke="none" fill={CHART.accent} fillOpacity={0.14} {...CHART.animation} />
          <Line dataKey="actual" name="Actual" stroke={CHART.accent} strokeWidth={2} dot={false} {...CHART.animation} />
          <Line dataKey="median" name="Forecast" stroke={CHART.accent} strokeWidth={2} strokeDasharray="5 4" dot={false} {...CHART.animation} />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="t-note mt-2">
        {outlook.model.name}, World Bank gold prices × USD/MYR from the US Federal Reserve (FRED). Backtest error at 12 months:{' '}
        {outlook.model.backtest_mape_12m}% (vs {outlook.model.naive_mape_12m}% for "price stays the same").
      </p>
    </Card>
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
      ? // Saved figures are the user's: worked-out costs do not overwrite them
        goal.cost_items.map((i) => ({ item_name: i.item_name, estimated_cost: String(i.estimated_cost), source: null, edited: true }))
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

/** The six goal types as buttons, the first step of a new goal. */
function GoalTypeChoice({ onPick }) {
  return (
    <m.ul className="grid grid-cols-1 sm:grid-cols-2 gap-3" variants={stagger(0.04)} initial="hidden" animate="show">
      {Object.entries(GOAL_META).map(([key, meta]) => (
        <m.li key={key} variants={rise}>
          <button
            type="button"
            onClick={() => onPick(key)}
            className="w-full min-h-11 flex items-center gap-3 rounded-xl border border-line p-3 text-left transition-colors hover:bg-paper hover:border-line-strong"
          >
            <GoalChip type={key} />
            <span className="min-w-0">
              <span className="block font-display font-semibold">{meta.label}</span>
              <span className="block t-note">{meta.sub}</span>
            </span>
          </button>
        </m.li>
      ))}
    </m.ul>
  );
}

/** A numbered part of the goal form. */
function Step({ n, id, title, note, action, children }) {
  return (
    <section aria-labelledby={id} className="rounded-xl border border-line p-4 min-w-0">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="chip tone-accent !w-7 !h-7 text-sm font-bold num">{n}</span>
          <div className="min-w-0">
            <h3 id={id} className="t-section mt-1">
              {title}
            </h3>
            {note && <div className="t-note mt-0.5">{note}</div>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** Savings vehicles ranked by monthly saving; a wash slides to the chosen one. */
function VehicleList({ rows, ranked, vehicle, onChange, n }) {
  return (
    <Step
      n={n}
      id="vehicle-title"
      title="Where will you save?"
      note={ranked ? 'Compared for this goal, lowest monthly saving first.' : 'Enter a target amount to compare them.'}
    >
      <ul role="radiogroup" aria-labelledby="vehicle-title" className="divide-y divide-line">
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
                {active && <m.span layoutId="vehicle-marker" className="absolute inset-0 rounded-control bg-accent-wash" transition={SPRING} />}
                <span className="relative min-w-0">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    {active && <CheckCircle2 className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />}
                    <span className="font-semibold">{c.label}</span>
                    <span className="t-note num">{c.rate_pct}% p.a.</span>
                    {c.shariah && <span className="tag tag-plain">Shariah-compliant</span>}
                  </span>
                  {VEHICLE_HINT[c.vehicle] && <span className="block t-note">{VEHICLE_HINT[c.vehicle]}</span>}
                  {c.growth_earned > 0 && <span className="block t-note text-ok">+{fmtRM0(c.growth_earned)} growth earned</span>}
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
        Savings, Tabung Haji and ASB use their latest published rates. Gold is planned at the cautious end of an ARIMA price
        forecast. Past returns do not guarantee future returns.
      </p>
      <details className="mt-1.5">
        <summary className="t-note cursor-pointer">Where these rates come from</summary>
        <ul className="mt-1.5 space-y-1">
          {rows
            .filter((c) => c.source)
            .map((c) => (
              <li key={c.vehicle} className="t-note">
                <span className="font-semibold text-ink-2">{c.label}:</span> {c.source}
              </li>
            ))}
        </ul>
      </details>
    </Step>
  );
}

function NewGoalModal({ config, goal = null, initialType = null, onClose, onSaved }) {
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
  const [buy, setBuy] = useState({ firstHome: false, engineCc: '' });
  const [costNote, setCostNote] = useState(null);
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

  useEffect(() => {
    if (initialType) pickType(initialType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the "Down payment" line in sync with price x %
  useEffect(() => {
    if (!isAssetGoal) return;
    setItems((list) =>
      list.map((i) => (i.item_name === 'Down payment' ? { ...i, estimated_cost: String(downPayment) } : i))
    );
  }, [downPayment, isAssetGoal]);

  // Stamp duty and legal fees (house) or road tax (car) follow the price, down payment and engine
  // size, worked out on the server from the published scales. A line the user has edited is left alone.
  useDebounced(
    async () => {
      if (!isAssetGoal) return;
      const q =
        goalType === 'house'
          ? `type=house&price=${parseFloat(asset.price) || 0}&down_pct=${parseFloat(asset.downPct) || 0}&first_home=${buy.firstHome}&purchase_date=${targetDate || ''}`
          : `type=car&engine_cc=${parseFloat(buy.engineCc) || 0}`;
      if (goalType === 'house' && !(parseFloat(asset.price) > 0)) return;
      try {
        const data = await authFetch(`/api/goals/purchase-costs?${q}`).then((r) => r.json());
        if (!data.success) return;
        setCostNote(data.data.note);
        setItems((list) =>
          list.map((i) => {
            const c = data.data.items.find((x) => x.item_name === i.item_name);
            return c && !i.edited ? { ...i, estimated_cost: String(c.cost), source: c.source } : i;
          })
        );
      } catch {
        // The lines stay editable by hand
      }
    },
    [goalType, asset.price, asset.downPct, buy.firstHome, buy.engineCc, targetDate]
  );

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
    : Object.entries(config.vehicles).map(([k, v]) => ({ vehicle: k, label: v.label, rate_pct: v.ratePct, shariah: v.shariah, source: v.source }));

  // Choosing the goal type is step 1 of a new goal; editing starts at the details
  const detailsStep = editing ? 1 : 2;
  const costsStep = detailsStep + (isAssetGoal ? 2 : 1);

  return (
    <Modal
      title={goalType ? `${editing ? 'Edit' : 'New'} ${GOAL_META[goalType].label} goal` : 'What are you saving for?'}
      description={goalType ? 'Work through the numbered steps. The monthly plan updates as you type.' : 'Step 1: pick a goal type. You can change every amount in the next steps.'}
      onClose={onClose}
      width={goalType ? 'max-w-5xl' : 'max-w-2xl'}
    >
      {!goalType ? (
        <GoalTypeChoice onPick={pickType} />
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left: details + cost items */}
            <div className="lg:col-span-5 min-w-0 space-y-4">
              <Step n={detailsStep} id="details-title" title="Goal details">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Goal name" className="col-span-2">
                    <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Wedding 2030" />
                  </Field>
                  <Field label="Target date" hint={timeUntil(targetDate)}>
                    <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
                  </Field>
                  <Field label="Already saved" prefix="RM">
                    <MoneyInput min="0" value={currentSaved} onChange={(e) => setCurrentSaved(e.target.value)} />
                  </Field>
                </div>
              </Step>

              {isAssetGoal && (
                <Step n={detailsStep + 1} id="asset-title" title={`${goalType === 'house' ? 'Property' : 'Car'} and loan`}>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Price" prefix="RM">
                      <MoneyInput value={asset.price} onChange={(e) => setAsset({ ...asset, price: e.target.value })} />
                    </Field>
                    <Field label="Down payment %">
                      <input type="number" min="0" max="100" step="0.1" value={asset.downPct} onChange={(e) => setAsset({ ...asset, downPct: e.target.value })} />
                    </Field>
                    <Field label="Loan rate (% p.a.)">
                      <input type="number" step="0.01" value={asset.rate} onChange={(e) => setAsset({ ...asset, rate: e.target.value })} />
                    </Field>
                    <Field label="Tenure (years)">
                      <input type="number" value={asset.tenureYears} onChange={(e) => setAsset({ ...asset, tenureYears: e.target.value })} />
                    </Field>
                    <Field label="Existing monthly debt" prefix="RM" hint="Not stored, so re-enter it when you edit this goal." className="col-span-2">
                      <MoneyInput value={asset.commitments} onChange={(e) => setAsset({ ...asset, commitments: e.target.value })} />
                    </Field>
                    {goalType === 'house' ? (
                      <label className="col-span-2 flex items-start gap-2.5 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          className="mt-0.5 w-4 h-4 accent-[var(--accent)]"
                          checked={buy.firstHome}
                          onChange={(e) => setBuy({ ...buy, firstHome: e.target.checked })}
                        />
                        <span>
                          This is my first home
                          <span className="block t-note">First homes up to RM500,000 bought by 31 Dec 2027 pay no stamp duty (Budget 2026).</span>
                        </span>
                      </label>
                    ) : (
                      <Field label="Engine size (cc)" hint="For the first year's road tax. Leave blank to enter it yourself." className="col-span-2">
                        <input type="number" min="0" max="8000" className="num" value={buy.engineCc} onChange={(e) => setBuy({ ...buy, engineCc: e.target.value })} />
                      </Field>
                    )}
                  </div>
                  {costNote && <p className="t-note mt-2">{costNote}</p>}
                  {loanCheck &&
                    (loanCheck.error ? (
                      <Notice tone="danger" className="mt-3">
                        {loanCheck.error}
                      </Notice>
                    ) : (
                      <div className="mt-3 space-y-1.5 text-sm">
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
                </Step>
              )}

              <Step
                n={costsStep}
                id="costs-title"
                title="Cost breakdown"
                note={templateGroup && templateGroup !== 'ALL' ? `${templateGroup} template` : null}
                action={
                  <button
                    type="button"
                    onClick={() => setItems([...items, { item_name: '', estimated_cost: '', source: null }])}
                    className="btn btn-soft btn-sm"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    Add item
                  </button>
                }
              >
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
                        <MoneyInput
                          min="0"
                          className="field num w-28 shrink-0"
                          aria-label={`${item.item_name || `Item ${idx + 1}`} cost in RM`}
                          value={item.estimated_cost}
                          placeholder="0"
                          onChange={(e) => setItems(items.map((it, i) => (i === idx ? { ...it, estimated_cost: e.target.value, edited: true } : it)))}
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
                <div className="flex justify-between items-baseline gap-3 mt-3 pt-3 border-t border-line">
                  <span className="t-label">Target amount</span>
                  <span className="t-figure text-2xl">{fmtRM(target)}</span>
                </div>
              </Step>
            </div>

            {/* Right: savings vehicle comparison */}
            <div className="lg:col-span-7 min-w-0 space-y-4">
              <VehicleList n={costsStep + 1} rows={vehicleRows} ranked={Boolean(comparisons)} vehicle={vehicle} onChange={setVehicle} />

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
                    <div className="rounded-xl border border-line p-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
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
            <button type="button" onClick={save} disabled={saving || !(target > 0)} className="btn btn-accent">
              {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              {saving ? 'Saving...' : editing ? 'Save changes' : 'Save goal'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

/* Goal card */

function GoalCard({ goal, vehicles, lead, onChanged, onEdit }) {
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
    <article className="card h-full p-4 sm:p-5 flex flex-col min-w-0">
      <div className="flex items-start gap-3 min-w-0">
        <GoalChip type={goal.goal_type} />
        <div className="min-w-0">
          <h3 className="t-section break-words">{goal.title}</h3>
          <p className="t-note mt-0.5">
            {meta.label} · by {fmtDate(goal.target_date)}
          </p>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 empty:hidden">
        <StatusTag value={status} />
        {lead && <span className="tag bg-accent-wash text-accent-deep">Needs you first</span>}
      </div>

      <div className="mt-3.5 min-w-0">
        <div className="flex items-baseline justify-between gap-3 text-sm mb-1.5">
          <span className="text-ink-2 min-w-0">
            <span className="num font-semibold text-ink">{fmtRM0(goal.current_saved)}</span> of {fmtRM0(goal.target_amount)}
          </span>
          <span className="num font-semibold">{goal.progress_pct}%</span>
        </div>
        <Meter value={goal.progress_pct} tone={meterTone} label={`Saved towards ${goal.title}`} />
      </div>

      {isActive && (
        <dl className="mt-3.5 grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <dt className="t-label">Save monthly</dt>
            <dd className="t-figure text-xl mt-0.5">{fmtRM(goal.required_monthly)}</dd>
            <dd className="t-note">{fmtDuration(goal.months_left)} left</dd>
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

      <div className="mt-3 space-y-2 empty:hidden">
        <Notice tone="danger" show={isActive && Boolean(goal.suggested_date)}>
          Not reachable by {fmtDate(goal.target_date)} on your current surplus
          {goal.earlier_goals_monthly > 0 ? ', shared with the goals due before it' : ''}. Putting everything that is left towards it gets you there by{' '}
          <b>{fmtDate(goal.suggested_date)}</b>.
        </Notice>
        <Notice tone="warn" show={isActive && Boolean(goal.catches_up)}>
          Only <span className="num font-semibold">{fmtRM(goal.available_monthly)}</span> a month is free for this goal today, because goals due
          earlier take <span className="num">{fmtRM(goal.earlier_goals_monthly)}</span> first. It still makes the date once those goals finish
          and free their share.
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

      <div className="mt-auto pt-3 space-y-2">
        {isActive && (
          <div className="flex items-end gap-2">
            <Field label="Add savings" prefix="RM" className="flex-1 min-w-0">
              <MoneyInput min="0" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <button type="button" onClick={contribute} disabled={busy || !(parseFloat(amount) > 0)} className="btn btn-soft shrink-0">
              {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              Add
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-1 -mx-2">
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            aria-controls={detailsId}
            className="btn btn-icon px-2"
          >
            <m.span className="inline-flex" animate={{ rotate: expanded ? 180 : 0 }} transition={SPRING}>
              <ChevronDown className="w-4 h-4" aria-hidden="true" />
            </m.span>
            Breakdown and history
          </button>
          <div className="grid grid-flow-col auto-cols-fr gap-1.5 w-full">
            {goal.status !== 'completed' && (
              <button
                type="button"
                onClick={() => setStatus(isActive ? 'paused' : 'active')}
                className="btn btn-quiet btn-sm !px-2 !gap-1.5"
                aria-label={`${isActive ? 'Pause' : 'Resume'} ${goal.title}`}
              >
                {isActive ? <Pause className="w-3.5 h-3.5" aria-hidden="true" /> : <Play className="w-3.5 h-3.5" aria-hidden="true" />}
                {isActive ? 'Pause' : 'Resume'}
              </button>
            )}
            <button type="button" onClick={() => onEdit(goal)} className="btn btn-quiet btn-sm !px-2 !gap-1.5" aria-label={`Edit ${goal.title}`}>
              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
              Edit
            </button>
            <button type="button" onClick={remove} className="btn btn-danger-quiet btn-sm !px-2 !gap-1.5" aria-label={`Delete ${goal.title}`}>
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              Delete
            </button>
          </div>
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
            <div className="mt-2 pt-3 border-t border-line space-y-4 text-sm">
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
                        <span className="num text-ok font-semibold">+{fmtRM(c.amount)}</span>
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

/** The goals on one line, read left to right. Scrolls inside its own box on phones. */
function GoalTimeline({ layout, className = '' }) {
  const { points, todayPct } = layout;

  return (
    <Card icon={CalendarDays} tone="blue" title="Timeline" note="When each goal is due, soonest on the left" className={className}>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Goal timeline">
        <div className="px-16" style={{ minWidth: `${points.length * 8 + 8}rem` }}>
          <div className="relative h-44">
            <m.div
              className="absolute -left-8 -right-8 top-1/2 -translate-y-1/2 h-0.5 bg-accent"
              initial={{ clipPath: 'inset(0 100% 0 0)' }}
              animate={{ clipPath: 'inset(0 0% 0 0)' }}
              transition={{ duration: 0.6, ease: EASE }}
              aria-hidden="true"
            />

            <div className="absolute top-1/2 -translate-x-1/2" style={{ left: `${todayPct}%` }}>
              <span className="block mx-auto w-px h-4 -mt-2 bg-ink" aria-hidden="true" />
              <span className="block t-note mt-1">Today</span>
            </div>

            <m.ol className="absolute inset-0" variants={stagger(0.06, 0.1)} initial="hidden" animate="show">
              {points.map(({ goal, pct, above }) => (
                <m.li key={goal.id} variants={rise} className="absolute inset-y-0 w-32 -translate-x-1/2" style={{ left: `${pct}%` }}>
                  <span className={`absolute left-1/2 w-px h-6 bg-line-strong ${above ? 'bottom-1/2' : 'top-1/2'}`} aria-hidden="true" />
                  {/* The dot wears the goal type's colour, matching the chip on its card */}
                  <span
                    className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-[var(--tone)] tone-${
                      (GOAL_META[goal.goal_type] || GOAL_META.custom).tone
                    } ${goal.status === 'completed' ? 'bg-[var(--tone)]' : 'bg-surface'}`}
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
    </Card>
  );
}

/* Page */

const SEVERITY = { 'Not Feasible': 0, 'At Risk': 1, 'On Track': 2 };

/** Active goals first, the ones in most trouble on top, then soonest first. */
const byUrgency = (a, b) =>
  Number(b.status === 'active') - Number(a.status === 'active') ||
  (SEVERITY[a.feasibility] ?? 3) - (SEVERITY[b.feasibility] ?? 3) ||
  String(a.target_date).localeCompare(String(b.target_date));

/** What the monthly total means against the surplus. */
function planNote(summary, hasGoals) {
  if (!hasGoals) return 'Each goal is planned against your real spending.';
  const surplus = summary.monthly_surplus;
  const count = summary.active_goals;
  if (!count) return 'No active goals right now.';
  const across = `Across ${count} goal${count === 1 ? '' : 's'}.`;
  if (!(surplus > 0)) return `${across} Your monthly surplus is ${fmtRM0(surplus)}, so nothing is left over for these goals yet.`;
  const left = surplus - summary.total_required_monthly;
  return `${across} That is ${Math.round(summary.overall_ratio * 100)}% of your ${fmtRM0(surplus)} monthly surplus, ${
    left >= 0 ? `leaving ${fmtRM0(left)}` : `${fmtRM0(-left)} short`
  } each month.`;
}

/** How the monthly surplus was worked out, line by line, for the info button. */
function SurplusBreakdown({ summary }) {
  const rows = [
    [summary.income_source === 'statements' ? 'Income seen in your statements' : 'Monthly income (your profile)', summary.monthly_income],
    summary.months_used ? [`Average spending, last ${summary.months_used} month${summary.months_used === 1 ? '' : 's'}`, -summary.avg_monthly_spending] : null,
    summary.commitments_deducted > 0 ? ['Commitments not in your statements', -summary.commitments_deducted] : null,
  ].filter(Boolean);
  return (
    <span className="block space-y-2">
      <span className="block">Money left each month after spending, which your goals share. Goals due first take their share first.</span>
      <span className="block space-y-0.5">
        {rows.map(([label, value]) => (
          <span key={label} className="flex justify-between gap-3">
            <span>{label}</span>
            <span className="num whitespace-nowrap">{value < 0 ? `- ${fmtRM0(-value)}` : fmtRM0(value)}</span>
          </span>
        ))}
        <span className="flex justify-between gap-3 border-t border-line pt-0.5 font-semibold text-ink">
          <span>Surplus</span>
          <span className="num">{fmtRM0(summary.monthly_surplus)}</span>
        </span>
      </span>
      {summary.savings_moves_avg > 0 && (
        <span className="block">
          Transfers to your own savings (Tabung Haji, ASB, your own accounts) average {fmtRM0(summary.savings_moves_avg)} a month. They are
          saving, not spending, so they are left out.
        </span>
      )}
    </span>
  );
}

/** One figure in the summary row, the same shape as the Spend Analyser's. */
function Kpi({ icon: Icon, tone, label, note, info, gold = false, children }) {
  return (
    <RevealItem className={`card p-4 sm:p-5 min-w-0 flex flex-col ${gold ? 'card-gold' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="t-label flex items-center gap-1">
          {label}
          {info}
        </p>
        <span className={`chip tone-${tone} ${gold ? '!bg-surface' : ''}`}>
          <Icon className="w-[1.125rem] h-[1.125rem]" aria-hidden="true" />
        </span>
      </div>
      <div className="t-figure text-2xl lg:text-[1.625rem] mt-1.5 truncate">{children}</div>
      <div className="t-note mt-1.5">{note}</div>
    </RevealItem>
  );
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
  const [showCommitments, setShowCommitments] = useState(false);
  const closeCommitments = useCallback(() => setShowCommitments(false), []);

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
    window.addEventListener(COMMITMENTS_CHANGED, load);
    return () => window.removeEventListener(COMMITMENTS_CHANGED, load);
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
  const ordered = [...goals].sort(byUrgency);
  const urgentId = ordered.length > 1 && ordered[0].status === 'active' ? ordered[0].id : null;
  const newGoal = (type = true) => setShowNew(type);
  const onTrack = goals.filter((g) => g.status === 'active' && g.feasibility === 'On Track').length;
  const timeline = goals.length >= 2 ? timelineLayout(goals) : null;
  const sideBySide = !hasGoals || Boolean(timeline);

  return (
    <div>
      <PageHeader module="goals">
        {hasGoals && (
          <button type="button" onClick={() => newGoal()} className="btn btn-primary">
            <Plus className="w-4 h-4" aria-hidden="true" />
            New goal
          </button>
        )}
      </PageHeader>

      <div className="page space-y-4">
        {hasGoals && (
          <Reveal className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
            <Kpi icon={Target} tone="orange" gold label="Needed each month" note={planNote(summary, hasGoals)}>
              <Money value={required} decimals={0} />
            </Kpi>

            <Kpi
              icon={PiggyBank}
              tone={surplusPositive ? 'green' : 'danger'}
              label="Monthly surplus"
              info={
                <InfoTip label="how the surplus is worked out">
                  <SurplusBreakdown summary={summary} />
                </InfoTip>
              }
              note={
                <>
                  {summary.months_used
                    ? `Income ${fmtRM0(summary.monthly_income)} minus average spend ${fmtRM0(summary.avg_monthly_spending)} (${summary.months_used} mo)`
                    : `Income ${fmtRM0(summary.monthly_income)}, no spending data yet`}
                  {summary.commitments_deducted > 0 && `, minus ${fmtRM0(summary.commitments_deducted)} commitments`}
                  .{' '}
                  <button type="button" onClick={() => setShowCommitments(true)} className="link">
                    {summary.commitments_monthly > 0 ? 'Edit commitments' : 'Add commitments'}
                  </button>
                </>
              }
            >
              <span className={surplusPositive ? 'text-ok' : 'text-danger'}>
                <Money value={summary.monthly_surplus} />
              </span>
            </Kpi>

            <Kpi icon={Wallet} tone="blue" label="Saved so far" note={`of ${fmtRM0(summary.total_target)}`}>
              <Money value={summary.total_saved} decimals={0} />
              {summary.total_target > 0 && (
                <div className="mt-2.5">
                  <Meter value={(summary.total_saved / summary.total_target) * 100} label="Saved across all goals" />
                </div>
              )}
            </Kpi>

            <Kpi
              icon={CheckCircle2}
              tone="purple"
              label="Goals on track"
              note={
                activeCount > 0 ? (
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    Overall plan <StatusTag value={summary.overall_feasibility} />
                    {summary.overall_ratio !== null && <span className="num">{Math.round(summary.overall_ratio * 100)}% of surplus</span>}
                  </span>
                ) : (
                  'No active goals right now'
                )
              }
            >
              {`${onTrack} of ${activeCount}`}
            </Kpi>
          </Reveal>
        )}

        <Notice tone="warn" show={Boolean(summary.warning)}>
          {summary.warning}
        </Notice>

        {hasGoals && (
          <section aria-labelledby="goals-title" className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="chip tone-orange">
                <Target className="w-[1.125rem] h-[1.125rem]" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 id="goals-title" className="t-section">
                  Your goals
                </h2>
                <p className="t-note">Kahwin, children, Haji, house and car, planned against your real spending</p>
              </div>
            </div>

            <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              <AnimatePresence initial={false}>
                {ordered.map((g) => (
                  <m.li
                    key={g.id}
                    className="min-w-0"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ duration: 0.25, ease: EASE }}
                  >
                    <GoalCard goal={g} vehicles={config.vehicles} lead={g.id === urgentId} onChanged={load} onEdit={setEditingGoal} />
                  </m.li>
                ))}
              </AnimatePresence>
            </ul>
          </section>
        )}

        {hasGoals && <DepositSuggestions refreshKey={goals.map((g) => `${g.id}:${g.status}`).join(',')} onChanged={load} />}

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          {!hasGoals && (
            <Card icon={Target} tone="orange" title="Start here" note="Pick what you are saving for. You will see what to put aside each month." className="xl:col-span-8">
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-1">
                {Object.entries(GOAL_META).map(([key, meta]) => (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => newGoal(key)}
                      className="w-full h-full flex items-center gap-3 p-3 rounded-xl border border-line text-left transition-colors hover:border-accent hover:bg-accent-wash"
                    >
                      <GoalChip type={key} />
                      <span className="min-w-0">
                        <span className="block font-semibold leading-tight">{meta.label}</span>
                        <span className="block t-note leading-tight">{meta.sub}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {timeline && <GoalTimeline layout={timeline} className="xl:col-span-8" />}

          <Card
            icon={Users}
            tone="green"
            title="Income group"
            note="Used for Haji and child-cost templates"
            className={sideBySide ? 'xl:col-span-4' : 'xl:col-span-12'}
          >
            <select
              className={`field ${sideBySide ? '' : 'sm:max-w-xs'}`}
              aria-label="Income group"
              value={config.profile.income_group || ''}
              onChange={(e) => setIncomeGroup(e.target.value)}
            >
              <option value="">Not set</option>
              {config.incomeGroups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </Card>
        </div>

        <ZakatCard monthlyIncome={summary.monthly_income} />

        <Card>
          <p className="t-note">
            Estimates only, not financial advice. Cost templates are midpoints of the cited ranges, and expected returns are not
            guaranteed.
          </p>
        </Card>
      </div>

      {(showNew || editingGoal) && (
        <NewGoalModal
          initialType={typeof showNew === 'string' ? showNew : null}
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
      {showCommitments && <CommitmentsModal onClose={closeCommitments} onChanged={load} />}
    </div>
  );
}
