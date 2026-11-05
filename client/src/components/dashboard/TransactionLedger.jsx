import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, CheckSquare, HelpCircle, ListOrdered, Pencil, Search, Square, Trash2, X } from 'lucide-react';
import { Empty } from '../ui/Controls';
import { SPRING } from '../../lib/motion';
import { getCategoryColor } from './dashboardUtils';
import { parseDay } from '../../lib/dates';

const SOURCE_TITLES = {
  model: 'Categorised by the ML model (Logistic Regression)',
  model_low_confidence: "The model's best guess, but it was not sure: please check",
  rules: 'Categorised by keyword rules',
  sign: 'Money in (from the + sign on the statement)',
  user: 'Category set by you',
};

const fmtDate = (d) => parseDay(d).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' });
const dayMs = (d) => parseDay(d).getTime();

const SORTS = {
  newest: { label: 'Newest first', compare: (a, b) => dayMs(b.txn_date) - dayMs(a.txn_date) || b.id - a.id },
  oldest: { label: 'Oldest first', compare: (a, b) => dayMs(a.txn_date) - dayMs(b.txn_date) || a.id - b.id },
  highest: { label: 'Highest amount', compare: (a, b) => b.amount - a.amount },
  lowest: { label: 'Lowest amount', compare: (a, b) => a.amount - b.amount },
  merchant: { label: 'Merchant A to Z', compare: (a, b) => a.description.localeCompare(b.description) },
};

const SHOWS = {
  all: { label: 'All transactions', keep: () => true },
  out: { label: 'Money out', keep: (t) => t.category !== 'Income' },
  in: { label: 'Money in', keep: (t) => t.category === 'Income' },
  unusual: { label: 'Unusual only', keep: (t) => Boolean(t.is_anomaly) },
  check: { label: 'Needs checking', keep: (t) => t.category_source === 'model_low_confidence' },
};

/** Column header that sorts the table; pressing it again flips the direction. */
function SortHeader({ label, up, down, sort, setSort, className }) {
  const active = sort === up || sort === down;
  const next = sort === down ? up : down;
  return (
    <th scope="col" className={className} aria-sort={active ? (sort === up ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => setSort(next)}
        className={`inline-flex items-center gap-1 rounded px-1 -mx-1 font-medium hover:text-ink ${active ? 'text-ink' : ''}`}
      >
        {label}
        {active ? (
          sort === up ? <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" /> : <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
        ) : (
          <ArrowUpDown className="w-3.5 h-3.5 opacity-60" aria-hidden="true" />
        )}
      </button>
    </th>
  );
}

/** Searchable, sortable ledger with inline recategorisation, single delete and checkbox bulk delete. */
export default function TransactionLedger({ transactions, categoryOptions, busy, onUpdateCategory, onDeleteOne, onDeleteMany }) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [sort, setSort] = useState('newest');
  const [show, setShow] = useState('all');
  const [selected, setSelected] = useState(new Set());
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');

  // New data (period change, upload, delete) clears the selection
  useEffect(() => {
    setSelected(new Set());
    setEditingId(null);
  }, [transactions]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return transactions
      .filter(
        (t) =>
          (t.description.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)) &&
          (categoryFilter === 'ALL' || t.category === categoryFilter) &&
          SHOWS[show].keep(t)
      )
      .map((t) => ({ ...t, amount: Number(t.amount) }))
      .sort(SORTS[sort].compare);
  }, [transactions, search, categoryFilter, show, sort]);
  const filtersOn = search || categoryFilter !== 'ALL' || show !== 'all';
  const clearFilters = () => {
    setSearch('');
    setCategoryFilter('ALL');
    setShow('all');
  };

  const allSelected = filtered.length > 0 && filtered.every((t) => selected.has(t.id));
  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(filtered.map((t) => t.id)));
  const filterOptions = Array.from(new Set([...categoryOptions, ...transactions.map((t) => t.category)]));

  return (
    <section aria-labelledby="ledger-title" className="card min-w-0">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-4 sm:p-5">
        <div className="flex items-center gap-3 min-w-0">
          <span className="chip tone-blue">
            <ListOrdered className="w-[1.125rem] h-[1.125rem]" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="ledger-title" className="t-section">
              Transactions <span className="num text-ink-3 font-medium">{filtered.length}</span>
            </h2>
            <p className="t-note max-w-[62ch]">
              Click a category to change it. <HelpCircle className="inline w-3.5 h-3.5 text-warn -mt-0.5" aria-label="Question mark" /> means the
              model was unsure, so check it.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap lg:flex-nowrap lg:shrink-0 items-center gap-2">
          <AnimatePresence>
            {selected.size > 0 && (
              <m.button
                type="button"
                onClick={() => onDeleteMany([...selected])}
                disabled={busy}
                className="btn btn-danger"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={SPRING}
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
                Delete {selected.size} selected
              </m.button>
            )}
          </AnimatePresence>
          <div className="relative flex-1 sm:flex-initial min-w-44">
            <Search className="w-4 h-4 text-ink-3 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
            <input
              type="search"
              aria-label="Search merchant or category"
              placeholder="Search merchant or category"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="field pl-9 sm:w-64"
            />
          </div>
          <select aria-label="Filter by category" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="field !w-auto">
            <option value="ALL">All categories</option>
            {filterOptions.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          <select aria-label="Show" value={show} onChange={(e) => setShow(e.target.value)} className="field !w-auto">
            {Object.entries(SHOWS).map(([key, s]) => (
              <option key={key} value={key}>
                {s.label}
              </option>
            ))}
          </select>
          <select aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value)} className="field !w-auto">
            {Object.entries(SORTS).map(([key, s]) => (
              <option key={key} value={key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Empty
          title={transactions.length === 0 ? 'No transactions for this period' : 'No transactions match your filters'}
          action={
            filtersOn && transactions.length > 0 ? (
              <button type="button" onClick={clearFilters} className="btn btn-quiet">
                Clear filters
              </button>
            ) : null
          }
        >
          {transactions.length === 0 ? 'Upload a statement or pick another month.' : 'Try another word, category or view.'}
        </Empty>
      ) : (
        <div className="relative overflow-x-auto rounded-b-panel">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-y border-line bg-paper text-ink-3 text-[0.8125rem]">
                <th scope="col" className="py-2 pl-2 w-10 font-medium">
                  <button type="button" onClick={toggleAll} className="btn btn-icon btn-sm !min-w-9" aria-label="Select all shown" aria-pressed={allSelected}>
                    {allSelected ? <CheckSquare className="w-4 h-4 text-accent" aria-hidden="true" /> : <Square className="w-4 h-4" aria-hidden="true" />}
                  </button>
                </th>
                <SortHeader label="Merchant" up="merchant" down="merchant" sort={sort} setSort={setSort} className="py-2" />
                <SortHeader label="Amount" up="lowest" down="highest" sort={sort} setSort={setSort} className="py-2 pr-3 text-right" />
                <th scope="col" className="py-2 font-medium hidden sm:table-cell">Category</th>
                <SortHeader label="Date" up="oldest" down="newest" sort={sort} setSort={setSort} className="py-2 hidden lg:table-cell" />
                <th scope="col" className="py-2 pr-2 w-12"><span className="sr-only">Delete</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((t) => {
                const isSelected = selected.has(t.id);
                const isIncome = t.category === 'Income';
                const color = getCategoryColor(t.category);
                const categoryControl =
                  editingId === t.id ? (
                    <div className="flex items-center gap-1">
                      <select
                        aria-label="New category"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="field !min-h-9 !w-auto text-sm !py-1"
                        autoFocus
                      >
                        {[...new Set([...categoryOptions, 'Income', t.category])].map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <button type="button" onClick={() => onUpdateCategory(t.id, editValue)} className="btn btn-accent btn-sm">
                        Save
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} className="btn btn-icon btn-sm !min-w-8" aria-label="Cancel">
                        <X className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(t.id);
                        setEditValue(t.category);
                      }}
                      className="inline-flex items-center gap-1.5 py-1 -ml-1 px-1 rounded text-[0.8125rem] font-semibold hover:bg-paper-2 transition-colors"
                      title={`${SOURCE_TITLES[t.category_source] || 'Change category'}. Click to change.`}
                    >
                      <span className="w-2 h-2 rounded-[2px] shrink-0" style={{ backgroundColor: color }} aria-hidden="true" />
                      {t.category}
                      {t.category_source === 'model_low_confidence' ? (
                        <HelpCircle className="w-3.5 h-3.5 text-warn" aria-label="The model was not sure" />
                      ) : (
                        <Pencil className="w-3 h-3 text-ink-3 opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true" />
                      )}
                    </button>
                  );

                return (
                  <tr key={t.id} className={`group transition-colors hover:bg-paper ${isSelected ? 'bg-gold-wash' : ''}`}>
                    <td className="py-1.5 pl-2 align-top sm:align-middle">
                      <button
                        type="button"
                        onClick={() => toggle(t.id)}
                        className="btn btn-icon btn-sm !min-w-9"
                        aria-label={`Select ${t.description}`}
                        aria-pressed={isSelected}
                      >
                        {isSelected ? <CheckSquare className="w-4 h-4 text-accent" aria-hidden="true" /> : <Square className="w-4 h-4" aria-hidden="true" />}
                      </button>
                    </td>
                    <td className="py-2.5 pr-3 max-w-[8.5rem] sm:max-w-xs">
                      <p className="font-semibold truncate" title={t.description}>
                        {t.description}
                      </p>
                      <p className="t-note lg:hidden num">{fmtDate(t.txn_date)}</p>
                      {t.is_anomaly ? <span className="tag tag-warn sm:hidden">Unusual</span> : null}
                      <div className="sm:hidden">{categoryControl}</div>
                    </td>
                    <td className="py-2.5 pr-3 text-right whitespace-nowrap align-top sm:align-middle">
                      <span className={`num font-semibold ${isIncome ? 'text-ok' : ''}`}>
                        {isIncome ? '+' : '-'}RM {Number(t.amount).toFixed(2)}
                      </span>
                      {t.is_anomaly ? (
                        <span className="tag tag-warn ml-2 hidden sm:inline-flex" title="Much higher than your usual spending in this category">
                          <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                          Unusual
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2.5 whitespace-nowrap hidden sm:table-cell">{categoryControl}</td>
                    <td className="py-2.5 whitespace-nowrap text-ink-3 num hidden lg:table-cell">{fmtDate(t.txn_date)}</td>
                    <td className="py-1.5 pr-2 text-right">
                      <button
                        type="button"
                        onClick={() => onDeleteOne(t.id)}
                        className="btn btn-icon btn-sm !min-w-9 hover:!text-danger hover:!bg-danger-wash"
                        aria-label={`Delete ${t.description}`}
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
      )}
    </section>
  );
}
