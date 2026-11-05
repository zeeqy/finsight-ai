/**
 * FinSight AI - Monthly commitments the user enters once (loans, PTPTN, card, takaful...).
 * Read by the financial profile, so DSR, surplus and goal plans all use the same figures.
 */

const express = require('express');
const db = require('../db');
const authenticateToken = require('../middleware/auth');
const requireMysql = require('../middleware/requireMysql');
const { COMMITMENT_KINDS, summariseCommitments } = require('../services/financialProfile');
const { planPayoff } = require('../services/debtPlanner');

const router = express.Router();
router.use(authenticateToken);
router.use(requireMysql);

const num = (v, fallback = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};
const optionalNum = (v) => (v === undefined || v === null || v === '' ? null : num(v, null));

const SELECT = `SELECT id, kind, label, monthly_amount, balance, annual_rate,
    DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date, paid_from_statement
  FROM commitments`;

function shape(row) {
  return {
    ...row,
    monthly_amount: parseFloat(row.monthly_amount),
    balance: row.balance === null ? null : parseFloat(row.balance),
    paid_from_statement: Boolean(row.paid_from_statement),
  };
}

/** Validates a create/update body. Throws RangeError on bad input. */
function parseBody(body) {
  const kind = body.kind;
  if (!COMMITMENT_KINDS[kind]) throw new RangeError('Choose what kind of commitment this is.');
  const monthly = num(body.monthly_amount, NaN);
  if (!(monthly > 0)) throw new RangeError('Monthly amount must be greater than 0.');
  if (monthly > 1e7) throw new RangeError('Monthly amount is too large.');

  const balance = optionalNum(body.balance);
  if (balance !== null && balance < 0) throw new RangeError('Balance cannot be negative.');
  const rate = optionalNum(body.annual_rate);
  if (rate !== null && (rate < 0 || rate > 100)) throw new RangeError('Interest rate must be between 0 and 100%.');
  const endDate = body.end_date ? String(body.end_date) : null;
  if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) throw new RangeError('End date must be YYYY-MM-DD.');

  return {
    kind,
    label: String(body.label || '').trim().slice(0, 100) || COMMITMENT_KINDS[kind].label,
    monthly_amount: Math.round(monthly * 100) / 100,
    balance,
    annual_rate: rate,
    end_date: endDate,
    paid_from_statement: body.paid_from_statement === undefined ? true : Boolean(body.paid_from_statement),
  };
}

function sendError(res, err, fallbackMessage) {
  if (err instanceof RangeError) return res.status(422).json({ success: false, message: err.message });
  console.error(fallbackMessage, err);
  return res.status(500).json({ success: false, message: fallbackMessage });
}

// GET /api/commitments — list, totals and the kinds the form offers
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(`${SELECT} WHERE user_id = ? ORDER BY monthly_amount DESC, id`, [req.user.id]);
    const items = rows.map(shape);
    return res.json({ success: true, data: { items, totals: summariseCommitments(items), kinds: COMMITMENT_KINDS } });
  } catch (err) {
    return sendError(res, err, 'Failed to load commitments.');
  }
});

// POST /api/commitments
router.post('/', async (req, res) => {
  try {
    const c = parseBody(req.body);
    const [result] = await db.query(
      `INSERT INTO commitments (user_id, kind, label, monthly_amount, balance, annual_rate, end_date, paid_from_statement)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, c.kind, c.label, c.monthly_amount, c.balance, c.annual_rate, c.end_date, c.paid_from_statement]
    );
    return res.status(201).json({ success: true, message: 'Commitment added.', data: { id: result.insertId, ...c } });
  } catch (err) {
    return sendError(res, err, 'Failed to add commitment.');
  }
});

// POST /api/commitments/payoff-plan { extra_monthly } — avalanche vs snowball over the saved debts
router.post('/payoff-plan', async (req, res) => {
  try {
    const extra = parseFloat(req.body.extra_monthly) || 0;
    if (extra < 0 || extra > 1e7) throw new RangeError('Extra payment must be RM 0 or more.');
    const [rows] = await db.query(`${SELECT} WHERE user_id = ?`, [req.user.id]);
    const debts = rows.map(shape).filter((c) => COMMITMENT_KINDS[c.kind]?.debt);
    return res.json({ success: true, data: planPayoff(debts, extra) });
  } catch (err) {
    return sendError(res, err, 'Failed to plan debt payoff.');
  }
});

// PUT /api/commitments/:id
router.put('/:id', async (req, res) => {
  try {
    const c = parseBody(req.body);
    const id = parseInt(req.params.id, 10);
    const [result] = await db.query(
      `UPDATE commitments SET kind = ?, label = ?, monthly_amount = ?, balance = ?, annual_rate = ?, end_date = ?,
         paid_from_statement = ? WHERE id = ? AND user_id = ?`,
      [c.kind, c.label, c.monthly_amount, c.balance, c.annual_rate, c.end_date, c.paid_from_statement, id, req.user.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Commitment not found.' });
    return res.json({ success: true, message: 'Commitment updated.', data: { id, ...c } });
  } catch (err) {
    return sendError(res, err, 'Failed to update commitment.');
  }
});

// DELETE /api/commitments/:id
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM commitments WHERE id = ? AND user_id = ?', [parseInt(req.params.id, 10), req.user.id]);
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Commitment not found.' });
    return res.json({ success: true, message: 'Commitment removed.' });
  } catch (err) {
    return sendError(res, err, 'Failed to remove commitment.');
  }
});

module.exports = router;
