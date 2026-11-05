const test = require('node:test');
const assert = require('node:assert/strict');
const { computeHealthIndex, piecewise } = require('../src/services/healthIndex');
const { simulatePayoff, planPayoff } = require('../src/services/debtPlanner');
const { calculateZakat } = require('../src/services/zakat');
const { applyDecision, explain, livingCheck } = require('../src/services/decisionSimulator');

test('piecewise scoring', () => {
  assert.equal(piecewise(0.5, [[0.5, 25], [1, 0]]), 25);
  assert.equal(piecewise(0.75, [[0.5, 25], [1, 0]]), 12.5);
  assert.equal(piecewise(2, [[0.5, 25], [1, 0]]), 0);
});

test('health index: all four parts, full marks', () => {
  const h = computeHealthIndex({ income: 5000, monthlyOutgoings: 2000, debtMonthly: 500, emergencySavings: 15000, surplus: 3000, goals: [{ feasibility: 'On Track' }] });
  assert.equal(h.score, 100);
  assert.equal(h.band, 'Healthy');
  assert.deepEqual(h.missing, []);
});

test('health index: stretched finances are Vulnerable, and each part says why', () => {
  const h = computeHealthIndex({ income: 3000, monthlyOutgoings: 2900, debtMonthly: 1800, emergencySavings: 500, surplus: 100, goals: [{ feasibility: 'Not Feasible' }] });
  assert.equal(h.band, 'Vulnerable');
  assert.ok(h.score < 40, `score ${h.score}`);
  const borrow = h.pillars.find((p) => p.key === 'borrow');
  assert.equal(borrow.value, 60);
  assert.equal(borrow.score, 5);
  assert.match(borrow.reason, /60% of your income/);
});

test('health index: missing savings is left out and the rest scaled to 100', () => {
  const h = computeHealthIndex({ income: 5000, monthlyOutgoings: 2500, debtMonthly: 0, emergencySavings: null, surplus: 2500, goals: [] });
  assert.equal(h.pillars.length, 3);
  assert.deepEqual(h.missing, ['emergency_savings']);
  assert.equal(h.score, Math.round(((25 + 25 + 12.5) / 75) * 100));
  assert.equal(computeHealthIndex({ income: 0 }).score, null);
});

test('debt payoff: avalanche pays less interest, snowball clears the small debt first', () => {
  const debts = [
    { id: 1, label: 'Credit card', balance: 6000, annual_rate: 18, monthly_amount: 200 },
    { id: 2, label: 'PTPTN', balance: 1500, annual_rate: 1, monthly_amount: 100 },
  ];
  const plan = planPayoff(debts.map((d) => ({ ...d, kind: 'credit_card' })), 300);
  const { avalanche, snowball, minimum } = plan.strategies;
  assert.ok(avalanche.total_interest < snowball.total_interest, 'avalanche should cost less');
  assert.equal(snowball.debts[0].label, 'PTPTN');
  assert.ok(snowball.debts[0].paid_off_month < avalanche.debts.find((d) => d.label === 'PTPTN').paid_off_month);
  assert.ok(minimum.total_interest > avalanche.total_interest && minimum.months > avalanche.months);
  assert.equal(plan.comparison.interest_saved_by_avalanche, Math.round((snowball.total_interest - avalanche.total_interest) * 100) / 100);
});

test('debt payoff: one debt at 0% clears in balance / payment months', () => {
  const r = simulatePayoff([{ id: 1, label: 'Loan', balance: 1200, annual_rate: 0, monthly_amount: 100 }], { strategy: 'avalanche' });
  assert.equal(r.months, 12);
  assert.equal(r.total_interest, 0);
});

test('debt payoff: debts without a balance or rate are listed as left out; payments below interest are flagged', () => {
  const plan = planPayoff([
    { id: 1, label: 'Car', kind: 'car_loan', balance: null, annual_rate: 3, monthly_amount: 800 },
    { id: 2, label: 'Card', kind: 'credit_card', balance: 10000, annual_rate: 18, monthly_amount: 100 },
  ]);
  assert.deepEqual(plan.excluded, [{ label: 'Car', reason: 'no balance left entered' }]);
  assert.deepEqual(plan.stuck, ['Card']); // RM 150 interest a month, RM 100 paid
});

test('zakat: 2.5% above the nisab of 85 g gold, nothing below it', () => {
  const z = calculateZakat({ savings: 60000, annualIncome: 30000, goldPricePerGram: 500 });
  assert.equal(z.nisab, 42500);
  assert.equal(z.savings.zakat, 1500);
  assert.equal(z.income.zakat, 0); // RM 30,000 is under the nisab
  const official = calculateZakat({ savings: 40000, annualIncome: 0, goldPricePerGram: 500, nisabOverride: 35000 });
  assert.equal(official.savings.zakat, 1000);
  assert.equal(calculateZakat({ savings: 60000, goldPricePerGram: 500, heldOneYear: false }).savings.zakat, 0);
});

const state = { income: 5000, outgoings: 2500, debtMonthly: 0, surplus: 2500, savings: 20000, goals: [] };

test('simulator: a car loan raises DSR, lowers the surplus and takes the down payment from savings', () => {
  const { after, summary } = applyDecision({ type: 'loan', loan_type: 'car', item_price: 80000, down_payment: 8000, interest_rate: 5.5, tenure_years: 9 }, state);
  assert.equal(summary.loan.monthly, 846.72); // TC05b
  assert.equal(summary.loan.interest_method, 'reducing');
  assert.equal(Math.round(after.surplus * 100) / 100, 1653.28);
  assert.equal(after.savings, 12000);
  assert.equal(summary.stress, undefined); // car hire purchase is fixed-rate, so no rate stress test
  const flat = applyDecision({ type: 'loan', loan_type: 'car', item_price: 80000, down_payment: 8000, interest_rate: 3, interest_method: 'flat', tenure_years: 9 }, state);
  assert.equal(flat.summary.loan.monthly, 846.67);
});

test('simulator: a house loan gets a +2 point rate stress test', () => {
  const { summary } = applyDecision({ type: 'loan', loan_type: 'house', item_price: 400000, down_payment: 40000, interest_rate: 4.5, tenure_years: 30 }, state);
  assert.equal(summary.loan.monthly, 1824.07); // TC05c
  assert.equal(summary.stress.rate_pct, 6.5);
  assert.ok(summary.stress.monthly > 2200 && summary.stress.monthly < 2300, `stressed ${summary.stress.monthly}`);
});

test('simulator: bad input is rejected', () => {
  assert.throws(() => applyDecision({ type: 'loan', loan_type: 'boat' }, state), RangeError);
  assert.throws(() => applyDecision({ type: 'purchase', amount: 0 }, state), RangeError);
  assert.throws(() => applyDecision({ type: 'pause_goal', goal_id: 99 }, state), RangeError);
  assert.throws(() => applyDecision({ type: 'lottery' }, state), RangeError);
});

test('simulator verdict: going short each month is Risky and is explained first', () => {
  const snap = (surplus, dsr, months, health) => ({ surplus, dsr, dsr_band: 'Healthy', emergency_months: months, emergency_savings: months * 2500, goals: [], health: { score: health, band: 'Coping' } });
  const { verdict, reasons } = explain(snap(500, 10, 8, 70), snap(-300, 25, 8, 50), state, {});
  assert.equal(verdict, 'Risky');
  assert.equal(reasons[0].tone, 'danger');
  assert.match(reasons[0].text, /RM 300 short every month/);
});

test('simulator: losing all income for 3 months is carried by savings for 8 months, so it is Tight', () => {
  // income 5,000, outgoings 2,500, surplus 2,500, savings 20,000
  const { after, summary, label } = applyDecision({ type: 'income_drop', drop_pct: 100, months: 3 }, state);
  assert.equal(after.income, 0);
  assert.equal(summary.income_drop.shortfall_monthly, 2500);
  assert.equal(summary.income_drop.runway_months, 8);
  assert.equal(after.savings, 12500);
  assert.equal(label, 'no income for 3 months');
  const snap = (surplus, savings) => ({ surplus, dsr: null, dsr_band: null, emergency_months: savings / 2500, emergency_savings: savings, goals: [], health: { score: null } });
  const { verdict, reasons } = explain(snap(2500, 20000), snap(-2500, 12500), state, summary);
  assert.equal(verdict, 'Tight');
  assert.ok(reasons.some((r) => /cover the RM 2,500 monthly gap for about 8 months, enough for 3 months/.test(r.text)));
});

test('simulator: savings that run out before the income recovers are Risky; a small drop leaves savings untouched', () => {
  const long = applyDecision({ type: 'income_drop', drop_pct: 100, months: 12 }, state);
  const snap = (surplus, savings) => ({ surplus, dsr: null, dsr_band: null, emergency_months: savings / 2500, emergency_savings: savings, goals: [], health: { score: null } });
  const risky = explain(snap(2500, 20000), snap(-2500, long.after.savings), state, long.summary);
  assert.equal(risky.verdict, 'Risky');
  assert.ok(risky.reasons.some((r) => r.tone === 'danger' && /run out after about 8 months, before the 12 months are over/.test(r.text)));

  const small = applyDecision({ type: 'income_drop', drop_pct: 20, months: 6 }, state);
  assert.equal(small.after.income, 4000);
  assert.equal(small.after.surplus, 1500);
  assert.equal(small.summary.income_drop.shortfall_monthly, 0);
  assert.equal(small.after.savings, 20000);

  assert.throws(() => applyDecision({ type: 'income_drop', drop_pct: 0, months: 3 }, state), RangeError);
  assert.throws(() => applyDecision({ type: 'income_drop', drop_pct: 50, months: 30 }, state), RangeError);
  assert.throws(() => applyDecision({ type: 'income_drop', drop_pct: 50, months: 3 }, { ...state, income: 0 }), RangeError);
});

test('protection: emergency months, and a needs-based gap only when there are dependants', () => {
  const { protectionCheck } = require('../src/services/protection');
  const p = protectionCheck({ monthlyIncome: 4000, monthlyOutgoings: 2000, emergencySavings: 5000, debtsOutstanding: 20000, dependants: 2, existingCover: 100000, supportYears: 10 });
  assert.deepEqual(p.emergency, { savings: 5000, months: 2.5, target_3: 6000, target_6: 12000, short_of_3: 1000 });
  assert.equal(p.gap.need, 4000 * 12 * 10 + 20000); // 500,000
  assert.equal(p.gap.gap, 500000 - 5000 - 100000);
  assert.equal(protectionCheck({ monthlyIncome: 4000, monthlyOutgoings: 2000, emergencySavings: null, dependants: 0 }).gap, null);
  assert.equal(protectionCheck({ monthlyIncome: 4000, monthlyOutgoings: 2000, emergencySavings: null }).emergency, null);
});

test('living check uses the Belanjawanku public-transport budget, even for car owners', () => {
  const r = livingCheck({ income: 4000 }, { debtMonthly: 1500 }, 'single_car');
  assert.equal(r.budget, 1970);
  assert.equal(r.left_for_living, 2500);
  assert.equal(r.enough, true);
  assert.equal(livingCheck({ income: 4000 }, { debtMonthly: 0 }, null), null);
  // An income drop is checked on the lower income
  const drop = livingCheck({ income: 4000 }, { income: 2000, debtMonthly: 500 }, 'single');
  assert.equal(drop.left_for_living, 1500);
  assert.equal(drop.enough, false);
});
