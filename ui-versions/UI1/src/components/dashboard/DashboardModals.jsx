import React, { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Trash2, UploadCloud, X } from 'lucide-react';
import { downloadSampleCsv, modalBackdropCls, monthName } from './dashboardUtils';

function ModalShell({ onClose, maxWidth = 'max-w-md', children }) {
  return (
    <div className={modalBackdropCls} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`bg-[#141824] border border-[#232A3B] rounded-2xl w-full ${maxWidth} p-6 shadow-2xl relative`}>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#94A3B8] hover:text-white p-1 rounded-lg hover:bg-[#1E2536] transition"
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>
        {children}
      </div>
    </div>
  );
}

function StatusAlert({ status }) {
  if (status.state === 'idle') return null;
  const styles = {
    working: 'bg-sky-500/10 border-sky-500/20 text-sky-300',
    success: 'bg-[#10B981]/15 border-[#10B981]/30 text-[#10B981]',
    error: 'bg-rose-500/10 border-rose-500/20 text-rose-300',
  };
  return (
    <div className={`mt-4 p-3 rounded-xl border text-xs flex items-center gap-2 ${styles[status.state]}`}>
      {status.state === 'working' && <Loader2 className="w-4 h-4 shrink-0 animate-spin" />}
      {status.state === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
      {status.state === 'error' && <AlertTriangle className="w-4 h-4 shrink-0" />}
      <span className="font-medium">{status.message}</span>
    </div>
  );
}

/** Drag-and-drop CSV upload. `onUpload(file)` resolves to a success message or throws. */
export function UploadModal({ onClose, onUpload }) {
  const [dragActive, setDragActive] = useState(false);
  const [status, setStatus] = useState({ state: 'idle', message: '' });
  const inputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setStatus({ state: 'error', message: 'Please choose a .csv bank statement file.' });
      return;
    }
    setStatus({ state: 'working', message: `Reading and categorising ${file.name}...` });
    try {
      const message = await onUpload(file);
      setStatus({ state: 'success', message });
      setTimeout(onClose, 1500);
    } catch (err) {
      setStatus({ state: 'error', message: err.message });
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  return (
    <ModalShell onClose={onClose} maxWidth="max-w-lg">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-[#FFC80A]/15 border border-[#FFC80A]/30 flex items-center justify-center text-[#FFC80A]">
          <UploadCloud className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-base font-extrabold text-white">Upload bank statement</h3>
          <p className="text-xs text-[#94A3B8]">Maybank (CASATIA and Maybank2u exports) and CIMB CSV files</p>
        </div>
      </div>

      <div
        onDragEnter={onDrag}
        onDragLeave={onDrag}
        onDragOver={onDrag}
        onDrop={(e) => {
          onDrag(e);
          setDragActive(false);
          handleFile(e.dataTransfer.files?.[0]);
        }}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
          dragActive ? 'border-[#FFC80A] bg-[#FFC80A]/10 scale-[1.01]' : 'border-[#2D3547] bg-[#0E1118]/70 hover:border-[#FFC80A]/60'
        }`}
      >
        <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={(e) => handleFile(e.target.files[0])} />
        <FileSpreadsheet className="w-12 h-12 text-[#FFC80A] mx-auto mb-3" />
        <p className="text-sm font-bold text-white">Click to browse, or drop your CSV here</p>
        <p className="text-xs text-[#64748B] mt-1">CSV only, up to 10 MB. Transactions are categorised automatically.</p>
      </div>

      <StatusAlert status={status} />

      <div className="mt-5 pt-4 border-t border-[#1F2533] flex items-center justify-between text-xs">
        <button type="button" onClick={downloadSampleCsv} className="text-[#FFC80A] hover:underline flex items-center gap-1 font-bold">
          <Download className="w-3.5 h-3.5" />
          <span>Download sample CSV</span>
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-xl bg-[#1C2230] text-[#CBD5E1] hover:bg-[#252C3D] font-semibold transition"
        >
          Close
        </button>
      </div>
    </ModalShell>
  );
}

/** Choose to clear one month or everything. */
export function ClearRecordsModal({ period, isAllTime, monthCount, totalCount, onClose, onConfirm }) {
  const [scope, setScope] = useState(isAllTime ? 'all' : 'month');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await onConfirm(scope);
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const option = (value, title, desc, activeCls, accent) => (
    <label
      className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition ${
        scope === value ? activeCls : 'border-[#232A3B] bg-[#0E1118] hover:border-[#2F374A]'
      }`}
    >
      <input type="radio" name="clearScope" checked={scope === value} onChange={() => setScope(value)} className={`mt-1 ${accent}`} />
      <div>
        <p className={`text-xs font-bold ${value === 'all' ? 'text-rose-400' : 'text-white'}`}>{title}</p>
        <p className="text-[11px] text-[#64748B] mt-0.5">{desc}</p>
      </div>
    </label>
  );

  return (
    <ModalShell onClose={onClose}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
          <Trash2 className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-base font-extrabold text-white">Clear statement records</h3>
          <p className="text-xs text-[#94A3B8]">This cannot be undone</p>
        </div>
      </div>

      <div className="space-y-3 mb-6">
        {!isAllTime &&
          option(
            'month',
            `Clear ${monthName(period.month)} ${period.year} only`,
            `Deletes the ${monthCount} transaction${monthCount === 1 ? '' : 's'} in this month. Other months are kept.`,
            'border-[#FFC80A] bg-[#FFC80A]/5',
            'accent-[#FFC80A]'
          )}
        {option(
          'all',
          'Delete all transactions',
          `Deletes all ${totalCount} transactions across every month so you can start again.`,
          'border-rose-500 bg-rose-500/5',
          'accent-rose-500'
        )}
      </div>

      {error && <p className="text-xs text-rose-400 mb-3">{error}</p>}

      <div className="flex items-center justify-end gap-2.5">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-xl bg-[#1C2230] text-[#CBD5E1] hover:bg-[#252C3D] text-xs font-semibold transition"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={busy}
          className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs shadow-md transition disabled:opacity-60"
        >
          {busy ? 'Deleting...' : 'Delete'}
        </button>
      </div>
    </ModalShell>
  );
}

/** Set a monthly limit for an existing or a new custom category. */
export function BudgetModal({ period, categoryOptions, initialCategory, onClose, onSave }) {
  const [custom, setCustom] = useState(false);
  const [category, setCategory] = useState(initialCategory || categoryOptions[0] || 'Food & Dining');
  const [customName, setCustomName] = useState('');
  const [limit, setLimit] = useState('600');
  const [status, setStatus] = useState({ state: 'idle', message: '' });

  const submit = async (e) => {
    e.preventDefault();
    const target = (custom ? customName : category).trim();
    if (!target) {
      setStatus({ state: 'error', message: 'Please enter a category name.' });
      return;
    }
    if (!(parseFloat(limit) > 0)) {
      setStatus({ state: 'error', message: 'The limit must be more than RM 0.' });
      return;
    }
    setStatus({ state: 'working', message: 'Saving...' });
    try {
      await onSave(target, limit);
      setStatus({ state: 'success', message: `Budget for "${target}" saved.` });
      setTimeout(onClose, 900);
    } catch (err) {
      setStatus({ state: 'error', message: err.message });
    }
  };

  const fieldCls =
    'w-full bg-[#0E1118] border border-[#232A3B] rounded-xl px-3 py-2 text-xs text-white placeholder-[#64748B] focus:outline-none focus:border-[#FFC80A]';

  return (
    <ModalShell onClose={onClose}>
      <h3 className="text-base font-extrabold text-white mb-1">Set a category budget</h3>
      <p className="text-xs text-[#94A3B8] mb-4">
        For {monthName(period.month)} {period.year}
      </p>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-bold text-[#CBD5E1]">{custom ? 'New category name' : 'Category'}</label>
            <button type="button" onClick={() => setCustom(!custom)} className="text-[11px] font-bold text-[#FFC80A] hover:underline">
              {custom ? '← Pick an existing category' : '+ New category'}
            </button>
          </div>
          {custom ? (
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="e.g. Rent, Parents' allowance, Takaful"
              className={fieldCls}
              autoFocus
            />
          ) : (
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={fieldCls}>
              {[...new Set([initialCategory, ...categoryOptions].filter(Boolean))].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="block text-xs font-bold text-[#CBD5E1] mb-1.5">Monthly limit</label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#64748B] font-mono text-xs font-bold">RM</span>
            <input
              type="number"
              min="1"
              step="any"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              className={`${fieldCls} pl-10`}
              required
            />
          </div>
        </div>

        <StatusAlert status={status} />

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#1F2533]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#1C2230] text-[#CBD5E1] hover:bg-[#252C3D] text-xs font-semibold transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={status.state === 'working'}
            className="px-4 py-2 rounded-xl bg-[#FFC80A] hover:bg-[#FFD43B] text-black font-extrabold text-xs shadow-md shadow-[#FFC80A]/20 transition disabled:opacity-60"
          >
            Save budget
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
