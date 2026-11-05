import React, { useCallback, useEffect, useState } from 'react';
import { Mountain, Snowflake, TrendingDown } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Card from '../ui/Card';
import { Empty, Field, InfoTip, MoneyInput, Notice } from '../ui/Controls';
import { COMMITMENTS_CHANGED } from '../CommitmentsModal';

const fmtRM0 = (n) => `RM ${Math.round(Number(n || 0)).toLocaleString('en-MY')}`;
const duration = (months) => {
  if (months === null || months === undefined) return 'over 50 years';
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y && `${y} year${y === 1 ? '' : 's'}`, m && `${m} month${m === 1 ? '' : 's'}`].filter(Boolean).join(' ') || 'under a month';
};

function Strategy({ icon: Icon, title, plan, note, best }) {
  return (
    <div className={`rounded-xl border p-3.5 ${best ? 'border-ok bg-ok-wash' : 'border-line'}`}>
      <p className="font-semibold flex items-center gap-1.5">
        <Icon className="w-4 h-4" aria-hidden="true" />
        {title}
      </p>
      <p className="t-note">{note}</p>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-ink-3">Debt-free in</dt>
          <dd className="font-semibold">{duration(plan.months)}</dd>
        </div>
        <div>
          <dt className="text-ink-3">Total interest</dt>
          <dd className="num font-semibold">{fmtRM0(plan.total_interest)}</dd>
        </div>
      </dl>
      <ol className="mt-2 text-sm space-y-0.5 list-decimal list-inside text-ink-2">
        {plan.debts.map((d) => (
          <li key={d.id}>
            {d.label}: cleared in {duration(d.paid_off_month)}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Avalanche vs snowball over the user's saved debts, with an optional extra monthly payment. */
export default function DebtPlannerCard({ onManage }) {
  const { authFetch } = useAuth();
  const [extra, setExtra] = useState('200');
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await authFetch('/api/commitments/payoff-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extra_monthly: extra || 0 }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      setPlan(json.data);
      setError('');
    } catch (err) {
      setError(err.message || 'Could not plan your debts.');
    }
  }, [authFetch, extra]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    window.addEventListener(COMMITMENTS_CHANGED, load);
    return () => {
      clearTimeout(t);
      window.removeEventListener(COMMITMENTS_CHANGED, load);
    };
  }, [load]);

  const s = plan?.strategies;
  const c = plan?.comparison;
  return (
    <Card
      icon={TrendingDown}
      tone="orange"
      title="Debt payoff plan"
      note="Two ways to clear the debts you saved, compared"
      action={
        <InfoTip label="avalanche and snowball">
          Both pay every minimum, then put the extra on one debt; when a debt is cleared its payment moves to the next. Avalanche picks the
          highest interest rate first, which costs the least (Amar et al., 2011). Snowball picks the smallest balance first: research found the
          early wins help people keep going (Gal and McShane, 2012). Interest is worked out monthly on what is left.
        </InfoTip>
      }
    >
      <Notice tone="danger" show={Boolean(error)}>
        {error}
      </Notice>
      {plan && !s ? (
        <Empty
          title="No debts with a balance yet"
          action={
            <button type="button" onClick={onManage} className="btn btn-soft">
              Add balances in My commitments
            </button>
          }
        >
          Save your loans and card with the balance left and the interest rate, and the plan appears here.
          {plan.excluded.length > 0 && ` Missing details: ${plan.excluded.map((e) => `${e.label} (${e.reason})`).join(', ')}.`}
        </Empty>
      ) : (
        s && (
          <div className="space-y-4">
            <Field label="Extra you can pay each month" prefix="RM" hint="On top of your usual payments.">
              <MoneyInput min="0" value={extra} onChange={(e) => setExtra(e.target.value)} className="num" />
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Strategy icon={Mountain} title="Avalanche" note="Highest interest first" plan={s.avalanche} best={c.interest_saved_by_avalanche > 0} />
              <Strategy icon={Snowflake} title="Snowball" note="Smallest balance first" plan={s.snowball} />
            </div>
            <p className="text-sm">
              {c.interest_saved_by_avalanche > 0
                ? `Avalanche saves ${fmtRM0(c.interest_saved_by_avalanche)} in interest. `
                : 'Both cost about the same here. '}
              {c.first_win_snowball_month < c.first_win_avalanche_month &&
                `Snowball clears its first debt sooner (${duration(c.first_win_snowball_month)} vs ${duration(c.first_win_avalanche_month)}), if quick wins keep you going. `}
              Compared with paying only the minimums, avalanche saves {fmtRM0(c.interest_saved_vs_minimum)}
              {c.months_saved_vs_minimum ? ` and ${duration(c.months_saved_vs_minimum)}` : ''}.
            </p>
            <Notice tone="warn" show={plan.stuck.length > 0}>
              The payment on {plan.stuck.join(', ')} does not cover its interest, so that balance keeps growing. Pay more than the interest each month.
            </Notice>
            <Notice show={plan.has_flat_rate_loan}>
              A car loan signed before 1 June 2026 charges a flat rate; settling it early earns a rebate (Hire-Purchase Act 1967), so the real
              saving on it is smaller than shown. Car loans from 1 June 2026 use a reducing balance, as modelled here.
            </Notice>
            {plan.excluded.length > 0 && (
              <p className="t-note">Left out for missing details: {plan.excluded.map((e) => `${e.label} (${e.reason})`).join(', ')}.</p>
            )}
          </div>
        )
      )}
    </Card>
  );
}
