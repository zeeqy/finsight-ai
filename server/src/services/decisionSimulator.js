/**
 * FinSight AI - "Can I afford this?" decision simulator: the integration layer.
 * Takes one decision (a loan, a one-off purchase, a new monthly commitment, pausing a goal, or a
 * drop in income for a few months),
 * re-runs the financial profile, goal plans and health index with it, and explains every change
 * in a sentence built from the numbers. Deterministic by design: the advisor may explain these
 * results but never computes them.
 */

const db = require('../db');
const { getFinancialProfile } = require('./financialProfile');
const { planActiveGoals } = require('./goalPlanner');
const { computeHealthIndex } = require('./healthIndex');
const { LOAN_CONFIG, calculateLoan, dsrBand } = require('./loanCalc');
const { REFERENCE_BUDGETS } = require('../data/referenceBudgets');

const round2 = (x) => Math.round(x * 100) / 100;
const rm = (x) => `RM ${Number(x).toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const STRESS_RATE_PCT = 2; // rate rise used to stress-test floating (reducing-balance) loans

const ACTIVE_GOALS_SQL = `SELECT id, goal_type, title, target_amount, current_saved,
    DATE_FORMAT(target_date, '%Y-%m-%d') AS target_date, savings_vehicle, expected_rate
  FROM life_goals WHERE user_id = ? AND status = 'active' ORDER BY target_date ASC, id ASC`;

/** Everything the simulator and health check need about one user, loaded once. */
async function loadSituation(userId) {
  const [profile, [[user = {}]], [goals]] = await Promise.all([
    getFinancialProfile(userId),
    db.query('SELECT emergency_savings, household_type FROM users WHERE id = ?', [userId]),
    db.query(ACTIVE_GOALS_SQL, [userId]),
  ]);
  return {
    profile,
    emergencySavings: user.emergency_savings === null || user.emergency_savings === undefined ? null : parseFloat(user.emergency_savings),
    householdType: user.household_type || null,
    goals,
  };
}

/** Figures for one state of the user's finances (before or after a decision). */
async function snapshot({ income, outgoings, debtMonthly, surplus, savings, goals }) {
  const plans = await planActiveGoals(goals, surplus);
  const goalPlans = goals.map((g, i) => ({ id: g.id, title: g.title, target_date: g.target_date, ...plans[i] }));
  const health = computeHealthIndex({ income, monthlyOutgoings: outgoings, debtMonthly, emergencySavings: savings, surplus, goals: goalPlans });
  return {
    surplus: round2(surplus),
    dsr: income > 0 ? round2((debtMonthly / income) * 100) : null,
    dsr_band: income > 0 ? dsrBand((debtMonthly / income) * 100) : null,
    emergency_months: savings !== null && outgoings > 0 ? round2(savings / outgoings) : null,
    emergency_savings: savings === null ? null : round2(savings),
    goals: goalPlans.map((g) => ({
      id: g.id,
      title: g.title,
      target_date: g.target_date,
      feasibility: g.feasibility,
      suggested_date: g.suggested_date,
      catches_up: g.catches_up,
      required_monthly: g.required_monthly,
    })),
    health,
  };
}

function baseState(s) {
  const p = s.profile;
  const outgoings = (p.spending.avg_monthly || 0) + p.commitments.deducted_from_surplus;
  return {
    income: p.income.used,
    outgoings: p.spending.avg_monthly === null && !p.commitments.monthly_total ? null : outgoings,
    debtMonthly: p.commitments.debt_monthly,
    surplus: p.monthly_surplus,
    savings: s.emergencySavings,
    goals: s.goals,
  };
}

/** Validates a decision and returns what it changes. Throws RangeError on bad input. */
function applyDecision(decision, state) {
  const after = { ...state, goals: [...state.goals] };
  const num = (v) => parseFloat(v);
  const summary = {};

  switch (decision.type) {
    case 'loan': {
      const loanType = decision.loan_type;
      const cfg = LOAN_CONFIG.loanTypes[loanType];
      if (!cfg) throw new RangeError('Loan type must be personal, car or house.');
      const years = num(decision.tenure_years);
      if (!(years > 0) || years > cfg.maxTenureYears) throw new RangeError(`Tenure must be 1 to ${cfg.maxTenureYears} years.`);
      const rate = decision.interest_rate === undefined || decision.interest_rate === '' ? cfg.defaultRatePct : num(decision.interest_rate);
      const calc = calculateLoan({
        loanType,
        itemPrice: num(decision.item_price) || 0,
        downPayment: num(decision.down_payment) || 0,
        loanAmount: loanType === 'personal' ? num(decision.loan_amount ?? decision.item_price) : undefined,
        annualRatePct: rate,
        years,
        method: decision.interest_method,
      });
      after.surplus -= calc.monthly;
      after.outgoings = (after.outgoings || 0) + calc.monthly;
      after.debtMonthly += calc.monthly;
      const fromSavings = decision.down_payment_from_savings !== false && calc.downPayment > 0;
      if (fromSavings && after.savings !== null) after.savings -= calc.downPayment;
      summary.loan = {
        loan_type: loanType,
        interest_method: calc.interestMethod,
        loan_amount: calc.loanAmount,
        down_payment: calc.downPayment,
        down_payment_from_savings: fromSavings,
        monthly: calc.monthly,
        total_interest: calc.totalInterest,
        rate_pct: rate,
        years,
      };
      // House loans float with the base rate and can get dearer; car hire purchase and personal
      // financing are fixed-rate for the whole term, even on a reducing balance
      if (loanType === 'house') {
        const stressed = calculateLoan({ loanType, itemPrice: calc.itemPrice, downPayment: calc.downPayment, loanAmount: calc.loanAmount, annualRatePct: rate + STRESS_RATE_PCT, years });
        summary.stress = {
          rate_pct: rate + STRESS_RATE_PCT,
          monthly: stressed.monthly,
          extra_monthly: round2(stressed.monthly - calc.monthly),
          dsr: state.income > 0 ? round2(((state.debtMonthly + stressed.monthly) / state.income) * 100) : null,
        };
      }
      return { after, summary, label: `a ${loanType} loan of ${rm(calc.loanAmount)} (${rm(calc.monthly)} a month)` };
    }
    case 'purchase': {
      const amount = num(decision.amount);
      if (!(amount > 0)) throw new RangeError('Enter how much the purchase costs.');
      if (after.savings !== null) after.savings -= amount;
      summary.purchase = { amount: round2(amount) };
      return { after, summary, label: `a one-off purchase of ${rm(amount)}` };
    }
    case 'commitment': {
      const amount = num(decision.monthly_amount);
      if (!(amount > 0)) throw new RangeError('Enter the monthly amount.');
      after.surplus -= amount;
      after.outgoings = (after.outgoings || 0) + amount;
      if (decision.is_debt) after.debtMonthly += amount;
      summary.commitment = { monthly_amount: round2(amount), is_debt: Boolean(decision.is_debt) };
      return { after, summary, label: `a new commitment of ${rm(amount)} a month` };
    }
    case 'pause_goal': {
      const id = parseInt(decision.goal_id, 10);
      const goal = state.goals.find((g) => g.id === id);
      if (!goal) throw new RangeError('Choose one of your active goals.');
      after.goals = state.goals.filter((g) => g.id !== id);
      summary.paused_goal = { id, title: goal.title };
      return { after, summary, label: `pausing "${goal.title}"` };
    }
    case 'income_drop': {
      // Resilience check: income falls (or stops) for a while; how long do savings carry the gap?
      if (!(state.income > 0)) throw new RangeError('Add your monthly income to your profile first.');
      const pct = num(decision.drop_pct);
      if (!(pct > 0 && pct <= 100)) throw new RangeError('The income drop must be between 1% and 100%.');
      const months = parseInt(decision.months, 10);
      if (!(months >= 1 && months <= 24)) throw new RangeError('Choose how long it lasts: 1 to 24 months.');
      const lost = round2((state.income * pct) / 100);
      after.income = round2(state.income - lost);
      after.surplus -= lost;
      const shortfall = after.surplus < 0 ? round2(-after.surplus) : 0;
      let runway = null;
      if (shortfall > 0 && state.savings !== null) {
        runway = round2(Math.max(0, state.savings) / shortfall);
        after.savings = state.savings - shortfall * months;
      }
      summary.income_drop = {
        drop_pct: pct,
        months,
        income_before: round2(state.income),
        income_after: after.income,
        shortfall_monthly: shortfall,
        runway_months: runway,
      };
      const span = months === 1 ? '1 month' : `${months} months`;
      return { after, summary, label: pct === 100 ? `no income for ${span}` : `income falling by ${pct}% for ${span}` };
    }
    default:
      throw new RangeError('Choose a purchase, a monthly cost, an income drop, pausing a goal or a loan.');
  }
}

const RANK = { 'On Track': 0, 'At Risk': 1, 'Not Feasible': 2 };
const dateText = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-MY', { month: 'short', year: 'numeric' }) : null);

/** Sentences explaining what changed, worst first, and an overall verdict. */
function explain(before, after, state, extra) {
  const reasons = [];
  const surplusDrop = before.surplus - after.surplus;
  if (Math.abs(surplusDrop) >= 1) {
    reasons.push({
      tone: after.surplus < 0 ? 'danger' : surplusDrop > 0 ? 'warn' : 'ok',
      text:
        after.surplus < 0
          ? `You would be ${rm(-after.surplus)} short every month (left over falls from ${rm(before.surplus)}).`
          : `Money left each month ${surplusDrop > 0 ? 'falls' : 'rises'} from ${rm(before.surplus)} to ${rm(after.surplus)}.`,
    });
  }
  if (after.dsr !== null && after.dsr !== before.dsr) {
    const limit = LOAN_CONFIG.bankDsrLimit;
    reasons.push({
      tone: after.dsr > limit ? 'danger' : after.dsr > LOAN_CONFIG.dsrBands.healthyMax ? 'warn' : 'ok',
      text: `Debt repayments go from ${before.dsr}% to ${after.dsr}% of income (DSR, ${after.dsr_band})${after.dsr > limit ? `, above the ${limit}% most banks accept` : ''}.`,
    });
  }
  if (extra.stress) {
    reasons.push({
      tone: extra.stress.dsr > LOAN_CONFIG.bankDsrLimit ? 'danger' : 'info',
      text: `If the rate rises by ${STRESS_RATE_PCT} points, the instalment grows by ${rm(extra.stress.extra_monthly)} a month and DSR reaches ${extra.stress.dsr}%.`,
    });
  }
  if (after.emergency_months !== null && after.emergency_months !== before.emergency_months) {
    reasons.push({
      tone: after.emergency_savings < 0 ? 'danger' : after.emergency_months < 3 ? 'warn' : 'ok',
      text:
        after.emergency_savings < 0
          ? `Your emergency savings (${rm(before.emergency_savings)}) do not cover it; you would need ${rm(-after.emergency_savings)} more.`
          : `Emergency savings would cover ${after.emergency_months} months of spending instead of ${before.emergency_months}.`,
    });
  } else if (state.savings === null && (extra.purchase || extra.loan?.down_payment > 0)) {
    reasons.push({ tone: 'info', text: 'Add your emergency savings to see how much of a cushion would be left.' });
  }
  for (const g of after.goals) {
    const was = before.goals.find((b) => b.id === g.id);
    if (!was) continue;
    if (RANK[g.feasibility] > RANK[was.feasibility]) {
      reasons.push({
        tone: g.feasibility === 'Not Feasible' ? 'danger' : 'warn',
        text: `"${g.title}" goes from ${was.feasibility} to ${g.feasibility}${g.suggested_date ? `; at this pace it is reached around ${dateText(g.suggested_date)} instead of ${dateText(g.target_date)}` : ''}.`,
      });
    } else if (RANK[g.feasibility] < RANK[was.feasibility]) {
      reasons.push({ tone: 'ok', text: `"${g.title}" improves from ${was.feasibility} to ${g.feasibility}.` });
    } else if (g.suggested_date && g.suggested_date !== was.suggested_date) {
      reasons.push({ tone: 'warn', text: `"${g.title}" moves to around ${dateText(g.suggested_date)}${was.suggested_date ? ` (was ${dateText(was.suggested_date)})` : ''}.` });
    }
  }
  const drop = extra.income_drop;
  if (drop) {
    const span = drop.months === 1 ? '1 month' : `${drop.months} months`;
    if (drop.shortfall_monthly === 0) {
      reasons.push({
        tone: 'ok',
        text: `On ${rm(drop.income_after)} a month you would still have ${rm(after.surplus)} left over, so your savings stay untouched.`,
      });
    } else if (drop.runway_months === null) {
      reasons.push({ tone: 'info', text: `Add your emergency savings to see how long they would cover the ${rm(drop.shortfall_monthly)} monthly gap.` });
    } else if (drop.runway_months >= drop.months) {
      reasons.push({
        tone: 'warn',
        text: `Your emergency savings would cover the ${rm(drop.shortfall_monthly)} monthly gap for about ${Math.floor(drop.runway_months)} months, enough for ${span}.`,
      });
    } else {
      reasons.push({
        tone: 'danger',
        text: `Your emergency savings would run out after ${drop.runway_months < 1 ? 'less than a month' : `about ${Math.floor(drop.runway_months)} month${Math.floor(drop.runway_months) === 1 ? '' : 's'}`}, before the ${span} are over.`,
      });
    }
    if (after.goals.length) {
      reasons.push({ tone: 'info', text: 'The goal checks assume the lower income continues. Once it recovers, your goals go back to the "Now" column.' });
    }
  }
  if (extra.paused_goal) reasons.push({ tone: 'info', text: `"${extra.paused_goal.title}" stops taking a share of your surplus while paused.` });
  if (before.health.score !== null && after.health.score !== null && before.health.score !== after.health.score) {
    reasons.push({
      tone: after.health.score < before.health.score ? 'warn' : 'ok',
      text: `Health index ${after.health.score < before.health.score ? 'drops' : 'rises'} from ${before.health.score} to ${after.health.score} (${after.health.band}).`,
    });
  }

  let verdict = 'Manageable';
  const income = state.income;
  if (after.surplus < 0 || (after.dsr !== null && after.dsr > LOAN_CONFIG.bankDsrLimit) || (after.emergency_savings !== null && after.emergency_savings < 0)) {
    verdict = 'Risky';
  } else if (
    (after.dsr !== null && after.dsr > LOAN_CONFIG.dsrBands.healthyMax) ||
    after.surplus < 0.1 * income ||
    (after.emergency_months !== null && after.emergency_months < 3) ||
    after.goals.some((g) => RANK[g.feasibility] > RANK[before.goals.find((b) => b.id === g.id)?.feasibility ?? 'On Track'])
  ) {
    verdict = 'Tight';
  }
  // A gap that savings carry for the whole period is tight, not risky; running out first is risky
  if (drop && drop.shortfall_monthly > 0) {
    const covered = drop.runway_months !== null && drop.runway_months >= drop.months;
    verdict = covered && !(after.dsr !== null && after.dsr > LOAN_CONFIG.bankDsrLimit) ? 'Tight' : 'Risky';
  }
  const order = { danger: 0, warn: 1, info: 2, ok: 3 };
  return { verdict, reasons: reasons.sort((a, b) => order[a.tone] - order[b.tone]) };
}

/** Income left for living after every loan repayment, against the Belanjawanku reference budget. */
function livingCheck(state, after, householdType) {
  const ref = REFERENCE_BUDGETS[householdType] || null;
  if (!ref || !(state.income > 0)) return null;
  // The car budget already includes running a car, so compare with the public-transport one
  const budget = ref.includesCar ? REFERENCE_BUDGETS.single : ref;
  // After an income drop, what is left is worked out on the lower income
  const income = after.income ?? state.income;
  const leftForLiving = round2(income - after.debtMonthly);
  return {
    household: ref.label,
    budget: budget.monthly,
    budget_label: budget.label,
    left_for_living: leftForLiving,
    enough: leftForLiving >= budget.monthly,
    source: budget.source,
  };
}

async function simulateDecision(userId, decision) {
  const situation = await loadSituation(userId);
  const state = baseState(situation);
  const { after: afterState, summary, label } = applyDecision(decision, state);
  const [before, after] = await Promise.all([snapshot(state), snapshot(afterState)]);
  const { verdict, reasons } = explain(before, after, state, summary);
  return {
    decision: { type: decision.type, label, ...summary },
    before,
    after,
    verdict,
    reasons,
    living: livingCheck(state, afterState, situation.householdType),
    notes: situation.profile.notes,
  };
}

/** The health index and the figures behind it, without any decision. */
async function currentHealth(userId) {
  const situation = await loadSituation(userId);
  const state = baseState(situation);
  const now = await snapshot(state);
  return {
    ...now,
    income: state.income,
    outgoings: state.outgoings === null ? null : round2(state.outgoings),
    household_type: situation.householdType,
    living: livingCheck(state, state, situation.householdType),
    notes: situation.profile.notes,
  };
}

/** The user's current state, for callers that try several decisions against it (quote comparison). */
async function loadSituationState(userId) {
  const situation = await loadSituation(userId);
  return { situation, state: baseState(situation) };
}

module.exports = {
  applyDecision,
  explain,
  livingCheck,
  simulateDecision,
  currentHealth,
  loadSituationState,
  snapshotFor: snapshot,
  STRESS_RATE_PCT,
};
