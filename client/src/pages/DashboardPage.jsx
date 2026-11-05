import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Download, Plus, UploadCloud } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import PeriodBar from '../components/dashboard/PeriodBar';
import KpiCards from '../components/dashboard/KpiCards';
import MonthlyReview from '../components/dashboard/MonthlyReview';
import CategoryBreakdown from '../components/dashboard/CategoryBreakdown';
import SpendingTrend from '../components/dashboard/SpendingTrend';
import BudgetTracker, { FiftyThirtyTwenty } from '../components/dashboard/BudgetTracker';
import TransactionLedger from '../components/dashboard/TransactionLedger';
import GettingStarted from '../components/dashboard/GettingStarted';
import { UploadModal, ClearRecordsModal, BudgetModal, ManualTransactionModal } from '../components/dashboard/DashboardModals';
import { ForecastCard, RecurringCard } from '../components/dashboard/SpendingInsights';
import PageHeader from '../components/ui/PageHeader';
import { Loading, Notice } from '../components/ui/Controls';
import { useConfirm } from '../components/ui/Modal';
import { DEFAULT_CATEGORIES, downloadSampleCsv, monthName, monthlyTotals } from '../components/dashboard/dashboardUtils';

/** Module 1: Spend Analyser. Data loading and actions live here; the UI is in components/dashboard. */
export default function DashboardPage() {
  const { user, authFetch } = useAuth();
  const confirm = useConfirm();

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
  const [insights, setInsights] = useState(null);
  const [recurringBusy, setRecurringBusy] = useState(null);

  const [modal, setModal] = useState(null); // 'upload' | 'clear' | 'manual' | { budget: category|null }

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
      requests.push(authFetch('/api/transactions/insights'));
      if (!isAllTime) requests.push(authFetch(`/api/transactions/list?${q}`));
      const [summaryJson, allJson, budgetsJson, insightsJson, monthJson] = await Promise.all(
        (await Promise.all(requests)).map((r) => r.json())
      );
      setInsights(insightsJson?.success ? insightsJson.data : null);

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
    if (!res.ok || data.success === false) {
      const err = new Error(data.message || 'Request failed.');
      err.code = data.code;
      throw err;
    }
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

  const statementForm = (file, password, preview) => {
    const formData = new FormData();
    formData.append('statement', file);
    if (password) formData.append('password', password);
    if (preview) formData.append('preview', 'true');
    return formData;
  };

  // PDF only: read and check the statement without saving anything
  const handlePreview = (file, password) =>
    callApi('/api/transactions/upload', { method: 'POST', body: statementForm(file, password, true) });

  const handleUpload = async (file, password) => {
    const data = await callApi('/api/transactions/upload', { method: 'POST', body: statementForm(file, password, false) });
    const list = await loadPeriods();
    // Open the month this statement covers, not simply the latest month with data
    const focus = list.find((p) => p.year === data.focusMonth?.year && p.month === data.focusMonth?.month) || list[0];
    if (focus) {
      setIsAllTime(false);
      setPeriod({ year: focus.year, month: focus.month });
    }
    await loadDashboardData();
    const engine =
      data.categoriser?.engine === 'ml_model'
        ? 'categorised by the ML model (Logistic Regression) and keyword rules'
        : 'categorised by keyword rules (ML service offline)';
    if (data.insertedCount === 0) return data.message;
    const fromOther = data.matchedOtherFile ? `, ${data.matchedOtherFile} of them from another file of the same account` : '';
    const skipped = data.duplicatesSkipped ? ` ${data.duplicatesSkipped} already imported were skipped${fromOther}.` : '';
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

  const handleDeleteMany = async (ids) => {
    const plural = ids.length === 1 ? '' : 's';
    if (!(await confirm({ title: `Delete ${ids.length} selected transaction${plural}?`, body: 'This cannot be undone.' }))) return;
    runAction(async () => {
      await callApi('/api/transactions/bulk-delete', jsonBody('POST', { ids }));
      await refreshAll();
    });
  };

  const handleDeleteOne = async (id) => {
    if (!(await confirm({ title: 'Delete this transaction?', body: 'This cannot be undone.' }))) return;
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

  const handleManual = async (form) => {
    const data = await callApi('/api/transactions/manual', jsonBody('POST', form));
    const list = await loadPeriods();
    const [y, m] = form.date.split('-').map(Number);
    if (list.some((p) => p.year === y && p.month === m)) {
      setIsAllTime(false);
      setPeriod({ year: y, month: m });
    }
    await loadDashboardData();
    return data.message;
  };

  const handleRecurringStatus = async (key, status) => {
    setRecurringBusy(key);
    setActionError('');
    try {
      await callApi('/api/transactions/recurring/status', jsonBody('POST', { key, status }));
      const res = await authFetch('/api/transactions/insights');
      const json = await res.json();
      if (json.success) setInsights(json.data);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setRecurringBusy(null);
    }
  };

  const handleSaveBudget = async (category, limit) => {
    await callApi('/api/budgets', jsonBody('POST', { category, budget_limit: limit, month: statsPeriod.month, year: statsPeriod.year }));
    await loadDashboardData();
  };

  const handleDeleteBudget = async (id) => {
    if (!(await confirm({ title: 'Remove this budget?', action: 'Remove' }))) return;
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

  if (!periodsLoaded) return <Loading>Loading your statements...</Loading>;

  const isNewUser = periods.length === 0;
  const spentShare = kpis.monthly_income > 0 ? kpis.total_monthly_spend / kpis.monthly_income : 0.3;
  const showTrend = trend.length >= 2;
  const showRule = breakdown.length > 0 && kpis.monthly_income > 0;

  return (
    <div className={`transition-opacity duration-300 ${loading ? 'opacity-70' : ''}`}>
      <PageHeader module="dashboard" energy={Math.min(1, spentShare)}>
        {!isNewUser && (
          <button type="button" onClick={downloadSampleCsv} className="btn btn-quiet">
            <Download className="w-4 h-4" aria-hidden="true" />
            Sample CSV
          </button>
        )}
        <button type="button" onClick={() => setModal('manual')} className="btn btn-soft">
          <Plus className="w-4 h-4" aria-hidden="true" />
          Add transaction
        </button>
        <button type="button" onClick={() => setModal('upload')} className="btn btn-primary">
          <UploadCloud className="w-4 h-4" aria-hidden="true" />
          Upload statement
        </button>
      </PageHeader>

      {isNewUser ? (
        <div className="page">
          <GettingStarted onUpload={() => setModal('upload')} onAddBudget={() => setModal({ budget: null })} />
        </div>
      ) : (
        <div className="page space-y-4">
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
          />

          <Notice show={isAllTime}>The ledger shows every month. The figures, charts and budgets show the latest month, {statsLabel}.</Notice>

          <KpiCards kpis={kpis} incomeSource={incomeSource} label={statsLabel} />

          <MonthlyReview year={statsPeriod.year} month={statsPeriod.month} refreshKey={`${kpis.total_monthly_spend}|${allTransactions.length}`} />

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <div className="xl:col-span-7 min-w-0">
              <CategoryBreakdown breakdown={breakdown} totalSpend={kpis.total_monthly_spend} onUpload={() => setModal('upload')} />
            </div>
            <div className="xl:col-span-5 min-w-0">
              <BudgetTracker
                budgets={budgets}
                breakdown={breakdown}
                income={kpis.monthly_income}
                incomeSource={incomeSource}
                onAdd={() => setModal({ budget: null })}
                onSetFor={(category) => setModal({ budget: category })}
                onDelete={handleDeleteBudget}
              />
            </div>
          </div>

          {(showTrend || showRule) && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
              {showTrend && (
                <div className={`min-w-0 ${showRule ? 'xl:col-span-7' : 'xl:col-span-12'}`}>
                  <SpendingTrend
                    months={trend}
                    selected={statsPeriod}
                    isAllTime={isAllTime}
                    onSelectMonth={(year, month) => {
                      setIsAllTime(false);
                      setPeriod({ year, month });
                    }}
                  />
                </div>
              )}
              {showRule && (
                <div className={`min-w-0 ${showTrend ? 'xl:col-span-5' : 'xl:col-span-12'}`}>
                  <FiftyThirtyTwenty breakdown={breakdown} income={kpis.monthly_income} />
                </div>
              )}
            </div>
          )}

          {insights && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
              <div className="xl:col-span-5 min-w-0">
                <ForecastCard forecast={insights.forecast} note={insights.forecast_note} />
              </div>
              <div className="xl:col-span-7 min-w-0">
                <RecurringCard
                  items={insights.recurring}
                  dismissed={insights.dismissed}
                  total={insights.recurring_monthly_total}
                  onStatus={handleRecurringStatus}
                  busyKey={recurringBusy}
                />
              </div>
            </div>
          )}

          <Notice tone="danger" show={Boolean(actionError)}>
            {actionError}
          </Notice>

          <TransactionLedger
            transactions={ledgerTransactions}
            categoryOptions={categoryOptions}
            busy={busy}
            onUpdateCategory={handleUpdateCategory}
            onDeleteOne={handleDeleteOne}
            onDeleteMany={handleDeleteMany}
          />
        </div>
      )}

      {modal === 'upload' && <UploadModal onClose={() => setModal(null)} onUpload={handleUpload} onPreview={handlePreview} />}
      {modal === 'manual' && <ManualTransactionModal categoryOptions={categoryOptions} onClose={() => setModal(null)} onSave={handleManual} />}
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
          budgets={budgets}
          income={kpis.monthly_income}
          onClose={() => setModal(null)}
          onSave={handleSaveBudget}
        />
      )}
    </div>
  );
}
