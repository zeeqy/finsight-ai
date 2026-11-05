const test = require('node:test');
const assert = require('node:assert/strict');
const { motStampDuty, loanStampDuty, scaleLegalFee, roadTax, houseCosts, carCosts } = require('../src/services/purchaseCosts');

test('stamp duty on transfer follows the Stamp Act slices', () => {
  assert.equal(motStampDuty(400000), 7000); // 1,000 + 6,000
  assert.equal(motStampDuty(100000), 1000);
  assert.equal(motStampDuty(800000), 18000); // 1,000 + 8,000 + 9,000
  assert.equal(motStampDuty(1200000), 32000); // 1,000 + 8,000 + 15,000 + 8,000
});

test('loan agreement duty is 0.5%', () => {
  assert.equal(loanStampDuty(360000), 1800);
});

test('legal fees follow the Solicitors\' Remuneration Order 2023 scale', () => {
  assert.equal(scaleLegalFee(400000), 5000);
  assert.equal(scaleLegalFee(360000), 4500);
  assert.equal(scaleLegalFee(600000), 7250); // 6,250 + 1,000
  assert.equal(scaleLegalFee(20000), 500); // minimum fee
});

test('a RM400,000 house with 10% down', () => {
  const r = houseCosts({ price: 400000, loanAmount: 360000 });
  assert.deepEqual(r.items.map((i) => i.cost), [8800, 9500]);
  assert.equal(r.exemption_applied, false);
});

test('first home: exempt only within the price cap and before the exemption ends', () => {
  assert.equal(houseCosts({ price: 400000, loanAmount: 360000, firstHome: true, purchaseDate: '2027-06-01' }).items[0].cost, 0);
  const late = houseCosts({ price: 400000, loanAmount: 360000, firstHome: true, purchaseDate: '2029-01-01' });
  assert.equal(late.items[0].cost, 8800);
  assert.match(late.note, /not law yet/);
  assert.match(houseCosts({ price: 650000, loanAmount: 585000, firstHome: true, purchaseDate: '2027-01-01' }).note, /up to RM500,000/);
});

test('road tax by engine size', () => {
  assert.deepEqual([1000, 1300, 1500, 1800, 2000].map(roadTax), [20, 70, 90, 280, 380]);
  assert.equal(roadTax(3500), null);
  assert.equal(carCosts({ engineCc: 1500 }).items[0].cost, 90);
  assert.equal(carCosts({}).items.length, 0);
});
