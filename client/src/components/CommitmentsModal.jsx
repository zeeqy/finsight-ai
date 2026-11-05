import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { Landmark, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Field, InfoTip, Loading, MoneyInput, Notice } from './ui/Controls';
import { Modal, useConfirm } from './ui/Modal';
import { EASE } from '../lib/motion';
import { parseDay } from '../lib/dates';

const fmtRM = (n) => `RM ${Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Fired on window after commitments change, so open pages can reload their surplus. */
export const COMMITMENTS_CHANGED = 'finsight:commitments-changed';

const BLANK = { kind: 'car_loan', label: '', monthly_amount: '', balance: '', annual_rate: '', end_date: '', paid_from_statement: true };

/** Add or edit one commitment. */
function CommitmentForm({ kinds, initial, onSave, onCancel, busy }) {
  const [f, setF] = useState(initial);
  const set = (key) => (e) => setF((prev) => ({ ...prev, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const isDebt = kinds[f.kind]?.debt;

  return (
    <form
      className="rounded-xl border border-line bg-paper p-3.5 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(f);
      }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="What is it">
          <select value={f.kind} onChange={set('kind')}>
            {Object.entries(kinds).map(([key, k]) => (
              <option key={key} value={key}>
                {k.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Name (optional)">
          <input value={f.label} onChange={set('label')} placeholder={kinds[f.kind]?.label} maxLength={100} />
        </Field>
        <Field label="Monthly payment" prefix="RM">
          <MoneyInput min="0" required value={f.monthly_amount} onChange={set('monthly_amount')} className="num" />
        </Field>
        {isDebt && (
          <Field label="Balance left (optional)" prefix="RM" hint="Used later by the debt payoff planner.">
            <MoneyInput min="0" value={f.balance} onChange={set('balance')} className="num" />
          </Field>
        )}
        {isDebt && (
          <Field label="Interest rate (optional)" hint="% per year">
            <input type="number" min="0" max="100" step="0.01" value={f.annual_rate} onChange={set('annual_rate')} className="num" />
          </Field>
        )}
        <Field label="Ends on (optional)">
          <input type="date" value={f.end_date} onChange={set('end_date')} />
        </Field>
      </div>
      <label className="flex items-start gap-2.5 text-sm cursor-pointer">
        <input type="checkbox" checked={f.paid_from_statement} onChange={set('paid_from_statement')} className="mt-1 w-4 h-4 accent-[var(--accent)]" />
        <span>
          Paid from the account whose statements I upload
          <span className="block t-note">
            Leave this ticked if the payment already shows in your statements, so it is not counted twice. Untick it for salary deductions or
            another account.
          </span>
        </span>
      </label>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn btn-quiet">
          Cancel
        </button>
        <button type="submit" disabled={busy} className="btn btn-accent">
          {initial.id ? 'Save changes' : 'Add commitment'}
        </button>
      </div>
    </form>
  );
}

/**
 * The user's monthly commitments (loans, PTPTN, card, takaful...). Saved once and used by the
 * surplus, DSR and goal plans everywhere. `onChanged` runs after any add, edit or delete.
 */
export default function CommitmentsModal({ onClose, onChanged }) {
  const { authFetch } = useAuth();
  const confirm = useConfirm();
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null); // BLANK for a new one, or the item being edited
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await authFetch('/api/commitments');
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      setData(json.data);
      setError('');
    } catch (e) {
      setError(e.message || 'Could not load your commitments.');
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const send = async (url, options) => {
    setBusy(true);
    try {
      const res = await authFetch(url, options);
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      setEditing(null);
      setError('');
      await load();
      onChanged?.();
    } catch (e) {
      setError(e.message || 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const save = (f) =>
    send(f.id ? `/api/commitments/${f.id}` : '/api/commitments', {
      method: f.id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(f),
    });

  const remove = async (c) => {
    if (await confirm({ title: `Remove "${c.label}"?`, body: 'Your surplus, DSR and goal plans will be worked out again without it.', action: 'Remove' })) {
      send(`/api/commitments/${c.id}`, { method: 'DELETE' });
    }
  };

  const items = data?.items || [];
  const totals = data?.totals;

  return (
    <Modal
      title="My monthly commitments"
      description="Loans, PTPTN, credit card, takaful and other fixed payments. Enter them once and every module uses them for your surplus and DSR."
      onClose={onClose}
      width="max-w-2xl"
    >
      {!data && !error ? (
        <Loading>Loading your commitments...</Loading>
      ) : (
        <div className="space-y-3">
          <Notice tone="danger" show={Boolean(error)}>
            {error}
          </Notice>

          {totals && totals.count > 0 && (
            <dl className="grid grid-cols-2 gap-3 rounded-xl bg-paper-2 p-3.5">
              <div>
                <dt className="t-label">Total each month</dt>
                <dd className="t-figure text-xl num">{fmtRM(totals.monthly_total)}</dd>
              </div>
              <div>
                <dt className="t-label flex items-center gap-1">
                  Counts toward DSR
                  <InfoTip label="what counts toward DSR">
                    Banks work out your debt service ratio from loan and credit card repayments. Takaful, insurance and other bills are part of
                    your spending but not your DSR.
                  </InfoTip>
                </dt>
                <dd className="t-figure text-xl num">{fmtRM(totals.debt_monthly)}</dd>
              </div>
            </dl>
          )}

          {items.length === 0 && !editing && (
            <div className="py-6 flex flex-col items-center text-center">
              <Landmark className="w-8 h-8 text-accent mb-3" aria-hidden="true" />
              <p className="font-display font-semibold text-lg">No commitments yet</p>
              <p className="t-note mt-1 max-w-[44ch]">Add your car loan, PTPTN or credit card payment so plans and loan checks start from the real figure.</p>
            </div>
          )}

          {items.length > 0 && (
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
              <AnimatePresence initial={false}>
                {items.map((c) => (
                  <m.li
                    key={c.id}
                    className="flex items-center gap-3 px-3.5 py-2.5 overflow-hidden"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25, ease: EASE }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate">{c.label}</p>
                      <p className="t-note">
                        {data.kinds[c.kind]?.label}
                        {c.end_date ? ` · until ${parseDay(c.end_date).toLocaleDateString('en-MY', { month: 'short', year: 'numeric' })}` : ''}
                        {c.paid_from_statement ? '' : ' · not in your statements'}
                      </p>
                    </div>
                    <span className="num font-semibold whitespace-nowrap">{fmtRM(c.monthly_amount)}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setEditing({
                          ...c,
                          balance: c.balance ?? '',
                          annual_rate: c.annual_rate ?? '',
                          end_date: c.end_date ?? '',
                        })
                      }
                      className="btn btn-icon btn-sm"
                      aria-label={`Edit ${c.label}`}
                    >
                      <Pencil className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(c)}
                      className="btn btn-icon btn-sm hover:!text-danger hover:!bg-danger-wash"
                      aria-label={`Remove ${c.label}`}
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </m.li>
                ))}
              </AnimatePresence>
            </ul>
          )}

          {editing ? (
            <CommitmentForm
              key={editing.id || 'new'}
              kinds={data.kinds}
              initial={editing}
              busy={busy}
              onSave={save}
              onCancel={() => setEditing(null)}
            />
          ) : (
            data && (
              <button type="button" onClick={() => setEditing(BLANK)} className="btn btn-soft w-full sm:w-auto">
                <Plus className="w-4 h-4" aria-hidden="true" />
                Add a commitment
              </button>
            )
          )}
        </div>
      )}
    </Modal>
  );
}
