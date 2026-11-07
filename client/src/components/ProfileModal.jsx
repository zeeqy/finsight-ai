import React, { useEffect, useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Field, MoneyInput, Notice } from './ui/Controls';
import { Modal } from './ui/Modal';
import HouseholdField from './HouseholdField';
import { COMMITMENTS_CHANGED } from './CommitmentsModal';

const GROUPS = [
  { value: '', label: 'Not set' },
  { value: 'B40', label: 'B40 (household income up to RM 5,250)' },
  { value: 'M40', label: 'M40 (RM 5,251 to RM 11,819)' },
  { value: 'T20', label: 'T20 (RM 11,820 and above)' },
];

/** Change the password: current one first, so a borrowed signed-in screen cannot lock the owner out. */
function PasswordForm() {
  const { authFetch, replaceToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [status, setStatus] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setStatus({ tone: 'working', text: 'Changing...' });
    try {
      const res = await authFetch('/api/auth/me/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      setCurrent('');
      setNext('');
      replaceToken(json.token);
      setStatus({ tone: 'ok', text: 'Password changed. Other devices signed in to this account are signed out; use the new password next time.' });
    } catch (err) {
      setStatus({ tone: 'danger', text: err.message || 'Could not change your password.' });
    }
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-quiet">
        <KeyRound className="w-4 h-4" aria-hidden="true" />
        Change password
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="rounded-xl bg-paper-2 p-3.5 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Current password">
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
        </Field>
        <Field label="New password" hint="At least 8 characters, not a common password">
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={8} required />
        </Field>
      </div>
      <Notice tone={status?.tone || 'info'} show={Boolean(status)}>
        {status?.text}
      </Notice>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="btn btn-quiet">
          Cancel
        </button>
        <button type="submit" disabled={!current || next.length < 8 || status?.tone === 'working'} className="btn btn-accent">
          Change password
        </button>
      </div>
    </form>
  );
}

/** "Your profile": name, income, age, income group and household, used by every module. */
export default function ProfileModal({ onClose }) {
  const { authFetch, updateUser } = useAuth();
  const [form, setForm] = useState(null);
  const [email, setEmail] = useState('');
  const [households, setHouseholds] = useState({});
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await authFetch('/api/auth/me');
        const json = await res.json();
        if (!json.success) throw new Error(json.message);
        if (!live) return;
        const u = json.user;
        setEmail(u.email);
        setHouseholds(json.households || {});
        setForm({
          full_name: u.full_name || '',
          monthly_income: u.monthly_income ? String(u.monthly_income) : '',
          age: u.age ? String(u.age) : '',
          income_group: u.income_group || '',
          household_type: u.household_type || '',
        });
      } catch (err) {
        if (live) setStatus({ tone: 'danger', text: err.message || 'Could not load your profile.' });
      }
    })();
    return () => {
      live = false;
    };
  }, [authFetch]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setStatus({ tone: 'working', text: 'Saving...' });
    try {
      const res = await authFetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      updateUser(json.user);
      // Pages that show a surplus, DSR or plan reload when this fires
      window.dispatchEvent(new Event(COMMITMENTS_CHANGED));
      setStatus({ tone: 'ok', text: 'Saved. Your plans and checks now use these figures.' });
    } catch (err) {
      setStatus({ tone: 'danger', text: err.message || 'Could not save your profile.' });
    }
  };

  return (
    <Modal title="Your profile" description="Used by every module. Change it whenever your situation changes." onClose={onClose} width="max-w-lg">
      {!form ? (
        <Notice tone={status?.tone || 'working'} show>
          {status?.text || 'Loading your profile...'}
        </Notice>
      ) : (
        <>
          <form onSubmit={save} className="space-y-3">
            <Field label="Name">
              <input type="text" value={form.full_name} onChange={set('full_name')} autoComplete="name" maxLength={100} required />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Monthly net income" prefix="RM" hint="Take-home pay after EPF, SOCSO and tax">
                <MoneyInput min="0" value={form.monthly_income} onChange={set('monthly_income')} className="num" />
              </Field>
              <Field label="Age" hint="Used by the loan and insurance checks">
                <input type="number" min="16" max="100" step="1" value={form.age} onChange={set('age')} className="num" />
              </Field>
            </div>
            <Field label="Income group" hint="Your household's group in the DOSM 2022 survey. Sets the Haji cost and goal cost templates.">
              <select value={form.income_group} onChange={set('income_group')}>
                {GROUPS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </Field>
            <HouseholdField households={households} value={form.household_type} onChange={set('household_type')} />
            <p className="t-note">
              Signed in as {email}. Your email is how you sign in, so it cannot be changed here.
            </p>
            <Notice tone={status?.tone || 'info'} show={Boolean(status)}>
              {status?.text}
            </Notice>
            <div className="flex justify-end">
              <button type="submit" disabled={status?.tone === 'working'} className="btn btn-primary">
                {status?.tone === 'working' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                Save profile
              </button>
            </div>
          </form>
          <div className="mt-5 pt-4 border-t border-line">
            <PasswordForm />
          </div>
        </>
      )}
    </Modal>
  );
}
