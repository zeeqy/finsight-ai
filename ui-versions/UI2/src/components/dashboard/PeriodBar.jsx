import React from 'react';
import { ChevronLeft, ChevronRight, Download, Trash2, UploadCloud } from 'lucide-react';
import { downloadSampleCsv, monthName } from './dashboardUtils';

/** Month navigator + actions (clear, sample CSV, upload). */
export default function PeriodBar({
  period,
  isAllTime,
  periods,
  allTimeCount,
  recordCount,
  onPrev,
  onNext,
  onSelect,
  onClear,
  onUpload,
}) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center bg-surface border border-line rounded-control">
          <button type="button" onClick={onPrev} className="btn btn-icon" aria-label="Previous month">
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>
          <span className="px-1 min-w-[9.5rem] text-center font-semibold text-sm">
            {isAllTime ? 'All records' : `${monthName(period.month)} ${period.year}`}
          </span>
          <button type="button" onClick={onNext} className="btn btn-icon" aria-label="Next month">
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {periods.length > 0 && (
          <select
            aria-label="Jump to a month"
            value={isAllTime ? 'ALL' : `${period.year}-${period.month}`}
            onChange={(e) => onSelect(e.target.value)}
            className="field !w-auto text-sm"
          >
            <option value="ALL">All time ({allTimeCount} records)</option>
            {periods.map((p) => (
              <option key={`${p.year}-${p.month}`} value={`${p.year}-${p.month}`}>
                {monthName(p.month)} {p.year} ({p.count} records)
              </option>
            ))}
          </select>
        )}

        <span className="t-note">
          {recordCount} record{recordCount === 1 ? '' : 's'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onClear} disabled={allTimeCount === 0} className="btn btn-danger-quiet">
          <Trash2 className="w-4 h-4" aria-hidden="true" />
          Clear records
        </button>
        <button type="button" onClick={downloadSampleCsv} className="btn btn-quiet">
          <Download className="w-4 h-4" aria-hidden="true" />
          Sample CSV
        </button>
        <button type="button" onClick={onUpload} className="btn btn-primary">
          <UploadCloud className="w-4 h-4" aria-hidden="true" />
          Upload statement
        </button>
      </div>
    </div>
  );
}
