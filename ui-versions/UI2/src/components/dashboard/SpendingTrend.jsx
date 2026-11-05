import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { CHART, kFormat } from '../ui/chartTheme';
import { fmtRM, fmtRM0 } from './dashboardUtils';

/**
 * Spending vs money in, per month (last 6 months with data). Click a bar to open that month.
 * "Money in" is what the statements show (salary, transfers in), not the profile income.
 */
export default function SpendingTrend({ months, selected, isAllTime, onSelectMonth }) {
  if (months.length < 2) return null;
  const isSelected = (m) => !isAllTime && m.year === selected.year && m.month === selected.month;
  const avgSpend = months.reduce((s, m) => s + m.spend, 0) / months.length;

  return (
    <section aria-labelledby="trend-title">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-4">
        <h2 id="trend-title" className="t-section">
          Did more come in than went out?
        </h2>
        <p className="t-note">
          Average spend <span className="num font-semibold text-ink">{fmtRM0(avgSpend)}</span> a month. Click a month to open it.
        </p>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={months} margin={{ top: 5, right: 0, left: -8, bottom: 0 }} barGap={4}>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="label" tick={CHART.tick} axisLine={CHART.axisLine} tickLine={false} />
          <YAxis tick={CHART.tick} axisLine={false} tickLine={false} width={48} tickFormatter={kFormat} />
          <Tooltip cursor={CHART.cursor} {...CHART.tooltip} formatter={(v, name) => [fmtRM(v), name]} />
          <Legend wrapperStyle={CHART.legend} iconType="square" iconSize={10} />
          <Bar
            dataKey="spend"
            name="Spending"
            fill={CHART.gold}
            radius={[3, 3, 0, 0]}
            maxBarSize={40}
            cursor="pointer"
            onClick={(d) => onSelectMonth(d.year, d.month)}
            {...CHART.animation}
          >
            {months.map((m) => (
              <Cell key={m.key} fill={CHART.gold} fillOpacity={isSelected(m) || isAllTime ? 1 : 0.5} />
            ))}
          </Bar>
          <Bar
            dataKey="inflow"
            name="Money in"
            fill={CHART.jade}
            radius={[3, 3, 0, 0]}
            maxBarSize={40}
            cursor="pointer"
            onClick={(d) => onSelectMonth(d.year, d.month)}
            {...CHART.animation}
          >
            {months.map((m) => (
              <Cell key={m.key} fill={CHART.jade} fillOpacity={isSelected(m) || isAllTime ? 1 : 0.5} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </section>
  );
}
