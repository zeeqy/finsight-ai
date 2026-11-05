/**
 * FinSight AI - Financial profile: one place that works out income, spending, commitments,
 * DSR and monthly surplus from the user's statements and saved commitments. Every module
 * (goals, loan, advisor) reads these figures so they never disagree.
 */

const db = require('../db');

const LOOKBACK_MONTHS = 6;
// A latest month whose last transaction is before this day is treated as partly uploaded
const PARTIAL_MONTH_DAY = 20;
// Declared and statement income further apart than this get a note
const INCOME_GAP_NOTE = 0.2;

/** `debt: true` kinds count toward DSR (banks count loan and card repayments, not takaful or bills). */
const COMMITMENT_KINDS = {
  car_loan: { label: 'Car loan', debt: true },
  house_loan: { label: 'House loan', debt: true },
  personal_loan: { label: 'Personal loan', debt: true },
  ptptn: { label: 'PTPTN', debt: true },
  credit_card: { label: 'Credit card', debt: true },
  insurance: { label: 'Insurance / takaful', debt: false },
  other: { label: 'Other', debt: false },
};

// Money moved into the user's own savings or investments is not spending
const SAVINGS_PATTERN = /\b(TABUNG HAJI|LEMBAGA TABUNG|ASNB|ASB|AMANAH SAHAM|KWSP|EPF|STASHAWAY|VERSA|GOINVEST|MYTHEO|WAHED)\b/i;
// Name parts too common to identify the user on their own
const COMMON_NAME_PARTS = new Set([
  'bin', 'binti', 'bte', 'bt', 'bn', 'al', 'ap', 'muhammad', 'muhamad', 'mohammad', 'mohamad', 'mohamed', 'mohd', 'muhd',
  'nur', 'nurul', 'siti', 'ahmad', 'abdul', 'abd', 'wan', 'nik', 'syed', 'sharifah', 'tan', 'lim', 'lee', 'wong', 'ng',
]);

const round2 = (x) => Math.round(x * 100) / 100;

function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** The user's own given names (before bin/binti/a/l/a/p), minus very common ones. */
function ownNameTokens(fullName) {
  const words = String(fullName || '').toLowerCase().replace(/[^a-z\s/]/g, ' ').split(/\s+/).filter(Boolean);
  const stop = words.findIndex((w) => ['bin', 'binti', 'bte', 'bt', 'bn', 'a/l', 'a/p'].includes(w));
  const given = stop > 0 ? words.slice(0, stop) : words;
  return given.filter((w) => w.length >= 4 && !COMMON_NAME_PARTS.has(w));
}

/**
 * Whether a transaction moves money to the user's own savings rather than spending it:
 * a savings or investment provider in the description, or a personal transfer to the user's own name.
 */
function isOwnSavingsMove(txn, nameTokens) {
  if (txn.category === 'Income') return false;
  const desc = String(txn.description || '');
  if (SAVINGS_PATTERN.test(desc)) return true;
  if (txn.category !== 'Personal Transfer' || !nameTokens.length) return false;
  const lower = desc.toLowerCase();
  return nameTokens.some((t) => new RegExp(`\\b${t}`).test(lower));
}

/** Totals for a list of commitments ({ kind, monthly_amount, paid_from_statement }). */
function summariseCommitments(items) {
  let monthly = 0;
  let debt = 0;
  let outside = 0;
  for (const c of items) {
    const amt = parseFloat(c.monthly_amount) || 0;
    monthly += amt;
    if (COMMITMENT_KINDS[c.kind]?.debt) debt += amt;
    if (!c.paid_from_statement) outside += amt;
  }
  return {
    count: items.length,
    monthly_total: round2(monthly),
    debt_monthly: round2(debt),
    outside_statement_monthly: round2(outside),
  };
}

/**
 * Pure maths behind the profile, so it can be unit-tested.
 * txns: [{ date: 'YYYY-MM-DD', description, amount, category }] (amounts positive)
 */
function buildProfile({ declaredIncome = 0, fullName = '', txns = [], commitments = [] }) {
  const nameTokens = ownNameTokens(fullName);
  const months = new Map();
  for (const t of txns) {
    const ym = t.date.slice(0, 7);
    if (!months.has(ym)) months.set(ym, { ym, income: 0, spend: 0, savings: 0, savingsCount: 0, lastDay: 0 });
    const m = months.get(ym);
    const amount = parseFloat(t.amount) || 0;
    m.lastDay = Math.max(m.lastDay, parseInt(t.date.slice(8, 10), 10));
    if (t.category === 'Income') m.income += amount;
    else if (isOwnSavingsMove(t, nameTokens)) {
      m.savings += amount;
      m.savingsCount += 1;
    } else m.spend += amount;
  }

  let used = [...months.values()].sort((a, b) => (a.ym < b.ym ? 1 : -1));
  let partialMonth = null;
  if (used.length > 1 && used[0].lastDay < PARTIAL_MONTH_DAY) {
    partialMonth = used[0].ym;
    used = used.slice(1);
  }
  used = used.slice(0, LOOKBACK_MONTHS);

  const hasTxns = used.length > 0;
  const avgSpend = hasTxns ? round2(used.reduce((s, m) => s + m.spend, 0) / used.length) : null;
  const avgSavings = hasTxns ? round2(used.reduce((s, m) => s + m.savings, 0) / used.length) : 0;
  const observedIncome = hasTxns ? median(used.map((m) => m.income).filter((v) => v > 0)) : null;

  const declared = parseFloat(declaredIncome) || 0;
  let incomeUsed = 0;
  let incomeSource = 'none';
  if (declared > 0) {
    incomeUsed = declared;
    incomeSource = 'declared';
  } else if (observedIncome) {
    incomeUsed = round2(observedIncome);
    incomeSource = 'statements';
  }

  const c = summariseCommitments(commitments);
  // Commitments paid from the uploaded account are already inside the spending average
  const commitmentsDeducted = hasTxns ? c.outside_statement_monthly : c.monthly_total;
  const surplus = round2(incomeUsed - (avgSpend || 0) - commitmentsDeducted);

  const notes = [];
  if (!hasTxns) notes.push('No statements yet, so spending is not counted. Upload statements in the Spend Analyser for a realistic surplus.');
  if (incomeSource === 'none') notes.push('Monthly income is not set on your profile and no income was found in your statements.');
  if (incomeSource === 'statements') notes.push('Income is the typical monthly money in from your statements, because no income is set on your profile.');
  if (declared > 0 && observedIncome && Math.abs(observedIncome - declared) / declared > INCOME_GAP_NOTE) {
    notes.push(`Your statements show a typical RM ${round2(observedIncome).toFixed(2)} coming in each month, while your profile says RM ${declared.toFixed(2)}. The profile figure is used.`);
  }
  if (partialMonth) notes.push(`${partialMonth} looks only partly uploaded, so it is left out of the averages.`);

  return {
    income: {
      declared: declared || null,
      observed_median: observedIncome === null ? null : round2(observedIncome),
      used: incomeUsed,
      source: incomeSource,
    },
    spending: {
      avg_monthly: avgSpend,
      months: used.map((m) => m.ym).reverse(),
      partial_month_excluded: partialMonth,
      savings_moves_avg: avgSavings,
      savings_moves_count: used.reduce((s, m) => s + m.savingsCount, 0),
    },
    commitments: { ...c, deducted_from_surplus: round2(commitmentsDeducted) },
    dsr_now: incomeUsed > 0 ? round2((c.debt_monthly / incomeUsed) * 100) : null,
    monthly_surplus: surplus,
    notes,
  };
}

async function loadCommitments(userId) {
  if (db.isUsingFallback()) return [];
  const [rows] = await db.query(
    'SELECT kind, label, monthly_amount, paid_from_statement FROM commitments WHERE user_id = ?',
    [userId]
  );
  return rows.map((r) => ({ ...r, paid_from_statement: Boolean(r.paid_from_statement) }));
}

/** The full profile for one user. */
async function getFinancialProfile(userId) {
  const [[user = {}]] = await db.query('SELECT full_name, monthly_income FROM users WHERE id = ?', [userId]);
  const [recent] = await db.query(
    `SELECT DATE_FORMAT(txn_date, '%Y-%m') AS ym FROM transactions WHERE user_id = ?
     GROUP BY ym ORDER BY ym DESC LIMIT ?`,
    [userId, LOOKBACK_MONTHS + 1]
  );
  let txns = [];
  if (recent.length) {
    const from = `${recent[recent.length - 1].ym}-01`;
    [txns] = await db.query(
      `SELECT DATE_FORMAT(txn_date, '%Y-%m-%d') AS date, description, amount, category
       FROM transactions WHERE user_id = ? AND txn_date >= ?`,
      [userId, from]
    );
  }
  const commitments = await loadCommitments(userId);
  return buildProfile({ declaredIncome: user.monthly_income, fullName: user.full_name, txns, commitments });
}

module.exports = {
  COMMITMENT_KINDS,
  ownNameTokens,
  isOwnSavingsMove,
  summariseCommitments,
  buildProfile,
  getFinancialProfile,
  loadCommitments,
};
