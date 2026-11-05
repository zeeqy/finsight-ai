import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { Loader2, PiggyBank } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Card from '../ui/Card';
import { InfoTip, Notice } from '../ui/Controls';
import { EASE } from '../../lib/motion';
import { parseDay } from '../../lib/dates';

const fmtRM = (n) => `RM ${Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDay = (s) => parseDay(s).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
const VEHICLE = { tabung_haji: 'Tabung Haji', asb: 'ASB' };

/** One transfer found in the statements, with the goal it would count towards. */
function Suggestion({ s, onAnswer }) {
  const [goalId, setGoalId] = useState(String(s.goals[0].id));
  const [busy, setBusy] = useState('');
  const answer = async (action) => {
    setBusy(action);
    await onAnswer(s, action, goalId);
    setBusy('');
  };
  return (
    <div className="flex flex-col md:flex-row md:items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          <span className="num">{fmtRM(s.amount)}</span> to {VEHICLE[s.vehicle]} on <span className="num">{fmtDay(s.date)}</span>
        </p>
        <p className="t-note truncate">{s.description}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {s.goals.length > 1 ? (
          <select className="field !min-h-10 !py-1.5 w-auto max-w-[14rem]" aria-label="Goal to count it towards" value={goalId} onChange={(e) => setGoalId(e.target.value)}>
            {s.goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        ) : null}
        <button type="button" onClick={() => answer('add')} disabled={Boolean(busy)} className="btn btn-soft btn-sm">
          {busy === 'add' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
          {s.goals.length > 1 ? 'Count it' : `Count towards ${s.goals[0].title}`}
        </button>
        <button type="button" onClick={() => answer('dismiss')} disabled={Boolean(busy)} className="btn btn-quiet btn-sm">
          Not for a goal
        </button>
      </div>
    </div>
  );
}

/**
 * Transfers to Tabung Haji or ASNB found in the user's statements, offered to the goal saved in
 * that vehicle so the same money is not logged twice. Nothing is added without a yes.
 */
export default function DepositSuggestions({ refreshKey, onChanged }) {
  const { authFetch } = useAuth();
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState(null);

  const load = useCallback(async () => {
    try {
      const json = await authFetch('/api/goals/deposits').then((r) => r.json());
      if (json.success) setItems(json.data.suggestions);
    } catch {
      // Suggestions are a convenience: the page works without them
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const onAnswer = async (s, action, goalId) => {
    const json = await authFetch(`/api/goals/deposits/${s.transaction_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, goal_id: goalId }),
    }).then((r) => r.json());
    setMessage({ tone: json.success ? 'ok' : 'danger', text: json.message });
    setItems((list) => list.filter((x) => x.transaction_id !== s.transaction_id));
    if (json.success && action === 'add') onChanged?.();
  };

  if (!items.length && !message) return null;
  return (
    <Card
      icon={PiggyBank}
      tone="green"
      title="Savings found in your statements"
      note="Count them towards your goals"
      action={
        <InfoTip label="how transfers are found">
          FinSight looks for money you moved to Tabung Haji or ASNB in the last six months of your statements, after the goal was created. It is
          offered to your active goal saved in the same place. Nothing is added until you press Count.
        </InfoTip>
      }
    >
      <Notice tone={message?.tone} show={Boolean(message)}>
        {message?.text}
      </Notice>
      <div className="divide-y divide-line">
        <AnimatePresence initial={false}>
          {items.map((s) => (
            <m.div key={s.transaction_id} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25, ease: EASE }} className="overflow-hidden">
              <Suggestion s={s} onAnswer={onAnswer} />
            </m.div>
          ))}
        </AnimatePresence>
      </div>
      {!items.length && <p className="t-note">Nothing else to check.</p>}
    </Card>
  );
}
