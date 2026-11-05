import React, { useState } from 'react';
import { Download, Loader2, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Field, Notice } from './ui/Controls';
import { Modal } from './ui/Modal';
import PrivacyNotice from './PrivacyNotice';
import { TermsList } from './TermsOfUse';

/** "Your data and privacy": what is kept, download it all, or delete the account and everything in it. */
export default function AccountDataModal({ onClose }) {
  const { authFetch, logout } = useAuth();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');

  const download = async () => {
    setBusy('download');
    setError('');
    try {
      const res = await authFetch('/api/auth/me/export');
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      const blob = new Blob([JSON.stringify(json.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `finsight-data-${new Date().toLocaleDateString('en-CA')}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'Could not prepare your data.');
    } finally {
      setBusy('');
    }
  };

  const remove = async (e) => {
    e.preventDefault();
    setBusy('delete');
    setError('');
    try {
      const res = await authFetch('/api/auth/me', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      logout();
    } catch (err) {
      setError(err.message || 'Could not delete your account.');
      setBusy('');
    }
  };

  return (
    <Modal title="Your data and privacy" description="What FinSight keeps, and how to take it with you or remove it." onClose={onClose} width="max-w-lg">
      <PrivacyNotice />
      <details className="mt-4 rounded-xl border border-line bg-surface p-3">
        <summary className="cursor-pointer text-sm font-semibold">Terms of use</summary>
        <TermsList className="mt-3" />
      </details>
      <Notice tone="danger" show={Boolean(error)} className="mt-4">
        {error}
      </Notice>
      <div className="mt-5 pt-4 border-t border-line space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-2 max-w-[34ch]">A file with everything stored about you, readable in any text editor.</p>
          <button type="button" onClick={download} disabled={Boolean(busy)} className="btn btn-soft">
            {busy === 'download' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Download className="w-4 h-4" aria-hidden="true" />}
            Download my data
          </button>
        </div>
        {!confirming ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-2 max-w-[34ch]">Removes your account, transactions, goals, checks and chats for good.</p>
            <button type="button" onClick={() => setConfirming(true)} className="btn btn-danger-quiet">
              <Trash2 className="w-4 h-4" aria-hidden="true" />
              Delete my account
            </button>
          </div>
        ) : (
          <form onSubmit={remove} className="rounded-xl bg-danger-wash p-3.5 space-y-3">
            <p className="text-sm text-ink">
              This cannot be undone. Download your data first if you may want it. Enter your password to confirm.
            </p>
            <Field label="Password">
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus required />
            </Field>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setConfirming(false)} className="btn btn-quiet">
                Keep my account
              </button>
              <button type="submit" disabled={!password || Boolean(busy)} className="btn btn-danger">
                {busy === 'delete' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                Delete account and data
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
