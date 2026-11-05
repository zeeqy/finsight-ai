/**
 * FinSight AI - emergency savings kept as a running balance with a history.
 *
 * users.emergency_savings stays the one figure every module reads (health index, decision simulator,
 * protection check). Each change is also written to savings_entries, so the user can add money as
 * they save it, take some out, or set the exact total, and see what changed. Only the latest entry
 * can be undone, so every balance in the history stays true.
 */

const db = require('../db');

const MAX_BALANCE = 1e9;
const KINDS = ['add', 'withdraw', 'set'];
const round2 = (n) => Math.round(n * 100) / 100;
const todayMY = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });

/** Checks one change; throws RangeError with a message for the user. */
function validateEntry({ kind, amount, note, date } = {}) {
  if (!KINDS.includes(kind)) throw new RangeError('Choose add, take out or set the total.');
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0 || value >= MAX_BALANCE) throw new RangeError('Enter an amount in ringgit.');
  if (kind !== 'set' && value === 0) throw new RangeError('Enter an amount above RM 0.');
  const cleanNote = note === undefined || note === null ? null : String(note).trim().slice(0, 80) || null;
  const day = date ? String(date) : todayMY();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day))) throw new RangeError('Enter the date as YYYY-MM-DD.');
  if (day > todayMY()) throw new RangeError('The date cannot be in the future.');
  return { kind, amount: round2(value), note: cleanNote, date: day };
}

/** The balance after applying one change to the current balance (null = never set). */
function applyEntry(current, { kind, amount }) {
  const base = current === null || current === undefined ? 0 : Number(current);
  if (kind === 'set') return amount;
  if (kind === 'add') {
    if (base + amount >= MAX_BALANCE) throw new RangeError('That total is too large.');
    return round2(base + amount);
  }
  if (amount > base + 0.004) {
    throw new RangeError(`You only have RM ${base.toLocaleString('en-MY', { minimumFractionDigits: 2 })} recorded, so you cannot take out more than that.`);
  }
  return round2(base - amount);
}

async function getSavings(userId, limit = 12) {
  const [[user]] = await db.query('SELECT emergency_savings FROM users WHERE id = ?', [userId]);
  const [entries] = await db.query(
    `SELECT id, kind, amount, balance_before, balance_after, note, entry_date, created_at
       FROM savings_entries WHERE user_id = ? ORDER BY id DESC LIMIT ?`,
    [userId, limit]
  );
  const balance = user?.emergency_savings === null || user?.emergency_savings === undefined ? null : Number(user.emergency_savings);
  return {
    balance,
    entries: entries.map((e) => ({
      ...e,
      amount: Number(e.amount),
      balance_before: e.balance_before === null ? null : Number(e.balance_before),
      balance_after: Number(e.balance_after),
    })),
  };
}

/** Records one change and updates the balance, both or neither. */
async function recordEntry(userId, input) {
  const entry = validateEntry(input);
  await db.withTransaction(async (q) => {
    const [[user]] = await q('SELECT emergency_savings FROM users WHERE id = ? FOR UPDATE', [userId]);
    if (!user) throw new RangeError('User not found.');
    const before = user.emergency_savings === null ? null : Number(user.emergency_savings);
    const after = applyEntry(before, entry);
    await q('UPDATE users SET emergency_savings = ? WHERE id = ?', [after, userId]);
    await q(
      'INSERT INTO savings_entries (user_id, kind, amount, balance_before, balance_after, note, entry_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [userId, entry.kind, entry.amount, before, after, entry.note, entry.date]
    );
  });
  return getSavings(userId);
}

/** Undoes the latest entry: the balance goes back to what it was before it. */
async function undoLatest(userId, entryId) {
  await db.withTransaction(async (q) => {
    const [[latest]] = await q('SELECT id, balance_before FROM savings_entries WHERE user_id = ? ORDER BY id DESC LIMIT 1 FOR UPDATE', [userId]);
    if (!latest || latest.id !== Number(entryId)) throw new RangeError('Only the latest change can be undone.');
    await q('UPDATE users SET emergency_savings = ? WHERE id = ?', [latest.balance_before, userId]);
    await q('DELETE FROM savings_entries WHERE id = ? AND user_id = ?', [latest.id, userId]);
  });
  return getSavings(userId);
}

module.exports = { validateEntry, applyEntry, getSavings, recordEntry, undoLatest, todayMY };
