const test = require('node:test');
const assert = require('node:assert/strict');
const { compareMonths } = require('../src/services/monthlyReview');

const now = [
  { category: 'Food & Dining', total: '650.00' },
  { category: 'Transport', total: '180.00' },
  { category: 'Shopping', total: '95.00' },
  { category: 'Income', total: '3500.00' },
];
const before = [
  { category: 'Food & Dining', total: '480.00' },
  { category: 'Transport', total: '190.00' },
  { category: 'Utilities', total: '140.00' },
  { category: 'Income', total: '3500.00' },
];

test('spending and money in compared, Income kept out of spending', () => {
  const r = compareMonths({ year: 2026, month: 10, now, before });
  assert.deepEqual(r.spend, { now: 925, before: 810, change: 115, pct: 14.2 });
  assert.equal(r.inflow.change, 0);
  assert.deepEqual(r.previous, { year: 2026, month: 9 });
});

test('the categories that moved most, ignoring changes under RM 20', () => {
  const r = compareMonths({ year: 2026, month: 10, now, before });
  assert.deepEqual(r.movers.map((m) => [m.category, m.change]), [['Food & Dining', 170], ['Utilities', -140], ['Shopping', 95]]);
  assert.ok(!r.movers.some((m) => m.category === 'Transport')); // only RM 10 apart
  assert.match(r.points[0].text, /RM 115 more than in September: RM 925 against RM 810/);
  assert.match(r.points.find((p) => p.text.startsWith('Shopping')).text, /new this month/);
});

test('January compares with December of the year before', () => {
  assert.deepEqual(compareMonths({ year: 2027, month: 1, now, before }).previous, { year: 2026, month: 12 });
});

test('a first month has nothing to compare, but still reports unusual payments', () => {
  const r = compareMonths({ year: 2026, month: 7, now, before: [], anomaliesNow: 2 });
  assert.equal(r.previous, null);
  assert.equal(r.points.length, 1);
  assert.match(r.points[0].text, /^2 payments look unusually large/);
});
