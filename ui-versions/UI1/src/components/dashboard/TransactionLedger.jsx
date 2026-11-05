import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckSquare, Edit2, HelpCircle, Search, Square, Trash2 } from 'lucide-react';

const SOURCE_TITLES = {
  model: 'Categorised by the ML model (Logistic Regression)',
  model_low_confidence: "The model's best guess, but it was not sure: please check",
  rules: 'Categorised by keyword rules',
  sign: 'Money in (from the + sign on the statement)',
  user: 'Category set by you',
};
import { cardCls, getCategoryColor } from './dashboardUtils';

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
    <div className={`${cardCls} p-6`}>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-[#1F2533]">
        <div>
          <h3 className="text-base font-extrabold text-white tracking-tight flex items-center gap-2">
            <span>Transactions</span>
            <span className="text-xs font-mono font-bold text-[#FFC80A] bg-[#FFC80A]/10 border border-[#FFC80A]/20 px-2 py-0.5 rounded-lg">
              {filtered.length}
            </span>
          </h3>
          <p className="text-xs text-[#94A3B8] mt-0.5">
            Click a category to change it. <HelpCircle className="inline w-3 h-3 text-amber-300 -mt-0.5" /> means the model was
            unsure, so check it. Tick rows to delete several at once.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          {selected.size > 0 && (
            <button
              onClick={() => onDeleteMany([...selected])}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-md transition disabled:opacity-60"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete {selected.size} selected</span>
            </button>
          )}
          <div className="relative flex-1 sm:flex-initial">
            <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search merchant or category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-[#0E1118] border border-[#232A3B] rounded-xl text-xs text-white placeholder-[#64748B] focus:outline-none focus:border-[#FFC80A] w-full sm:w-56"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-[#0E1118] border border-[#232A3B] rounded-xl px-2.5 py-1.5 text-xs text-[#CBD5E1] focus:outline-none focus:border-[#FFC80A]"
          >
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
        <div className="text-center py-14 text-xs text-[#64748B]">
          {transactions.length === 0 ? 'No transactions for this period.' : 'No transactions match your search.'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#232A3B] text-[#94A3B8] font-bold uppercase tracking-wider text-[11px]">
                <th className="pb-3 pl-3 w-8">
                  <button onClick={toggleAll} className="p-1 hover:text-[#FFC80A] transition" title="Select all shown">
                    {allSelected ? <CheckSquare className="w-4 h-4 text-[#FFC80A]" /> : <Square className="w-4 h-4 text-[#64748B]" />}
                  </button>
                </th>
                <th className="pb-3 pl-2">Date</th>
                <th className="pb-3">Description</th>
                <th className="pb-3">Category</th>
                <th className="pb-3 text-right">Amount</th>
                <th className="pb-3 text-center">Status</th>
                <th className="pb-3 pr-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1F2533]">
              {filtered.map((t) => {
                const isSelected = selected.has(t.id);
                const isIncome = t.category === 'Income';
                const color = getCategoryColor(t.category);
                return (
                  <tr key={t.id} className={`hover:bg-[#181D2A] transition group ${isSelected ? 'bg-[#FFC80A]/5' : ''}`}>
                    <td className="py-3 pl-3">
                      <button onClick={() => toggle(t.id)} className="p-1 text-[#64748B] hover:text-[#FFC80A] transition">
                        {isSelected ? <CheckSquare className="w-4 h-4 text-[#FFC80A]" /> : <Square className="w-4 h-4 text-[#475569]" />}
                      </button>
                    </td>
                    <td className="py-3 pl-2 font-mono text-[#94A3B8] whitespace-nowrap">
                      {new Date(t.txn_date).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="py-3 font-semibold text-[#E2E8F0] max-w-xs truncate" title={t.description}>
                      {t.description}
                    </td>
                    <td className="py-3 whitespace-nowrap">
                      {editingId === t.id ? (
                        <div className="flex items-center gap-1.5">
                          <select
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="bg-[#0E1118] border border-[#FFC80A] rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
                            autoFocus
                          >
                            {[...new Set([...categoryOptions, 'Income', t.category])].map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => onUpdateCategory(t.id, editValue)}
                            className="px-2 py-1 rounded bg-[#FFC80A] text-black font-extrabold text-[10px]"
                          >
                            Save
                          </button>
                          <button onClick={() => setEditingId(null)} className="px-1.5 py-1 text-[#94A3B8] hover:text-white" title="Cancel">
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingId(t.id);
                            setEditValue(t.category);
                          }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition hover:brightness-125"
                          style={{ backgroundColor: `${color}15`, color, borderColor: `${color}35` }}
                          title={`${SOURCE_TITLES[t.category_source] || 'Change category'}. Click to change.`}
                        >
                          <span>{t.category}</span>
                          {t.category_source === 'model_low_confidence' ? (
                            <HelpCircle className="w-3 h-3 text-amber-300" aria-label="The model was not sure" />
                          ) : (
                            <Edit2 className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100" />
                          )}
                        </button>
                      )}
                    </td>
                    <td className={`py-3 text-right font-mono font-black whitespace-nowrap ${isIncome ? 'text-[#10B981]' : 'text-white'}`}>
                      {isIncome ? '+' : '-'}RM {Number(t.amount).toFixed(2)}
                    </td>
                    <td className="py-3 text-center whitespace-nowrap">
                      {t.is_anomaly ? (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          title="Much higher than your usual spending in this category"
                        >
                          <AlertTriangle className="w-3 h-3" />
                          <span>Unusual</span>
                        </span>
                      ) : isIncome ? (
                        <span className="text-[10px] text-[#10B981] font-bold">Money in</span>
                      ) : (
                        <span className="text-[10px] text-[#64748B]">Normal</span>
                      )}
                    </td>
                    <td className="py-3 pr-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => onDeleteOne(t.id)}
                        className="p-1.5 rounded-lg text-[#64748B] hover:text-rose-400 hover:bg-rose-500/10 transition opacity-60 group-hover:opacity-100"
                        title="Delete transaction"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
