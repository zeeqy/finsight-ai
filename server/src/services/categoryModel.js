/**
 * FinSight AI - Module 1 transaction categorisation (ML model + keyword rules)
 *
 * Credits are always Income (from the + sign / credit column), never the model.
 * Debits go to the ML service's TF-IDF + Logistic Regression (chosen over Random Forest on
 * merchant-grouped CV) in one batch call, and the model's
 * answer is merged with the keyword rules using the decision rule picked during training
 * (merchant-grouped cross-validation, see ml-service/notebooks/train_category.py).
 * If the ML service or model is unavailable, the rules alone are used. Never throws.
 */

const { mlPost, checkMlHealth } = require('./mlClient');
const { categorizeTransaction } = require('../utils/categorizer');

/** Mirrors combine() in train_category.py. Returns { category, source }. */
function combine(decision, ml, ruleCategory) {
  const { strategy, threshold } = decision;
  const sure = ml.confidence >= threshold;
  const ruleHit = ruleCategory !== 'Others';

  if (strategy === 'ml_first') {
    return sure ? { category: ml.category, source: 'model' } : { category: ruleCategory, source: 'rules' };
  }
  if (strategy === 'ml_first_guess') {
    if (sure) return { category: ml.category, source: 'model' };
    return ruleHit ? { category: ruleCategory, source: 'rules' } : { category: ml.category, source: 'model_low_confidence' };
  }
  // rules_first
  if (ruleHit) return { category: ruleCategory, source: 'rules' };
  return sure ? { category: ml.category, source: 'model' } : { category: 'Others', source: 'rules' };
}

/**
 * @param {Array<{text: string, isCredit: boolean}>} rows - categoriser context per transaction
 * @returns {Promise<{categories: string[], sources: string[], engine: 'ml_model'|'rules', modelName?: string}>}
 */
async function categoriseBatch(rows) {
  const ruleCategories = rows.map((r) => categorizeTransaction(r.text, { isCredit: r.isCredit }));
  const sources = rows.map((r) => (r.isCredit ? 'sign' : 'rules'));
  const debitIdx = rows.map((r, i) => (r.isCredit ? -1 : i)).filter((i) => i >= 0);

  if (debitIdx.length === 0) return { categories: ruleCategories, sources, engine: 'rules' };

  const health = await checkMlHealth();
  if (!health.online || !health.models_loaded?.category) {
    return { categories: ruleCategories, sources, engine: 'rules' };
  }

  try {
    const out = await mlPost('/predict/category', { descriptions: debitIdx.map((i) => rows[i].text) }, { timeoutMs: 15000 });
    const categories = [...ruleCategories];
    debitIdx.forEach((rowIdx, k) => {
      // A rule that says Income on a debit (e.g. "salary" in a reference) is kept: the model has no Income class
      if (ruleCategories[rowIdx] === 'Income') return;
      const merged = combine(out.decision, out.predictions[k], ruleCategories[rowIdx]);
      categories[rowIdx] = merged.category;
      sources[rowIdx] = merged.source;
    });
    return { categories, sources, engine: 'ml_model', modelName: out.model?.name };
  } catch (err) {
    console.warn('[Categoriser] ML service failed, using keyword rules:', err.message);
    return { categories: ruleCategories, sources, engine: 'rules' };
  }
}

module.exports = { categoriseBatch, combine };
