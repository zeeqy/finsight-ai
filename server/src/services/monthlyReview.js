/**
 * FinSight AI - Monthly review (Module 1). After an upload, "this month against last month":
 * spending, money in, the categories that moved most, and unusual payments. Totals follow the
 * summary endpoint: spending is every category except Income. Sentences are built from the numbers.
 */

const db = require('../db');

const round2 = (x) => Math.round(x * 100) / 100;
const rm = (x) => `RM ${Math.abs(x).toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MIN_MOVE = 20; // ringgit: smaller category changes are noise, not news
const TOP_MOVERS = 3;

function change(now, before) {
  return { now: round2(now), before: round2(before), change: round2(now - before), pct: before > 0 ? round2(((now - before) / before) * 100) : null };
}

/**
 * Pure comparison. now/before: [{category, total}] for each month (Income included as its own row).
 * anomaliesNow: number of unusual payments flagged this month.
 */
function compareMonths({ year, month, now, before, anomaliesNow = 0 }) {
  const total = (rows, pick) => rows.filter(pick).reduce((s, r) => s + Number(r.total), 0);
  const isSpend = (r) => r.category !== 'Income';
  const spend = change(total(now, isSpend), total(before, isSpend));
  const inflow = change(total(now, (r) => r.category === 'Income'), total(before, (r) => r.category === 'Income'));

  const cats = new Set([...now, ...before].filter(isSpend).map((r) => r.category));
  const of = (rows, c) => Number(rows.find((r) => r.category === c)?.total || 0);
  const movers = [...cats]
    .map((c) => ({ category: c, ...change(of(now, c), of(before, c)) }))
    .filter((m) => Math.abs(m.change) >= MIN_MOVE)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, TOP_MOVERS);

  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const hasBefore = before.length > 0;
  const points = [];
  if (hasBefore) {
    points.push({
      tone: spend.change > 0 ? 'warn' : 'ok',
      text:
        Math.abs(spend.change) < 1
          ? `You spent about the same as in ${MONTHS[prev.month - 1]} (${rm(spend.now)}).`
          : `You spent ${rm(spend.change)} ${spend.change > 0 ? 'more' : 'less'} than in ${MONTHS[prev.month - 1]}: ${rm(spend.now)} against ${rm(spend.before)}.`,
    });
    for (const m of movers) {
      points.push({
        tone: m.change > 0 ? 'warn' : 'ok',
        text: m.before === 0 ? `${m.category}: ${rm(m.now)}, new this month.` : `${m.category} ${m.change > 0 ? 'up' : 'down'} ${rm(m.change)} (${rm(m.before)} to ${rm(m.now)}).`,
      });
    }
    if (Math.abs(inflow.change) >= 1) {
      points.push({ tone: inflow.change >= 0 ? 'ok' : 'info', text: `Money in ${inflow.change > 0 ? 'rose' : 'fell'} by ${rm(inflow.change)} to ${rm(inflow.now)}.` });
    }
  }
  if (anomaliesNow > 0) {
    const one = anomaliesNow === 1;
    points.push({
      tone: 'warn',
      text: `${anomaliesNow} payment${one ? ' looks' : 's look'} unusually large for ${one ? 'its' : 'their'} category. ${one ? 'It is' : 'They are'} marked in the ledger.`,
    });
  }
  return {
    year,
    month,
    previous: hasBefore ? prev : null,
    spend,
    inflow,
    movers,
    anomalies: anomaliesNow,
    points,
  };
}

async function monthlyReview(userId, year, month) {
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const byCategory = `SELECT category, SUM(amount) AS total FROM transactions
    WHERE user_id = ? AND YEAR(txn_date) = ? AND MONTH(txn_date) = ? GROUP BY category`;
  const [[now], [before], [[{ n }]]] = await Promise.all([
    db.query(byCategory, [userId, year, month]),
    db.query(byCategory, [userId, prev.year, prev.month]),
    db.query('SELECT COUNT(*) AS n FROM transactions WHERE user_id = ? AND YEAR(txn_date) = ? AND MONTH(txn_date) = ? AND is_anomaly = 1', [userId, year, month]),
  ]);
  return compareMonths({ year, month, now, before, anomaliesNow: Number(n) });
}

module.exports = { compareMonths, monthlyReview };
