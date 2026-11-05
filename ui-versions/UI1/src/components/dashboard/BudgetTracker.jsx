import React from 'react';
import { PlusCircle, Trash2 } from 'lucide-react';
import { cardCls, fmtRM0, getCategoryColor, NEEDS_CATEGORIES, WANTS_CATEGORIES } from './dashboardUtils';

function BudgetRow({ category, spent, budget, onSet, onDelete }) {
  const limit = budget ? parseFloat(budget.budget_limit) : null;
  const percent = limit ? Math.round((spent / limit) * 100) : null;
  const isOver = limit !== null && spent > limit;
  const isWarning = limit !== null && !isOver && spent >= limit * 0.8;
  const barCls = isOver ? 'bg-rose-500' : isWarning ? 'bg-[#FFC80A]' : 'bg-[#10B981]';

  return (
    <div className="p-2.5 rounded-xl bg-[#0E1118] border border-[#232A3B] space-y-1.5 hover:border-[#FFC80A]/40 transition group">
      <div className="flex items-center justify-between text-xs gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getCategoryColor(category) }} />
          <span className="font-bold text-[#E2E8F0] truncate">{category}</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono shrink-0">
          <span className={isOver ? 'text-rose-400 font-extrabold' : 'text-white'}>{fmtRM0(spent)}</span>
          {limit !== null ? (
            <>
              <span className="text-[#64748B]">/</span>
              <span className="text-[#94A3B8]">{fmtRM0(limit)}</span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  isOver ? 'bg-rose-500/20 text-rose-300' : isWarning ? 'bg-[#FFC80A]/20 text-[#FFC80A]' : 'bg-[#1C2230] text-[#94A3B8]'
                }`}
              >
                {percent}%
              </span>
              <button
                onClick={() => onDelete(budget.id)}
                className="opacity-0 group-hover:opacity-100 p-1 text-[#64748B] hover:text-rose-400 transition"
                title="Remove this budget"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </>
          ) : (
            <button onClick={() => onSet(category)} className="text-[10px] font-sans font-bold text-[#FFC80A] hover:underline">
              Set budget
            </button>
          )}
        </div>
      </div>
      {limit !== null && (
        <div className="w-full h-2 rounded-full bg-[#1C2230] overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${barCls}`} style={{ width: `${Math.min(100, percent)}%` }} />
        </div>
      )}
    </div>
  );
}

/** Actual needs / wants / savings share of income vs the 50/30/20 rule. */
function FiftyThirtyTwenty({ breakdown, income }) {
  if (!(income > 0)) return null;
  const sum = (cats) => breakdown.filter((b) => cats.includes(b.category)).reduce((s, b) => s + b.total_amount, 0);
  const needs = sum(NEEDS_CATEGORIES);
  const wants = sum(WANTS_CATEGORIES);
  const total = breakdown.reduce((s, b) => s + b.total_amount, 0);
  const other = total - needs - wants;
  const saved = income - total;
  const pct = (v) => Math.round((v / income) * 100);

  const rows = [
    { label: 'Needs', value: needs, target: 50, color: '#38BDF8', over: pct(needs) > 50 },
    { label: 'Wants', value: wants, target: 30, color: '#A855F7', over: pct(wants) > 30 },
    { label: 'Saved', value: Math.max(0, saved), target: 20, color: '#10B981', over: false, under: pct(saved) < 20 },
  ];

  return (
    <div className="mt-5 pt-4 border-t border-[#1F2533]">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-xs font-bold text-white">50/30/20 check</span>
        <span className="text-[10px] text-[#64748B]">share of income, target in brackets</span>
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2.5 text-[11px]">
            <span className="w-12 text-[#CBD5E1] font-semibold">{r.label}</span>
            <div className="flex-1 h-2 rounded-full bg-[#1C2230] overflow-hidden relative">
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct(r.value))}%`, background: r.color }} />
              <div className="absolute inset-y-0 w-0.5 bg-white/50" style={{ left: `${r.target}%` }} />
            </div>
            <span className={`w-20 text-right font-mono ${r.over || r.under ? 'text-amber-300' : 'text-[#94A3B8]'}`}>
              {pct(r.value)}% <span className="text-[#475569]">({r.target}%)</span>
            </span>
          </div>
        ))}
      </div>
      {other > 0 && (
        <p className="text-[10px] text-[#64748B] mt-2">
          {fmtRM0(other)} ({pct(other)}%) in transfers and other categories is not counted as a need or a want.
        </p>
      )}
    </div>
  );
}

/** Budgets for the month: every category with spending or a budget, plus the 50/30/20 check. */
export default function BudgetTracker({ budgets, breakdown, income, showRule, onAdd, onSetFor, onDelete }) {
  const categories = Array.from(new Set([...budgets.map((b) => b.category), ...breakdown.map((c) => c.category)])).filter(
    (c) => c !== 'Income'
  );
  // Budgeted categories first, then the rest by spending
  const spentOf = (c) => breakdown.find((b) => b.category === c)?.total_amount || 0;
  const budgetOf = (c) => budgets.find((b) => b.category === c);
  categories.sort((a, b) => Number(Boolean(budgetOf(b))) - Number(Boolean(budgetOf(a))) || spentOf(b) - spentOf(a));

  return (
    <div className={`${cardCls} p-6 h-full flex flex-col`}>
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#1F2533]">
        <div>
          <h3 className="text-base font-extrabold text-white tracking-tight">Budgets</h3>
          <p className="text-xs text-[#94A3B8]">Monthly limits per category, including your own categories</p>
        </div>
        <button
          onClick={onAdd}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#FFC80A] text-black font-extrabold text-xs shadow-md shadow-[#FFC80A]/20 hover:bg-[#FFD43B] transition"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span>Set budget</span>
        </button>
      </div>

      {categories.length === 0 ? (
        <div className="p-8 text-center text-xs text-[#64748B] border border-dashed border-[#232A3B] rounded-xl">
          No spending or budgets for this month yet.
        </div>
      ) : (
        <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
          {categories.map((c) => (
            <BudgetRow key={c} category={c} spent={spentOf(c)} budget={budgetOf(c)} onSet={onSetFor} onDelete={onDelete} />
          ))}
        </div>
      )}

      {showRule && <FiftyThirtyTwenty breakdown={breakdown} income={income} />}
    </div>
  );
}
