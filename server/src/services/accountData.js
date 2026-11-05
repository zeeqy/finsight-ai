/**
 * FinSight AI - The user's own data: download all of it, or delete the account and all of it.
 * Supports the rights in Malaysia's Personal Data Protection Act 2010 (access to and control of
 * one's personal data). One list of tables is used for both, so a new table cannot be exported
 * but forgotten on delete.
 */

const db = require('../db');

// Tables keyed by user_id, deleted in this order (children before parents). life_goals cascades to
// goal_cost_items and goal_contributions; chat_messages are reached through chat_sessions.
const USER_TABLES = [
  'transactions',
  'bank_statements',
  'budgets',
  'loan_predictions',
  'goal_deposit_links',
  'life_goals',
  'insurance_predictions',
  'insurance_quotes',
  'commitments',
  'recurring_overrides',
  'savings_entries',
  'chat_sessions',
];

/** Everything stored about the user, as one JSON-ready object. The password hash is left out. */
async function exportUserData(userId) {
  const [[user]] = await db.query(
    'SELECT id, full_name, email, monthly_income, age, income_group, emergency_savings, household_type, created_at FROM users WHERE id = ?',
    [userId]
  );
  const data = { exported_at: new Date().toISOString(), user: user || null };
  for (const table of USER_TABLES) {
    const [rows] = await db.query(`SELECT * FROM ${table} WHERE user_id = ?`, [userId]);
    data[table] = rows;
  }
  const goalIds = data.life_goals.map((g) => g.id);
  const sessionIds = data.chat_sessions.map((s) => s.id);
  data.goal_cost_items = goalIds.length ? (await db.query('SELECT * FROM goal_cost_items WHERE goal_id IN (?)', [goalIds]))[0] : [];
  data.goal_contributions = goalIds.length ? (await db.query('SELECT * FROM goal_contributions WHERE goal_id IN (?)', [goalIds]))[0] : [];
  data.chat_messages = sessionIds.length ? (await db.query('SELECT * FROM chat_messages WHERE session_id IN (?)', [sessionIds]))[0] : [];
  return data;
}

/** Deletes the account and every row that belongs to it, all or nothing. Returns rows removed per table. */
async function deleteUserData(userId) {
  return db.withTransaction(async (q) => {
    const removed = {};
    const [msg] = await q('DELETE m FROM chat_messages m JOIN chat_sessions s ON s.id = m.session_id WHERE s.user_id = ?', [userId]);
    removed.chat_messages = msg.affectedRows;
    for (const table of USER_TABLES) {
      const [r] = await q(`DELETE FROM ${table} WHERE user_id = ?`, [userId]);
      removed[table] = r.affectedRows;
    }
    const [u] = await q('DELETE FROM users WHERE id = ?', [userId]);
    removed.users = u.affectedRows;
    return removed;
  });
}

module.exports = { USER_TABLES, exportUserData, deleteUserData };
