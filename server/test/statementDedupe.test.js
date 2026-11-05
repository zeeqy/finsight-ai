const test = require('node:test');
const assert = require('node:assert/strict');
const { matchStored, mainMonth } = require('../src/services/statementDedupe');

const stored = [
  { id: 1, txn_date: '2026-07-03', description: 'QR PAYMENT KEDAI MAKAN 123456', amount: '12.50', category: 'Food & Dining' },
  { id: 2, txn_date: '2026-07-03', description: 'QR PAYMENT KEDAI MAKAN 123457', amount: '12.50', category: 'Food & Dining' },
  { id: 3, txn_date: '2026-07-05', description: 'SALARY JUL', amount: '3000.00', category: 'Income' },
];

test('same file again: every row matched by description', () => {
  const parsed = stored.map((s) => ({ ...s, isCredit: s.category === 'Income' }));
  const r = matchStored(parsed, stored);
  assert.equal(r.newTxns.length, 0);
  assert.equal(r.sameFile, 3);
  assert.equal(r.otherFile, 0);
});

test('same month as another file type: matched by day, amount and direction', () => {
  const parsed = [
    { txn_date: '2026-07-03', description: 'QR Payment KEDAI MAKAN', amount: 12.5, isCredit: false },
    { txn_date: '2026-07-05', description: 'Salary', amount: 3000, isCredit: true },
  ];
  const r = matchStored(parsed, stored);
  assert.equal(r.newTxns.length, 0);
  assert.equal(r.otherFile, 2);
});

test('each stored row matches only once, so a third same-day payment stays new', () => {
  const parsed = [1, 2, 3].map(() => ({ txn_date: '2026-07-03', description: 'QR Payment', amount: 12.5, isCredit: false }));
  const r = matchStored(parsed, stored);
  assert.equal(r.newTxns.length, 1);
  assert.equal(r.otherFile, 2);
});

test('direction and day must agree', () => {
  const parsed = [
    { txn_date: '2026-07-05', description: 'Refund', amount: 3000, isCredit: false },
    { txn_date: '2026-07-04', description: 'QR Payment', amount: 12.5, isCredit: false },
  ];
  assert.equal(matchStored(parsed, stored).newTxns.length, 2);
});

test('the dashboard opens on the month most rows fall in', () => {
  const rows = ['2025-10-11', '2025-10-20', '2025-10-31', '2025-11-02'].map((d) => ({ txn_date: d }));
  assert.deepEqual(mainMonth(rows), { year: 2025, month: 10 });
  assert.deepEqual(mainMonth([{ txn_date: '2026-06-30' }, { txn_date: '2026-07-01' }]), { year: 2026, month: 7 });
  assert.equal(mainMonth([]), null);
});
