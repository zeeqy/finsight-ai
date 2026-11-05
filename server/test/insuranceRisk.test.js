const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateBmi, bmiCategory, buildTips } = require('../src/services/insuranceRisk');

test('BMI from height and weight', () => {
  assert.equal(calculateBmi(170, 65), 22.5);
  assert.equal(calculateBmi(160, 89.6), 35);
});

test('BMI uses Asian (Malaysian CPG) cut-offs', () => {
  assert.equal(bmiCategory(18.4), 'Underweight');
  assert.equal(bmiCategory(22.9), 'Normal');
  assert.equal(bmiCategory(23), 'Overweight'); // WHO would still call this normal
  assert.equal(bmiCategory(27.5), 'Obese');
});

test('smoker tip quotes the quit-smoking what-if score', () => {
  const tips = buildTips({
    age: 55,
    bmi: 35,
    smoker: true,
    prediction: { risk_score: 0.9999, risk_tier: 'High', what_if: [{ scenario: 'Quit smoking', risk_score: 0.7982 }] },
  });
  assert.match(tips[0], /from 100% to 80%/);
  assert.ok(tips.some((t) => /obese range/.test(t)));
});
