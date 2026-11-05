const test = require('node:test');
const assert = require('node:assert/strict');
const { matchDeposits } = require('../src/services/goalDeposits');

const goals = [
  { id: 1, title: 'Haji 2031', savings_vehicle: 'tabung_haji', target_date: '2031-06-01', created_on: '2026-01-10' },
  { id: 2, title: 'Umrah', savings_vehicle: 'tabung_haji', target_date: '2028-03-01', created_on: '2026-08-01' },
  { id: 3, title: 'House deposit', savings_vehicle: 'asb', target_date: '2030-01-01', created_on: '2026-01-10' },
];
const txn = (id, txn_date, description, amount = 200) => ({ id, txn_date, description, amount });

test('a Tabung Haji transfer is offered to Tabung Haji goals, the one due first listed first', () => {
  const [s] = matchDeposits(goals, [txn(10, '2026-09-03', 'IBG TRANSFER LEMBAGA TABUNG HAJI')], new Set());
  assert.equal(s.vehicle, 'tabung_haji');
  assert.deepEqual(s.goals.map((g) => g.id), [2, 1]);
});

test('an ASNB transfer goes to the ASB goal only', () => {
  const [s] = matchDeposits(goals, [txn(11, '2026-09-04', 'FPX ASNB MYASNB TOPUP')], new Set());
  assert.deepEqual(s.goals.map((g) => g.id), [3]);
});

test('money moved before a goal existed is not offered to it', () => {
  const [s] = matchDeposits(goals, [txn(12, '2026-03-01', 'TABUNG HAJI')], new Set());
  assert.deepEqual(s.goals.map((g) => g.id), [1]); // Umrah was created in August
});

test('ordinary spending, answered transfers and vehicles without a goal are skipped', () => {
  const out = matchDeposits(
    goals.filter((g) => g.savings_vehicle !== 'asb'),
    [txn(13, '2026-09-05', 'MYDEBIT TESCO'), txn(14, '2026-09-06', 'TABUNG HAJI'), txn(15, '2026-09-07', 'ASB TOPUP')],
    new Set([14])
  );
  assert.equal(out.length, 0);
});

test('newest first', () => {
  const out = matchDeposits(goals, [txn(16, '2026-08-01', 'ASNB'), txn(17, '2026-10-01', 'ASNB')], new Set());
  assert.deepEqual(out.map((s) => s.transaction_id), [17, 16]);
});
