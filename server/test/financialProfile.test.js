const test = require('node:test');
const assert = require('node:assert/strict');
const { buildProfile, ownNameTokens, isOwnSavingsMove, summariseCommitments } = require('../src/services/financialProfile');
const { allocateSurplus, monthsToReachShared } = require('../src/services/goalPlanner');

const txn = (date, amount, category, description = 'SHOP') => ({ date, amount, category, description });

test('own name tokens skip bin/binti and common name parts', () => {
  assert.deepEqual(ownNameTokens('Muhammad Haziq Danish Bin Haidil Amir'), ['haziq', 'danish']);
  assert.deepEqual(ownNameTokens('Siti Aisyah binti Ahmad'), ['aisyah']);
  // Names shorter than 4 letters are too likely to match other text
  assert.deepEqual(ownNameTokens('Tan Wei Ming'), ['ming']);
});

test('transfers to savings providers or to your own name are not spending', () => {
  const tokens = ownNameTokens('Muhammad Haziq Danish Bin Haidil Amir');
  assert.equal(isOwnSavingsMove(txn('2026-09-02', 200, 'Others', 'IBG TABUNG HAJI'), tokens), true);
  assert.equal(isOwnSavingsMove(txn('2026-09-02', 300, 'Personal Transfer', 'DUITNOW TO HAZIQ DANISH'), tokens), true);
  // A sibling sharing the father's name is still a transfer to someone else
  assert.equal(isOwnSavingsMove(txn('2026-09-02', 50, 'Personal Transfer', 'DUITNOW TO AINA BINTI HAIDIL AMIR'), tokens), false);
  assert.equal(isOwnSavingsMove(txn('2026-09-02', 5000, 'Income', 'SALARY ASB'), tokens), false);
});

test('commitment totals: debt counts toward DSR, takaful does not; outside-statement ones are deducted', () => {
  const s = summariseCommitments([
    { kind: 'car_loan', monthly_amount: 846.67, paid_from_statement: true },
    { kind: 'ptptn', monthly_amount: 150, paid_from_statement: false },
    { kind: 'insurance', monthly_amount: 120, paid_from_statement: false },
  ]);
  assert.deepEqual(s, { count: 3, monthly_total: 1116.67, debt_monthly: 996.67, outside_statement_monthly: 270 });
});

test('profile: averages full months, drops a partly uploaded latest month, leaves savings moves out', () => {
  const txns = [
    txn('2026-07-28', 3000, 'Income', 'SALARY'),
    txn('2026-07-10', 1200, 'Groceries'),
    txn('2026-08-28', 3000, 'Income', 'SALARY'),
    txn('2026-08-10', 1600, 'Groceries'),
    txn('2026-08-15', 500, 'Others', 'ASNB ONLINE'),
    txn('2026-09-05', 90, 'Food & Dining'), // September stops on the 5th: partly uploaded
  ];
  const p = buildProfile({ declaredIncome: 4000, fullName: 'Ali bin Abu', txns, commitments: [{ kind: 'ptptn', monthly_amount: 100, paid_from_statement: false }] });
  assert.equal(p.spending.partial_month_excluded, '2026-09');
  assert.deepEqual(p.spending.months, ['2026-07', '2026-08']);
  assert.equal(p.spending.avg_monthly, 1400); // ASNB RM500 is saving, not spending
  assert.equal(p.spending.savings_moves_avg, 250);
  assert.equal(p.income.used, 4000);
  assert.equal(p.income.source, 'declared');
  assert.equal(p.income.observed_median, 3000);
  assert.ok(p.notes.some((n) => n.includes('RM 3000.00')), 'notes the gap between declared and statement income');
  assert.equal(p.monthly_surplus, 4000 - 1400 - 100);
  assert.equal(p.dsr_now, 2.5);
});

test('profile: with no statements, every commitment is deducted and income can come from nowhere else', () => {
  const p = buildProfile({ declaredIncome: 3000, commitments: [{ kind: 'car_loan', monthly_amount: 500, paid_from_statement: true }] });
  assert.equal(p.spending.avg_monthly, null);
  assert.equal(p.monthly_surplus, 2500);
});

test('profile: no declared income falls back to income seen in statements', () => {
  const p = buildProfile({ declaredIncome: 0, txns: [txn('2026-08-25', 2800, 'Income'), txn('2026-08-26', 800, 'Shopping')] });
  assert.equal(p.income.source, 'statements');
  assert.equal(p.monthly_surplus, 2000);
});

test('goal allocation: earlier goals take their share first, later goals get what is left', () => {
  const shares = allocateSurplus(
    [
      { target_date: '2030-01-01', required_monthly: 600 }, // house, due last
      { target_date: '2027-06-01', required_monthly: 500 }, // kahwin, due first
      { target_date: '2028-01-01', required_monthly: 400 }, // haji
    ],
    1000
  );
  assert.deepEqual(shares[1], { available: 1000, allocated: 500, shortfall: 0 });
  assert.deepEqual(shares[2], { available: 500, allocated: 400, shortfall: 0 });
  assert.deepEqual(shares[0], { available: 100, allocated: 100, shortfall: 500 });
});

test('shared date: a later goal speeds up once an earlier goal stops taking its share', () => {
  // RM1,000 surplus; an earlier goal takes all of it for 12 months, then this goal gets the full RM1,000
  assert.equal(monthsToReachShared({ target: 6000, surplus: 1000, earlier: [{ allocated: 1000, monthsLeft: 12 }] }), 18);
  // With RM400 taken for 12 months: 600 x 12 = 7,200 already covers 6,000 by month 10
  assert.equal(monthsToReachShared({ target: 6000, surplus: 1000, earlier: [{ allocated: 400, monthsLeft: 12 }] }), 10);
  assert.equal(monthsToReachShared({ target: 6000, surplus: 0 }), null);
});

test('goal allocation: a negative surplus leaves nothing for any goal', () => {
  const [s] = allocateSurplus([{ target_date: '2027-01-01', required_monthly: 300 }], -200);
  assert.deepEqual(s, { available: 0, allocated: 0, shortfall: 300 });
});
