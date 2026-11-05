import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { cardCls, fmtRM, fmtRM0 } from './dashboardUtils';

/**
 * Spending vs money in, per month (last 6 months with data). Click a bar to open that month.
 * "Money in" is what the statements show (salary, transfers in), not the profile income.
 */
export default function SpendingTrend({ months, selected, isAllTime, onSelectMonth }) {
  if (months.length < 2) return null;
  const isSelected = (m) => !isAllTime && m.year === selected.year && m.month === selected.month;
  const avgSpend = months.reduce((s, m) => s + m.spend, 0) / months.length;

  return (
    <div className={`${cardCls} p-6`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-3 border-b border-[#1F2533]">
        <div>
          <h3 className="text-base font-extrabold text-white tracking-tight">Monthly trend</h3>
          <p className="text-xs text-[#94A3B8]">Spending vs money in from your statements. Click a month to open it.</p>
        </div>
        <span className="text-xs font-mono text-[#94A3B8]">
          Average spend <span className="text-white font-bold">{fmtRM0(avgSpend)}</span>/month
        </span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={months} margin={{ top: 5, right: 10, left: 0, bottom: 0 }} barGap={4}>
          <CartesianGrid stroke="#1F2533" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={{ stroke: '#2D3547' }} tickLine={false} />
          <YAxis
            tick={{ fill: '#64748B', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={56}
            tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : v)}
          />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.03)' }}
            contentStyle={{ background: '#0E1118', border: '1px solid #2D3547', borderRadius: 12, fontSize: 12 }}
            labelStyle={{ color: '#F3F4F6', fontWeight: 700 }}
            itemStyle={{ color: '#CBD5E1' }}
            formatter={(v, name) => [fmtRM(v), name]}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: '#94A3B8' }} />
          <Bar
            dataKey="spend"
            name="Spending"
            radius={[4, 4, 0, 0]}
            maxBarSize={36}
            cursor="pointer"
            onClick={(d) => onSelectMonth(d.year, d.month)}
          >
            {months.map((m) => (
              <Cell key={m.key} fill="#FFC80A" fillOpacity={isSelected(m) || isAllTime ? 1 : 0.45} />
            ))}
          </Bar>
          <Bar
            dataKey="inflow"
            name="Money in"
            radius={[4, 4, 0, 0]}
            maxBarSize={36}
            cursor="pointer"
            onClick={(d) => onSelectMonth(d.year, d.month)}
          >
            {months.map((m) => (
              <Cell key={m.key} fill="#10B981" fillOpacity={isSelected(m) || isAllTime ? 0.9 : 0.35} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
