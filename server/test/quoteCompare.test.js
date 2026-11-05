const test = require('node:test');
const assert = require('node:assert/strict');
const { parseQuote, monthlyPremium, outOfPocket, highlights } = require('../src/services/quoteCompare');

const medical = { plan_type: 'medical', annual_limit: 100000, deductible: 1000, co_pay_pct: 10, co_pay_cap: 3000, premium: 150, premium_frequency: 'monthly' };

test('a hospital bill: deductible first, then co-payment, insurer pays the rest', () => {
  // RM 20,000: RM 1,000 deductible, 10% of RM 19,000 = RM 1,900 co-pay, insurer RM 17,100
  assert.deepEqual(outOfPocket(medical, 20000), { bill: 20000, deductible: 1000, co_pay: 1900, above_limit: 0, you_pay: 2900, insurer_pays: 17100 });
});

test('the co-payment stops at its cap', () => {
  // 10% of RM 49,000 = RM 4,900, capped at RM 3,000
  const r = outOfPocket(medical, 50000);
  assert.equal(r.co_pay, 3000);
  assert.equal(r.you_pay, 4000);
});

test('anything above the annual limit is paid by the user', () => {
  const r = outOfPocket({ ...medical, deductible: 0, co_pay_pct: 0, annual_limit: 50000 }, 80000);
  assert.equal(r.insurer_pays, 50000);
  assert.equal(r.above_limit, 30000);
  assert.equal(r.you_pay, 30000);
});

test('a bill smaller than the deductible is all the user\'s', () => {
  assert.equal(outOfPocket(medical, 600).you_pay, 600);
});

test('yearly premiums are compared per month', () => {
  assert.equal(monthlyPremium({ premium: 1800, premium_frequency: 'yearly' }), 150);
  assert.equal(monthlyPremium({ premium: '95.50', premium_frequency: 'monthly' }), 95.5);
});

test('quotes are validated before they are saved', () => {
  assert.throws(() => parseQuote({ plan_type: 'medical', premium: 100, annual_limit: 1000 }), /insurer/);
  assert.throws(() => parseQuote({ provider: 'A', plan_type: 'motor', premium: 100 }), /medical card/);
  assert.throws(() => parseQuote({ provider: 'A', plan_type: 'life', premium: 0, coverage: 1000 }), /premium/);
  assert.throws(() => parseQuote({ provider: 'A', plan_type: 'life', premium: 50 }), /cover/);
  assert.throws(() => parseQuote({ provider: 'A', plan_type: 'medical', premium: 50, annual_limit: 1000, co_pay_pct: 120 }), /Co-payment/);
  const q = parseQuote({ provider: ' Insurer A ', plan_type: 'life', premium: '80', coverage: '250000', takaful: 'true', annual_limit: 5 });
  assert.equal(q.provider, 'Insurer A');
  assert.equal(q.coverage, 250000);
  assert.equal(q.annual_limit, null); // medical-only fields are ignored for life cover
  assert.equal(q.takaful, true);
});

test('highlights state facts and never pick an overall winner', () => {
  const rows = [
    { id: 1, provider: 'A', plan_type: 'medical', monthly_premium: 180, medical: { you_pay: 1000 } },
    { id: 2, provider: 'B', plan_type: 'medical', monthly_premium: 150, medical: { you_pay: 2900 } },
  ];
  const facts = highlights(rows);
  assert.deepEqual(facts.map((f) => [f.key, f.quote_id]), [['premium', 2], ['out_of_pocket', 1]]);
  assert.ok(facts.every((f) => !/best|recommend/i.test(f.text)));
  // a life plan is never "cheaper" than a medical card: premiums only compared within a plan type
  const mixed = highlights([...rows, { id: 3, provider: 'C', plan_type: 'life', monthly_premium: 90, cover: { per_rm_premium: 270 } }]);
  assert.equal(mixed.find((f) => f.key === 'premium').quote_id, 2);
  assert.equal(mixed.filter((f) => f.key === 'premium').length, 1);
});
