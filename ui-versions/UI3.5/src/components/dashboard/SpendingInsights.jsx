import React, { useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { CalendarClock, Check, Repeat, RotateCcw, TrendingUp, X } from 'lucide-react';
import Card from '../ui/Card';
import { Money } from '../ui/RollingNumber';
import { Empty, InfoTip, Meter } from '../ui/Controls';
import { EASE } from '../../lib/motion';
import { fmtRM, fmtRM0, monthName } from './dashboardUtils';

const monthLabel = (ym) => {
  const [y, mo] = ym.split('-').map(Number);
  return `${monthName(mo)} ${y}`;
};
const dayLabel = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });

/** Next month's spending: recurring payments plus usual spending, with a likely range. */
export function ForecastCard({ forecast, note }) {
  if (!forecast) {
    return (
      <Card icon={TrendingUp} tone="purple" title="Next month">
        <Empty title="Not enough months yet">{note}</Empty>
      </Card>
    );
  }
  const rest = Math.max(0, forecast.point - forecast.recurring_part);
  const recurringShare = forecast.point > 0 ? (forecast.recurring_part / forecast.point) * 100 : 0;
  const months = forecast.history.length;

  return (
    <Card
      icon={TrendingUp}
      tone="purple"
      title="Next month"
      note={`Estimate for ${monthLabel(forecast.month)}`}
      action={
        <InfoTip label="how next month is estimated">
          Recurring payments are counted at their usual amount. The rest of your usual spending is smoothed over the last {months} months
          (exponential smoothing), with purchases flagged as unusual left out. Those one-offs still widen the top of the range. Tested on real
          bank data, the estimate typically missed by about a third of a month's spending, so treat it as a rough guide.
        </InfoTip>
      }
    >
      <p className="t-figure text-3xl">
        <span className="text-ink-3 text-xl font-semibold mr-1.5">About</span>
        <Money value={forecast.point} decimals={0} />
      </p>
      <p className="t-note mt-1 num">
        Likely between {fmtRM0(forecast.low)} and {fmtRM0(forecast.high)}
        {forecast.range_source === 'rough' ? ' (a rough range until there are more months)' : ''}
      </p>

      <div className="mt-4">
        <Meter value={recurringShare} colour="var(--purple)" track="bg-[var(--purple-wash)]" label="Share of next month already committed to recurring payments" />
        <div className="mt-1.5 flex justify-between gap-3 text-sm">
          <span>
            <span className="num font-semibold">{fmtRM0(forecast.recurring_part)}</span> <span className="text-ink-2">recurring</span>
          </span>
          <span>
            <span className="num font-semibold">{fmtRM0(rest)}</span> <span className="text-ink-2">usual spending</span>
          </span>
        </div>
      </div>

      {forecast.categories.length > 0 && (
        <div className="mt-4">
          <p className="t-label mb-1.5">Biggest categories</p>
          <ul className="space-y-1 text-sm">
            {forecast.categories.map((c) => (
              <li key={c.category} className="flex justify-between gap-3">
                <span className="text-ink-2 truncate">{c.category}</span>
                <span className="num font-semibold whitespace-nowrap">{fmtRM0(c.point)}</span>
              </li>
            ))}
          </ul>
          <p className="t-note mt-1.5">Each category is estimated on its own, so they do not add up to the total exactly.</p>
        </div>
      )}
    </Card>
  );
}

function kindLabel(r) {
  if (r.is_saving) return 'Regular saving';
  if (r.cadence === 'weekly') return 'Weekly';
  return r.kind === 'bill' ? 'Monthly bill' : 'Monthly, same amount';
}

/** Payments found to repeat at a regular interval, which the user can confirm or hide. */
export function RecurringCard({ items, dismissed, total, onStatus, busyKey }) {
  const [showHidden, setShowHidden] = useState(false);
  const active = items.filter((r) => r.active);

  return (
    <Card
      icon={Repeat}
      tone="green"
      title="Recurring payments"
      note={
        items.length
          ? `${active.length} still running, about ${fmtRM0(total)} a month`
          : 'Bills and subscriptions found in your statements'
      }
      action={
        <InfoTip label="how recurring payments are found">
          A payee counts as recurring after at least 3 payments at a regular gap (weekly or monthly), either for the same amount or, for bills
          like electricity and phone, an amount that changes a little. Checked against real standing orders in a public bank dataset: 99.5% of
          what it found was right and it found 98.5% of them. Confirm the ones you recognise and hide any that are not.
        </InfoTip>
      }
    >
      {items.length === 0 ? (
        <Empty title="None found yet">
          They show up once the same payee is paid at a regular interval at least 3 times, so upload 3 or more months of statements.
        </Empty>
      ) : (
        <ul className="divide-y divide-line -my-1">
          <AnimatePresence initial={false}>
            {items.map((r) => (
              <m.li
                key={r.key}
                className="py-2.5 flex items-center gap-3 overflow-hidden"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: EASE }}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate" title={r.merchant}>
                    {r.merchant}
                  </p>
                  <p className="t-note flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span>{kindLabel(r)}</span>
                    {r.active ? (
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="w-3.5 h-3.5" aria-hidden="true" />
                        next around {dayLabel(r.next_date)}
                      </span>
                    ) : (
                      <span className="tag tag-plain">None since {dayLabel(r.last_date)}</span>
                    )}
                    {r.status === 'confirmed' && <span className="tag tag-ok">Confirmed</span>}
                  </p>
                </div>
                <span className="num font-semibold whitespace-nowrap">{fmtRM(r.typical_amount)}</span>
                <div className="flex gap-1 shrink-0">
                  {r.status !== 'confirmed' && (
                    <button
                      type="button"
                      onClick={() => onStatus(r.key, 'confirmed')}
                      disabled={busyKey === r.key}
                      className="btn btn-icon btn-sm hover:!text-ok hover:!bg-ok-wash"
                      aria-label={`Confirm ${r.merchant} is recurring`}
                    >
                      <Check className="w-4 h-4" aria-hidden="true" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onStatus(r.key, 'dismissed')}
                    disabled={busyKey === r.key}
                    className="btn btn-icon btn-sm hover:!text-danger hover:!bg-danger-wash"
                    aria-label={`Hide ${r.merchant}, it is not recurring`}
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </m.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {dismissed.length > 0 && (
        <div className="mt-3">
          <button type="button" onClick={() => setShowHidden((s) => !s)} className="link text-sm" aria-expanded={showHidden}>
            {showHidden ? 'Hide' : 'Show'} {dismissed.length} hidden
          </button>
          {showHidden && (
            <ul className="mt-2 space-y-1.5">
              {dismissed.map((r) => (
                <li key={r.key} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-ink-2">{r.merchant}</span>
                  <button type="button" onClick={() => onStatus(r.key, null)} className="btn btn-quiet btn-sm">
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    Show again
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
