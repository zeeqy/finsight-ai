const test = require('node:test');
const assert = require('node:assert/strict');
const { detectRecurring, merchantKey } = require('../src/services/recurring');
const { naive, mean3, ses, bestAlpha, split, forecastNext } = require('../src/services/spendForecast');
const { computeAnomalyFlags, computeAnomalyFlagsMad } = require('../src/utils/categorizer');

const monthly = (description, amounts, category = 'Entertainment', day = 5) =>
  amounts.map((amount, i) => ({ id: `${description}-${i}`, date: `2026-${String(i + 5).padStart(2, '0')}-${String(day).padStart(2, '0')}`, description, amount, category }));

test('merchant key drops store numbers and punctuation but keeps account numbers', () => {
  assert.equal(merchantKey('99 SPEEDMART-1535 SELANGOR'), 'SPEEDMART SELANGOR');
  assert.equal(merchantKey('NETFLIX.COM  SINGAPORE SG'), 'NETFLIX COM SINGAPORE');
  assert.equal(merchantKey('TRANSFER YZ87144583'), 'TRANSFER YZ87144583');
});

test('recurring: a fixed monthly subscription is found with its next date', () => {
  const [r] = detectRecurring(monthly('NETFLIX.COM SINGAPORE', [54.9, 54.9, 54.9, 54.9]));
  assert.equal(r.cadence, 'monthly');
  assert.equal(r.kind, 'fixed');
  assert.equal(r.typical_amount, 54.9);
  assert.equal(r.next_date, '2026-09-05'); // last payment 5 Aug + the median 31-day gap
  assert.equal(r.active, true);
});

test('recurring: a utility bill that changes every month still counts, a shop does not', () => {
  const tnb = monthly('TENAGA NASIONAL BERHAD', [142, 180, 121, 165], 'Utilities', 16);
  const shop = monthly('UNIQLO SUNWAY PYRAMID', [129, 60, 210, 95], 'Shopping', 14);
  const found = detectRecurring([...tnb, ...shop]);
  assert.deepEqual(found.map((r) => [r.key, r.kind]), [['TENAGA NASIONAL BERHAD', 'bill']]);
});

test('recurring: frequent same-day payments and irregular gaps are not a bill', () => {
  const sameDay = [1, 2, 3].map((i) => ({ id: i, date: '2026-09-10', description: 'MYDIN SUBANG', amount: 20, category: 'Groceries' }));
  const irregular = ['2026-06-01', '2026-06-09', '2026-08-20', '2026-09-02'].map((date, i) => ({ id: `x${i}`, date, description: 'SPOTIFY', amount: 15.9, category: 'Entertainment' }));
  assert.deepEqual(detectRecurring([...sameDay, ...irregular]), []);
});

test('recurring: a payment that stopped is marked inactive', () => {
  const old = monthly('GYM ANYTIME FITNESS', [99, 99, 99]); // May to July
  const recent = [{ id: 'z', date: '2026-11-01', description: 'SHELL', amount: 80, category: 'Transport' }];
  const [r] = detectRecurring([...old, ...recent]);
  assert.equal(r.active, false);
});

test('forecast baselines', () => {
  assert.equal(naive([100, 200, 300]), 300);
  assert.equal(mean3([100, 200, 300, 600]), 1100 / 3);
  assert.equal(bestAlpha([100, 100, 100, 100, 100]), 0.1); // any alpha fits a flat line; the first one is kept
  assert.equal(ses([500, 500, 500]), 500);
  // Recurring RM 300 at its known amount + SES on the rest (flat RM 1,000)
  assert.equal(split([1300, 1300, 1300, 1300], [300, 300, 300, 300], 300), 1300);
});

test('forecast range: surprises widen only the upper end', () => {
  const usual = [1000, 1050, 980, 1020, 1000, 1010];
  const actual = [1000, 1050, 980, 2900, 1000, 1010]; // a one-off RM 1,880 purchase in month 4
  const f = forecastNext(usual, { method: 'ses', actualSeries: actual });
  assert.ok(f.point > 990 && f.point < 1030, `point ${f.point}`);
  assert.ok(f.point - f.low < 100, `low ${f.low}`);
  assert.ok(f.high - f.point > 500, `high ${f.high}`);
  assert.equal(f.range_source, 'past_errors');
  assert.equal(forecastNext([900, 1100], { method: 'mean3' }).range_source, 'rough');
});

test('anomaly rules: both flag a clear outlier; MAD is not masked by an earlier big purchase', () => {
  const food = [20, 22, 18, 25, 21, 19, 23, 20].map((amount) => ({ amount, category: 'Food & Dining' }));
  const withOutlier = [...food, { amount: 400, category: 'Food & Dining' }];
  assert.equal(computeAnomalyFlags(withOutlier).at(-1).isAnomaly, true);
  assert.equal(computeAnomalyFlagsMad(withOutlier).at(-1).isAnomaly, true);
  // Two big purchases: each inflates the other's standard deviation
  const twoBig = [...food, { amount: 300, category: 'Food & Dining' }, { amount: 320, category: 'Food & Dining' }];
  const z = computeAnomalyFlags(twoBig).slice(-2).map((f) => f.isAnomaly);
  const mad = computeAnomalyFlagsMad(twoBig).slice(-2).map((f) => f.isAnomaly);
  assert.deepEqual(mad, [true, true]);
  assert.ok(z.filter(Boolean).length <= mad.filter(Boolean).length);
  // Income is never judged
  assert.equal(computeAnomalyFlagsMad([...food, { amount: 9000, category: 'Income' }]).at(-1).isAnomaly, false);
});
