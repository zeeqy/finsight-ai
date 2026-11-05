/**
 * FinSight AI - user income / spending helpers shared by Modules 2-4.
 * The maths lives in services/financialProfile.js; this keeps the older call shape.
 */
const db = require('../db');
const { getFinancialProfile } = require('./financialProfile');

async function getUserProfile(userId) {
  const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
  const u = rows[0] || {};
  return {
    monthly_income: parseFloat(u.monthly_income) || 0,
    age: u.age || null,
    income_group: u.income_group || null,
  };
}

/**
 * Monthly surplus = income - average monthly spending (up to 6 recent months, money moved to the
 * user's own savings left out) - commitments not already paid from the uploaded account.
 */
async function getMonthlySurplus(userId) {
  const p = await getFinancialProfile(userId);
  return {
    monthly_income: p.income.used,
    income_source: p.income.source,
    avg_monthly_spending: p.spending.avg_monthly,
    months_used: p.spending.months.length,
    commitments_monthly: p.commitments.monthly_total,
    commitments_deducted: p.commitments.deducted_from_surplus,
    debt_monthly: p.commitments.debt_monthly,
    savings_moves_avg: p.spending.savings_moves_avg,
    monthly_surplus: p.monthly_surplus,
    warning: p.notes.length ? p.notes.join(' ') : null,
    notes: p.notes,
  };
}

module.exports = { getUserProfile, getMonthlySurplus };
