import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { UploadCloud } from 'lucide-react';
import { cardCls, fmtRM, fmtRM0, getCategoryColor } from './dashboardUtils';

/** Doughnut of spending by category, with the list beside it. */
export default function CategoryBreakdown({ breakdown, totalSpend, onUpload }) {
  const data = breakdown.map((item) => ({
    name: item.category,
    value: item.total_amount,
    count: item.transaction_count,
    color: getCategoryColor(item.category),
  }));

  return (
    <div className={`${cardCls} p-6 h-full`}>
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#1F2533]">
        <div>
          <h3 className="text-base font-extrabold text-white tracking-tight">Spending by category</h3>
          <p className="text-xs text-[#94A3B8]">Where your money went this month</p>
        </div>
        <span className="text-xs font-mono font-bold text-[#FFC80A] bg-[#FFC80A]/10 border border-[#FFC80A]/20 px-2.5 py-1 rounded-lg">
          {data.length} categories
        </span>
      </div>

      {data.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-[#232A3B] rounded-xl bg-[#0E1118]/50">
          <UploadCloud className="w-10 h-10 text-[#64748B] mb-2" />
          <p className="text-sm font-bold text-[#CBD5E1]">No spending recorded for this month</p>
          <p className="text-xs text-[#64748B] mt-1 max-w-sm">
            Upload a Maybank or CIMB statement CSV, or pick another month above.
          </p>
          <button
            onClick={onUpload}
            className="mt-4 px-4 py-2 rounded-xl bg-[#FFC80A] text-black font-extrabold text-xs shadow-md shadow-[#FFC80A]/20 transition hover:bg-[#FFD43B]"
          >
            Upload statement
          </button>
        </div>
      ) : (
        <div className="flex flex-col md:flex-row items-center gap-6">
          <div className="w-full md:w-1/2 h-64 relative flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={65} outerRadius={95} paddingAngle={3} stroke="none">
                  {data.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <div className="bg-[#0E1118] border border-[#232A3B] p-2.5 rounded-xl shadow-2xl text-xs">
                        <p className="font-bold text-white">{payload[0].name}</p>
                        <p className="text-[#FFC80A] font-mono font-bold mt-0.5">{fmtRM(payload[0].value)}</p>
                      </div>
                    ) : null
                  }
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] text-[#94A3B8] uppercase font-bold tracking-wider">Total spent</span>
              <span className="text-base font-black text-white font-mono">{fmtRM0(totalSpend)}</span>
            </div>
          </div>

          <div className="w-full md:w-1/2 space-y-2 max-h-64 overflow-y-auto pr-1">
            {data.map((item) => {
              const percent = totalSpend > 0 ? Math.round((item.value / totalSpend) * 100) : 0;
              return (
                <div
                  key={item.name}
                  className="p-2.5 rounded-xl bg-[#0E1118] border border-[#232A3B] flex items-center justify-between text-xs hover:border-[#FFC80A]/40 transition"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <div className="truncate">
                      <p className="font-bold text-[#E2E8F0] truncate">{item.name}</p>
                      <p className="text-[10px] text-[#64748B]">
                        {item.count} transaction{item.count === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono font-bold text-white">{fmtRM(item.value)}</p>
                    <p className="text-[10px] text-[#FFC80A] font-mono font-bold">{percent}%</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
