import React from 'react';
import { Plus, Scale, Trash2, Wallet } from 'lucide-react';
import Card from '../ui/Card';
import { Empty, Meter, Notice } from '../ui/Controls';
import { fmtRM0, NEEDS_CATEGORIES, WANTS_CATEGORIES } from './dashboardUtils';

function BudgetRow({ category, spent, budget, onSet, onDelete }) {
  const limit = budget ? parseFloat(budget.budget_limit) : null;
  const percent = limit ? Math.round((spent / limit) * 100) : null;
  const isOver = limit !== null && spent > limit;
  const isWarning = limit !== null && !isOver && spent >= limit * 0.8;

  return (
    <li className="py-2.5 group">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-semibold truncate">{category}</span>
        <span className="flex items-center gap-1 num shrink-0">
          <span className={isOver ? 'text-danger font-bold' : ''}>{fmtRM0(spent)}</span>
          {limit !== null ? (
            <>
              <span className="text-ink-3">of {fmtRM0(limit)}</span>
              {isOver && <span className="tag tag-danger ml-1">Over</span>}
              <button
                type="button"
                onClick={() => onDelete(budget.id)}
                className="btn btn-icon btn-sm !min-w-8 !min-h-8 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100"
                aria-label={`Remove the ${category} budget`}
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </>
          ) : (
            <button type="button" onClick={() => onSet(category)} className="link text-[0.8125rem] ml-1.5">
              Set budget
            </button>
          )}
        </span>
      </div>
      {limit !== null && (
        <div className="mt-1.5">
          <Meter value={percent} tone={isOver ? 'danger' : isWarning ? 'warn' : 'ok'} label={`${category} budget used`} />
        </div>
      )}
    </li>
  );
}

/** Actual needs / wants / savings share of income vs the 50/30/20 rule. */
export function FiftyThirtyTwenty({ breakdown, income }) {
  if (!(income > 0)) return null;
  const sum = (cats) => breakdown.filter((b) => cats.includes(b.category)).reduce((s, b) => s + b.total_amount, 0);
  const needs = sum(NEEDS_CATEGORIES);
  const wants = sum(WANTS_CATEGORIES);
  const total = breakdown.reduce((s, b) => s + b.total_amount, 0);
  const other = total - needs - wants;
  const saved = income - total;
  const pct = (v) => Math.round((v / income) * 100);

  const rows = [
    { label: 'Needs', value: needs, target: 50, off: pct(needs) > 50 },
    { label: 'Wants', value: wants, target: 30, off: pct(wants) > 30 },
    { label: 'Saved', value: Math.max(0, saved), target: 20, off: pct(saved) < 20 },
  ];

  return (
    <Card icon={Scale} tone="purple" title="50/30/20 check" note="Share of income. The dark mark is the target." className="h-full">
      <div className="mt-1 space-y-3.5">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[3.25rem_minmax(0,1fr)_3rem] items-center gap-2.5 text-sm">
            <span className="font-medium">{r.label}</span>
            <Meter value={pct(r.value)} marker={r.target} tone={r.off ? 'warn' : 'ok'} label={`${r.label} share of income`} />
            <span className={`num text-right ${r.off ? 'text-warn font-semibold' : 'text-ink-2'}`}>{pct(r.value)}%</span>
          </div>
        ))}
      </div>
      {other > 0 && (
        <p className="t-note mt-3">
          {fmtRM0(other)} ({pct(other)}%) in transfers and other categories counts as neither a need nor a want.
        </p>
      )}
    </Card>
  );
}

/** Total of every budget set for the month. */
export const budgetTotal = (budgets) => budgets.reduce((s, b) => s + (parseFloat(b.budget_limit) || 0), 0);

/** Budgets for the month: every category with spending or a budget. */
export default function BudgetTracker({ budgets, breakdown, income, incomeSource, onAdd, onSetFor, onDelete }) {
  const total = budgetTotal(budgets);
  const overBy = income > 0 ? total - income : 0;
  const categories = Array.from(new Set([...budgets.map((b) => b.category), ...breakdown.map((c) => c.category)])).filter(
    (c) => c !== 'Income'
  );
  // Budgeted categories first, then the rest by spending
  const spentOf = (c) => breakdown.find((b) => b.category === c)?.total_amount || 0;
  const budgetOf = (c) => budgets.find((b) => b.category === c);
  categories.sort((a, b) => Number(Boolean(budgetOf(b))) - Number(Boolean(budgetOf(a))) || spentOf(b) - spentOf(a));

  return (
    <Card
      icon={Wallet}
      tone="green"
      title="Budgets"
      note="Monthly limits you set"
      className="h-full"
      action={
        <button type="button" onClick={onAdd} className="btn btn-soft btn-sm">
          <Plus className="w-4 h-4" aria-hidden="true" />
          Add budget
        </button>
      }
    >
      {overBy > 0 && (
        <Notice tone="danger" className="mb-3">
          Your budgets add up to {fmtRM0(total)}, which is {fmtRM0(overBy)} more than your income of {fmtRM0(income)} a month ({incomeSource}).
          Spending to these limits would leave you short every month, so lower some of them.
        </Notice>
      )}
      {categories.length === 0 ? (
        <Empty title="No budgets yet">Set a monthly limit for a category, including your own categories.</Empty>
      ) : (
        <ul className="divide-y divide-line max-h-60 overflow-y-auto pr-1">
          {categories.map((c) => (
            <BudgetRow key={c} category={c} spent={spentOf(c)} budget={budgetOf(c)} onSet={onSetFor} onDelete={onDelete} />
          ))}
        </ul>
      )}
      {budgets.length > 0 && (
        <p className={`t-note mt-2 num ${overBy > 0 ? 'text-danger' : ''}`}>
          Budgets total {fmtRM0(total)}
          {income > 0 ? ` of ${fmtRM0(income)} income (${Math.round((total / income) * 100)}%)` : ''}
        </p>
      )}
    </Card>
  );
}
