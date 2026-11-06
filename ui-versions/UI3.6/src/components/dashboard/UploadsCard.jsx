import React, { useEffect, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { FileText, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Card from '../ui/Card';
import { InfoTip, Notice } from '../ui/Controls';
import { EASE } from '../../lib/motion';
import { parseDay } from '../../lib/dates';
import { fmtRM } from './dashboardUtils';

const fmtDay = (d) => parseDay(d).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
const FILE_TYPE = { pdf: 'PDF e-statement', csv: 'CSV', xlsx: 'Excel' };

/** "1 – 30 Jun 2026", or one date when the file covers a single day. */
function coverage(from, to) {
  if (from === to) return fmtDay(from);
  const a = parseDay(from);
  const b = parseDay(to);
  const sameMonth = a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
  return sameMonth ? `${a.getDate()} – ${fmtDay(to)}` : `${fmtDay(from)} – ${fmtDay(to)}`;
}

/**
 * Every uploaded file that still has transactions, newest first. Removing one deletes only that file's
 * transactions, so a user with three banks can take one out without clearing the month.
 * `refreshKey` reloads the list after uploads and other changes; `onRemove(statement)` does the delete.
 */
export default function UploadsCard({ refreshKey, onRemove, busy }) {
  const { authFetch } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    authFetch('/api/transactions/statements')
      .then((r) => r.json())
      .then((json) => {
        if (!live) return;
        if (!json.success) throw new Error(json.message);
        setData(json.data);
        setError('');
      })
      .catch((err) => live && setError(err.message || 'Could not load your uploads.'));
    return () => {
      live = false;
    };
  }, [authFetch, refreshKey]);

  const statements = data?.statements || [];
  if (!error && data && statements.length === 0) return null; // nothing uploaded (only hand-added transactions)

  return (
    <Card
      icon={FileText}
      tone="blue"
      title="Your uploads"
      note={statements.length ? `${statements.length} ${statements.length === 1 ? 'file' : 'files'}, newest first` : 'Files you have uploaded'}
      action={
        <InfoTip label="removing one upload">
          Removing a file deletes only the transactions that came from it. Your other banks, transactions you added by hand and your budgets
          stay. A transaction that was skipped because another file already had it is not in this file, so it stays too.
        </InfoTip>
      }
    >
      <Notice tone="danger" show={Boolean(error)}>
        {error}
      </Notice>
      {statements.length > 0 && (
        <ul className="divide-y divide-line -my-1">
          <AnimatePresence initial={false}>
            {statements.map((s) => (
              <m.li
                key={s.id}
                className="py-2.5 flex items-center gap-3 overflow-hidden"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: EASE }}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate" title={s.filename}>
                    {s.bank || s.filename}
                    <span className="font-normal text-ink-2"> · {coverage(s.first_date, s.last_date)}</span>
                  </p>
                  <p className="t-note truncate">
                    {s.txn_count} {s.txn_count === 1 ? 'transaction' : 'transactions'} · out {fmtRM(s.money_out)} · in {fmtRM(s.money_in)}
                  </p>
                  <p className="t-note truncate" title={s.filename}>
                    {FILE_TYPE[s.file_type || (s.filename.match(/\.(pdf|csv|xlsx)$/i)?.[1] || '').toLowerCase()] || 'File'}
                    {s.bank ? `, ${s.filename}` : ''} · uploaded {new Date(s.uploaded_at).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(s)}
                  disabled={busy}
                  className="btn btn-quiet btn-sm shrink-0"
                  aria-label={`Remove ${s.bank || s.filename}, ${coverage(s.first_date, s.last_date)}`}
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                  Remove
                </button>
              </m.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      {data?.manual_count > 0 && (
        <p className="t-note mt-3">
          {data.manual_count} {data.manual_count === 1 ? 'transaction was' : 'transactions were'} added by hand. Delete those from the ledger
          below.
        </p>
      )}
    </Card>
  );
}
