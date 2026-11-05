import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Info, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import PeriodBar from '../components/dashboard/PeriodBar';
import KpiCards from '../components/dashboard/KpiCards';
import CategoryBreakdown from '../components/dashboard/CategoryBreakdown';
import SpendingTrend from '../components/dashboard/SpendingTrend';
import BudgetTracker from '../components/dashboard/BudgetTracker';
import TransactionLedger from '../components/dashboard/TransactionLedger';
import { UploadModal, ClearRecordsModal, BudgetModal } from '../components/dashboard/DashboardModals';
import { DEFAULT_CATEGORIES, monthName, monthlyTotals } from '../components/dashboard/dashboardUtils';

/** Module 1: Spend Analyser. Data loading and actions live here; the UI is in components/dashboard. */
export default function DashboardPage() {
  const { user, authFetch } = useAuth();

  const now = new Date();
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [isAllTime, setIsAllTime] = useState(false);
  const [periods, setPeriods] = useState([]);
  const [periodsLoaded, setPeriodsLoaded] = useState(false);

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [allTransactions, setAllTransactions] = useState([]);
  const [monthTransactions, setMonthTransactions] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [usedCategories, setUsedCategories] = useState([]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  const [modal, setModal] = useState(null); // 'upload' | 'clear' | { budget: category|null }

  // In "all time" view the charts and budgets show the latest month with data
  const statsPeriod = isAllTime && periods[0] ? { year: periods[0].year, month: periods[0].month } : period;

  const loadPeriods = useCallback(async () => {
    try {
      const res = await authFetch('/api/transactions/periods');
      const data = await res.json();
      const list = data.success ? data.periods || [] : [];
      setPeriods(list);
      return list;
    } catch (err) {
      console.error('Failed to load periods:', err);
      return [];
    }
  }, [authFetch]);

  // First load: open the latest month that has data instead of an empty current month
  useEffect(() => {
    (async () => {
      const list = await loadPeriods();
      if (list.length) setPeriod({ year: list[0].year, month: list[0].month });
      setPeriodsLoaded(true);
    })();
  }, [loadPeriods]);

  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const q = `year=${statsPeriod.year}&month=${statsPeriod.month}`;
      const requests = [
        authFetch(`/api/transactions/summary?${q}`),
        authFetch('/api/transactions/list?year=ALL'),
        authFetch(`/api/budgets?${q}`),
      ];
      if (!isAllTime) requests.push(authFetch(`/api/transactions/list?${q}`));
      const [summaryJson, allJson, budgetsJson, monthJson] = await Promise.all(
        (await Promise.all(requests)).map((r) => r.json())
      );

      if (summaryJson.success) setSummary(summaryJson);
      if (allJson.success) setAllTransactions(allJson.transactions || []);
      if (budgetsJson.success) {
        setBudgets(budgetsJson.budgets || []);
        if (budgetsJson.usedCategories) setUsedCategories(budgetsJson.usedCategories);
      }
      setMonthTransactions(monthJson?.success ? monthJson.transactions || [] : []);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, [authFetch, isAllTime, statsPeriod.year, statsPeriod.month]);

  useEffect(() => {
    if (periodsLoaded) loadDashboardData();
  }, [periodsLoaded, loadDashboardData]);

  const refreshAll = async () => {
    await loadPeriods();
    await loadDashboardData();
  };

  /** Runs a change, then reloads; shows the error above the ledger if it fails. */
  const runAction = async (fn) => {
    setBusy(true);
    setActionError('');
    try {
      await fn();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const callApi = async (url, options = {}) => {
    const res = await authFetch(url, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) throw new Error(data.message || 'Request failed.');
    return data;
  };
  const jsonBody = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  const shiftMonth = (delta) => {
    setIsAllTime(false);
    setPeriod((p) => {
      const idx = p.year * 12 + (p.month - 1) + delta;
      return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
    });
  };

  const selectPeriod = (value) => {
    if (value === 'ALL') {
      setIsAllTime(true);
      return;
    }
    const [y, m] = value.split('-').map(Number);
    setIsAllTime(false);
    setPeriod({ year: y, month: m });
  };

  const handleUpload = async (file) => {
    const formData = new FormData();
    formData.append('statement', file);
    const data = await callApi('/api/transactions/upload', { method: 'POST', body: formData });
    const list = await loadPeriods();
    if (list.length) {
      setIsAllTime(false);
      setPeriod({ year: list[0].year, month: list[0].month });
    }
    await loadDashboardData();
    const engine =
      data.categoriser?.engine === 'ml_model'
        ? 'categorised by the ML model (Logistic Regression) and keyword rules'
        : 'categorised by keyword rules (ML service offline)';
    if (data.insertedCount === 0) return data.message;
    const skipped = data.duplicatesSkipped ? ` ${data.duplicatesSkipped} already imported were skipped.` : '';
    return `Added ${data.insertedCount} transactions from ${file.name}, ${engine}.${skipped}`;
  };

  const handleClear = async (scope) => {
    if (scope === 'month') {
      await callApi(`/api/transactions/period?year=${period.year}&month=${period.month}`, { method: 'DELETE' });
    } else {
      await callApi('/api/transactions/all', { method: 'DELETE' });
      setIsAllTime(false);
    }
    await refreshAll();
  };

  const handleDeleteMany = (ids) => {
    if (!window.confirm(`Delete ${ids.length} selected transaction${ids.length === 1 ? '' : 's'}?`)) return;
    runAction(async () => {
      await callApi('/api/transactions/bulk-delete', jsonBody('POST', { ids }));
      await refreshAll();
    });
  };

  const handleDeleteOne = (id) => {
    if (!window.confirm('Delete this transaction?')) return;
    runAction(async () => {
      await callApi(`/api/transactions/${id}`, { method: 'DELETE' });
      await refreshAll();
    });
  };

  const handleUpdateCategory = (id, category) =>
    runAction(async () => {
      await callApi(`/api/transactions/${id}/category`, jsonBody('PATCH', { category }));
      await loadDashboardData();
    });

  const handleSaveBudget = async (category, limit) => {
    await callApi('/api/budgets', jsonBody('POST', { category, budget_limit: limit, month: statsPeriod.month, year: statsPeriod.year }));
    await loadDashboardData();
  };

  const handleDeleteBudget = (id) => {
    if (!window.confirm('Remove this budget?')) return;
    runAction(async () => {
      await callApi(`/api/budgets/${id}`, { method: 'DELETE' });
      await loadDashboardData();
    });
  };

  const ledgerTransactions = isAllTime ? allTransactions : monthTransactions;
  const trend = useMemo(() => monthlyTotals(allTransactions, 6), [allTransactions]);
  const categoryOptions = useMemo(
    () =>
      Array.from(new Set([...DEFAULT_CATEGORIES, ...usedCategories, ...budgets.map((b) => b.category)])).filter(
        (c) => c && c !== 'Income'
      ),
    [usedCategories, budgets]
  );

  const kpis = summary?.kpis || {
    total_monthly_spend: 0,
    monthly_income: user?.monthly_income || 0,
    net_savings: user?.monthly_income || 0,
    savings_rate: 0,
    anomaly_count: 0,
    top_category: 'None',
  };
  const breakdown = summary?.breakdown || [];
  const incomeSource = Number(user?.monthly_income) > 0 ? 'from your profile' : 'from statements';
  const statsLabel = `${monthName(statsPeriod.month)} ${statsPeriod.year}`;

  if (!periodsLoaded) {
    return (
      <div className="p-8 flex items-center justify-center text-[#94A3B8] text-sm gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-[#FFC80A]" /> Loading your statements...
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      <PeriodBar
        period={period}
        isAllTime={isAllTime}
        periods={periods}
        allTimeCount={allTransactions.length}
        recordCount={ledgerTransactions.length}
        onPrev={() => shiftMonth(-1)}
        onNext={() => shiftMonth(1)}
        onSelect={selectPeriod}
        onClear={() => setModal('clear')}
        onUpload={() => setModal('upload')}
      />

      {isAllTime && periods.length > 0 && (
        <p className="text-xs text-[#94A3B8] flex items-center gap-1.5 -mt-2">
          <Info className="w-3.5 h-3.5 text-[#FFC80A]" />
          The ledger shows every month. The cards, charts and budgets show the latest month, {statsLabel}.
        </p>
      )}

      <div className={`space-y-6 transition-opacity ${loading ? 'opacity-60' : ''}`}>
        <KpiCards kpis={kpis} incomeSource={incomeSource} />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7">
            <CategoryBreakdown breakdown={breakdown} totalSpend={kpis.total_monthly_spend} onUpload={() => setModal('upload')} />
          </div>
          <div className="lg:col-span-5">
            <BudgetTracker
              budgets={budgets}
              breakdown={breakdown}
              income={kpis.monthly_income}
              showRule={breakdown.length > 0}
              onAdd={() => setModal({ budget: null })}
              onSetFor={(category) => setModal({ budget: category })}
              onDelete={handleDeleteBudget}
            />
          </div>
        </div>

        <SpendingTrend
          months={trend}
          selected={statsPeriod}
          isAllTime={isAllTime}
          onSelectMonth={(year, month) => {
            setIsAllTime(false);
            setPeriod({ year, month });
          }}
        />

        {actionError && (
          <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">{actionError}</p>
        )}

        <TransactionLedger
          transactions={ledgerTransactions}
          categoryOptions={categoryOptions}
          busy={busy}
          onUpdateCategory={handleUpdateCategory}
          onDeleteOne={handleDeleteOne}
          onDeleteMany={handleDeleteMany}
        />
      </div>

      {modal === 'upload' && <UploadModal onClose={() => setModal(null)} onUpload={handleUpload} />}
      {modal === 'clear' && (
        <ClearRecordsModal
          period={period}
          isAllTime={isAllTime}
          monthCount={monthTransactions.length}
          totalCount={allTransactions.length}
          onClose={() => setModal(null)}
          onConfirm={handleClear}
        />
      )}
      {modal?.budget !== undefined && (
        <BudgetModal
          period={statsPeriod}
          categoryOptions={categoryOptions}
          initialCategory={modal.budget}
          onClose={() => setModal(null)}
          onSave={handleSaveBudget}
        />
      )}
    </div>
  );
}
