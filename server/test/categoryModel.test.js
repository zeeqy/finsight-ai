const test = require('node:test');
const assert = require('node:assert/strict');
const { combine } = require('../src/services/categoryModel');

const sure = { category: 'Groceries', confidence: 0.8 };
const unsure = { category: 'Groceries', confidence: 0.2 };

test('ml_first: confident model wins, otherwise the rules', () => {
  const d = { strategy: 'ml_first', threshold: 0.4 };
  assert.deepEqual(combine(d, sure, 'Shopping'), { category: 'Groceries', source: 'model' });
  assert.deepEqual(combine(d, unsure, 'Others'), { category: 'Others', source: 'rules' });
});

test('ml_first_guess: falls back to a rule match, then to the model guess instead of Others', () => {
  const d = { strategy: 'ml_first_guess', threshold: 0.4 };
  assert.equal(combine(d, unsure, 'Shopping').category, 'Shopping');
  assert.deepEqual(combine(d, unsure, 'Others'), { category: 'Groceries', source: 'model_low_confidence' });
});

test('rules_first: a specific rule match beats even a confident model', () => {
  const d = { strategy: 'rules_first', threshold: 0.4 };
  assert.equal(combine(d, sure, 'Shopping').category, 'Shopping');
  assert.equal(combine(d, sure, 'Others').category, 'Groceries');
  assert.equal(combine(d, unsure, 'Others').category, 'Others');
});
