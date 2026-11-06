import React, { useRef, useState } from 'react';
import { m } from 'motion/react';
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, FileSpreadsheet, Plus } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Field, MoneyInput, Notice, Segmented } from '../ui/Controls';
import { SPRING } from '../../lib/motion';
import { downloadSampleCsv, fmtRM, monthName } from './dashboardUtils';

function StatusAlert({ status }) {
  const tone = { working: 'working', success: 'ok', error: 'danger' }[status.state];
  return (
    <Notice tone={tone || 'info'} show={status.state !== 'idle'} className="mt-4">
      {status.message}
    </Notice>
  );
}

// Banks whose savings/current account statements have been tried with real files. Keep in step with services/pdfStatement.js.
const TESTED_BANKS = ['AEON Bank', 'Bank Islam', 'CIMB', 'Maybank'];

// What each bank gives you, as far as it has been tried with FinSight
const STATEMENT_SOURCES = [
  { bank: 'AEON Bank', how: 'The monthly PDF e-statement from the AEON Bank app (tested).' },
  { bank: 'Bank Islam', how: 'The monthly PDF e-statement or a CSV of your transaction history from Bank Islam online banking (both tested).' },
  { bank: 'CIMB', how: 'The monthly PDF e-statement (tested).' },
  { bank: 'Maybank', how: 'The monthly PDF e-statement from Maybank2u (tested). A Maybank2u CSV has not been tested yet.' },
  { bank: 'Other banks', how: 'Try the PDF e-statement. You will see what was found, and whether it adds up, before anything is saved.' },
];

/** Which banks are tested and what is not supported, shown before the user picks a file. */
function SupportedBanks() {
  return (
    <div className="mt-3 rounded-xl bg-paper-2 px-3 py-2.5 text-sm">
      <p className="font-semibold">Tested with real statements</p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Tested banks">
        {TESTED_BANKS.map((b) => (
          <li key={b} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-0.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-ok" aria-hidden="true" />
            {b}
          </li>
        ))}
      </ul>
      <p className="t-note mt-2">
        Savings and current account statements only. Other banks are not tested yet: they may still work, and the preview shows whether
        every amount adds up before anything is saved. Credit card statements and scanned or photographed statements cannot be read.
      </p>
    </div>
  );
}

const fmtDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });

/** The balance checks of a PDF preview as plain sentences, each with a tone. */
function pdfCheckLines(preview) {
  const c = preview.checks;
  const lines = [];
  const checked = c.rows_checked + c.rows_not_matching;
  if (c.rows_not_matching > 0) {
    lines.push({ tone: 'warn', text: `${c.rows_not_matching} of ${checked} rows do not match the running balance. Check those amounts after importing.` });
  } else if (checked > 0) {
    lines.push({ tone: 'ok', text: `Every amount matches the running balance on the statement (${checked} rows).` });
  }
  if (c.closing_matches === true) lines.push({ tone: 'ok', text: `Ends on the statement's closing balance, ${fmtRM(c.closing_balance)}.` });
  if (c.closing_matches === false) lines.push({ tone: 'warn', text: `Does not end on the closing balance of ${fmtRM(c.closing_balance)}. Some rows may be missing.` });
  if (c.card_holds_left_out > 0) {
    const n = c.card_holds_left_out;
    lines.push({ tone: 'ok', text: `${n} card ${n === 1 ? 'hold' : 'holds'} (for example at a petrol pump) and ${n === 1 ? 'its release are' : 'their releases are'} left out, because they cancel out. The real payments are kept.` });
  }
  for (const [key, word] of [['bank_total_out', 'money out'], ['bank_total_in', 'money in']]) {
    const t = c[key];
    if (!t) continue;
    const total = t.count === null ? fmtRM(t.amount) : `${t.count} transactions, ${fmtRM(t.amount)}`; // some banks print the amount only
    lines.push(
      t.matches
        ? { tone: 'ok', text: `Matches the bank's own total for ${word}: ${total}.` }
        : { tone: 'warn', text: `Does not match the bank's own total for ${word} (${total}).` }
    );
  }
  return lines;
}

/**
 * Statement upload. CSV and XLSX are imported straight away. A PDF e-statement is read first and
 * shown as a preview with its balance checks; a locked PDF asks for its password, which is sent
 * with the file and never saved. `onPreview(file, password)` resolves to the preview data,
 * `onUpload(file, password)` to a success message; both throw with `err.code` for PDF problems.
 */
export function UploadModal({ onClose, onUpload, onPreview }) {
  const [dragActive, setDragActive] = useState(false);
  const [status, setStatus] = useState({ state: 'idle', message: '' });
  const [pdfFile, setPdfFile] = useState(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [preview, setPreview] = useState(null);
  const inputRef = useRef(null);

  const resetPdf = () => {
    setPdfFile(null);
    setNeedsPassword(false);
    setPassword('');
    setPreview(null);
    setStatus({ state: 'idle', message: '' });
  };

  const importFile = async (file, pw) => {
    setStatus({ state: 'working', message: `Reading and categorising ${file.name}...` });
    try {
      const message = await onUpload(file, pw);
      setStatus({ state: 'success', message });
      setTimeout(onClose, 1500);
    } catch (err) {
      setStatus({ state: 'error', message: err.message });
    }
  };

  const readPdf = async (file, pw) => {
    setStatus({ state: 'working', message: `Reading ${file.name}...` });
    try {
      const data = await onPreview(file, pw);
      setPreview(data);
      setNeedsPassword(false);
      setStatus({ state: 'idle', message: '' });
    } catch (err) {
      if (err.code === 'PDF_PASSWORD_REQUIRED') {
        setNeedsPassword(true);
        setStatus({ state: 'idle', message: '' });
      } else {
        if (err.code === 'PDF_PASSWORD_WRONG') setNeedsPassword(true);
        setStatus({ state: 'error', message: err.message });
      }
    }
  };

  const handleFile = async (file) => {
    if (inputRef.current) inputRef.current.value = '';
    if (!file) return;
    if (!/\.(csv|xlsx|pdf)$/i.test(file.name)) {
      setStatus({ state: 'error', message: 'Choose your bank\'s PDF e-statement, or a .csv or .xlsx file.' });
      return;
    }
    if (/\.pdf$/i.test(file.name)) {
      resetPdf();
      setPdfFile(file);
      await readPdf(file, '');
      return;
    }
    await importFile(file);
  };

  const onDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  if (pdfFile && (needsPassword || preview)) {
    const lines = preview ? pdfCheckLines(preview) : [];
    const working = status.state === 'working' || status.state === 'success';
    return (
      <Modal title="Upload bank statement" description={pdfFile.name} onClose={onClose} width="max-w-2xl">
        {needsPassword && !preview && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (password) readPdf(pdfFile, password);
            }}
          >
            <p className="mb-4">This e-statement is locked with a password, the same one you type to open it from your bank's email.</p>
            <Field label="PDF password" hint="Used once to open the file. FinSight does not save it.">
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" autoFocus />
            </Field>
            <StatusAlert status={status} />
            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button type="button" onClick={resetPdf} className="btn btn-quiet">
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                Choose another file
              </button>
              <button type="submit" disabled={!password || status.state === 'working'} className="btn btn-accent">
                Open statement
              </button>
            </div>
          </form>
        )}

        {preview && (
          <>
            <p>
              <span className="font-semibold">{preview.bank.name === 'your bank' ? 'Statement' : `${preview.bank.name} statement`}</span>,{' '}
              <span className="num">{fmtDate(preview.from)}</span> to <span className="num">{fmtDate(preview.to)}</span>:{' '}
              <span className="num font-semibold">{preview.transactionCount}</span> transactions found
              {preview.duplicatesSkipped > 0 && (
                <>
                  , <span className="num">{preview.duplicatesSkipped}</span> already imported
                  {preview.matchedOtherFile > 0 && (
                    <>
                      {' '}(<span className="num">{preview.matchedOtherFile}</span> from another file, matched by date,
                      amount and direction)
                    </>
                  )}
                </>
              )}
              .
            </p>
            <ul className="mt-3 space-y-1.5">
              {lines.map((l) => (
                <li key={l.text} className={`flex items-start gap-2 text-sm ${l.tone === 'ok' ? 'text-ok-deep' : 'text-warn'}`}>
                  {l.tone === 'ok' ? (
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                  )}
                  <span>{l.text}</span>
                </li>
              ))}
            </ul>

            <div className="mt-4 rounded-xl border border-line overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">First transactions found in the statement</caption>
                <thead className="bg-paper-2 text-ink-2">
                  <tr>
                    <th scope="col" className="hidden sm:table-cell text-left font-semibold px-3 py-2">Date</th>
                    <th scope="col" className="text-left font-semibold px-3 py-2">Description</th>
                    <th scope="col" className="text-right font-semibold px-3 py-2">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r, i) => (
                    <tr key={i} className="border-t border-line">
                      <td className="hidden sm:table-cell px-3 py-2 num whitespace-nowrap">{fmtDate(r.txn_date)}</td>
                      <td className="px-3 py-2 max-w-[9rem] sm:max-w-[22rem]">
                        <span className="block truncate" title={r.description}>
                          {r.description}
                        </span>
                        <span className="sm:hidden t-note num">{fmtDate(r.txn_date)}</span>
                      </td>
                      <td className={`px-3 py-2 num text-right whitespace-nowrap ${r.direction === 'in' ? 'text-ok-deep' : ''}`}>
                        {r.direction === 'in' ? '+ ' : '− '}
                        {fmtRM(r.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.transactionCount > preview.rows.length && (
              <p className="t-note mt-2">
                Showing the first {preview.rows.length} of {preview.transactionCount}. All of them are categorised when you import.
              </p>
            )}

            <StatusAlert status={status} />
            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button type="button" onClick={resetPdf} disabled={working} className="btn btn-quiet">
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                Choose another file
              </button>
              <button
                type="button"
                onClick={() => importFile(pdfFile, password)}
                disabled={working || preview.newCount === 0}
                className="btn btn-accent"
              >
                {preview.newCount === 0 ? 'Already imported' : `Import ${preview.newCount} transactions`}
              </button>
            </div>
          </>
        )}
      </Modal>
    );
  }

  return (
    <Modal
      title="Upload bank statement"
      description="Your bank's PDF e-statement, or a CSV or Excel export of your transactions"
      onClose={onClose}
      width="max-w-lg"
    >
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
          dragActive ? 'border-accent bg-accent-wash' : 'border-line-strong hover:border-accent hover:bg-paper'
        }`}
      >
        <FileSpreadsheet className="w-10 h-10 text-accent mx-auto mb-2" aria-hidden="true" />
        <span className="block font-semibold">Click to browse, or drop your statement here</span>
        <span className="block t-note mt-1">
          PDF, CSV or XLSX, up to 10 MB. A PDF is checked and shown to you before anything is saved. Transactions are categorised
          automatically.
        </span>
      </m.button>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.csv,.xlsx"
        className="hidden"
        aria-label="Bank statement PDF, CSV or XLSX"
        onChange={(e) => handleFile(e.target.files[0])}
      />
      <SupportedBanks />
      <details className="mt-3 rounded-xl border border-line px-3 py-2">
        <summary className="cursor-pointer font-semibold text-sm">Where do I get my statement?</summary>
        <p className="t-note mt-2">
          The easiest is the PDF e-statement your bank sends each month. It is usually locked with a password; you will be asked for it.
        </p>
        <dl className="mt-2 space-y-1.5 text-sm">
          {STATEMENT_SOURCES.map((s) => (
            <div key={s.bank}>
              <dt className="font-semibold inline">{s.bank}: </dt>
              <dd className="inline text-ink-2">{s.how}</dd>
            </div>
          ))}
        </dl>
        <p className="t-note mt-2">Cash spending or a bank that won't work? Add payments by hand with "Add transaction".</p>
      </details>

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

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Type in one transaction: cash spending, or a bank with no export. Leaving the category on
 * "Work it out for me" categorises it like an upload. `onSave(body)` resolves to a message or throws.
 */
export function ManualTransactionModal({ categoryOptions, onClose, onSave }) {
  const [form, setForm] = useState({ direction: 'out', date: todayStr(), description: '', amount: '', category: '' });
  const [status, setStatus] = useState({ state: 'idle', message: '' });
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.description.trim()) {
      setStatus({ state: 'error', message: 'Enter what the payment was for.' });
      return;
    }
    if (!(parseFloat(form.amount) > 0)) {
      setStatus({ state: 'error', message: 'The amount must be more than RM 0.' });
      return;
    }
    setStatus({ state: 'working', message: 'Saving...' });
    try {
      const message = await onSave(form);
      setStatus({ state: 'success', message });
      setTimeout(onClose, 900);
    } catch (err) {
      setStatus({ state: 'error', message: err.message });
    }
  };

  return (
    <Modal title="Add a transaction" description="For cash spending, or a payment that is not in an uploaded statement" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Segmented
          label="Money in or out"
          value={form.direction}
          onChange={(direction) => setForm((f) => ({ ...f, direction }))}
          options={[
            { value: 'out', label: 'Money out' },
            { value: 'in', label: 'Money in' },
          ]}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <input type="date" value={form.date} max={todayStr()} onChange={set('date')} required />
          </Field>
          <Field label="Amount" prefix="RM">
            <MoneyInput min="0.01" value={form.amount} onChange={set('amount')} className="num" required />
          </Field>
        </div>
        <Field label={form.direction === 'out' ? 'What was it for' : 'Where it came from'}>
          <input
            type="text"
            value={form.description}
            onChange={set('description')}
            maxLength={255}
            placeholder={form.direction === 'out' ? 'Nasi lemak at Kampung Baru' : 'Freelance payment'}
            autoFocus
          />
        </Field>
        {form.direction === 'out' && (
          <Field label="Category" hint="Leave it to us and it is categorised the same way as an upload.">
            <select value={form.category} onChange={set('category')}>
              <option value="">Work it out for me</option>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        )}

        <StatusAlert status={status} />

        <div className="flex justify-end gap-2.5">
          <button type="button" onClick={onClose} className="btn btn-quiet">
            Cancel
          </button>
          <button type="submit" disabled={status.state === 'working'} className="btn btn-accent">
            Add transaction
          </button>
        </div>
      </form>
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
      <input type="radio" name="clearScope" checked={scope === value} onChange={() => setScope(value)} className="mt-1 accent-[var(--accent)]" />
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
            'border-accent bg-accent-wash'
          )}
        {option('all', 'Delete all transactions', `Deletes all ${totalCount} transactions across every month so you can start again.`, 'border-danger bg-danger-wash')}
      </div>
      <p className="t-note mt-3">To remove one bank's file only, close this and use Remove under "Your uploads" above the transaction list.</p>

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
export function BudgetModal({ period, categoryOptions, initialCategory, budgets = [], income = 0, onClose, onSave }) {
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
          <MoneyInput min="1" value={limit} onChange={(e) => setLimit(e.target.value)} required />
        </Field>

        {(() => {
          // Saving replaces this category's budget, so the others plus the new limit is the new total
          const target = (custom ? customName : category).trim().toLowerCase();
          const others = budgets.filter((b) => b.category.toLowerCase() !== target).reduce((s, b) => s + (parseFloat(b.budget_limit) || 0), 0);
          const total = others + (parseFloat(limit) || 0);
          if (!(income > 0) || total <= income || status.state === 'success') return null;
          return (
            <Notice tone="warn">
              With this limit your budgets add up to {fmtRM(total)}, {fmtRM(total - income)} more than your monthly income of {fmtRM(income)}.
              You can still save it.
            </Notice>
          );
        })()}

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
