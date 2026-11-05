import React from 'react';
import { AlertTriangle, PiggyBank, TrendingDown, Wallet } from 'lucide-react';
import { fmtRM } from './dashboardUtils';

function Kpi({ label, icon: Icon, iconCls, hoverCls, children, footer }) {
  return (
    <div className={`bg-[#141824]/90 border border-[#232A3B] rounded-2xl p-5 transition shadow-lg ${hoverCls}`}>
      <div className="flex items-center justify-between text-[#94A3B8] text-xs font-bold uppercase tracking-wider mb-2">
        <span>{label}</span>
        <div className={`p-2 rounded-xl ${iconCls}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      {children}
      <div className="text-[11px] text-[#64748B] mt-1.5">{footer}</div>
    </div>
  );
}

/** Four headline numbers for one month. `incomeSource` says where the income figure came from. */
export default function KpiCards({ kpis, incomeSource }) {
  const spentPct = kpis.monthly_income > 0 ? Math.round((kpis.total_monthly_spend / kpis.monthly_income) * 100) : null;
  const overspent = kpis.monthly_income > 0 && kpis.total_monthly_spend > kpis.monthly_income;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <Kpi
        label="Spending"
        icon={TrendingDown}
        iconCls="bg-rose-500/10 text-rose-400"
        hoverCls="hover:border-[#FFC80A]/40"
        footer={
          <span className="flex items-center justify-between">
            <span>
              Income {fmtRM(kpis.monthly_income)} <span className="text-[#475569]">({incomeSource})</span>
            </span>
            {spentPct !== null && <span className="text-[#94A3B8] font-mono">{spentPct}% spent</span>}
          </span>
        }
      >
        <div className="text-2xl font-black text-white tracking-tight">{fmtRM(kpis.total_monthly_spend)}</div>
      </Kpi>

      <Kpi
        label="Left over"
        icon={PiggyBank}
        iconCls={overspent ? 'bg-rose-500/10 text-rose-400' : 'bg-[#10B981]/15 text-[#10B981]'}
        hoverCls="hover:border-[#10B981]/40"
        footer={
          overspent ? (
            <span className="text-rose-300">Spending is above income this month</span>
          ) : (
            <span>
              <span className="text-[#10B981] font-bold font-mono">{kpis.savings_rate}%</span> of income saved
            </span>
          )
        }
      >
        <div className={`text-2xl font-black tracking-tight ${overspent ? 'text-rose-400' : 'text-[#10B981]'}`}>
          {overspent ? `-${fmtRM(kpis.total_monthly_spend - kpis.monthly_income)}` : fmtRM(kpis.net_savings)}
        </div>
      </Kpi>

      <Kpi
        label="Top category"
        icon={Wallet}
        iconCls="bg-[#FFC80A]/15 text-[#FFC80A]"
        hoverCls="hover:border-[#FFC80A]/40"
        footer="Highest spending this month"
      >
        <div className="text-2xl font-black text-white tracking-tight truncate">{kpis.top_category}</div>
      </Kpi>

      <Kpi
        label="Unusual transactions"
        icon={AlertTriangle}
        iconCls={kpis.anomaly_count > 0 ? 'bg-amber-500/20 text-amber-300' : 'bg-[#10B981]/15 text-[#10B981]'}
        hoverCls="hover:border-amber-500/40"
        footer={
          kpis.anomaly_count > 0
            ? 'Much higher than usual for their category (Z-score > 2.5)'
            : 'Nothing unusual for your spending pattern'
        }
      >
        <div className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
          <span>{kpis.anomaly_count}</span>
          {kpis.anomaly_count > 0 ? (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Review
            </span>
          ) : (
            <span className="text-[10px] font-medium text-[#10B981]">All clear</span>
          )}
        </div>
      </Kpi>
    </div>
  );
}
