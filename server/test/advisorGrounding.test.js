const test = require('node:test');
const assert = require('node:assert/strict');
const { extractFigures, validateReply } = require('../src/services/advisorGrounding');

test('extracts RM amounts (with commas, k and juta) and percentages', () => {
  const f = extractFigures('You have **RM 2,623.91** left, about RM2.6k, DSR 18.8% and RM 1.2 juta');
  assert.deepEqual(
    f.map((x) => [x.kind, x.value]),
    [['money', 2623.91], ['money', 2600], ['money', 1200000], ['percent', 18.8]]
  );
});

const context = '- Average monthly surplus: RM 2,623.91\n- Income: RM 4,500.00\n- Goals need RM 3,203.90 a month\n- DSR 18.81%';

test('figures from the context, rounded, count as grounded', () => {
  const v = validateReply('Your surplus is RM 2,624 (about RM2.6k) on income of RM 4,500. DSR is 18.8%.', context);
  assert.equal(v.unsupported.length, 0);
  assert.equal(v.grounded, 4);
});

test('one step of arithmetic on known figures is derived; yearly versions are grounded', () => {
  const v = validateReply('Goals need RM 579.99 more than your surplus, or RM 31,486.92 a year of surplus.', context);
  assert.equal(v.derived, 1); // 3,203.90 - 2,623.91
  assert.equal(v.grounded, 1); // 2,623.91 x 12
});

test('a made-up figure is unsupported; rules of thumb are allowed', () => {
  const v = validateReply('Keep 20% for savings (50/30/20). You could save RM 987.65 a month.', context);
  assert.deepEqual(v.unsupported.map((f) => f.text), ['RM 987.65']);
  assert.equal(v.grounded, 1);
});
