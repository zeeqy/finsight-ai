import React, { useRef, useState } from 'react';
import { m } from 'motion/react';
import { ArrowLeft, Download, FileSpreadsheet, Plus } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Field, Notice } from '../ui/Controls';
import { SPRING } from '../../lib/motion';
import { downloadSampleCsv, monthName } from './dashboardUtils';

function StatusAlert({ status }) {
  const tone = { working: 'working', success: 'ok', error: 'danger' }[status.state];
  return (
    <Notice tone={tone || 'info'} show={status.state !== 'idle'} className="mt-4">
      {status.message}
    </Notice>
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
      setStatus({ state: 'error', message: 'Choose a .csv bank statement file.' });
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
    <Modal title="Upload bank statement" description="Maybank (CASATIA and Maybank2u exports) and CIMB CSV files" onClose={onClose} width="max-w-lg">
      <m.button
        type="button"
        onDragEnter={onDrag}
        onDragLeave={onDrag}
        onDragOver={onDrag}
        onDrop={(e) => {
          onDrag(e);
          setDragActive(false);
          handleFile(e.dataTransfer.files?.[0]);
        }}
        onClick={() => inputRef.current?.click()}
        animate={{ scale: dragActive ? 1.02 : 1 }}
        transition={SPRING}
        className={`w-full rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          dragActive ? 'border-jade bg-jade-wash' : 'border-line-strong hover:border-jade hover:bg-paper'
        }`}
      >
        <FileSpreadsheet className="w-10 h-10 text-jade mx-auto mb-2" aria-hidden="true" />
        <span className="block font-semibold">Click to browse, or drop your CSV here</span>
        <span className="block t-note mt-1">CSV only, up to 10 MB. Transactions are categorised automatically.</span>
      </m.button>
      <input ref={inputRef} type="file" accept=".csv" className="hidden" aria-label="Bank statement CSV" onChange={(e) => handleFile(e.target.files[0])} />

      <StatusAlert status={status} />

      <div className="mt-5 flex items-center justify-between gap-3">
        <button type="button" onClick={downloadSampleCsv} className="link inline-flex items-center gap-1.5 text-sm">
          <Download className="w-4 h-4" aria-hidden="true" />
          Download sample CSV
        </button>
        <button type="button" onClick={onClose} className="btn btn-quiet">
          Close
        </button>
      </div>
    </Modal>
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

  const option = (value, title, desc, activeCls) => (
    <label
      className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors ${
        scope === value ? activeCls : 'border-line hover:border-line-strong'
      }`}
    >
      <input type="radio" name="clearScope" checked={scope === value} onChange={() => setScope(value)} className="mt-1 accent-[var(--jade)]" />
      <span>
        <span className="block font-semibold text-sm">{title}</span>
        <span className="block t-note mt-0.5">{desc}</span>
      </span>
    </label>
  );

  return (
    <Modal title="Clear statement records" description="This cannot be undone." onClose={onClose}>
      <div className="space-y-2.5">
        {!isAllTime &&
          option(
            'month',
            `Clear ${monthName(period.month)} ${period.year} only`,
            `Deletes the ${monthCount} transaction${monthCount === 1 ? '' : 's'} in this month. Other months are kept.`,
            'border-jade bg-jade-wash'
          )}
        {option('all', 'Delete all transactions', `Deletes all ${totalCount} transactions across every month so you can start again.`, 'border-danger bg-danger-wash')}
      </div>

      <Notice tone="danger" show={Boolean(error)} className="mt-3">
        {error}
      </Notice>

      <div className="flex justify-end gap-2.5 mt-5">
        <button type="button" onClick={onClose} className="btn btn-quiet">
          Cancel
        </button>
        <button type="button" onClick={confirm} disabled={busy} className="btn btn-danger">
          {busy ? 'Deleting...' : 'Delete'}
        </button>
      </div>
    </Modal>
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
      setStatus({ state: 'error', message: 'Enter a category name.' });
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

  return (
    <Modal title="Set a category budget" description={`For ${monthName(period.month)} ${period.year}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {custom ? (
          <Field label="New category name">
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Rent, parents' allowance, takaful"
              autoFocus
            />
          </Field>
        ) : (
          <Field label="Category">
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {[...new Set([initialCategory, ...categoryOptions].filter(Boolean))].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        )}
        <button type="button" onClick={() => setCustom(!custom)} className="link inline-flex items-center gap-1 text-sm">
          {custom ? <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> : <Plus className="w-3.5 h-3.5" aria-hidden="true" />}
          {custom ? 'Pick an existing category' : 'New category'}
        </button>

        <Field label="Monthly limit" prefix="RM">
          <input type="number" min="1" step="any" value={limit} onChange={(e) => setLimit(e.target.value)} required />
        </Field>

        <StatusAlert status={status} />

        <div className="flex justify-end gap-2.5">
          <button type="button" onClick={onClose} className="btn btn-quiet">
            Cancel
          </button>
          <button type="submit" disabled={status.state === 'working'} className="btn btn-primary">
            Save budget
          </button>
        </div>
      </form>
    </Modal>
  );
}
