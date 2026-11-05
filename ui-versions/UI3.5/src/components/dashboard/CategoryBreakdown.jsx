import React, { useId, useState } from 'react';
import { m } from 'motion/react';
import { PieChart, UploadCloud } from 'lucide-react';
import Card from '../ui/Card';
import { Empty } from '../ui/Controls';
import { Money } from '../ui/RollingNumber';
import { EASE } from '../../lib/motion';
import { fmtRM, getCategoryColor } from './dashboardUtils';

const R = 74;
const WIDTH = 26;
const LENGTH = 2 * Math.PI * R;
const GAP = 2.5;

/** Hand-drawn so a slice can grow on hover and the middle can follow it. It sweeps round once on load. */
function Donut({ rows, total, active, setActive }) {
  const maskId = useId();
  const current = active === null ? null : rows[active];
  const segments = rows.reduce((list, row) => {
    const start = list.length ? list[list.length - 1].end : 0;
    return [...list, { ...row, start, end: start + (row.total_amount / total) * LENGTH }];
  }, []);

  return (
    <div className="relative w-52 h-52 sm:w-56 sm:h-56 shrink-0 mx-auto">
      <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90" role="img" aria-label="Doughnut chart of spending by category">
        <mask id={maskId}>
          <m.circle
            cx="100"
            cy="100"
            r={R}
            fill="none"
            stroke="white"
            strokeWidth="60"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.9, ease: EASE }}
          />
        </mask>
        <g mask={`url(#${maskId})`}>
          {segments.map((s, i) => (
            <circle
              key={s.category}
              cx="100"
              cy="100"
              r={R}
              fill="none"
              stroke={getCategoryColor(s.category)}
              strokeWidth={active === i ? WIDTH + 9 : WIDTH}
              strokeDasharray={`${Math.max(s.end - s.start - GAP, 1)} ${LENGTH}`}
              strokeDashoffset={-s.start}
              opacity={active === null || active === i ? 1 : 0.35}
              className="transition-all duration-200 cursor-pointer"
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onClick={() => setActive(active === i ? null : i)}
            />
          ))}
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-12">
        {current ? (
          <>
            <span className="t-note font-semibold leading-tight line-clamp-2">{current.category}</span>
            <span className="t-figure text-lg mt-0.5">{fmtRM(current.total_amount)}</span>
            <span className="t-note num">{Math.round((current.total_amount / total) * 100)}% of spending</span>
          </>
        ) : (
          <>
            <span className="t-note font-semibold">Total spent</span>
            <span className="t-figure text-lg mt-0.5">
              <Money value={total} />
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/** Spending by category: a doughnut with the ranked list beside it. Hover or tap either one. */
export default function CategoryBreakdown({ breakdown, totalSpend, onUpload }) {
  const [active, setActive] = useState(null);
  const rows = [...breakdown].sort((a, b) => b.total_amount - a.total_amount);

  return (
    <Card
      icon={PieChart}
      tone="blue"
      title="Spending by category"
      note="Where your money went this month"
      className="h-full"
      action={rows.length > 0 ? <span className="tag tag-plain num">{rows.length} categories</span> : null}
    >
      {rows.length === 0 ? (
        <Empty
          icon={UploadCloud}
          title="No spending this month"
          action={
            <button type="button" onClick={onUpload} className="btn btn-primary">
              Upload statement
            </button>
          }
        >
          Upload a bank statement (PDF or CSV), or pick another month above.
        </Empty>
      ) : (
        <div className="flex flex-col md:flex-row md:items-center gap-5">
          <Donut rows={rows} total={totalSpend} active={active} setActive={setActive} />
          <ul className="flex-1 min-w-0 max-h-60 overflow-y-auto pr-1 space-y-0.5">
            {rows.map((item, i) => {
              const percent = totalSpend > 0 ? Math.round((item.total_amount / totalSpend) * 100) : 0;
              return (
                <li key={item.category}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onMouseLeave={() => setActive(null)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                    className={`w-full flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-lg text-sm text-left transition-colors ${
                      active === i ? 'bg-paper-2' : ''
                    }`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: getCategoryColor(item.category) }} aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="block font-semibold truncate">{item.category}</span>
                        <span className="block t-note leading-tight">
                          {item.transaction_count} transaction{item.transaction_count === 1 ? '' : 's'}
                        </span>
                      </span>
                    </span>
                    <span className="text-right shrink-0 num">
                      <span className="block font-semibold">{fmtRM(item.total_amount)}</span>
                      <span className="block t-note leading-tight">{percent}%</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}
