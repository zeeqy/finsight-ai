import React from 'react';
import { m } from 'motion/react';
import { UploadCloud } from 'lucide-react';
import { Empty } from '../ui/Controls';
import { EASE } from '../../lib/motion';
import { fmtRM, getCategoryColor } from './dashboardUtils';

/** Spending by category as ranked bars: the biggest category sets the scale. */
export default function CategoryBreakdown({ breakdown, totalSpend, onUpload }) {
  const rows = [...breakdown].sort((a, b) => b.total_amount - a.total_amount);
  const top = rows[0]?.total_amount || 1;

  return (
    <section aria-labelledby="where-it-went">
      <h2 id="where-it-went" className="t-section">
        Where the money went
      </h2>

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
          Upload a Maybank or CIMB statement CSV, or pick another month above.
        </Empty>
      ) : (
        <ol className="mt-5 space-y-3.5">
          {rows.map((item, i) => {
            const percent = totalSpend > 0 ? Math.round((item.total_amount / totalSpend) * 100) : 0;
            return (
              <li key={item.category}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-semibold truncate">{item.category}</span>
                  <span className="num shrink-0">
                    <span className="font-semibold">{fmtRM(item.total_amount)}</span>
                    <span className="text-ink-3 ml-2 inline-block w-9 text-right">{percent}%</span>
                  </span>
                </div>
                <m.div
                  className="mt-1.5 h-2.5 rounded-sm origin-left"
                  style={{
                    width: `${Math.max(1.5, (item.total_amount / top) * 100)}%`,
                    backgroundColor: getCategoryColor(item.category),
                  }}
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.9, ease: EASE, delay: i * 0.05 }}
                  title={`${item.transaction_count} transaction${item.transaction_count === 1 ? '' : 's'}`}
                />
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
