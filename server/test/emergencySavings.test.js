const test = require('node:test');
const assert = require('node:assert/strict');
const { validateEntry, applyEntry, todayMY } = require('../src/services/emergencySavings');

test('savings: add, take out and set the total', () => {
  assert.equal(applyEntry(null, { kind: 'add', amount: 500 }), 500); // first deposit, nothing recorded before
  assert.equal(applyEntry(1200.5, { kind: 'add', amount: 99.5 }), 1300);
  assert.equal(applyEntry(1300, { kind: 'withdraw', amount: 300 }), 1000);
  assert.equal(applyEntry(1000, { kind: 'set', amount: 2500 }), 2500);
  assert.equal(applyEntry(1000, { kind: 'set', amount: 0 }), 0);
});

test('savings: cannot take out more than is recorded', () => {
  assert.throws(() => applyEntry(200, { kind: 'withdraw', amount: 250 }), /only have RM 200.00 recorded/);
  assert.throws(() => applyEntry(null, { kind: 'withdraw', amount: 1 }), RangeError);
  assert.equal(applyEntry(200, { kind: 'withdraw', amount: 200 }), 0);
});

test('savings: input is checked', () => {
  assert.deepEqual(validateEntry({ kind: 'add', amount: '150.255', note: '  bonus  ' }), { kind: 'add', amount: 150.26, note: 'bonus', date: todayMY() });
  assert.throws(() => validateEntry({ kind: 'spend', amount: 10 }), RangeError);
  assert.throws(() => validateEntry({ kind: 'add', amount: 0 }), RangeError);
  assert.throws(() => validateEntry({ kind: 'add', amount: -5 }), RangeError);
  assert.throws(() => validateEntry({ kind: 'add', amount: 'abc' }), RangeError);
  assert.throws(() => validateEntry({ kind: 'add', amount: 10, date: '2999-01-01' }), /future/);
  assert.throws(() => validateEntry({ kind: 'add', amount: 10, date: '5/11/2026' }), RangeError);
  assert.equal(validateEntry({ kind: 'set', amount: 0 }).amount, 0);
  assert.equal(validateEntry({ kind: 'add', amount: 1, note: 'x'.repeat(200) }).note.length, 80);
});
