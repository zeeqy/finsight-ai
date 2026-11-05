/**
 * FinSight AI - Goal deposits found in statements (Module 4 + Module 1). A transfer out to Tabung
 * Haji or ASNB is offered to the active goal saved in that vehicle, so the user does not have to
 * log the same money twice. Nothing is added until the user says yes; each transaction is asked
 * about once (goal_deposit_links remembers "added" or "not for a goal").
 */

const db = require('../db');

// Statement wording per savings vehicle. Only vehicles a bank transfer clearly names.
const VEHICLE_PATTERNS = {
  tabung_haji: /\b(TABUNG HAJI|LEMBAGA TABUNG HAJI|LTH)\b/i,
  asb: /\b(ASNB|ASB|AMANAH SAHAM)\b/i,
};
const LOOKBACK_DAYS = 180;
const MAX_SUGGESTIONS = 10;

const round2 = (x) => Math.round(x * 100) / 100;
const dayOf = (v) => String(v).slice(0, 10);

/**
 * Pure matching. goals: active goals {id, title, savings_vehicle, target_date, created_on}.
 * txns: money-out transactions {id, txn_date, description, amount}. linked: Set of transaction ids
 * already answered. Returns the newest first, each with the goals it could count towards.
 */
function matchDeposits(goals, txns, linked) {
  const out = [];
  for (const t of txns) {
    if (linked.has(t.id)) continue;
    const vehicle = Object.keys(VEHICLE_PATTERNS).find((v) => VEHICLE_PATTERNS[v].test(t.description || ''));
    if (!vehicle) continue;
    // Goals in that vehicle that existed when the money was moved, due soonest first
    const options = goals
      .filter((g) => g.savings_vehicle === vehicle && dayOf(t.txn_date) >= dayOf(g.created_on))
      .sort((a, b) => dayOf(a.target_date).localeCompare(dayOf(b.target_date)))
      .map((g) => ({ id: g.id, title: g.title }));
    if (!options.length) continue;
    out.push({ transaction_id: t.id, date: dayOf(t.txn_date), description: t.description, amount: round2(Number(t.amount)), vehicle, goals: options });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || b.transaction_id - a.transaction_id).slice(0, MAX_SUGGESTIONS);
}

async function findDepositSuggestions(userId) {
  const [[goals], [txns], [links]] = await Promise.all([
    db.query(
      `SELECT id, title, savings_vehicle, DATE_FORMAT(target_date, '%Y-%m-%d') AS target_date, DATE_FORMAT(created_at, '%Y-%m-%d') AS created_on
       FROM life_goals WHERE user_id = ? AND status = 'active' AND savings_vehicle IN (?)`,
      [userId, Object.keys(VEHICLE_PATTERNS)]
    ),
    db.query(
      `SELECT id, DATE_FORMAT(txn_date, '%Y-%m-%d') AS txn_date, description, amount FROM transactions
       WHERE user_id = ? AND category <> 'Income' AND txn_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
      [userId, LOOKBACK_DAYS]
    ),
    db.query('SELECT transaction_id FROM goal_deposit_links WHERE user_id = ?', [userId]),
  ]);
  if (!goals.length) return [];
  return matchDeposits(goals, txns, new Set(links.map((l) => l.transaction_id)));
}

module.exports = { VEHICLE_PATTERNS, LOOKBACK_DAYS, matchDeposits, findDepositSuggestions };
