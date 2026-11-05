/**
 * FinSight AI - Recurring payments and next month's spending forecast for one user (Module 1),
 * shared by GET /api/transactions/insights and the AI advisor's context.
 */

const db = require('../db');
const { detectRecurring } = require('./recurring');
const { forecastNext, ses } = require('./spendForecast');
const { ownNameTokens, isOwnSavingsMove } = require('./financialProfile');

const FORECAST_HISTORY = 12; // months of history the forecast looks at
const PARTIAL_MONTH_DAY = 20; // same rule as the financial profile

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The latest run of back-to-back months, dropping a partly uploaded last month. */
function recentMonthRun(byMonth) {
  const months = [...byMonth.keys()].sort();
  if (months.length > 1 && byMonth.get(months.at(-1)).lastDay < PARTIAL_MONTH_DAY) months.pop();
  const run = [];
  for (let i = months.length - 1; i >= 0 && run.length < FORECAST_HISTORY; i -= 1) {
    if (run.length) {
      const [y, m] = run[0].split('-').map(Number);
      const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
      if (months[i] !== prev) break;
    }
    run.unshift(months[i]);
  }
  return run;
}

const nextMonth = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};

async function getSpendingInsights(userId) {
  const [rows] = await db.query('SELECT id, txn_date, description, amount, category, is_anomaly FROM transactions WHERE user_id = ?', [userId]);
  const [userRows] = await db.query('SELECT full_name FROM users WHERE id = ?', [userId]);
  const nameTokens = ownNameTokens(userRows?.[0]?.full_name);
  const txns = rows.map((r) => ({
    id: r.id,
    date: r.txn_date instanceof Date ? localDateStr(r.txn_date) : String(r.txn_date).slice(0, 10),
    description: r.description,
    amount: parseFloat(r.amount) || 0,
    category: r.category,
    unusual: Boolean(r.is_anomaly),
  }));

  let overrides = new Map();
  if (!db.isUsingFallback()) {
    const [o] = await db.query('SELECT merchant_key, status FROM recurring_overrides WHERE user_id = ?', [userId]);
    overrides = new Map(o.map((x) => [x.merchant_key, x.status]));
  }
  const byId = new Map(txns.map((t) => [t.id, t]));
  const found = detectRecurring(txns).map(({ txn_ids, ...r }) => ({
    ...r,
    // A regular transfer into Tabung Haji, ASB or the user's own account is saving, not a bill
    is_saving: txn_ids.some((id) => isOwnSavingsMove(byId.get(id), nameTokens)),
    status: overrides.get(r.key) || 'detected',
    txn_ids,
  }));
  const kept = found.filter((r) => r.status !== 'dismissed' && !r.is_saving);

  // Usual spending per month: no income, no money moved to the user's own savings, and no
  // purchases flagged as unusual (leaving one-offs out was the most accurate option on the
  // Berka backtest, evaluation/results/behaviour_results.md)
  const byMonth = new Map();
  for (const t of txns) {
    const ym = t.date.slice(0, 7);
    if (!byMonth.has(ym)) byMonth.set(ym, { total: 0, recurring: 0, unusual: 0, lastDay: 0, byCat: {} });
    const m = byMonth.get(ym);
    m.lastDay = Math.max(m.lastDay, parseInt(t.date.slice(8, 10), 10));
    if (t.category === 'Income' || isOwnSavingsMove(t, nameTokens)) continue;
    if (t.unusual) {
      m.unusual += t.amount;
      continue;
    }
    m.total += t.amount;
    m.byCat[t.category] = (m.byCat[t.category] || 0) + t.amount;
  }
  const recurringIds = new Set(kept.flatMap((r) => r.txn_ids));
  for (const t of txns) if (recurringIds.has(t.id)) byMonth.get(t.date.slice(0, 7)).recurring += t.amount;

  const run = recentMonthRun(byMonth);
  let forecast = null;
  let forecastNote = null;
  if (run.length < 3) {
    forecastNote = 'A forecast needs at least 3 full months in a row. Upload more statements to see next month.';
  } else {
    const series = run.map((m) => byMonth.get(m).total);
    const recurringSeries = run.map((m) => byMonth.get(m).recurring);
    const recurringNext = kept.filter((r) => r.active).reduce((s, r) => s + r.monthly_amount, 0);
    const actualSeries = run.map((m) => byMonth.get(m).total + byMonth.get(m).unusual);
    const f = forecastNext(series, { method: 'split', recurringSeries, recurringNext, actualSeries });
    const cats = new Set(run.flatMap((m) => Object.keys(byMonth.get(m).byCat)));
    const categories = [...cats]
      .map((c) => ({ category: c, point: Math.round(ses(run.map((m) => byMonth.get(m).byCat[c] || 0)) * 100) / 100 }))
      .filter((c) => c.point > 0)
      .sort((a, b) => b.point - a.point)
      .slice(0, 5);
    forecast = {
      month: nextMonth(run.at(-1)),
      ...f,
      recurring_part: Math.round(Math.min(recurringNext, f.point) * 100) / 100,
      history: run.map((m) => ({
        month: m,
        total: Math.round(byMonth.get(m).total * 100) / 100,
        unusual: Math.round(byMonth.get(m).unusual * 100) / 100,
      })),
      categories,
    };
  }

  return {
    recurring: found.filter((r) => r.status !== 'dismissed').map(({ txn_ids, ...r }) => r),
    dismissed: found.filter((r) => r.status === 'dismissed').map(({ txn_ids, ...r }) => r),
    // Payments only: regular savings are listed but not counted as spending
    recurring_monthly_total: Math.round(kept.filter((r) => r.active).reduce((s, r) => s + r.monthly_amount, 0) * 100) / 100,
    forecast,
    forecast_note: forecastNote,
  };
}

module.exports = { getSpendingInsights };
