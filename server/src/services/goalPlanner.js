/**
 * FinSight AI - Life goal plan maths (Module 4), shared by the goals routes and the
 * Module 2 advisor so both always see the same required monthly saving and feasibility.
 */

const db = require('../db');
const {
  SAVINGS_CONFIG,
  monthsBetween,
  addMonths,
  requiredMonthlyWithGrowth,
  monthsToReach,
  feasibility,
} = require('./savingsCalc');
const { goldPlanningRate } = require('./goldForecast');

const num = (v, fallback = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};
const round2 = (x) => Math.round(x * 100) / 100;
const hasRate = (r) => r !== null && r !== undefined && r !== '';

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function vehicleRate(vehicle, expectedRate) {
  if (hasRate(expectedRate)) return num(expectedRate);
  return SAVINGS_CONFIG.vehicles[vehicle]?.ratePct ?? 0;
}

/** Gold's planning rate from the ARIMA forecast to the target date, unless the user set their own rate. */
async function goldOverride(vehicle, expectedRate, targetDate) {
  if (vehicle !== 'gold' || hasRate(expectedRate)) return null;
  return goldPlanningRate(Math.max(1, monthsBetween(todayStr(), targetDate)), SAVINGS_CONFIG.vehicles.gold.ratePct);
}

/** Core plan maths for one goal against the user's monthly surplus. */
function computePlan({ target, currentSaved, targetDate, vehicle, expectedRate, surplus }) {
  const today = todayStr();
  const monthsLeft = monthsBetween(today, targetDate);
  const ratePct = vehicleRate(vehicle, expectedRate);
  const requiredMonthly = requiredMonthlyWithGrowth({ target, currentSaved, annualRatePct: ratePct, months: monthsLeft });
  const f = feasibility({ requiredMonthly, monthlySurplus: surplus });

  let suggestedDate = null;
  if (f.status === 'Not Feasible' && surplus > 0) {
    const months = monthsToReach({ target, currentSaved, monthly: surplus, annualRatePct: ratePct });
    if (months !== null) suggestedDate = addMonths(today, months);
  }

  return {
    months_left: monthsLeft,
    rate_pct: ratePct,
    required_monthly: requiredMonthly,
    feasibility: f.status,
    feasibility_ratio: f.ratio,
    suggested_date: suggestedDate,
    progress_pct: target > 0 ? Math.min(100, round2((currentSaved / target) * 100)) : 0,
  };
}

/** computePlan, with gold's forecast rate looked up first. */
async function planGoal({ target, currentSaved, targetDate, vehicle, expectedRate, surplus }) {
  const gold = await goldOverride(vehicle, expectedRate, targetDate);
  const plan = computePlan({
    target,
    currentSaved,
    targetDate,
    vehicle,
    expectedRate: gold ? gold.ratePct : expectedRate,
    surplus,
  });
  if (gold) plan.rate_note = gold.note;
  return plan;
}

/**
 * Shares one monthly surplus across goals, earliest target date first (ties keep input order).
 * Each goal gets what is left after the goals due before it: `available` is that remainder and
 * `allocated` is the part of it the goal needs. items: [{ target_date, required_monthly }].
 */
function allocateSurplus(items, surplus) {
  const order = items.map((g, i) => i).sort((a, b) => String(items[a].target_date).localeCompare(String(items[b].target_date)) || a - b);
  const out = new Array(items.length);
  let left = Math.max(0, num(surplus));
  for (const i of order) {
    const required = Math.max(0, num(items[i].required_monthly));
    const allocated = Math.min(required, left);
    out[i] = { available: round2(left), allocated: round2(allocated), shortfall: round2(required - allocated) };
    left -= allocated;
  }
  return out;
}

const MAX_PLAN_MONTHS = 600;

/**
 * Months until a goal is reached when it saves whatever the earlier goals leave each month.
 * Earlier goals stop taking their share after their own target date, which frees money for this one.
 * earlier: [{ allocated, monthsLeft }]. Returns null if not reached within 50 years.
 */
function monthsToReachShared({ target, currentSaved = 0, annualRatePct = 0, surplus, earlier = [] }) {
  if (currentSaved >= target) return 0;
  const r = annualRatePct / 100 / 12;
  let balance = currentSaved;
  for (let month = 1; month <= MAX_PLAN_MONTHS; month += 1) {
    const taken = earlier.reduce((s, e) => (month <= e.monthsLeft ? s + e.allocated : s), 0);
    balance = balance * (1 + r) + Math.max(0, surplus - taken);
    if (balance >= target - 0.005) return month;
  }
  return null;
}

/**
 * Plans for a set of active goals that share the surplus. Each goal's status is judged against
 * the surplus left after earlier goals, so goals can no longer each claim the whole surplus.
 * goals: [{ target_amount, current_saved, target_date, savings_vehicle, expected_rate }]
 */
async function planActiveGoals(goals, surplus) {
  const own = await Promise.all(
    goals.map((g) =>
      planGoal({
        target: num(g.target_amount),
        currentSaved: num(g.current_saved),
        targetDate: g.target_date,
        vehicle: g.savings_vehicle,
        expectedRate: g.expected_rate,
        surplus,
      })
    )
  );
  const shares = allocateSurplus(
    goals.map((g, i) => ({ target_date: g.target_date, required_monthly: own[i].required_monthly })),
    surplus
  );
  return own.map((plan, i) => {
    const g = goals[i];
    const shared = computePlan({
      target: num(g.target_amount),
      currentSaved: num(g.current_saved),
      targetDate: g.target_date,
      vehicle: g.savings_vehicle,
      expectedRate: plan.rate_pct,
      surplus: shares[i].available,
    });
    // A goal short of money today may still make it once earlier goals finish and free their share
    let status = shared.feasibility;
    let suggestedDate = null;
    let catchesUp = false;
    if (shares[i].shortfall > 0 && surplus > 0) {
      const earlier = goals
        .map((o, j) => ({ j, o }))
        .filter(({ j, o }) => j !== i && (o.target_date < g.target_date || (o.target_date === g.target_date && j < i)))
        .map(({ j }) => ({ allocated: shares[j].allocated, monthsLeft: own[j].months_left }));
      const months = monthsToReachShared({
        target: num(g.target_amount),
        currentSaved: num(g.current_saved),
        annualRatePct: plan.rate_pct,
        surplus,
        earlier,
      });
      if (months !== null && months <= plan.months_left) {
        status = 'At Risk';
        catchesUp = true;
      } else {
        status = 'Not Feasible';
        if (months !== null) suggestedDate = addMonths(todayStr(), months);
      }
    } else if (shares[i].shortfall > 0) {
      status = 'Not Feasible';
    }
    return {
      ...plan,
      feasibility: status,
      catches_up: catchesUp,
      feasibility_ratio: shared.feasibility_ratio,
      suggested_date: suggestedDate,
      available_monthly: shares[i].available,
      allocated_monthly: shares[i].allocated,
      earlier_goals_monthly: round2(Math.max(0, num(surplus)) - shares[i].available),
    };
  });
}

const ACTIVE_GOALS_SQL = `SELECT id, goal_type, title, target_amount, current_saved,
    DATE_FORMAT(target_date, '%Y-%m-%d') AS target_date, savings_vehicle, expected_rate
  FROM life_goals WHERE user_id = ? AND status = 'active' ORDER BY target_date ASC, id ASC`;

/**
 * Surplus left for a goal due on `targetDate` once the user's other active goals due on or
 * before it have taken their share. `excludeId` leaves out the goal being edited.
 */
async function surplusLeftFor(userId, surplus, targetDate, excludeId = null) {
  const [rows] = await db.query(ACTIVE_GOALS_SQL, [userId]);
  const others = rows.filter((g) => g.id !== excludeId);
  if (!others.length) return { available: round2(surplus), earlier_goals_monthly: 0 };
  const plans = await planActiveGoals(others, surplus);
  const earlier = plans.reduce((s, p, i) => (others[i].target_date <= targetDate ? s + p.allocated_monthly : s), 0);
  return { available: round2(Math.max(0, surplus - earlier)), earlier_goals_monthly: round2(earlier) };
}

/** Active goals with live plans, plus totals against the surplus (used by the advisor). */
async function getActiveGoalPlans(userId, surplus) {
  const [rows] = await db.query(ACTIVE_GOALS_SQL, [userId]);
  const plans = await planActiveGoals(rows, surplus);
  const goals = rows.map((g, i) => ({
    title: g.title,
    goal_type: g.goal_type,
    target_amount: num(g.target_amount),
    current_saved: num(g.current_saved),
    target_date: g.target_date,
    vehicle: SAVINGS_CONFIG.vehicles[g.savings_vehicle]?.label || g.savings_vehicle,
    ...plans[i],
  }));
  const totalRequired = round2(goals.reduce((s, g) => s + g.required_monthly, 0));
  const overall = feasibility({ requiredMonthly: totalRequired, monthlySurplus: surplus });
  return { goals, total_required_monthly: totalRequired, overall_feasibility: overallStatus(goals), overall_ratio: overall.ratio };
}

/** The weakest status across goals: one unreachable goal makes the whole plan Not Feasible. */
function overallStatus(plans) {
  const statuses = plans.map((p) => p.feasibility);
  if (statuses.includes('Not Feasible')) return 'Not Feasible';
  if (statuses.includes('At Risk')) return 'At Risk';
  return 'On Track';
}

module.exports = {
  todayStr,
  vehicleRate,
  goldOverride,
  computePlan,
  planGoal,
  allocateSurplus,
  monthsToReachShared,
  overallStatus,
  planActiveGoals,
  surplusLeftFor,
  getActiveGoalPlans,
};
