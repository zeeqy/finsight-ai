import React from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Info, Scale, XCircle } from 'lucide-react';
import Card from '../ui/Card';
import { InfoTip, Notice } from '../ui/Controls';
import { useGoTo } from '../../context/NavContext';

const fmtRM0 = (n) => `RM ${Math.round(Number(n || 0)).toLocaleString('en-MY')}`;
const ICON = { danger: XCircle, warn: AlertTriangle, info: Info, ok: CheckCircle2 };
const TONE = { danger: 'text-danger', warn: 'text-warn', info: 'text-ink-3', ok: 'text-ok' };
const VERDICT_TAG = { Manageable: 'tag-ok', Tight: 'tag-warn', Risky: 'tag-danger' };

/**
 * Affordability first: what this loan does to the user's real surplus, savings, goals and
 * health index (the decision simulator), with a rate stress test for floating-rate loans.
 * Uses the saved profile, so it can differ from the DSR above, which uses the figures typed here.
 */
export default function AffordabilityCard({ affordability }) {
  const goTo = useGoTo();
  if (!affordability) return null;
  const { before, after, reasons, living, verdict } = affordability;

  return (
    <Card
      icon={Scale}
      tone="teal"
      title="Can you afford it?"
      note="Against your real spending, savings and goals"
      action={
        <InfoTip label="how affordability is checked">
          This uses your saved profile: income, average spending from your statements, saved commitments, emergency savings and active goals.
          The DSR card above uses the figures typed into this form instead, so the two can differ. Default risk, below, is a separate question:
          how likely a lender is to lose money, not whether the repayments fit your life.
        </InfoTip>
      }
    >
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className={`tag ${VERDICT_TAG[verdict]}`}>{verdict}</span>
        <span className="text-sm text-ink-2">
          Left each month: <span className="num font-semibold text-ink">{fmtRM0(before.surplus)}</span> now,{' '}
          <span className={`num font-semibold ${after.surplus < 0 ? 'text-danger' : 'text-ink'}`}>{fmtRM0(after.surplus)}</span> with this loan
        </span>
      </div>
      <ul className="space-y-2">
        {reasons.map((r) => {
          const Icon = ICON[r.tone];
          return (
            <li key={r.text} className="flex items-start gap-2 text-sm">
              <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${TONE[r.tone]}`} aria-hidden="true" />
              <span>{r.text}</span>
            </li>
          );
        })}
      </ul>
      {living && (
        <Notice tone={living.enough ? 'ok' : 'warn'} className="mt-3">
          After all loan repayments you would have {fmtRM0(living.left_for_living)} a month to live on.{' '}
          {living.enough ? 'That covers' : 'That is below'} the EPF Belanjawanku budget of {fmtRM0(living.budget)} ({living.budget_label}).
        </Notice>
      )}
      <button type="button" onClick={() => goTo('health')} className="btn btn-soft btn-sm mt-3">
        Try other options in the Health Check
        <ArrowRight className="w-4 h-4" aria-hidden="true" />
      </button>
    </Card>
  );
}
