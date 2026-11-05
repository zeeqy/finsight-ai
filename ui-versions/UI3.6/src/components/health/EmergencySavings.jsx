import React, { useEffect, useState } from 'react';
import { Minus, Plus, Undo2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Field, InfoTip, MoneyInput, Notice, Segmented } from '../ui/Controls';
import { RollingText } from '../ui/RollingNumber';
import { parseDay } from '../../lib/dates';

const fmtRM = (n) => `RM ${Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDay = (d) => parseDay(d).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });

const KINDS = [
  { value: 'add', label: 'Add', icon: Plus },
  { value: 'withdraw', label: 'Take out', icon: Minus },
  { value: 'set', label: 'Set the total' },
];
const BUTTON = { add: 'Add to savings', withdraw: 'Take out', set: 'Set the total' };
const DONE = { add: 'Added', withdraw: 'Taken out', set: 'Total set' };

/** One line of the history, in words: "+RM 500.00", "−RM 200.00" or "Set to RM 3,000.00". */
function change(e) {
  if (e.kind === 'add') return { text: `+${fmtRM(e.amount)}`, tone: 'text-ok' };
  if (e.kind === 'withdraw') return { text: `−${fmtRM(e.amount)}`, tone: 'text-danger' };
  return { text: `Set to ${fmtRM(e.amount)}`, tone: 'text-ink-2' };
}

/**
 * Emergency savings as a running balance: the user adds money as they save it, takes some out when
 * they use it, or sets the exact total. Every module reads the same balance; the latest change can be undone.
 */
export default function EmergencySavings({ inputRef, onChanged }) {
  const { authFetch } = useAuth();
  const [data, setData] = useState(null);
  const [kind, setKind] = useState('add');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let live = true;
    authFetch('/api/profile/savings')
      .then((r) => r.json())
      .then((json) => {
        if (!live) return;
        if (!json.success) throw new Error(json.message);
        setData(json.data);
        if (json.data.balance === null) setKind('set');
      })
      .catch((err) => live && setStatus({ tone: 'danger', text: err.message || 'Could not load your savings.' }));
    return () => {
      live = false;
    };
  }, [authFetch]);

  const send = async (url, options, doneText) => {
    setStatus({ tone: 'working', text: 'Saving...' });
    try {
      const res = await authFetch(url, options);
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      setData(json.data);
      setAmount('');
      setNote('');
      setStatus({ tone: 'ok', text: doneText(json.data) });
      onChanged();
    } catch (err) {
      setStatus({ tone: 'danger', text: err.message || 'Could not save this change.' });
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    const doneKind = kind;
    await send(
      '/api/profile/savings',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, amount, note: note || null }) },
      (d) => {
        if (doneKind === 'set') setKind('add'); // after the total, the usual next step is adding to it
        return `${DONE[doneKind]}. You now have ${fmtRM(d.balance)}. Your index is updated.`;
      }
    );
  };

  const undo = (entry) =>
    send(`/api/profile/savings/${entry.id}`, { method: 'DELETE' }, (d) =>
      d.balance === null ? 'Undone. No savings are recorded now.' : `Undone. You have ${fmtRM(d.balance)} again.`
    );

  const balance = data?.balance;
  const entries = data?.entries || [];
  const canSubmit = amount !== '' && (kind === 'set' || Number(amount) > 0) && status?.tone !== 'working';

  return (
    <div>
      <div className="flex items-center gap-1">
        <h3 className="t-label">Emergency savings</h3>
        <InfoTip label="what counts as emergency savings">
          Cash and savings accounts you can reach within a few days. Leave out EPF, ASB you would not sell, and money already saved for a goal
          on the Goals page, so nothing is counted twice. Add money here whenever you put some aside.
        </InfoTip>
      </div>
      <p className="t-figure text-3xl mt-1" aria-live="polite">
        {balance === null || balance === undefined ? (
          <span className="text-lg text-ink-3 font-semibold">{data ? 'Not added yet' : 'Loading...'}</span>
        ) : (
          <RollingText text={fmtRM(balance)} />
        )}
      </p>
      {entries[0] && (
        <p className="t-note">
          Last change {fmtDay(entries[0].entry_date)}: {change(entries[0]).text}
        </p>
      )}

      <form onSubmit={submit} className="mt-3 space-y-3">
        <Segmented label="What to do with your savings" options={KINDS} value={kind} onChange={setKind} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={kind === 'set' ? 'Your total savings now' : kind === 'add' ? 'Amount you saved' : 'Amount you used'} prefix="RM">
            <MoneyInput ref={inputRef} min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="num" />
          </Field>
          <Field label="Note (optional)" hint={kind === 'withdraw' ? 'For example: car repair' : 'For example: October salary'}>
            <input type="text" value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
        <div className="flex justify-end">
          <button type="submit" disabled={!canSubmit} className="btn btn-accent">
            {BUTTON[kind]}
          </button>
        </div>
        <Notice tone={status?.tone || 'info'} show={Boolean(status)}>
          {status?.text}
        </Notice>
      </form>

      {entries.length > 0 && (
        <div className="mt-3">
          <h4 className="text-sm font-semibold">Recent changes</h4>
          <ul className="mt-1.5 divide-y divide-line rounded-xl bg-paper-2">
            {entries.slice(0, 5).map((e, i) => {
              const c = change(e);
              return (
                <li key={e.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className={`num font-semibold ${c.tone}`}>{c.text}</p>
                    <p className="t-note truncate">
                      {fmtDay(e.entry_date)}
                      {e.note ? `, ${e.note}` : ''}. Balance {fmtRM(e.balance_after)}
                    </p>
                  </div>
                  {i === 0 && (
                    <button type="button" onClick={() => undo(e)} disabled={status?.tone === 'working'} className="btn btn-quiet btn-sm shrink-0">
                      <Undo2 className="w-4 h-4" aria-hidden="true" />
                      Undo
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
