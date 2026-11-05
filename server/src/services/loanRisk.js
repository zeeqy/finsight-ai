/**
 * FinSight AI - Loan default risk (Module 3)
 *
 * Uses the XGBoost model via the ML service. When the service or model is unavailable, a
 * transparent rule-based score (logistic curve over the same features) stands in and is labelled
 * as such. It is NOT a trained model.
 */

const { mlPost, checkMlHealth } = require('./mlClient');

const RISK_CONFIG = {
  // Same band edges as the XGBoost model: 0.75x and 1.5x the Lending Club default rate of 19.6%
  // (ml-service/models/loan_xgb_metrics.json), so Low/Medium/High mean the same with either source.
  thresholds: { lowMax: 0.147, mediumMax: 0.294 },
  employmentWeights: { permanent: 0, contract: 0.4, self_employed: 0.5, gig: 0.7 },
};

const sigmoid = (z) => 1 / (1 + Math.exp(-z));

function riskLevel(probability) {
  const { lowMax, mediumMax } = RISK_CONFIG.thresholds;
  if (probability <= lowMax) return 'Low';
  if (probability <= mediumMax) return 'Medium';
  return 'High';
}

/** Rule-based fallback: each term is listed so the UI can show what drove the score. */
function heuristicDefaultProbability(f) {
  const terms = [
    { feature: 'DSR after loan', weight: 0.045 * (f.dsr - 40) },
    { feature: 'Employment type', weight: RISK_CONFIG.employmentWeights[f.employment_type] ?? 0.3 },
    { feature: 'Years employed', weight: f.years_employed < 1 ? 0.5 : f.years_employed < 3 ? 0.2 : 0 },
    { feature: 'Dependants', weight: 0.12 * (f.dependants || 0) },
    { feature: 'Age', weight: f.age && f.age < 25 ? 0.3 : 0 },
    { feature: 'Down payment ratio', weight: f.down_payment_ratio >= 0.2 ? -0.3 : 0 },
  ];
  const z = -2.6 + terms.reduce((s, t) => s + t.weight, 0);
  return {
    default_probability: sigmoid(z),
    top_factors: terms
      .filter((t) => t.weight !== 0)
      .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
      .map((t) => ({ feature: t.feature, impact: Math.round(t.weight * 100) / 100 })),
  };
}

/** Returns { default_probability, risk_level, top_factors, source, note } — never throws. */
async function predictDefault(features) {
  const health = await checkMlHealth();
  if (health.online && health.models_loaded?.loan) {
    try {
      const out = await mlPost('/predict/loan', features);
      const auc = out.model?.test_roc_auc;
      const outside = out.out_of_range || [];
      let note = `Predicted by the XGBoost model trained on Lending Club loans 2007-2016${auc ? ` (test ROC-AUC ${auc})` : ''}. It uses only the details on this form, not your credit history.`;
      if (outside.length) {
        note += ` Some inputs (${outside.join(', ').toLowerCase()}) are outside what the model was trained on (3-5 year personal loans), so this score is shown for reference only and the verdict is based on your DSR.`;
      }
      return {
        default_probability: out.default_probability,
        // Cut-offs come from the model's training data (relative to the average default rate), not RISK_CONFIG
        risk_level: out.risk_level || riskLevel(out.default_probability),
        top_factors: out.top_factors || [],
        out_of_range: outside,
        // An extrapolated score (e.g. a 30-year house loan) must not decide the verdict
        counts_toward_verdict: outside.length === 0,
        source: 'xgboost',
        note,
      };
    } catch (err) {
      console.warn('[Loan] ML prediction failed, using rule-based estimate:', err.message);
    }
  }

  const h = heuristicDefaultProbability(features);
  return {
    ...h,
    risk_level: riskLevel(h.default_probability),
    counts_toward_verdict: true,
    source: 'rule_based',
    note: 'Rule-based estimate. The XGBoost model is unavailable right now, so this score comes from simple rules, not the trained model.',
  };
}

module.exports = { RISK_CONFIG, riskLevel, heuristicDefaultProbability, predictDefault };
