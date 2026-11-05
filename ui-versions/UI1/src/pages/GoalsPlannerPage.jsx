import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Heart,
  Baby,
  Plane,
  Home,
  Car,
  Target,
  Plus,
  X,
  Trash2,
  Pause,
  Play,
  PiggyBank,
  AlertTriangle,
  Info,
  Loader2,
  CheckCircle2,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Gauge,
  Wallet,
  Coins,
  Pencil,
} from 'lucide-react';
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const fmtRM = (n) =>
  `RM ${Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtRM0 = (n) => `RM ${Number(n || 0).toLocaleString('en-MY', { maximumFractionDigits: 0 })}`;
const fmtDate = (s) =>
  s ? new Date(`${s}T00:00:00`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';

const GOAL_META = {
  kahwin: { label: 'Kahwin', sub: 'Wedding', icon: Heart, color: '#F472B6' },
  children: { label: 'Children', sub: 'Raising a child', icon: Baby, color: '#38BDF8' },
  haji: { label: 'Haji', sub: 'Pilgrimage', icon: Plane, color: '#10B981' },
  house: { label: 'House', sub: 'Down payment + costs', icon: Home, color: '#FFC80A' },
  car: { label: 'Car', sub: 'Down payment + costs', icon: Car, color: '#A855F7' },
  custom: { label: 'Custom', sub: 'Your own goal', icon: Target, color: '#94A3B8' },
};

const FEAS_STYLES = {
  'On Track': 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  'At Risk': 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  'Not Feasible': 'text-rose-400 bg-rose-500/10 border-rose-500/30',
  Healthy: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  Moderate: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  High: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
  completed: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  paused: 'text-[#94A3B8] bg-[#1C202B] border-[#2D3547]',
};

const inputBase =
  'bg-[#0E1118] border border-[#2D3547] rounded-xl px-3 py-2 text-sm text-white placeholder-[#475569] focus:outline-none focus:border-[#FFC80A]/60 font-mono';
const inputCls = `w-full ${inputBase}`;
const labelCls = 'block text-[11px] font-bold uppercase tracking-wider text-[#94A3B8] mb-1.5';
const cardCls = 'bg-[#141824]/90 border border-[#232A3B] rounded-2xl p-5 shadow-lg';

/** Gold price history + ARIMA forecast with its 80% interval (Module 4 AI component). */
function GoldForecastChart({ outlook }) {
  const data = [
    ...outlook.history.map((h) => ({ month: h.month, actual: h.price })),
    ...outlook.path.map((p) => ({ month: p.month, median: p.median, band: [p.lower80, p.upper80] })),
  ];
  return (
    <div className="rounded-2xl border border-[#232A3B] bg-[#0E1118] p-4">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[11px] font-bold uppercase tracking-wider text-[#FFC80A]">Gold price forecast (RM / gram)</div>
        <div className="text-[10px] text-[#64748B] font-mono">
          Last: {fmtRM(outlook.last_actual.price)} ({outlook.last_actual.month})
        </div>
      </div>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#232A3B" />
            <XAxis dataKey="month" stroke="#64748B" tick={{ fontSize: 10 }} minTickGap={40} />
            <YAxis stroke="#64748B" tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
            <Tooltip
              contentStyle={{ background: '#0E1118', border: '1px solid #2D3547', borderRadius: 12, fontSize: 12 }}
              formatter={(v, name) => [Array.isArray(v) ? `${fmtRM(v[0])} – ${fmtRM(v[1])}` : fmtRM(v), name]}
            />
            <Area dataKey="band" name="80% range" stroke="none" fill="#FFC80A" fillOpacity={0.18} />
            <Line dataKey="actual" name="Actual" stroke="#E2E8F0" strokeWidth={2} dot={false} />
            <Line dataKey="median" name="Forecast" stroke="#FFC80A" strokeWidth={2} strokeDasharray="5 4" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[10px] text-[#64748B] mt-1">
        {outlook.model.name}, World Bank gold prices × USD/MYR from the US Federal Reserve (FRED). Backtest error at 12 months:{' '}
        {outlook.model.backtest_mape_12m}% (vs {outlook.model.naive_mape_12m}% for "price stays the same").
      </p>
    </div>
  );
}

function Badge({ value, label }) {
  if (!value) return null;
  return (
    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border whitespace-nowrap ${FEAS_STYLES[value] || 'text-[#CBD5E1] border-[#2D3547]'}`}>
      {label || value}
    </span>
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

/* ───────────────────────── New / edit goal modal ───────────────────────── */

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

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-4xl bg-[#11141D] border border-[#232A3B] rounded-2xl shadow-2xl my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#232A3B]">
          <div className="text-white font-extrabold">{goalType ? `${editing ? 'Edit' : 'New'} ${GOAL_META[goalType].label} goal` : 'Choose a life goal'}</div>
          <button onClick={onClose} className="text-[#64748B] hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!goalType ? (
          <div className="p-6 grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(GOAL_META).map(([key, m]) => {
              const Icon = m.icon;
              return (
                <button
                  key={key}
                  onClick={() => pickType(key)}
                  className="flex flex-col items-start gap-2 p-4 rounded-2xl bg-[#0E1118] border border-[#2D3547] hover:border-[#FFC80A]/50 transition text-left"
                >
                  <div className="p-2.5 rounded-xl" style={{ background: `${m.color}20`, color: m.color }}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="text-white font-bold">{m.label}</div>
                  <div className="text-[11px] text-[#64748B]">{m.sub}</div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: details + cost items */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className={labelCls}>Goal name</label>
                  <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Wedding 2030" />
                </div>
                <div>
                  <label className={labelCls}>Target date</label>
                  <input type="date" className={inputCls} value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Already saved (RM)</label>
                  <input type="number" min="0" className={inputCls} value={currentSaved} onChange={(e) => setCurrentSaved(e.target.value)} />
                </div>
              </div>

              {isAssetGoal && (
                <div className="p-4 rounded-2xl bg-[#0E1118] border border-[#232A3B] space-y-3">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[#FFC80A]">
                    {goalType === 'house' ? 'Property' : 'Car'} & loan
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Price (RM)</label>
                      <input type="number" className={inputCls} value={asset.price} onChange={(e) => setAsset({ ...asset, price: e.target.value })} />
                    </div>
                    <div>
                      <label className={labelCls}>Down payment %</label>
                      <input type="number" className={inputCls} value={asset.downPct} onChange={(e) => setAsset({ ...asset, downPct: e.target.value })} />
                    </div>
                    <div>
                      <label className={labelCls}>Loan rate (% p.a.)</label>
                      <input type="number" step="0.05" className={inputCls} value={asset.rate} onChange={(e) => setAsset({ ...asset, rate: e.target.value })} />
                    </div>
                    <div>
                      <label className={labelCls}>Tenure (years)</label>
                      <input type="number" className={inputCls} value={asset.tenureYears} onChange={(e) => setAsset({ ...asset, tenureYears: e.target.value })} />
                    </div>
                    <div className="col-span-2">
                      <label className={labelCls}>Existing monthly debt (RM)</label>
                      <input type="number" className={inputCls} value={asset.commitments} onChange={(e) => setAsset({ ...asset, commitments: e.target.value })} />
                    </div>
                  </div>
                  {loanCheck &&
                    (loanCheck.error ? (
                      <p className="text-xs text-rose-400">{loanCheck.error}</p>
                    ) : (
                      <div className="pt-2 border-t border-[#232A3B] space-y-1.5 text-xs">
                        <div className="flex justify-between text-[#94A3B8]">
                          <span>
                            Loan {fmtRM0(loanCheck.loan_amount)} ({loanCheck.interest_method === 'flat' ? 'flat rate' : 'reducing balance'})
                          </span>
                          <span className="text-white font-mono font-bold">{fmtRM(loanCheck.monthly_instalment)}/mo</span>
                        </div>
                        {loanCheck.projected_dsr !== null && (
                          <div className="flex justify-between items-center text-[#94A3B8]">
                            <span>Projected DSR after purchase</span>
                            <span className="flex items-center gap-2">
                              <span className="text-white font-mono font-bold">{loanCheck.projected_dsr}%</span>
                              <Badge value={loanCheck.dsr_band} />
                            </span>
                          </div>
                        )}
                        {loanCheck.warning && (
                          <p className="text-rose-300 flex gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            {loanCheck.warning}
                          </p>
                        )}
                      </div>
                    ))}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className={`${labelCls} mb-0`}>
                    Cost breakdown
                    {templateGroup && templateGroup !== 'ALL' && (
                      <span className="ml-2 text-[#FFC80A] normal-case font-mono">({templateGroup} template)</span>
                    )}
                  </label>
                  <button
                    onClick={() => setItems([...items, { item_name: '', estimated_cost: '', source: null }])}
                    className="text-[11px] text-[#FFC80A] flex items-center gap-1 hover:underline"
                  >
                    <Plus className="w-3 h-3" /> Add item
                  </button>
                </div>
                <div className="space-y-2">
                  {items.map((item, idx) => (
                    <div key={idx}>
                      <div className="flex gap-2">
                        <input
                          className={`${inputBase} font-sans flex-1 min-w-0`}
                          value={item.item_name}
                          placeholder="Item"
                          onChange={(e) => setItems(items.map((it, i) => (i === idx ? { ...it, item_name: e.target.value } : it)))}
                        />
                        <input
                          type="number"
                          min="0"
                          className={`${inputBase} w-32 shrink-0`}
                          value={item.estimated_cost}
                          placeholder="0"
                          onChange={(e) => setItems(items.map((it, i) => (i === idx ? { ...it, estimated_cost: e.target.value } : it)))}
                        />
                        <button onClick={() => setItems(items.filter((_, i) => i !== idx))} className="text-[#64748B] hover:text-rose-400 px-1">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      {item.source && <p className="text-[10px] text-[#64748B] mt-0.5 ml-1 truncate" title={item.source}>{item.source}</p>}
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center mt-3 pt-3 border-t border-[#232A3B]">
                  <span className="text-xs text-[#94A3B8] font-bold uppercase tracking-wider">Target amount</span>
                  <span className="text-xl font-black text-white font-mono">{fmtRM(target)}</span>
                </div>
              </div>
            </div>

            {/* Right: savings vehicle comparison */}
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Where will you save? (compare)</label>
                <div className="space-y-2">
                  {(comparisons || Object.entries(config.vehicles).map(([k, v]) => ({ vehicle: k, label: v.label, rate_pct: v.ratePct }))).map((c) => {
                    const active = vehicle === c.vehicle;
                    return (
                      <button
                        key={c.vehicle}
                        onClick={() => setVehicle(c.vehicle)}
                        className={`w-full flex items-center justify-between gap-3 p-3 rounded-xl border text-left transition ${
                          active ? 'bg-[#FFC80A]/10 border-[#FFC80A]/50' : 'bg-[#0E1118] border-[#2D3547] hover:border-[#FFC80A]/30'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className={`text-sm font-bold ${active ? 'text-[#FFC80A]' : 'text-white'}`}>
                            {c.label} <span className="text-[11px] font-mono text-[#64748B]">{c.rate_pct}% p.a.</span>
                          </div>
                          {c.growth_earned > 0 && (
                            <div className="text-[11px] text-emerald-400">+{fmtRM0(c.growth_earned)} growth earned</div>
                          )}
                          {c.forecast_rates && (
                            <div className="text-[10px] text-[#94A3B8]">
                              AI forecast: {c.forecast_rates.cautious}% cautious · {c.forecast_rates.expected}% expected ·{' '}
                              {c.forecast_rates.optimistic}% optimistic
                            </div>
                          )}
                          {c.note && !c.forecast_rates && <div className="text-[10px] text-amber-300/80">{c.note}</div>}
                        </div>
                        <div className="text-right shrink-0">
                          {c.required_monthly !== undefined && (
                            <div className="text-sm font-mono font-bold text-white">{fmtRM(c.required_monthly)}/mo</div>
                          )}
                          {c.feasibility && <Badge value={c.feasibility} />}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-[#64748B] mt-2">
                  Savings, Tabung Haji and ASB rates are placeholders and will be verified against the latest hibah and dividend
                  announcements. Gold is planned at the cautious end of an ARIMA price forecast. Past returns do not guarantee future
                  returns.
                </p>
              </div>

              {selected && (
                <div className={`rounded-2xl border p-4 ${FEAS_STYLES[selected.feasibility]}`}>
                  <div className="text-[11px] font-bold uppercase tracking-wider opacity-80">With {selected.label}</div>
                  <div className="text-lg font-black">
                    Save {fmtRM(selected.required_monthly)} / month for {selected.months_left} months
                  </div>
                  <div className="text-xs opacity-80">Feasibility: {selected.feasibility} against your monthly surplus</div>
                  {selected.required_monthly_expected !== undefined && (
                    <div className="text-xs opacity-80 mt-1">
                      If gold grows as expected: {fmtRM(selected.required_monthly_expected)}/mo · optimistic:{' '}
                      {fmtRM(selected.required_monthly_optimistic)}/mo
                    </div>
                  )}
                </div>
              )}

              {vehicle === 'gold' && goldOutlook && <GoldForecastChart outlook={goldOutlook} />}

              {error && <p className="text-xs text-rose-400">{error}</p>}

              <div className="flex gap-3">
                <button
                  onClick={() => (editing ? onClose() : setGoalType(null))}
                  className="px-4 py-2.5 rounded-xl border border-[#2D3547] text-[#CBD5E1] text-sm hover:bg-[#1C202B]"
                >
                  {editing ? 'Cancel' : 'Back'}
                </button>
                <button
                  onClick={save}
                  disabled={saving || !(target > 0)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#FFC80A] hover:bg-[#FFD43B] disabled:opacity-50 text-black font-extrabold text-sm shadow-lg shadow-[#FFC80A]/25"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {editing ? 'Save changes' : 'Save goal'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── Goal card ───────────────────────── */

function GoalCard({ goal, vehicles, onChanged, onEdit }) {
  const { authFetch } = useAuth();
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [msg, setMsg] = useState('');
  const meta = GOAL_META[goal.goal_type] || GOAL_META.custom;
  const Icon = meta.icon;
  const isActive = goal.status === 'active';

  const call = async (url, options) => {
    setBusy(true);
    setMsg('');
    try {
      const res = await authFetch(url, options);
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      if (data.message) setMsg(data.message);
      onChanged();
    } catch (e) {
      setMsg(e.message);
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

  const setStatus = (status) =>
    call(`/api/goals/${goal.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });

  const remove = () => {
    if (window.confirm(`Delete "${goal.title}"? This removes its contributions too.`)) {
      call(`/api/goals/${goal.id}`, { method: 'DELETE' });
    }
  };

  return (
    <div className={`${cardCls} flex flex-col gap-4 ${!isActive ? 'opacity-80' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-xl shrink-0" style={{ background: `${meta.color}20`, color: meta.color }}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-white font-extrabold truncate">{goal.title}</div>
            <div className="text-[11px] text-[#64748B]">
              {meta.label} · by {fmtDate(goal.target_date)}
            </div>
          </div>
        </div>
        {isActive ? <Badge value={goal.feasibility} /> : <Badge value={goal.status} label={goal.status === 'completed' ? 'Completed' : 'Paused'} />}
      </div>

      <div>
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-[#94A3B8]">
            <span className="text-white font-mono font-bold">{fmtRM0(goal.current_saved)}</span> of {fmtRM0(goal.target_amount)}
          </span>
          <span className="font-mono text-[#FFC80A] font-bold">{goal.progress_pct}%</span>
        </div>
        <div className="h-2.5 rounded-full bg-[#0E1118] overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${goal.progress_pct}%`, background: meta.color }} />
        </div>
      </div>

      {isActive && (
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-[#0E1118] border border-[#232A3B]">
            <div className="text-[#64748B] mb-0.5">Save monthly</div>
            <div className="text-white font-mono font-bold text-sm">{fmtRM(goal.required_monthly)}</div>
            <div className="text-[10px] text-[#64748B]">{goal.months_left} months left</div>
          </div>
          <div className="p-3 rounded-xl bg-[#0E1118] border border-[#232A3B]">
            <div className="text-[#64748B] mb-0.5">Saving in</div>
            <div className="text-white font-bold text-sm truncate">{vehicles[goal.savings_vehicle]?.label || goal.savings_vehicle}</div>
            <div className="text-[10px] text-[#64748B]" title={goal.rate_note || undefined}>
              {goal.rate_pct}% p.a. {goal.rate_note ? 'cautious forecast' : 'expected'}
            </div>
          </div>
        </div>
      )}

      {isActive && goal.suggested_date && (
        <div className="flex gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200">
          <CalendarClock className="w-4 h-4 shrink-0 text-rose-400" />
          <span>
            Not reachable by {fmtDate(goal.target_date)} on your current surplus. Saving your full surplus each month gets you there by{' '}
            <b>{fmtDate(goal.suggested_date)}</b>.
          </span>
        </div>
      )}

      {goal.est_monthly_instalment !== null && (
        <div className="flex justify-between items-center text-xs p-3 rounded-xl bg-[#0E1118] border border-[#232A3B]">
          <span className="text-[#94A3B8] flex items-center gap-1.5">
            <Gauge className="w-3.5 h-3.5 text-[#FFC80A]" /> Loan after down payment
          </span>
          <span className="text-white font-mono">
            {fmtRM(goal.est_monthly_instalment)}/mo{goal.projected_dsr !== null && ` · DSR ${goal.projected_dsr}%`}
          </span>
        </div>
      )}

      {isActive && (
        <div className="flex gap-2">
          <input
            type="number"
            min="0"
            className={inputCls}
            placeholder="Add savings (RM)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <button
            onClick={contribute}
            disabled={busy || !(parseFloat(amount) > 0)}
            className="px-4 rounded-xl bg-[#FFC80A] hover:bg-[#FFD43B] disabled:opacity-40 text-black font-extrabold text-xs flex items-center gap-1.5"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Add
          </button>
        </div>
      )}
      {msg && <p className="text-[11px] text-[#FFC80A]">{msg}</p>}

      <div className="flex items-center justify-between border-t border-[#232A3B] pt-3 -mb-1">
        <button onClick={() => setExpanded((e) => !e)} className="text-[11px] text-[#94A3B8] hover:text-white flex items-center gap-1">
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          Breakdown & history
        </button>
        <div className="flex gap-1">
          {goal.status !== 'completed' && (
            <button
              onClick={() => setStatus(isActive ? 'paused' : 'active')}
              className="p-1.5 rounded-lg text-[#64748B] hover:text-white hover:bg-[#1C202B]"
              title={isActive ? 'Pause' : 'Resume'}
            >
              {isActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
          )}
          <button onClick={() => onEdit(goal)} className="p-1.5 rounded-lg text-[#64748B] hover:text-white hover:bg-[#1C202B]" title="Edit">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={remove} className="p-1.5 rounded-lg text-[#64748B] hover:text-rose-400 hover:bg-rose-500/10" title="Delete">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-3 text-xs">
          {goal.cost_items.length > 0 && (
            <div className="space-y-1">
              {goal.cost_items.map((i) => (
                <div key={i.item_name} className="flex justify-between text-[#CBD5E1]">
                  <span>{i.item_name}</span>
                  <span className="font-mono">{fmtRM0(i.estimated_cost)}</span>
                </div>
              ))}
            </div>
          )}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[#64748B] mb-1">Recent contributions</div>
            {goal.contributions.length ? (
              goal.contributions.map((c) => (
                <div key={c.id} className="flex justify-between text-[#CBD5E1]">
                  <span className="font-mono">{fmtDate(c.contributed_at)}</span>
                  <span className="font-mono text-emerald-400">+{fmtRM(c.amount)}</span>
                </div>
              ))
            ) : (
              <div className="text-[#64748B]">None yet</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Page ───────────────────────── */

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

  const setIncomeGroup = async (group) => {
    await authFetch('/api/goals/income-group', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ income_group: group || null }),
    });
    load();
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-2 text-[#94A3B8] text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading your goals…
      </div>
    );
  }

  if (error && !config) {
    return (
      <div className="p-8">
        <div className="flex items-start gap-2 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
        </div>
      </div>
    );
  }

  const surplusPositive = summary.monthly_surplus > 0;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className={cardCls}>
          <div className="flex items-center justify-between text-[#94A3B8] text-xs font-bold uppercase tracking-wider mb-2">
            <span>Monthly surplus</span>
            <div className="p-2 rounded-xl bg-[#10B981]/15 text-[#10B981]">
              <PiggyBank className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-2xl font-black tracking-tight ${surplusPositive ? 'text-[#10B981]' : 'text-rose-400'}`}>
            {fmtRM(summary.monthly_surplus)}
          </div>
          <div className="text-[11px] text-[#64748B] mt-1.5">
            {summary.months_used
              ? `Income ${fmtRM0(summary.monthly_income)} − avg spend ${fmtRM0(summary.avg_monthly_spending)} (${summary.months_used} mo)`
              : `Income ${fmtRM0(summary.monthly_income)}, no spending data yet`}
          </div>
        </div>

        <div className={cardCls}>
          <div className="flex items-center justify-between text-[#94A3B8] text-xs font-bold uppercase tracking-wider mb-2">
            <span>Needed for goals</span>
            <div className="p-2 rounded-xl bg-[#FFC80A]/15 text-[#FFC80A]">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white tracking-tight">{fmtRM(summary.total_required_monthly)}</div>
          <div className="text-[11px] text-[#64748B] mt-1.5">per month across {summary.active_goals} active goal(s)</div>
        </div>

        <div className={cardCls}>
          <div className="flex items-center justify-between text-[#94A3B8] text-xs font-bold uppercase tracking-wider mb-2">
            <span>Overall plan</span>
            <div className="p-2 rounded-xl bg-[#38BDF8]/15 text-[#38BDF8]">
              <Gauge className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {summary.active_goals ? (
              <>
                <Badge value={summary.overall_feasibility} />
                {summary.overall_ratio !== null && (
                  <span className="text-xs text-[#94A3B8] font-mono">{Math.round(summary.overall_ratio * 100)}% of surplus</span>
                )}
              </>
            ) : (
              <span className="text-sm text-[#64748B]">No active goals</span>
            )}
          </div>
          <div className="text-[11px] text-[#64748B] mt-2.5">
            {fmtRM0(summary.total_saved)} saved of {fmtRM0(summary.total_target)}
          </div>
        </div>

        <div className={cardCls}>
          <div className="flex items-center justify-between text-[#94A3B8] text-xs font-bold uppercase tracking-wider mb-2">
            <span>Income group</span>
            <div className="p-2 rounded-xl bg-[#A855F7]/15 text-[#A855F7]">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <select className={inputCls} value={config.profile.income_group || ''} onChange={(e) => setIncomeGroup(e.target.value)}>
            <option value="">Not set</option>
            {config.incomeGroups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <div className="text-[11px] text-[#64748B] mt-1.5">Used for Haji and child-cost templates</div>
        </div>
      </div>

      {summary.warning && (
        <div className="flex items-start gap-2 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-300" />
          <span>{summary.warning}</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-extrabold text-lg">Your life goals</h2>
          <p className="text-xs text-[#64748B]">Kahwin, children, Haji, house and car, planned against your real spending</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FFC80A] hover:bg-[#FFD43B] text-black font-extrabold text-xs shadow-lg shadow-[#FFC80A]/25 transition active:scale-95"
        >
          <Plus className="w-4 h-4" /> New goal
        </button>
      </div>

      {goals.length === 0 ? (
        <div className={`${cardCls} text-center py-16`}>
          <Target className="w-10 h-10 mx-auto text-[#FFC80A] mb-3" />
          <div className="text-white font-bold">No goals yet</div>
          <p className="text-sm text-[#64748B] mt-1 mb-4">Start with Kahwin, Haji or a house down payment.</p>
          <button onClick={() => setShowNew(true)} className="px-4 py-2 rounded-xl bg-[#FFC80A] text-black font-extrabold text-xs">
            Create your first goal
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-5">
          {goals.map((g) => (
            <GoalCard key={g.id} goal={g} vehicles={config.vehicles} onChanged={load} onEdit={setEditingGoal} />
          ))}
        </div>
      )}

      <p className="text-[11px] text-[#64748B] flex items-start gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          Estimates only, not financial advice. Cost templates are midpoints of the cited ranges, and expected returns are not
          guaranteed.
        </span>
      </p>

      {(showNew || editingGoal) && (
        <NewGoalModal
          key={editingGoal?.id ?? 'new'}
          config={config}
          goal={editingGoal}
          onClose={() => {
            setShowNew(false);
            setEditingGoal(null);
          }}
          onSaved={() => {
            setShowNew(false);
            setEditingGoal(null);
            load();
          }}
        />
      )}
    </div>
  );
}
