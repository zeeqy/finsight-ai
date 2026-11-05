import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { AlertTriangle, CheckSquare, HelpCircle, Pencil, Search, Square, Trash2, X } from 'lucide-react';
import { Empty } from '../ui/Controls';
import { SPRING } from '../../lib/motion';
import { getCategoryColor } from './dashboardUtils';

const SOURCE_TITLES = {
  model: 'Categorised by the ML model (Logistic Regression)',
  model_low_confidence: "The model's best guess, but it was not sure: please check",
  rules: 'Categorised by keyword rules',
  sign: 'Money in (from the + sign on the statement)',
  user: 'Category set by you',
};

const fmtDate = (d) => new Date(d).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' });

/** Searchable ledger with inline recategorisation, single delete and checkbox bulk delete. */
export default function TransactionLedger({ transactions, categoryOptions, busy, onUpdateCategory, onDeleteOne, onDeleteMany }) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
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
    return transactions.filter(
      (t) =>
        (t.description.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)) &&
        (categoryFilter === 'ALL' || t.category === categoryFilter)
    );
  }, [transactions, search, categoryFilter]);

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
    <section aria-labelledby="ledger-title">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-4">
        <div>
          <h2 id="ledger-title" className="t-section">
            Transactions <span className="num text-ink-3 font-medium">{filtered.length}</span>
          </h2>
          <p className="t-note mt-1 max-w-[62ch]">
            Click a category to change it. <HelpCircle className="inline w-3.5 h-3.5 text-warn -mt-0.5" aria-label="Question mark" /> means the
            model was unsure, so check it.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
        </div>
      </div>

      {filtered.length === 0 ? (
        <Empty title={transactions.length === 0 ? 'No transactions for this period' : 'No transactions match your search'}>
          {transactions.length === 0 ? 'Upload a statement or pick another month.' : 'Try another word or clear the category filter.'}
        </Empty>
      ) : (
        <div className="sheet overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-ink-3 text-[0.8125rem]">
                <th scope="col" className="py-2 pl-2 w-10 font-medium">
                  <button type="button" onClick={toggleAll} className="btn btn-icon btn-sm !min-w-9" aria-label="Select all shown" aria-pressed={allSelected}>
                    {allSelected ? <CheckSquare className="w-4 h-4 text-jade" aria-hidden="true" /> : <Square className="w-4 h-4" aria-hidden="true" />}
                  </button>
                </th>
                <th scope="col" className="py-2 font-medium">Merchant</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">Amount</th>
                <th scope="col" className="py-2 font-medium hidden sm:table-cell">Category</th>
                <th scope="col" className="py-2 font-medium hidden lg:table-cell">Date</th>
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
                      <button type="button" onClick={() => onUpdateCategory(t.id, editValue)} className="btn btn-jade btn-sm">
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
                        {isSelected ? <CheckSquare className="w-4 h-4 text-jade" aria-hidden="true" /> : <Square className="w-4 h-4" aria-hidden="true" />}
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
                      <span className={`num font-semibold ${isIncome ? 'text-jade' : ''}`}>
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
