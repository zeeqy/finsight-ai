/**
 * FinSight AI - The financial intelligence layer's API:
 *   GET   /api/profile/finance   shared profile (income, spending, commitments, DSR, surplus)
 *   PATCH /api/profile/finance   emergency savings and household type
 *   GET   /api/profile/savings   emergency savings balance and its latest changes
 *   POST  /api/profile/savings   {kind: add|withdraw|set, amount, note?, date?} one change
 *   DELETE /api/profile/savings/:id  undo the latest change
 *   GET   /api/profile/health    Financial Health Index with the reasons behind each part
 *   POST  /api/profile/simulate  "Can I afford this?" for a loan, purchase, commitment, paused goal or income drop
 *   POST  /api/profile/zakat     zakat on savings and income
 */

const express = require('express');
const db = require('../db');
const authenticateToken = require('../middleware/auth');
const { checkLimiter } = require('../middleware/userLimiter');
const requireMysql = require('../middleware/requireMysql');
const { getFinancialProfile } = require('../services/financialProfile');
const { simulateDecision, currentHealth } = require('../services/decisionSimulator');
const { calculateZakat, ZAKAT_CONFIG } = require('../services/zakat');
const { getGoldOutlook } = require('../services/goldForecast');
const { REFERENCE_BUDGETS } = require('../data/referenceBudgets');
const savings = require('../services/emergencySavings');

const router = express.Router();
router.use(authenticateToken);
router.use(requireMysql);

function sendError(res, err, fallbackMessage) {
  if (err instanceof RangeError) return res.status(422).json({ success: false, message: err.message });
  console.error(fallbackMessage, err);
  return res.status(500).json({ success: false, message: fallbackMessage });
}

router.get('/finance', async (req, res) => {
  try {
    return res.json({ success: true, data: await getFinancialProfile(req.user.id) });
  } catch (err) {
    return sendError(res, err, 'Failed to load your financial profile.');
  }
});

router.patch('/finance', async (req, res) => {
  try {
    const sets = [];
    const values = [];
    // A number goes through the savings history (a "set the total" entry); null clears it
    let setSavings = null;
    if ('emergency_savings' in req.body) {
      const v = req.body.emergency_savings;
      const amount = v === null || v === '' ? null : parseFloat(v);
      if (amount !== null && !(amount >= 0 && amount < 1e9)) throw new RangeError('Emergency savings must be RM 0 or more.');
      if (amount === null) {
        sets.push('emergency_savings = ?');
        values.push(null);
      } else setSavings = amount;
    }
    if ('household_type' in req.body) {
      const h = req.body.household_type || null;
      if (h !== null && !REFERENCE_BUDGETS[h]) throw new RangeError('Choose one of the listed household types.');
      sets.push('household_type = ?');
      values.push(h);
    }
    if (!sets.length && setSavings === null) throw new RangeError('Nothing to update.');
    if (sets.length) await db.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...values, req.user.id]);
    if (setSavings !== null) {
      const { balance } = await savings.getSavings(req.user.id, 0);
      if (balance === null || Math.abs(balance - setSavings) >= 0.005) await savings.recordEntry(req.user.id, { kind: 'set', amount: setSavings });
    }
    return res.json({ success: true, message: 'Saved.' });
  } catch (err) {
    return sendError(res, err, 'Failed to save.');
  }
});

router.get('/savings', async (req, res) => {
  try {
    return res.json({ success: true, data: await savings.getSavings(req.user.id) });
  } catch (err) {
    return sendError(res, err, 'Failed to load your savings.');
  }
});

router.post('/savings', async (req, res) => {
  try {
    return res.status(201).json({ success: true, data: await savings.recordEntry(req.user.id, req.body || {}) });
  } catch (err) {
    return sendError(res, err, 'Failed to save this change.');
  }
});

router.delete('/savings/:id', async (req, res) => {
  try {
    return res.json({ success: true, data: await savings.undoLatest(req.user.id, req.params.id) });
  } catch (err) {
    return sendError(res, err, 'Failed to undo this change.');
  }
});

router.get('/health', async (req, res) => {
  try {
    const data = await currentHealth(req.user.id);
    return res.json({ success: true, data: { ...data, households: REFERENCE_BUDGETS } });
  } catch (err) {
    return sendError(res, err, 'Failed to work out your health index.');
  }
});

router.post('/simulate', checkLimiter, async (req, res) => {
  try {
    return res.json({ success: true, data: await simulateDecision(req.user.id, req.body || {}) });
  } catch (err) {
    return sendError(res, err, 'Failed to simulate this decision.');
  }
});

router.post('/zakat', async (req, res) => {
  try {
    const savings = Math.max(0, parseFloat(req.body.savings) || 0);
    const annualIncome = Math.max(0, parseFloat(req.body.annual_income) || 0);
    const nisabOverride = parseFloat(req.body.nisab) || null;
    const outlook = await getGoldOutlook(1);
    const gold = outlook?.last_actual
      ? { price: outlook.last_actual.price, month: outlook.last_actual.month, source: 'gold_dataset' }
      : { price: ZAKAT_CONFIG.fallbackGoldPricePerGram, month: ZAKAT_CONFIG.fallbackGoldMonth, source: 'fallback' };
    const result = calculateZakat({
      savings,
      annualIncome,
      goldPricePerGram: gold.price,
      nisabOverride,
      heldOneYear: req.body.held_one_year !== false,
    });
    return res.json({ success: true, data: { ...result, gold, nisab_grams: ZAKAT_CONFIG.nisabGoldGrams, rule_source: ZAKAT_CONFIG.source } });
  } catch (err) {
    return sendError(res, err, 'Failed to work out zakat.');
  }
});

module.exports = router;
