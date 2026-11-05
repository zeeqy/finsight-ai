/**
 * FinSight AI - Module 4: Life Goals Planner
 * Kahwin / Children / Haji / House / Car savings plans with feasibility from real spending.
 */

const express = require('express');
const db = require('../db');
const authenticateToken = require('../middleware/auth');
const requireMysql = require('../middleware/requireMysql');
const { SAVINGS_CONFIG, monthsBetween, requiredMonthlyWithGrowth, feasibility } = require('../services/savingsCalc');
const { LOAN_CONFIG, calculateLoan, calculateDsr, dsrBand } = require('../services/loanCalc');
const { getUserProfile, getMonthlySurplus } = require('../services/userFinance');
const { getGoldOutlook } = require('../services/goldForecast');
const { LOOKBACK_DAYS: DEPOSIT_LOOKBACK_DAYS, findDepositSuggestions } = require('../services/goalDeposits');
const { houseCosts, carCosts } = require('../services/purchaseCosts');
const { todayStr, goldOverride, computePlan, planGoal, planActiveGoals, surplusLeftFor, overallStatus } = require('../services/goalPlanner');

const router = express.Router();
router.use(authenticateToken);
router.use(requireMysql);

const GOAL_TYPES = ['kahwin', 'children', 'haji', 'house', 'car', 'custom'];
const INCOME_GROUPS = ['B40', 'M40', 'T20'];
const VEHICLES = Object.keys(SAVINGS_CONFIG.vehicles);

const num = (v, fallback = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};
const round2 = (x) => Math.round(x * 100) / 100;

/** Optional house/car loan check: instalment after the down payment + projected DSR. */
function loanCheck({ goalType, assetPrice, downPayment, loanRate, tenureMonths, monthlyIncome, existingCommitments }) {
  if (!['house', 'car'].includes(goalType) || !(assetPrice > 0) || !(tenureMonths > 0)) return null;
  const cfg = LOAN_CONFIG.loanTypes[goalType];
  const calc = calculateLoan({
    loanType: goalType,
    itemPrice: assetPrice,
    downPayment: Math.min(downPayment, assetPrice),
    annualRatePct: loanRate ?? cfg.defaultRatePct,
    years: tenureMonths / 12,
  });
  const out = {
    loan_amount: calc.loanAmount,
    interest_method: calc.interestMethod,
    monthly_instalment: calc.monthly,
    total_interest: calc.totalInterest,
    projected_dsr: null,
    dsr_band: null,
    warning: null,
  };
  if (monthlyIncome > 0) {
    out.projected_dsr = calculateDsr({ netIncome: monthlyIncome, existingCommitments, newInstalment: calc.monthly });
    out.dsr_band = dsrBand(out.projected_dsr);
    if (out.projected_dsr > LOAN_CONFIG.bankDsrLimit) {
      out.warning = `Projected DSR of ${out.projected_dsr}% exceeds the typical bank limit of ${LOAN_CONFIG.bankDsrLimit}%. Not recommended.`;
    }
  }
  return out;
}

/** Validates and normalises a create/update body. Throws RangeError on bad input. */
function parseGoalBody(body) {
  const goalType = body.goal_type;
  if (!GOAL_TYPES.includes(goalType)) throw new RangeError('Choose a valid goal type.');

  const costItems = Array.isArray(body.cost_items)
    ? body.cost_items
        .filter((i) => i && String(i.item_name || '').trim())
        .map((i) => ({ item_name: String(i.item_name).trim().slice(0, 150), estimated_cost: Math.max(0, num(i.estimated_cost)) }))
    : [];

  const itemsTotal = costItems.reduce((s, i) => s + i.estimated_cost, 0);
  const target = body.target_amount !== undefined && body.target_amount !== '' ? num(body.target_amount) : itemsTotal;
  if (!(target > 0)) throw new RangeError('Target amount must be greater than 0 (add cost items or enter a target).');

  const targetDate = String(body.target_date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) throw new RangeError('Target date must be YYYY-MM-DD.');
  if (targetDate <= todayStr()) throw new RangeError('Target date must be in the future.');

  const vehicle = VEHICLES.includes(body.savings_vehicle) ? body.savings_vehicle : 'piggybank';
  const tenureMonths = body.loan_tenure_months ? Math.round(num(body.loan_tenure_months)) : null;

  return {
    goal_type: goalType,
    title: String(body.title || '').trim().slice(0, 150) || goalType,
    target_amount: round2(target),
    current_saved: Math.max(0, num(body.current_saved)),
    target_date: targetDate,
    savings_vehicle: vehicle,
    expected_rate: body.expected_rate === '' || body.expected_rate === undefined || body.expected_rate === null ? null : num(body.expected_rate),
    asset_price: body.asset_price ? num(body.asset_price) : null,
    down_payment: num(body.down_payment),
    loan_rate: body.loan_rate !== undefined && body.loan_rate !== '' ? num(body.loan_rate) : null,
    loan_tenure_months: tenureMonths,
    existing_commitments: Math.max(0, num(body.existing_commitments)),
    cost_items: costItems,
  };
}

function shapeGoal(row) {
  const n = (v) => (v === null || v === undefined ? null : parseFloat(v));
  return {
    ...row,
    target_amount: n(row.target_amount),
    current_saved: n(row.current_saved),
    required_monthly: n(row.required_monthly),
    asset_price: n(row.asset_price),
    est_monthly_instalment: n(row.est_monthly_instalment),
  };
}

const GOAL_SELECT = `SELECT id, goal_type, title, target_amount, current_saved,
    DATE_FORMAT(target_date, '%Y-%m-%d') AS target_date, savings_vehicle, expected_rate,
    required_monthly, feasibility, asset_price, loan_rate, loan_tenure_months,
    est_monthly_instalment, projected_dsr, status, created_at
  FROM life_goals`;

async function saveGoal(userId, g, goalId = null) {
  const surplusInfo = await getMonthlySurplus(userId);
  const share = await surplusLeftFor(userId, surplusInfo.monthly_surplus, g.target_date, goalId);
  const plan = await planGoal({
    target: g.target_amount,
    currentSaved: g.current_saved,
    targetDate: g.target_date,
    vehicle: g.savings_vehicle,
    expectedRate: g.expected_rate,
    surplus: share.available,
  });
  plan.available_monthly = share.available;
  plan.earlier_goals_monthly = share.earlier_goals_monthly;
  const lc = loanCheck({
    goalType: g.goal_type,
    assetPrice: g.asset_price,
    downPayment: g.down_payment || g.target_amount,
    loanRate: g.loan_rate,
    tenureMonths: g.loan_tenure_months,
    monthlyIncome: surplusInfo.monthly_income,
    // Saved debts are used unless the form gives a figure
    existingCommitments: g.existing_commitments || surplusInfo.debt_monthly,
  });

  const values = [
    g.goal_type, g.title, g.target_amount, g.current_saved, g.target_date, g.savings_vehicle, g.expected_rate,
    plan.required_monthly, plan.feasibility, g.asset_price, g.loan_rate, g.loan_tenure_months,
    lc ? lc.monthly_instalment : null, lc ? lc.projected_dsr : null,
  ];

  let id = goalId;
  if (goalId) {
    await db.query(
      `UPDATE life_goals SET goal_type = ?, title = ?, target_amount = ?, current_saved = ?, target_date = ?,
         savings_vehicle = ?, expected_rate = ?, required_monthly = ?, feasibility = ?, asset_price = ?,
         loan_rate = ?, loan_tenure_months = ?, est_monthly_instalment = ?, projected_dsr = ?
       WHERE id = ? AND user_id = ?`,
      [...values, goalId, userId]
    );
    await db.query('DELETE FROM goal_cost_items WHERE goal_id = ?', [goalId]);
  } else {
    const [result] = await db.query(
      `INSERT INTO life_goals (goal_type, title, target_amount, current_saved, target_date, savings_vehicle,
         expected_rate, required_monthly, feasibility, asset_price, loan_rate, loan_tenure_months,
         est_monthly_instalment, projected_dsr, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [...values, userId]
    );
    id = result.insertId;
  }

  if (g.cost_items.length) {
    await db.query('INSERT INTO goal_cost_items (goal_id, item_name, estimated_cost) VALUES ?', [
      g.cost_items.map((i) => [id, i.item_name, i.estimated_cost]),
    ]);
  }
  return { id, plan, loan_check: lc };
}

function sendError(res, err, fallbackMessage) {
  if (err instanceof RangeError) return res.status(422).json({ success: false, message: err.message });
  console.error(fallbackMessage, err);
  return res.status(500).json({ success: false, message: fallbackMessage });
}

// GET /api/goals/config — vehicles, goal types, income group, surplus
router.get('/config', async (req, res) => {
  try {
    const [profile, surplus] = await Promise.all([getUserProfile(req.user.id), getMonthlySurplus(req.user.id)]);
    return res.json({
      success: true,
      data: {
        goalTypes: GOAL_TYPES,
        incomeGroups: INCOME_GROUPS,
        vehicles: SAVINGS_CONFIG.vehicles,
        feasibilityBands: SAVINGS_CONFIG.feasibility,
        loanTypes: { house: LOAN_CONFIG.loanTypes.house, car: LOAN_CONFIG.loanTypes.car },
        profile,
        surplus,
      },
    });
  } catch (err) {
    return sendError(res, err, 'Failed to load goal settings.');
  }
});

// PATCH /api/goals/income-group
router.patch('/income-group', async (req, res) => {
  try {
    const group = req.body.income_group;
    if (group !== null && !INCOME_GROUPS.includes(group)) throw new RangeError('Income group must be B40, M40 or T20.');
    await db.query('UPDATE users SET income_group = ? WHERE id = ?', [group, req.user.id]);
    return res.json({ success: true, data: { income_group: group } });
  } catch (err) {
    return sendError(res, err, 'Failed to update income group.');
  }
});

// GET /api/goals/purchase-costs?type=house&price=&down_pct=&first_home=&purchase_date= | type=car&engine_cc=
// Upfront costs worked out from the published scales (services/purchaseCosts.js)
router.get('/purchase-costs', async (req, res) => {
  try {
    const type = req.query.type;
    if (type === 'house') {
      const price = num(req.query.price);
      const downPct = num(req.query.down_pct);
      if (!(price > 0)) throw new RangeError('Enter the property price.');
      if (!(downPct >= 0 && downPct <= 100)) throw new RangeError('Down payment must be 0 to 100%.');
      const purchaseDate = /^\d{4}-\d{2}-\d{2}$/.test(req.query.purchase_date || '') ? req.query.purchase_date : null;
      const loanAmount = round2(price * (1 - downPct / 100));
      return res.json({ success: true, data: houseCosts({ price, loanAmount, firstHome: req.query.first_home === 'true', purchaseDate }) });
    }
    if (type === 'car') {
      return res.json({ success: true, data: carCosts({ engineCc: num(req.query.engine_cc) }) });
    }
    throw new RangeError('Purchase costs are worked out for a house or a car.');
  } catch (err) {
    return sendError(res, err, 'Failed to work out purchase costs.');
  }
});

// GET /api/goals/templates/:goalType?income_group=M40
router.get('/templates/:goalType', async (req, res) => {
  try {
    const goalType = req.params.goalType;
    if (!GOAL_TYPES.includes(goalType)) throw new RangeError('Unknown goal type.');
    const group = INCOME_GROUPS.includes(req.query.income_group) ? req.query.income_group : null;

    const [rows] = await db.query(
      'SELECT item_name, default_cost, source, income_group FROM cost_templates WHERE goal_type = ? ORDER BY id',
      [goalType]
    );
    const specific = group ? rows.filter((r) => r.income_group === group) : [];
    const items = (specific.length ? specific : rows.filter((r) => r.income_group === 'ALL')).map((r) => ({
      item_name: r.item_name,
      default_cost: parseFloat(r.default_cost),
      source: r.source,
    }));
    return res.json({ success: true, data: { goal_type: goalType, income_group: specific.length ? group : 'ALL', items } });
  } catch (err) {
    return sendError(res, err, 'Failed to load templates.');
  }
});

// GET /api/goals — list with live progress + feasibility, and an overall summary
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const [[goals], surplus] = await Promise.all([
      db.query(`${GOAL_SELECT} WHERE user_id = ? ORDER BY status = 'active' DESC, target_date ASC`, [userId]),
      getMonthlySurplus(userId),
    ]);

    const ids = goals.map((g) => g.id);
    let items = [];
    let contribs = [];
    if (ids.length) {
      [items] = await db.query('SELECT goal_id, item_name, estimated_cost FROM goal_cost_items WHERE goal_id IN (?) ORDER BY id', [ids]);
      [contribs] = await db.query(
        `SELECT id, goal_id, amount, DATE_FORMAT(contributed_at, '%Y-%m-%d') AS contributed_at
         FROM goal_contributions WHERE goal_id IN (?) ORDER BY contributed_at DESC, id DESC`,
        [ids]
      );
    }

    const shaped = goals.map(shapeGoal);
    const activeRows = shaped.filter((g) => g.status === 'active');
    const activePlans = await planActiveGoals(activeRows, surplus.monthly_surplus);
    const planById = new Map(activeRows.map((g, i) => [g.id, activePlans[i]]));

    const data = shaped.map((g) => {
      const plan = planById.get(g.id) || {
        progress_pct: g.target_amount > 0 ? Math.min(100, round2((g.current_saved / g.target_amount) * 100)) : 0,
      };
      return {
        ...g,
        ...plan,
        cost_items: items.filter((i) => i.goal_id === g.id).map((i) => ({ item_name: i.item_name, estimated_cost: parseFloat(i.estimated_cost) })),
        contributions: contribs.filter((c) => c.goal_id === g.id).slice(0, 5).map((c) => ({ ...c, amount: parseFloat(c.amount) })),
      };
    });

    const active = data.filter((g) => g.status === 'active');
    const totalRequired = round2(active.reduce((s, g) => s + (g.required_monthly || 0), 0));
    const overall = feasibility({ requiredMonthly: totalRequired, monthlySurplus: surplus.monthly_surplus });

    return res.json({
      success: true,
      data: {
        goals: data,
        summary: {
          ...surplus,
          active_goals: active.length,
          total_required_monthly: totalRequired,
          total_target: round2(active.reduce((s, g) => s + g.target_amount, 0)),
          total_saved: round2(active.reduce((s, g) => s + g.current_saved, 0)),
          overall_feasibility: active.length ? overallStatus(active) : overall.status,
          overall_ratio: overall.ratio,
        },
      },
    });
  } catch (err) {
    return sendError(res, err, 'Failed to load goals.');
  }
});

// POST /api/goals
router.post('/', async (req, res) => {
  try {
    const g = parseGoalBody(req.body);
    const saved = await saveGoal(req.user.id, g);
    return res.status(201).json({ success: true, message: 'Goal created.', data: saved });
  } catch (err) {
    return sendError(res, err, 'Failed to create goal.');
  }
});

// PUT /api/goals/:id
router.put('/:id', async (req, res) => {
  try {
    const goalId = parseInt(req.params.id, 10);
    const [existing] = await db.query('SELECT id FROM life_goals WHERE id = ? AND user_id = ?', [goalId, req.user.id]);
    if (!existing.length) return res.status(404).json({ success: false, message: 'Goal not found.' });

    if (req.body.status && Object.keys(req.body).length === 1) {
      if (!['active', 'completed', 'paused'].includes(req.body.status)) throw new RangeError('Invalid status.');
      await db.query('UPDATE life_goals SET status = ? WHERE id = ? AND user_id = ?', [req.body.status, goalId, req.user.id]);
      return res.json({ success: true, message: 'Goal status updated.' });
    }

    const g = parseGoalBody(req.body);
    const saved = await saveGoal(req.user.id, g, goalId);
    return res.json({ success: true, message: 'Goal updated.', data: saved });
  } catch (err) {
    return sendError(res, err, 'Failed to update goal.');
  }
});

// DELETE /api/goals/:id
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM life_goals WHERE id = ? AND user_id = ?', [parseInt(req.params.id, 10), req.user.id]);
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Goal not found.' });
    return res.json({ success: true, message: 'Goal deleted.' });
  } catch (err) {
    return sendError(res, err, 'Failed to delete goal.');
  }
});

/**
 * Adds a contribution and raises the goal's saved amount, marking it completed at the target.
 * q is db.query or a transaction's query. Returns null when the goal is not the user's.
 */
async function addContribution(q, userId, goalId, amount, date) {
  const [rows] = await q('SELECT target_amount, current_saved FROM life_goals WHERE id = ? AND user_id = ?', [goalId, userId]);
  if (!rows.length) return null;
  await q('INSERT INTO goal_contributions (goal_id, amount, contributed_at) VALUES (?, ?, ?)', [goalId, amount, date]);
  const newSaved = round2(parseFloat(rows[0].current_saved) + amount);
  const completed = newSaved >= parseFloat(rows[0].target_amount);
  await q(`UPDATE life_goals SET current_saved = ?, status = IF(?, 'completed', status) WHERE id = ? AND user_id = ?`, [
    newSaved,
    completed,
    goalId,
    userId,
  ]);
  return { current_saved: newSaved, completed };
}

const contributionMessage = (r, amount) => (r.completed ? 'Target reached! Goal marked as completed.' : `Added RM ${amount.toFixed(2)}.`);

// POST /api/goals/:id/contributions
router.post('/:id/contributions', async (req, res) => {
  try {
    const goalId = parseInt(req.params.id, 10);
    const amount = num(req.body.amount);
    if (!(amount > 0)) throw new RangeError('Contribution must be greater than 0.');
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.body.contributed_at || '') ? req.body.contributed_at : todayStr();

    const result = await addContribution(db.query, req.user.id, goalId, amount, date);
    if (!result) return res.status(404).json({ success: false, message: 'Goal not found.' });
    return res.status(201).json({ success: true, message: contributionMessage(result, amount), data: result });
  } catch (err) {
    return sendError(res, err, 'Failed to add contribution.');
  }
});

// GET /api/goals/deposits — transfers to Tabung Haji / ASNB in the statements that could count towards a goal
router.get('/deposits', async (req, res) => {
  try {
    return res.json({ success: true, data: { suggestions: await findDepositSuggestions(req.user.id), lookback_days: DEPOSIT_LOOKBACK_DAYS } });
  } catch (err) {
    return sendError(res, err, 'Failed to look for savings in your statements.');
  }
});

// POST /api/goals/deposits/:transactionId { action: 'add' | 'dismiss', goal_id }
router.post('/deposits/:transactionId', async (req, res) => {
  try {
    const txnId = parseInt(req.params.transactionId, 10);
    const action = req.body.action;
    if (!['add', 'dismiss'].includes(action)) throw new RangeError('Choose to add it to a goal or leave it out.');
    const [[txn]] = await db.query(
      "SELECT id, amount, DATE_FORMAT(txn_date, '%Y-%m-%d') AS txn_date FROM transactions WHERE id = ? AND user_id = ? AND category <> 'Income'",
      [txnId, req.user.id]
    );
    if (!txn) return res.status(404).json({ success: false, message: 'Transaction not found.' });

    const result = await db.withTransaction(async (q) => {
      const goalId = action === 'add' ? parseInt(req.body.goal_id, 10) : null;
      // The unique key on transaction_id stops the same transfer being counted twice
      await q('INSERT INTO goal_deposit_links (user_id, transaction_id, goal_id, status) VALUES (?, ?, ?, ?)', [
        req.user.id,
        txnId,
        goalId,
        action === 'add' ? 'added' : 'dismissed',
      ]);
      if (action === 'dismiss') return { dismissed: true };
      const added = await addContribution(q, req.user.id, goalId, parseFloat(txn.amount), txn.txn_date);
      if (!added) throw new RangeError('Choose one of your goals.');
      return added;
    });
    if (result.dismissed) return res.json({ success: true, message: 'Left out. It will not be suggested again.' });
    return res.status(201).json({ success: true, message: contributionMessage(result, parseFloat(txn.amount)), data: result });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'This transfer has already been counted or left out.' });
    return sendError(res, err, 'Failed to count this transfer.');
  }
});

// POST /api/goals/simulate — compare savings vehicles for the same target
router.post('/simulate', async (req, res) => {
  try {
    const target = num(req.body.target_amount);
    const currentSaved = Math.max(0, num(req.body.current_saved));
    const targetDate = String(req.body.target_date || '');
    if (!(target > 0)) throw new RangeError('Target amount must be greater than 0.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || targetDate <= todayStr()) throw new RangeError('Choose a future target date.');

    const overrides = req.body.rates || {};
    const [surplus, gold] = await Promise.all([
      getMonthlySurplus(req.user.id),
      goldOverride('gold', overrides.gold, targetDate),
    ]);
    const editingId = req.body.goal_id ? parseInt(req.body.goal_id, 10) : null;
    const share = await surplusLeftFor(req.user.id, surplus.monthly_surplus, targetDate, editingId);
    surplus.available_monthly = share.available;
    surplus.earlier_goals_monthly = share.earlier_goals_monthly;
    const comparisons = VEHICLES.map((v) => {
      const cfg = SAVINGS_CONFIG.vehicles[v];
      const isForecast = v === 'gold' && gold;
      const plan = computePlan({
        target,
        currentSaved,
        targetDate,
        vehicle: v,
        expectedRate: isForecast ? gold.ratePct : overrides[v],
        surplus: share.available,
      });
      // Gold: also show what the expected and optimistic forecast rates would need
      const scenario = (ratePct) =>
        requiredMonthlyWithGrowth({ target, currentSaved, annualRatePct: ratePct, months: plan.months_left });
      const totalDeposited = round2(currentSaved + plan.required_monthly * plan.months_left);
      return {
        vehicle: v,
        label: cfg.label,
        shariah: cfg.shariah,
        rate_pct: plan.rate_pct,
        source: cfg.source,
        required_monthly: plan.required_monthly,
        total_deposited: totalDeposited,
        growth_earned: round2(Math.max(0, target - totalDeposited)),
        feasibility: plan.feasibility,
        months_left: plan.months_left,
        rate_source: v === 'gold' ? (isForecast ? gold.source : 'user') : 'config',
        ...(isForecast && gold.rates && {
          forecast_rates: gold.rates,
          required_monthly_expected: scenario(gold.rates.expected),
          required_monthly_optimistic: scenario(gold.rates.optimistic),
        }),
        note: isForecast ? gold.note : null,
      };
    });

    let goldOutlook = null;
    if (gold?.source === 'arima') {
      const o = await getGoldOutlook(Math.max(1, monthsBetween(todayStr(), targetDate)));
      if (o) {
        goldOutlook = {
          unit: o.unit,
          last_actual: o.last_actual,
          history: Object.entries(o.history)
            .filter(([m]) => m >= '2021-01')
            .map(([month, price]) => ({ month, price })),
          path: o.path,
          model: o.model,
        };
      }
    }
    return res.json({ success: true, data: { comparisons, surplus, gold_outlook: goldOutlook } });
  } catch (err) {
    return sendError(res, err, 'Failed to simulate savings.');
  }
});

// POST /api/goals/loan-check — house/car instalment + projected DSR
router.post('/loan-check', async (req, res) => {
  try {
    const goalType = req.body.goal_type;
    if (!['house', 'car'].includes(goalType)) throw new RangeError('Loan check is only for house or car goals.');
    const surplusInfo = await getMonthlySurplus(req.user.id);
    const monthlyIncome = req.body.monthly_income ? num(req.body.monthly_income) : surplusInfo.monthly_income;
    const commitmentsGiven = req.body.existing_commitments !== undefined && req.body.existing_commitments !== '';
    const tenureMonths = Math.round(num(req.body.loan_tenure_months) || num(req.body.tenure_years) * 12);
    const assetPrice = num(req.body.asset_price);
    const maxMonths = LOAN_CONFIG.loanTypes[goalType].maxTenureYears * 12;
    if (!(assetPrice > 0)) throw new RangeError('Enter the property / car price.');
    if (!(tenureMonths > 0) || tenureMonths > maxMonths) throw new RangeError(`Tenure must be between 1 and ${maxMonths} months.`);

    const result = loanCheck({
      goalType,
      assetPrice,
      downPayment: num(req.body.down_payment),
      loanRate: req.body.loan_rate !== undefined && req.body.loan_rate !== '' ? num(req.body.loan_rate) : null,
      tenureMonths,
      monthlyIncome,
      existingCommitments: commitmentsGiven ? Math.max(0, num(req.body.existing_commitments)) : surplusInfo.debt_monthly,
    });
    return res.json({
      success: true,
      data: { ...result, monthly_income: monthlyIncome, existing_commitments_source: commitmentsGiven ? 'form' : 'saved' },
    });
  } catch (err) {
    return sendError(res, err, 'Failed to run loan check.');
  }
});

module.exports = router;
