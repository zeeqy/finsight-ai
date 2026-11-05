import React from 'react';
import { AlertTriangle, CheckCircle2, PiggyBank, ShoppingBag, Wallet } from 'lucide-react';
import { Money, RollingText } from '../ui/RollingNumber';
import { Meter } from '../ui/Controls';
import { Reveal, RevealItem } from '../ui/Reveal';
import { fmtRM } from './dashboardUtils';

function Kpi({ icon: Icon, tone, label, note, gold = false, children }) {
  return (
    <RevealItem className={`card p-4 sm:p-5 min-w-0 flex flex-col ${gold ? 'card-gold' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="t-label">{label}</p>
        <span className={`chip tone-${tone} ${gold ? '!bg-surface' : ''}`}>
          <Icon className="w-[1.125rem] h-[1.125rem]" aria-hidden="true" />
        </span>
      </div>
      <div className="t-figure text-2xl lg:text-[1.625rem] mt-1.5 truncate">{children}</div>
      <div className="t-note mt-1.5">{note}</div>
    </RevealItem>
  );
}

/** The month at a glance. `incomeSource` says where the income figure came from. */
export default function KpiCards({ kpis, incomeSource, label }) {
  const income = Number(kpis.monthly_income);
  const spent = Number(kpis.total_monthly_spend);
  const left = income - spent;
  const spentPct = income > 0 ? Math.round((spent / income) * 100) : null;
  const anomalies = Number(kpis.anomaly_count);
  const top = kpis.top_category;

  return (
    <Reveal className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
      <Kpi icon={Wallet} tone="blue" gold label={`Spent in ${label}`} note={spentPct === null ? 'Set your income to compare' : `${spentPct}% of your income`}>
        <Money value={spent} />
        {spentPct !== null && (
          <div className="mt-2.5">
            <Meter value={spentPct} tone="ink" track="bg-surface/70" label="Share of income spent" />
          </div>
        )}
      </Kpi>

      <Kpi
        icon={PiggyBank}
        tone={left >= 0 ? 'green' : 'danger'}
        label={left >= 0 ? 'Left this month' : 'Over your income'}
        note={`${fmtRM(income)} income, ${incomeSource}`}
      >
        {income > 0 ? <Money value={Math.abs(left)} /> : 'No income set'}
      </Kpi>

      <Kpi icon={ShoppingBag} tone="orange" label="Biggest category" note={top && top !== 'None' ? 'Highest spending this month' : 'Nothing spent yet'}>
        {top && top !== 'None' ? top : 'None yet'}
      </Kpi>

      <Kpi
        icon={anomalies > 0 ? AlertTriangle : CheckCircle2}
        tone={anomalies > 0 ? 'danger' : 'green'}
        label="Unusual transactions"
        note={anomalies > 0 ? 'Much higher than usual for their category' : 'Nothing unusual this month'}
      >
        <RollingText text={String(anomalies)} />
      </Kpi>
    </Reveal>
  );
}
