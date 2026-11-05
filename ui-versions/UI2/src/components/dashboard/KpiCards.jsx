import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Money, RollingText } from '../ui/RollingNumber';
import { Meter } from '../ui/Controls';
import { Reveal, RevealItem } from '../ui/Reveal';
import { fmtRM } from './dashboardUtils';

function Fact({ label, children, note }) {
  return (
    <RevealItem className="py-4 md:py-0 md:px-6 first:md:pl-0 last:md:pr-0 min-w-0">
      <p className="t-label">{label}</p>
      <div className="t-figure text-2xl md:text-[1.75rem] mt-1 truncate">{children}</div>
      <div className="t-note mt-1.5">{note}</div>
    </RevealItem>
  );
}

/** The month's facts under the headline. `incomeSource` says where the income figure came from. */
export default function KpiCards({ kpis, incomeSource }) {
  const spentPct = kpis.monthly_income > 0 ? Math.round((kpis.total_monthly_spend / kpis.monthly_income) * 100) : null;
  const overspent = kpis.monthly_income > 0 && kpis.total_monthly_spend > kpis.monthly_income;
  const anomalies = Number(kpis.anomaly_count);

  return (
    <Reveal className="grid grid-cols-1 md:grid-cols-[1.3fr_1fr_1fr] divide-y md:divide-y-0 md:divide-x divide-line">
      <Fact
        label="Share of income spent"
        note={`${fmtRM(kpis.monthly_income)} income, ${incomeSource}`}
      >
        {spentPct === null ? (
          'No income set'
        ) : (
          <>
            <RollingText text={`${spentPct}%`} />
            <div className="mt-2.5">
              <Meter value={spentPct} tone={overspent ? 'danger' : spentPct >= 80 ? 'warn' : 'ok'} label="Share of income spent" />
            </div>
          </>
        )}
      </Fact>

      <Fact label="Biggest category" note="Highest spending this month">
        {kpis.top_category}
      </Fact>

      <Fact
        label="Unusual transactions"
        note={
          anomalies > 0 ? (
            <span className="inline-flex items-center gap-1 text-warn">
              <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
              Much higher than usual for their category
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-jade">
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              Nothing unusual this month
            </span>
          )
        }
      >
        <RollingText text={String(anomalies)} />
      </Fact>
    </Reveal>
  );
}

/** Sentence at the top of the page: the month's answer, with the amounts rolling in. */
export function MonthHeadline({ kpis, label, hasData }) {
  if (!hasData) return `Nothing recorded for ${label} yet`;
  const left = kpis.monthly_income - kpis.total_monthly_spend;
  return (
    <>
      <Money value={kpis.total_monthly_spend} /> spent in {label}.{' '}
      {kpis.monthly_income > 0 &&
        (left >= 0 ? (
          <span className="text-jade">
            <Money value={left} /> left.
          </span>
        ) : (
          <span className="text-danger">
            <Money value={-left} /> over income.
          </span>
        ))}
    </>
  );
}
