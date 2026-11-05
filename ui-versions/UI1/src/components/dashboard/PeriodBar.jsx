import React from 'react';
import { Calendar, ChevronLeft, ChevronRight, Download, Trash2, UploadCloud } from 'lucide-react';
import { cardCls, downloadSampleCsv, monthName } from './dashboardUtils';

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
    <div className={`${cardCls} p-4 md:p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4`}>
      <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
        <div className="flex items-center bg-[#0E1118] border border-[#232A3B] rounded-xl p-1 shadow-inner">
          <button
            onClick={onPrev}
            className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#FFC80A] hover:bg-[#1A202E] transition"
            title="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="px-3 py-1 flex items-center gap-2 min-w-[150px] justify-center">
            <Calendar className="w-4 h-4 text-[#FFC80A]" />
            <span className="font-extrabold text-sm text-white tracking-wide">
              {isAllTime ? 'All records' : `${monthName(period.month)} ${period.year}`}
            </span>
          </div>
          <button
            onClick={onNext}
            className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#FFC80A] hover:bg-[#1A202E] transition"
            title="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {periods.length > 0 && (
          <select
            value={isAllTime ? 'ALL' : `${period.year}-${period.month}`}
            onChange={(e) => onSelect(e.target.value)}
            className="bg-[#0E1118] border border-[#232A3B] text-xs text-[#CBD5E1] rounded-xl px-3 py-2 font-mono focus:outline-none focus:border-[#FFC80A]"
          >
            <option value="ALL">All time ({allTimeCount} records)</option>
            {periods.map((p) => (
              <option key={`${p.year}-${p.month}`} value={`${p.year}-${p.month}`}>
                {monthName(p.month)} {p.year} ({p.count} records)
              </option>
            ))}
          </select>
        )}

        <span className="text-[11px] font-mono text-[#FFC80A] bg-[#FFC80A]/10 border border-[#FFC80A]/20 px-2.5 py-1 rounded-lg">
          {recordCount} record{recordCount === 1 ? '' : 's'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
        <button
          onClick={onClear}
          disabled={allTimeCount === 0}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1C202B] hover:bg-rose-500/15 border border-[#2D3547] hover:border-rose-500/40 text-rose-300 hover:text-rose-200 text-xs font-semibold transition disabled:opacity-40 disabled:pointer-events-none"
        >
          <Trash2 className="w-3.5 h-3.5 text-rose-400" />
          <span>Clear records</span>
        </button>
        <button
          onClick={downloadSampleCsv}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#181D2A] hover:bg-[#202738] border border-[#2D3547] text-xs text-[#CBD5E1] transition"
          title="Download a sample statement CSV"
        >
          <Download className="w-3.5 h-3.5 text-[#FFC80A]" />
          <span>Sample CSV</span>
        </button>
        <button
          onClick={onUpload}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FFC80A] hover:bg-[#FFD43B] text-black font-extrabold text-xs shadow-lg shadow-[#FFC80A]/25 transition active:scale-95"
        >
          <UploadCloud className="w-4 h-4" />
          <span>Upload statement</span>
        </button>
      </div>
    </div>
  );
}
