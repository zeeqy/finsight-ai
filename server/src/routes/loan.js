/**
 * FinSight AI - Module 3: Loan Default Predictor
 * "Can I afford this loan?" self-check before applying to a bank.
 */

const express = require('express');
const db = require('../db');
const authenticateToken = require('../middleware/auth');
const { checkLimiter } = require('../middleware/userLimiter');
const requireMysql = require('../middleware/requireMysql');
const {
  LOAN_CONFIG,
  calculateLoan,
  calculateDsr,
  dsrBand,
  maxLoanForInstalment,
  minTenureForInstalment,
} = require('../services/loanCalc');
const { RISK_CONFIG, predictDefault } = require('../services/loanRisk');
const { getUserProfile } = require('../services/userFinance');
const { COMMITMENT_KINDS, loadCommitments } = require('../services/financialProfile');
const { simulateDecision } = require('../services/decisionSimulator');

const router = express.Router();
router.use(authenticateToken);

const EMPLOYMENT_TYPES = ['permanent', 'contract', 'self_employed', 'gig'];
const COMMITMENT_FIELDS = ['car_loan', 'house_loan', 'ptptn', 'credit_card', 'personal_loan', 'other'];

const num = (v, fallback = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};
const rm = (n) => `RM ${Number(n).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function parseBody(body) {
  const loanType = body.loan_type;
  if (!LOAN_CONFIG.loanTypes[loanType]) throw new RangeError('Loan type must be personal, car or house.');
  const cfg = LOAN_CONFIG.loanTypes[loanType];

  const years = num(body.tenure_years);
  if (years > cfg.maxTenureYears) {
    throw new RangeError(`Maximum tenure for a ${loanType} loan is ${cfg.maxTenureYears} years.`);
  }

  const commitments = body.commitments || {};
  const existingCommitments =
    body.existing_commitments !== undefined
      ? num(body.existing_commitments)
      : COMMITMENT_FIELDS.reduce((s, k) => s + Math.max(0, num(commitments[k])), 0);

  return {
    calcInput: {
      loanType,
      itemPrice: num(body.item_price),
      downPayment: num(body.down_payment),
      loanAmount: loanType === 'personal' ? num(body.loan_amount ?? body.item_price) : undefined,
      annualRatePct: num(body.interest_rate, cfg.defaultRatePct),
      years,
      method: body.interest_method,
    },
    netIncome: num(body.monthly_income),
    existingCommitments,
    profile: {
      employment_type: EMPLOYMENT_TYPES.includes(body.employment_type) ? body.employment_type : 'permanent',
      years_employed: num(body.years_employed),
      dependants: Math.max(0, Math.round(num(body.dependants))),
      age: body.age ? Math.round(num(body.age)) : null,
    },
  };
}

/** Rule-based tips: solve the formulas backwards for down payment / tenure that fixes the DSR. */
function buildTips({ calc, netIncome, existingCommitments, dsr }) {
  const tips = [];
  const { healthyMax, moderateMax } = LOAN_CONFIG.dsrBands;
  const cfg = LOAN_CONFIG.loanTypes[calc.loanType];
  const targetDsr = dsr > moderateMax ? moderateMax : healthyMax;

  if (dsr <= healthyMax) {
    tips.push(`Your DSR stays at or under ${healthyMax}% with this loan, which banks generally see as healthy.`);
  } else {
    const maxMonthly = (netIncome * targetDsr) / 100 - existingCommitments;
    if (maxMonthly <= 0) {
      tips.push(
        `Your existing commitments already use ${((existingCommitments / netIncome) * 100).toFixed(1)}% of your income. Clear some existing debt before taking on this loan.`
      );
    } else {
      const maxLoan = maxLoanForInstalment({
        maxMonthly,
        annualRatePct: calc.annualRatePct,
        years: calc.years,
        method: calc.interestMethod,
      });
      if (calc.loanType === 'personal') {
        tips.push(`Borrowing at most ${rm(maxLoan)} over ${calc.years} years brings your DSR under ${targetDsr}%.`);
      } else {
        const neededDown = calc.itemPrice - maxLoan;
        if (neededDown > calc.downPayment && neededDown < calc.itemPrice) {
          tips.push(
            `A down payment of ${rm(neededDown)} (${((neededDown / calc.itemPrice) * 100).toFixed(1)}% of the price) brings your DSR under ${targetDsr}%.`
          );
        }
      }

      const minYears = minTenureForInstalment({
        loanAmount: calc.loanAmount,
        maxMonthly,
        annualRatePct: calc.annualRatePct,
        method: calc.interestMethod,
        maxYears: cfg.maxTenureYears,
      });
      if (minYears && minYears > calc.years) {
        const longer = calculateLoan({ ...calc, years: minYears, method: calc.interestMethod });
        tips.push(
          `A tenure of ${minYears} years brings your DSR under ${targetDsr}% (${rm(longer.monthly)}/month), but total interest rises to ${rm(longer.totalInterest)}.`
        );
      } else if (!minYears) {
        tips.push(
          targetDsr === healthyMax
            ? `Extending the tenure alone (up to ${cfg.maxTenureYears} years) cannot bring your DSR down to a healthy ${healthyMax}%.`
            : `Even the maximum ${cfg.maxTenureYears}-year tenure keeps your DSR above ${targetDsr}%. Consider a cheaper option or a larger down payment.`
        );
      }
    }
  }

  if (calc.interestMethod === 'flat') {
    tips.push(
      `A flat ${calc.annualRatePct}% charges interest on the full original amount for the whole tenure, so it costs the same as ${calc.effectiveRatePct}% on a reducing balance. Compare offers by their effective rate.`
    );
    tips.push(
      calc.loanType === 'car'
        ? 'New car hire-purchase agreements from 1 Jun 2026 must use an effective rate on a reducing balance. A flat rate only applies to agreements signed before then.'
        : 'Banks cannot offer flat-rate personal financing from 1 Jan 2027, so new offers will quote an effective rate.'
    );
  }
  return tips;
}

const LEVEL_RANK = { Healthy: 0, Low: 0, Moderate: 1, Medium: 1, High: 2 };
const VERDICTS = ['Affordable', 'Caution', 'Not Recommended'];

function overallVerdict(band, riskLevel, dsr) {
  if (dsr > LOAN_CONFIG.bankDsrLimit) return 'Not Recommended';
  const rank = Math.max(LEVEL_RANK[band] ?? 0, riskLevel ? LEVEL_RANK[riskLevel] : 0);
  return VERDICTS[rank];
}

function assess(body) {
  const { calcInput, netIncome, existingCommitments, profile } = parseBody(body);
  const calc = calculateLoan(calcInput);
  const dsr = calculateDsr({ netIncome, existingCommitments, newInstalment: calc.monthly });
  const band = dsrBand(dsr);
  const warnings = [];
  if (dsr > LOAN_CONFIG.bankDsrLimit) {
    warnings.push(`DSR of ${dsr}% exceeds the typical bank limit of ${LOAN_CONFIG.bankDsrLimit}%. This loan is not recommended.`);
  }
  return {
    calc,
    netIncome,
    existingCommitments,
    profile,
    dsr,
    band,
    instalmentToIncome: Math.round((calc.monthly / netIncome) * 10000) / 100,
    tips: buildTips({ calc, netIncome, existingCommitments, dsr }),
    warnings,
  };
}

function sendError(res, err, fallbackMessage) {
  if (err instanceof RangeError) {
    return res.status(422).json({ success: false, message: err.message });
  }
  console.error(fallbackMessage, err);
  return res.status(500).json({ success: false, message: fallbackMessage });
}

// GET /api/loan/config — defaults for the form
router.get('/config', async (req, res) => {
  try {
    const [profile, saved] = await Promise.all([getUserProfile(req.user.id), loadCommitments(req.user.id)]);
    // Saved debts, summed per form field (takaful and other bills don't count toward DSR)
    const savedCommitments = {};
    for (const c of saved) {
      if (!COMMITMENT_KINDS[c.kind]?.debt) continue;
      savedCommitments[c.kind] = Math.round(((savedCommitments[c.kind] || 0) + parseFloat(c.monthly_amount)) * 100) / 100;
    }
    return res.json({
      success: true,
      data: {
        loanTypes: LOAN_CONFIG.loanTypes,
        dsrBands: LOAN_CONFIG.dsrBands,
        bankDsrLimit: LOAN_CONFIG.bankDsrLimit,
        riskThresholds: RISK_CONFIG.thresholds,
        employmentTypes: EMPLOYMENT_TYPES,
        commitmentFields: COMMITMENT_FIELDS,
        savedCommitments,
        profile,
      },
    });
  } catch (err) {
    return sendError(res, err, 'Failed to load loan settings.');
  }
});

// POST /api/loan/calculate — maths only, no ML, no save (live preview)
router.post('/calculate', (req, res) => {
  try {
    const a = assess(req.body);
    return res.json({
      success: true,
      data: {
        ...a.calc,
        dsr: a.dsr,
        dsrBand: a.band,
        instalmentToIncome: a.instalmentToIncome,
        existingCommitments: a.existingCommitments,
        warnings: a.warnings,
      },
    });
  } catch (err) {
    return sendError(res, err, 'Failed to calculate loan.');
  }
});

// POST /api/loan/predict — calculate + default risk + verdict + tips, saved to loan_predictions
router.post('/predict', requireMysql, checkLimiter, async (req, res) => {
  try {
    const a = assess(req.body);
    const { calc, profile } = a;

    const risk = await predictDefault({
      loan_type: calc.loanType,
      item_price: calc.itemPrice,
      loan_amount: calc.loanAmount,
      monthly_instalment: calc.monthly,
      tenure_years: calc.years,
      monthly_income: a.netIncome,
      existing_commitments: a.existingCommitments,
      dsr: a.dsr,
      instalment_to_income: a.instalmentToIncome / 100,
      credit_to_income: calc.loanAmount / (a.netIncome * 12),
      down_payment_ratio: calc.itemPrice > 0 ? calc.downPayment / calc.itemPrice : 0,
      ...profile,
    });

    const verdict = overallVerdict(a.band, risk.counts_toward_verdict ? risk.risk_level : null, a.dsr);

    // Affordability against the user's real finances: surplus, savings, goals, health index
    let affordability = null;
    try {
      affordability = await simulateDecision(req.user.id, {
        type: 'loan',
        loan_type: calc.loanType,
        item_price: calc.itemPrice,
        down_payment: calc.downPayment,
        loan_amount: calc.loanAmount,
        interest_rate: calc.annualRatePct,
        interest_method: calc.interestMethod,
        tenure_years: calc.years,
      });
    } catch (err) {
      console.warn('Loan affordability simulation failed:', err.message);
    }

    const [result] = await db.query(
      `INSERT INTO loan_predictions
        (user_id, loan_type, interest_method, item_price, down_payment, loan_amount, interest_rate, tenure_years,
         monthly_income, existing_commitments, employment_type, years_employed, dependants, age,
         monthly_instalment, total_payment, total_interest, dsr, dsr_band,
         default_probability, risk_level, risk_source, risk_counts, overall_verdict)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id, calc.loanType, calc.interestMethod, calc.itemPrice, calc.downPayment, calc.loanAmount,
        calc.annualRatePct, calc.years, a.netIncome, a.existingCommitments, profile.employment_type,
        profile.years_employed, profile.dependants, profile.age, calc.monthly, calc.totalPayment,
        calc.totalInterest, a.dsr, a.band, risk.default_probability, risk.risk_level, risk.source,
        risk.counts_toward_verdict !== false, verdict,
      ]
    );

    return res.json({
      success: true,
      data: {
        id: result.insertId,
        ...calc,
        dsr: a.dsr,
        dsrBand: a.band,
        instalmentToIncome: a.instalmentToIncome,
        existingCommitments: a.existingCommitments,
        risk: { ...risk, default_probability: Math.round(risk.default_probability * 1000) / 1000 },
        verdict,
        affordability,
        tips: a.tips,
        warnings: a.warnings,
      },
    });
  } catch (err) {
    return sendError(res, err, 'Failed to run loan assessment.');
  }
});

// GET /api/loan/history
router.get('/history', requireMysql, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, loan_type, interest_method, item_price, down_payment, loan_amount, interest_rate, tenure_years,
              monthly_instalment, total_interest, dsr, dsr_band, default_probability, risk_level, risk_source,
              risk_counts, overall_verdict, predicted_at
       FROM loan_predictions WHERE user_id = ? ORDER BY predicted_at DESC, id DESC LIMIT 20`,
      [req.user.id]
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return sendError(res, err, 'Failed to load loan history.');
  }
});

// DELETE /api/loan/history/:id
router.delete('/history/:id', requireMysql, async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM loan_predictions WHERE id = ? AND user_id = ?', [
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
