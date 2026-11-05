const test = require('node:test');
const assert = require('node:assert/strict');
const {
  requiredMonthlySimple,
  requiredMonthlyWithGrowth,
  futureValue,
  monthsToReach,
  feasibility,
  monthsBetween,
  addMonths,
} = require('../src/services/savingsCalc');

test('TC08: Haji M40 RM23,500 over 60 months, piggybank, RM0 saved -> RM391.67', () => {
  assert.equal(requiredMonthlySimple({ target: 23500, currentSaved: 0, months: 60 }), 391.67);
  // 0% vehicle through the growth formula gives the same answer
  assert.equal(requiredMonthlyWithGrowth({ target: 23500, annualRatePct: 0, months: 60 }), 391.67);
});

test('TC09: needs RM1,500/month vs RM800 surplus -> Not Feasible', () => {
  const f = feasibility({ requiredMonthly: 1500, monthlySurplus: 800 });
  assert.equal(f.status, 'Not Feasible');
  assert.equal(f.ratio, 1.88);
  // Adjusted timeline when saving the whole surplus
  const months = monthsToReach({ target: 1500 * 24, monthly: 800 });
  assert.equal(months, 45);
});

test('feasibility bands', () => {
  assert.equal(feasibility({ requiredMonthly: 400, monthlySurplus: 800 }).status, 'On Track');
  assert.equal(feasibility({ requiredMonthly: 800, monthlySurplus: 800 }).status, 'At Risk');
  assert.equal(feasibility({ requiredMonthly: 100, monthlySurplus: 0 }).status, 'Not Feasible');
  assert.equal(feasibility({ requiredMonthly: 0, monthlySurplus: 0 }).status, 'On Track');
});

test('PMT and FV are inverses', () => {
  const pmt = requiredMonthlyWithGrowth({ target: 50000, currentSaved: 5000, annualRatePct: 5, months: 48 });
  const fv = futureValue({ principal: 5000, monthly: pmt, annualRatePct: 5, months: 48 });
  assert.ok(Math.abs(fv - 50000) < 1, `fv ${fv}`);
  assert.ok(pmt < requiredMonthlySimple({ target: 50000, currentSaved: 5000, months: 48 }));
});

test('already saved enough -> 0 required', () => {
  assert.equal(requiredMonthlySimple({ target: 1000, currentSaved: 1500, months: 12 }), 0);
  assert.equal(requiredMonthlyWithGrowth({ target: 1000, currentSaved: 1500, annualRatePct: 4, months: 12 }), 0);
});

test('date helpers use plain YYYY-MM-DD maths', () => {
  assert.equal(monthsBetween('2026-10-27', '2031-10-27'), 60);
  assert.equal(monthsBetween('2026-10-27', '2026-11-28'), 2);
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2026-10-27', 45), '2030-07-27');
});

test('negative rate (cautious gold forecast): PMT still works, unreachable target -> null', () => {
  const pmt = requiredMonthlyWithGrowth({ target: 12000, currentSaved: 0, annualRatePct: -5, months: 12 });
  assert.ok(pmt > 1000, `pmt ${pmt}`); // must save more than the no-growth RM1,000 when prices fall
  assert.ok(Math.abs(futureValue({ monthly: pmt, annualRatePct: -5, months: 12 }) - 12000) < 1);
  // Losing value faster than RM10/month can top up: never reaches the target
  assert.equal(monthsToReach({ target: 100000, currentSaved: 0, monthly: 10, annualRatePct: -5 }), null);
});
