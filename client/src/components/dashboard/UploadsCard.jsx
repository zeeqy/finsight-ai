import React, { useEffect, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { FileText, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Card from '../ui/Card';
import { InfoTip, Notice } from '../ui/Controls';
import { EASE } from '../../lib/motion';
import { parseDay } from '../../lib/dates';
import { fmtRM, monthName } from './dashboardUtils';

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
 * The uploaded files behind the month on screen (`period` {year, month}; null = every file, for the all-time view),
 * newest first. Removing one deletes only that file's transactions, so a user with three banks can take one out
 * without clearing the month. A file that also covers other months says so, because removing it removes those too.
 * `refreshKey` reloads the list after uploads and other changes; `onRemove(statement)` does the delete.
 */
export default function UploadsCard({ period, refreshKey, onRemove, busy }) {
  const { authFetch } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    authFetch(period ? `/api/transactions/statements?year=${period.year}&month=${period.month}` : '/api/transactions/statements')
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
  }, [authFetch, refreshKey, period?.year, period?.month]);

  const statements = data?.statements || [];
  if (!error && data && !data.total_files) return null; // nothing uploaded at all (only hand-added transactions)
  const label = period ? `${monthName(period.month)} ${period.year}` : '';
  const others = data ? data.total_files - statements.length : 0;

  return (
    <Card
      icon={FileText}
      tone="blue"
      title="Your uploads"
      note={
        period
          ? `${statements.length || 'No'} ${statements.length === 1 ? 'file' : 'files'} with transactions in ${label}`
          : `${statements.length} ${statements.length === 1 ? 'file' : 'files'}, newest first`
      }
      action={
        <InfoTip label="removing one upload">
          Removing a file deletes only the transactions that came from it. Your other banks, transactions you added by hand and your budgets
          stay. A transaction that was skipped because another file already had it is not in this file, so it stays too. A file that covers
          several months is listed under each of them, and removing it removes all of its months.
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
                    {period ? (
                      <>
                        {s.month_count} {s.month_count === 1 ? 'transaction' : 'transactions'} in {monthName(period.month)} · out {fmtRM(s.month_out)} · in{' '}
                        {fmtRM(s.month_in)}
                      </>
                    ) : (
                      <>
                        {s.txn_count} {s.txn_count === 1 ? 'transaction' : 'transactions'} · out {fmtRM(s.money_out)} · in {fmtRM(s.money_in)}
                      </>
                    )}
                  </p>
                  {period && s.txn_count > s.month_count && (
                    <p className="t-note text-warn">
                      Also has {s.txn_count - s.month_count} {s.txn_count - s.month_count === 1 ? 'transaction' : 'transactions'} in other months
                    </p>
                  )}
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
      {period && data && statements.length === 0 && (
        <p className="t-note">No file you uploaded has transactions in {label}. Pick another month above to see its files.</p>
      )}
      {period && others > 0 && statements.length > 0 && (
        <p className="t-note mt-3">
          {others} other {others === 1 ? 'file is' : 'files are'} listed under {others === 1 ? 'its' : 'their'} own months.
        </p>
      )}
      {data?.manual_count > 0 && (
        <p className="t-note mt-3">
          {data.manual_count} {data.manual_count === 1 ? 'transaction was' : 'transactions were'} added by hand{period ? ` in ${monthName(period.month)}` : ''}.
          Delete those from the ledger below.
        </p>
      )}
    </Card>
  );
}
