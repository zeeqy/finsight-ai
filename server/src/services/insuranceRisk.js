/**
 * FinSight AI - Insurance risk (Module 5)
 *
 * Lifestyle profile -> probability of a higher-cost medical profile, from the
 * Logistic Regression model in the ML service, with per-factor SHAP contributions.
 * There is no rule-based fallback: if the ML service is down the route says so.
 */

const INSURANCE_CONFIG = {
  // The model was trained on ages 18-64 (Medical Cost Personal dataset)
  ageRange: { min: 18, max: 64 },
  // Malaysian Clinical Practice Guidelines on Management of Obesity (2004) use Asian
  // BMI cut-offs, lower than the WHO international ones (25 / 30)
  bmiBands: [
    { max: 18.5, label: 'Underweight' },
    { max: 23, label: 'Normal' },
    { max: 27.5, label: 'Overweight' },
    { max: Infinity, label: 'Obese' },
  ],
  bmiSource: 'Malaysian CPG Management of Obesity (2004)',
};

const round = (n, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp;

/** BMI = weight (kg) / height (m)^2 */
function calculateBmi(heightCm, weightKg) {
  const m = heightCm / 100;
  return round(weightKg / (m * m), 1);
}

function bmiCategory(bmi) {
  return INSURANCE_CONFIG.bmiBands.find((b) => bmi < b.max).label;
}

/** Plain-language tips from the inputs and the model's what-if scenarios. */
function buildTips({ age, bmi, smoker, prediction }) {
  const tips = [];
  const pct = (p) => `${Math.round(p * 100)}%`;
  const quit = prediction.what_if.find((w) => w.scenario === 'Quit smoking');

  if (smoker) {
    tips.push(
      quit
        ? `Smoking is the biggest factor in your score. In the model, quitting alone moves your score from ${pct(prediction.risk_score)} to ${pct(quit.risk_score)}. Insurers usually charge smokers higher medical and life premiums.`
        : 'Smoking is the biggest factor in your score.'
    );
  }

  const category = bmiCategory(bmi);
  if (category === 'Overweight' || category === 'Obese') {
    tips.push(
      `Your BMI of ${bmi} is in the ${category.toLowerCase()} range for Asians (healthy is 18.5-22.9). In this dataset BMI has a small effect on its own, but insurers may still load premiums for a high BMI at underwriting.`
    );
  } else if (category === 'Underweight') {
    tips.push(`Your BMI of ${bmi} is below the healthy range (18.5-22.9).`);
  }

  if (age < 30 && !smoker) {
    tips.push('Premiums rise with age, so locking in medical cover while you are young and healthy usually costs less over time.');
  }
  if (prediction.risk_tier === 'Low') {
    tips.push('A low score means your profile looks like people with below-median medical costs. You still need cover: one hospital stay can cost more than years of premiums.');
  }
  return tips;
}

module.exports = { INSURANCE_CONFIG, calculateBmi, bmiCategory, buildTips };
