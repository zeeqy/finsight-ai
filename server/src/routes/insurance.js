/**
 * FinSight AI - Module 5: Insurance Risk Predictor
 * Lifestyle inputs -> risk score + per-factor explanation (Logistic Regression + SHAP).
 */

const express = require('express');
const db = require('../db');
const authenticateToken = require('../middleware/auth');
const { checkLimiter } = require('../middleware/userLimiter');
const requireMysql = require('../middleware/requireMysql');
const { mlPost, checkMlHealth } = require('../services/mlClient');
const { INSURANCE_CONFIG, calculateBmi, bmiCategory, buildTips } = require('../services/insuranceRisk');
const { getUserProfile } = require('../services/userFinance');
const { currentHealth } = require('../services/decisionSimulator');
const { DEFAULT_SUPPORT_YEARS, protectionCheck } = require('../services/protection');
const { QUOTE_CONFIG, parseQuote, compareQuotes } = require('../services/quoteCompare');

const router = express.Router();
router.use(authenticateToken);

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
};

function parseBody(body) {
  const { min, max } = INSURANCE_CONFIG.ageRange;
  const age = Math.round(num(body.age));
  if (!(age >= min && age <= max)) {
    throw new RangeError(`Age must be between ${min} and ${max} (the range the model was trained on).`);
  }

  const heightCm = num(body.height_cm);
  const weightKg = num(body.weight_kg);
  if (!(heightCm >= 120 && heightCm <= 230)) throw new RangeError('Height must be between 120 and 230 cm.');
  if (!(weightKg >= 30 && weightKg <= 250)) throw new RangeError('Weight must be between 30 and 250 kg.');

  const children = Math.round(num(body.children ?? 0));
  if (!(children >= 0 && children <= 10)) throw new RangeError('Number of children must be between 0 and 10.');

  return {
    age,
    heightCm,
    weightKg,
    bmi: calculateBmi(heightCm, weightKg),
    smoker: body.smoker === true || body.smoker === 'true',
    children,
  };
}

function sendError(res, err, fallbackMessage) {
  if (err instanceof RangeError) {
    return res.status(422).json({ success: false, message: err.message });
  }
  if (err.name === 'MlServiceError') {
    return res.status(503).json({
      success: false,
      message: 'The insurance risk model is unavailable right now (ML service offline). Please try again later.',
    });
  }
  console.error(fallbackMessage, err);
  return res.status(500).json({ success: false, message: fallbackMessage });
}

// GET /api/insurance/config — form limits, profile prefill, model status
router.get('/config', async (req, res) => {
  try {
    const [profile, health] = await Promise.all([getUserProfile(req.user.id), checkMlHealth()]);
    return res.json({
      success: true,
      data: {
        ageRange: INSURANCE_CONFIG.ageRange,
        bmiBands: INSURANCE_CONFIG.bmiBands.map((b) => ({ ...b, max: Number.isFinite(b.max) ? b.max : null })),
        bmiSource: INSURANCE_CONFIG.bmiSource,
        profile: { age: profile.age },
        modelAvailable: Boolean(health.online && health.models_loaded?.insurance),
      },
    });
  } catch (err) {
    return sendError(res, err, 'Failed to load insurance settings.');
  }
});

// POST /api/insurance/predict — ML score + SHAP + tips, saved to insurance_predictions
router.post('/predict', requireMysql, checkLimiter, async (req, res) => {
  try {
    const input = parseBody(req.body);
    const prediction = await mlPost('/predict/insurance', {
      age: input.age,
      bmi: input.bmi,
      smoker: input.smoker,
      children: input.children,
    });

    const [result] = await db.query(
      `INSERT INTO insurance_predictions
        (user_id, age, height_cm, weight_kg, bmi, smoker, children, risk_score, risk_tier, shap_values)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id, input.age, input.heightCm, input.weightKg, input.bmi, input.smoker, input.children,
        prediction.risk_score, prediction.risk_tier,
        JSON.stringify({ base_value: prediction.base_value, contributions: prediction.contributions }),
      ]
    );

    return res.json({
      success: true,
      data: {
        id: result.insertId,
        input: { ...input, bmiCategory: bmiCategory(input.bmi) },
        ...prediction,
        tips: buildTips({ ...input, prediction }),
      },
    });
  } catch (err) {
    return sendError(res, err, 'Failed to run insurance risk assessment.');
  }
});

// POST /api/insurance/protection { dependants, existing_cover, support_years }
// Emergency cover and a needs-based protection gap from the user's own figures
router.post('/protection', requireMysql, checkLimiter, async (req, res) => {
  try {
    const dependants = Math.max(0, Math.round(parseFloat(req.body.dependants) || 0));
    const existingCover = Math.max(0, parseFloat(req.body.existing_cover) || 0);
    const supportYears = req.body.support_years === undefined || req.body.support_years === '' ? DEFAULT_SUPPORT_YEARS : parseFloat(req.body.support_years);
    if (!(supportYears >= 1 && supportYears <= 40)) throw new RangeError('Years of support must be between 1 and 40.');

    const [health, [debtRows]] = await Promise.all([
      currentHealth(req.user.id),
      db.query(
        "SELECT COALESCE(SUM(balance), 0) AS owed FROM commitments WHERE user_id = ? AND kind IN ('car_loan','house_loan','personal_loan','ptptn','credit_card')",
        [req.user.id]
      ),
    ]);
    const result = protectionCheck({
      monthlyIncome: health.income,
      monthlyOutgoings: health.outgoings,
      emergencySavings: health.emergency_savings,
      debtsOutstanding: parseFloat(debtRows[0].owed) || 0,
      dependants,
      existingCover,
      supportYears,
    });
    return res.json({ success: true, data: { ...result, income: health.income } });
  } catch (err) {
    if (err instanceof RangeError) return res.status(422).json({ success: false, message: err.message });
    console.error('Protection check error:', err);
    return res.status(500).json({ success: false, message: 'Failed to work out your protection.' });
  }
});

// Quotes the user received, compared against their own figures (services/quoteCompare.js)
const QUOTE_COLUMNS = ['provider', 'plan_name', 'plan_type', 'takaful', 'premium', 'premium_frequency', 'coverage', 'annual_limit', 'deductible', 'co_pay_pct', 'co_pay_cap', 'room_board'];
const QUOTE_SELECT = `SELECT id, ${QUOTE_COLUMNS.join(', ')}, created_at FROM insurance_quotes WHERE user_id = ? ORDER BY id ASC`;
const quoteRow = (r) => ({ ...r, takaful: Boolean(r.takaful) });

// GET /api/insurance/quotes
router.get('/quotes', requireMysql, async (req, res) => {
  try {
    const [rows] = await db.query(QUOTE_SELECT, [req.user.id]);
    return res.json({ success: true, data: { quotes: rows.map(quoteRow), config: QUOTE_CONFIG } });
  } catch (err) {
    return sendError(res, err, 'Failed to load your quotes.');
  }
});

// POST /api/insurance/quotes
router.post('/quotes', requireMysql, async (req, res) => {
  try {
    const quote = parseQuote(req.body);
    const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM insurance_quotes WHERE user_id = ?', [req.user.id]);
    if (n >= QUOTE_CONFIG.maxQuotes) throw new RangeError(`You can keep up to ${QUOTE_CONFIG.maxQuotes} quotes. Remove one to add another.`);
    const [result] = await db.query(
      `INSERT INTO insurance_quotes (user_id, ${QUOTE_COLUMNS.join(', ')}) VALUES (?, ${QUOTE_COLUMNS.map(() => '?').join(', ')})`,
      [req.user.id, ...QUOTE_COLUMNS.map((c) => quote[c])]
    );
    return res.status(201).json({ success: true, data: { id: result.insertId, ...quote } });
  } catch (err) {
    return sendError(res, err, 'Failed to save the quote.');
  }
});

// PUT /api/insurance/quotes/:id
router.put('/quotes/:id', requireMysql, async (req, res) => {
  try {
    const quote = parseQuote(req.body);
    const [result] = await db.query(
      `UPDATE insurance_quotes SET ${QUOTE_COLUMNS.map((c) => `${c} = ?`).join(', ')} WHERE id = ? AND user_id = ?`,
      [...QUOTE_COLUMNS.map((c) => quote[c]), parseInt(req.params.id, 10), req.user.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Quote not found.' });
    return res.json({ success: true, data: { id: parseInt(req.params.id, 10), ...quote } });
  } catch (err) {
    return sendError(res, err, 'Failed to update the quote.');
  }
});

// DELETE /api/insurance/quotes/:id
router.delete('/quotes/:id', requireMysql, async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM insurance_quotes WHERE id = ? AND user_id = ?', [parseInt(req.params.id, 10), req.user.id]);
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Quote not found.' });
    return res.json({ success: true, message: 'Quote removed.' });
  } catch (err) {
    return sendError(res, err, 'Failed to remove the quote.');
  }
});

// POST /api/insurance/quotes/compare { example_bill, dependants, support_years, existing_cover }
router.post('/quotes/compare', requireMysql, checkLimiter, async (req, res) => {
  try {
    const [rows] = await db.query(QUOTE_SELECT, [req.user.id]);
    if (rows.length === 0) throw new RangeError('Add at least one quote to compare.');
    const data = await compareQuotes(req.user.id, rows.map(quoteRow), req.body || {});
    return res.json({ success: true, data });
  } catch (err) {
    return sendError(res, err, 'Failed to compare your quotes.');
  }
});

router.get('/history', requireMysql, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, age, bmi, smoker, children, risk_score, risk_tier, predicted_at
       FROM insurance_predictions WHERE user_id = ? ORDER BY predicted_at DESC, id DESC LIMIT 20`,
      [req.user.id]
    );
    return res.json({ success: true, data: rows.map((r) => ({ ...r, smoker: Boolean(r.smoker) })) });
  } catch (err) {
    return sendError(res, err, 'Failed to load insurance history.');
  }
});

// DELETE /api/insurance/history/:id
router.delete('/history/:id', requireMysql, async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM insurance_predictions WHERE id = ? AND user_id = ?', [
      parseInt(req.params.id, 10),
      req.user.id,
    ]);
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Assessment not found.' });
    return res.json({ success: true, message: 'Assessment removed.' });
  } catch (err) {
    return sendError(res, err, 'Failed to delete assessment.');
  }
});

module.exports = router;
