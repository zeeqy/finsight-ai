const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateLoan,
  calculateDsr,
  dsrBand,
  reducingBalanceLoan,
  flatRateLoan,
  maxLoanForInstalment,
  minTenureForInstalment,
  effectiveFromFlat,
  LOAN_CONFIG,
} = require('../src/services/loanCalc');

test('TC05b: car RM80,000, 10% down, 5.5% effective (reducing balance), 9 yrs', () => {
  // New hire-purchase agreements from 1 Jun 2026 use an effective rate on a reducing balance
  const r = calculateLoan({ loanType: 'car', itemPrice: 80000, downPayment: 8000, annualRatePct: 5.5, years: 9 });
  assert.equal(r.interestMethod, 'reducing');
  assert.equal(r.loanAmount, 72000);
  assert.equal(r.monthly, 846.72);
  assert.equal(r.totalPayment, 91445.74);
  assert.equal(r.totalInterest, 19445.74);
});

test('TC05b-flat: the same car quoted at 3% flat (agreements before 1 Jun 2026)', () => {
  const r = calculateLoan({ loanType: 'car', itemPrice: 80000, downPayment: 8000, annualRatePct: 3, years: 9, method: 'flat' });
  assert.equal(r.interestMethod, 'flat');
  assert.equal(r.totalInterest, 19440);
  assert.equal(r.totalPayment, 91440);
  assert.equal(r.monthly, 846.67);
  assert.equal(r.effectiveRatePct, 5.5); // what that flat rate really costs
});

test('a flat rate converts to the effective rate with the same instalment', () => {
  assert.ok(Math.abs(effectiveFromFlat(3, 9) - 5.4985) < 0.001);
  assert.ok(Math.abs(effectiveFromFlat(6.5, 5) - 11.6805) < 0.001);
  assert.equal(effectiveFromFlat(0, 5), 0);
  // default example rates are those effective equals, not guesses
  assert.equal(LOAN_CONFIG.loanTypes.car.defaultRatePct, 5.5);
  assert.equal(LOAN_CONFIG.loanTypes.personal.defaultRatePct, 11.68);
});

test('house loans cannot be entered as flat rate', () => {
  assert.throws(() => calculateLoan({ loanType: 'house', itemPrice: 400000, downPayment: 40000, annualRatePct: 4.5, years: 30, method: 'flat' }), /reducing balance/);
});

test('TC05c/TC10: house RM400,000, 10% down, 4.5% reducing, 30 yrs', () => {
  const r = calculateLoan({ loanType: 'house', itemPrice: 400000, downPayment: 40000, annualRatePct: 4.5, years: 30 });
  assert.equal(r.interestMethod, 'reducing');
  assert.equal(r.loanAmount, 360000);
  assert.equal(r.monthly, 1824.07);
  assert.ok(Math.abs(r.totalPayment - 656664) < 2, `total ${r.totalPayment}`);
  assert.ok(Math.abs(r.totalInterest - 296664) < 2, `interest ${r.totalInterest}`);

  const dsr = calculateDsr({ netIncome: 6000, existingCommitments: 1000, newInstalment: r.monthly });
  assert.equal(dsr, 47.07);
  assert.equal(dsrBand(dsr), 'Moderate');
});

test('TC05: income RM5,000, commitments RM2,500, no new loan -> 50% Moderate', () => {
  const dsr = calculateDsr({ netIncome: 5000, existingCommitments: 2500 });
  assert.equal(dsr, 50);
  assert.equal(dsrBand(dsr), 'Moderate');
});

test('DSR band boundaries', () => {
  assert.equal(dsrBand(40), 'Healthy');
  assert.equal(dsrBand(40.01), 'Moderate');
  assert.equal(dsrBand(60), 'Moderate');
  assert.equal(dsrBand(60.01), 'High');
});

test('zero interest rate falls back to simple division', () => {
  assert.equal(reducingBalanceLoan({ loanAmount: 12000, annualRatePct: 0, years: 1 }).monthly, 1000);
  assert.equal(flatRateLoan({ loanAmount: 12000, annualRatePct: 0, years: 1 }).totalInterest, 0);
});

test('personal loan uses loan amount directly, no down payment; effective rate by default, flat on request', () => {
  const r = calculateLoan({ loanType: 'personal', loanAmount: 20000, annualRatePct: 6, years: 5 });
  assert.equal(r.interestMethod, 'reducing');
  assert.equal(r.downPayment, 0);
  assert.equal(r.monthly, 386.66);
  const flat = calculateLoan({ loanType: 'personal', loanAmount: 20000, annualRatePct: 6, years: 5, method: 'flat' });
  assert.equal(flat.totalInterest, 6000);
});

test('schedules end at zero balance and sum to totals', () => {
  for (const [loanType, itemPrice, dp, rate, years] of [
    ['car', 80000, 8000, 3, 9],
    ['house', 400000, 40000, 4.5, 30],
  ]) {
    const r = calculateLoan({ loanType, itemPrice, downPayment: dp, annualRatePct: rate, years });
    assert.equal(r.schedule.length, years);
    assert.equal(r.schedule.at(-1).remaining_balance, 0);
    const principal = r.schedule.reduce((s, y) => s + y.principal_paid, 0);
    const interest = r.schedule.reduce((s, y) => s + y.interest_paid, 0);
    assert.ok(Math.abs(principal - r.loanAmount) < 1);
    assert.ok(Math.abs(interest - r.totalInterest) < 1);
  }
});

test('inverse solvers agree with forward formulas', () => {
  const maxLoan = maxLoanForInstalment({ maxMonthly: 846.67, annualRatePct: 3, years: 9, method: 'flat' });
  assert.ok(Math.abs(maxLoan - 72000) < 1);
  const maxHouse = maxLoanForInstalment({ maxMonthly: 1824.07, annualRatePct: 4.5, years: 30, method: 'reducing' });
  assert.ok(Math.abs(maxHouse - 360000) < 5);
  assert.equal(minTenureForInstalment({ loanAmount: 72000, maxMonthly: 900, annualRatePct: 3, method: 'flat', maxYears: 9 }), 9);
  assert.equal(minTenureForInstalment({ loanAmount: 72000, maxMonthly: 100, annualRatePct: 3, method: 'flat', maxYears: 9 }), null);
});

test('invalid inputs throw', () => {
  assert.throws(() => calculateLoan({ loanType: 'car', itemPrice: 50000, downPayment: 60000, annualRatePct: 3, years: 5 }));
  assert.throws(() => calculateLoan({ loanType: 'car', itemPrice: 50000, downPayment: 0, annualRatePct: 3, years: 0 }));
  assert.throws(() => calculateDsr({ netIncome: 0 }));
});
