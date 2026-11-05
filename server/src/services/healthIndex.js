/**
 * FinSight AI - Financial Health Index (0 to 100), worked out from the user's own data.
 * Four pillars after the Financial Health Network's FinHealth framework (Spend, Save, Borrow,
 * Plan), but scored from statements and saved figures instead of a survey. It is an indicator
 * built for this app, not a validated scale. Each pillar is worth 25 and says why it scored
 * what it did; a pillar with missing data is left out and the rest are scaled to 100.
 * Bands follow FinHealth's tiers: Vulnerable < 40 <= Coping < 80 <= Healthy.
 */

const BANDS = [
  { min: 80, label: 'Healthy' },
  { min: 40, label: 'Coping' },
  { min: 0, label: 'Vulnerable' },
];
// BNM Financial Stability Review 1H2025: median DSR of outstanding household borrowers
const BNM_MEDIAN_DSR = 33;

const round1 = (x) => Math.round(x * 10) / 10;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** Straight-line score between points [[x, score], ...] sorted by x. */
function piecewise(x, points) {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i += 1) {
    const [x1, y1] = points[i];
    const [x0, y0] = points[i - 1];
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return points.at(-1)[1];
}

const pct = (x) => `${Math.round(x)}%`;
const rm = (x) => `RM ${Math.round(x).toLocaleString('en-MY')}`;

/**
 * inputs: { income, monthlyOutgoings (spending + commitments outside statements), debtMonthly,
 *           emergencySavings (null if not given), surplus, goals: [{ feasibility }] }
 */
function computeHealthIndex({ income, monthlyOutgoings, debtMonthly, emergencySavings, surplus, goals = [] }) {
  if (!(income > 0)) {
    return { score: null, band: null, pillars: [], missing: ['income'], note: 'Set your monthly income to see your health index.' };
  }
  const pillars = [];

  // Spend: share of income that goes out each month. Half or less scores full marks.
  if (monthlyOutgoings !== null && monthlyOutgoings !== undefined) {
    const ratio = monthlyOutgoings / income;
    pillars.push({
      key: 'spend',
      label: 'Spending',
      score: round1(piecewise(ratio, [[0.5, 25], [1, 0]])),
      value: round1(ratio * 100),
      reason:
        ratio <= 0.5
          ? `You spend ${pct(ratio * 100)} of your income, leaving plenty to save.`
          : ratio < 1
            ? `You spend ${pct(ratio * 100)} of your income. Below 50% scores full marks.`
            : `You spend ${pct(ratio * 100)} of your income, more than comes in.`,
    });
  }

  // Save: months of usual outgoings the emergency savings would cover. 6 months scores full marks.
  if (emergencySavings !== null && emergencySavings !== undefined && monthlyOutgoings > 0) {
    const months = emergencySavings / monthlyOutgoings;
    pillars.push({
      key: 'save',
      label: 'Emergency savings',
      score: round1(piecewise(months, [[0, 0], [3, 15], [6, 25]])),
      value: round1(months),
      reason:
        months >= 6
          ? `Your savings would cover ${round1(months)} months of spending, the 6 months often recommended.`
          : `Your savings would cover ${round1(months)} month${round1(months) === 1 ? '' : 's'} of spending. Aim for 3, then 6.`,
    });
  }

  // Borrow: DSR. Up to 20% scores full marks; the 40% and 60% bands match Module 3.
  const dsr = (debtMonthly / income) * 100;
  pillars.push({
    key: 'borrow',
    label: 'Debt',
    score: round1(piecewise(dsr, [[20, 25], [40, 15], [60, 5], [70, 0]])),
    value: round1(dsr),
    reason:
      dsr === 0
        ? 'No loan or card repayments saved. Add them under My commitments if you have any.'
        : `Loan and card repayments take ${round1(dsr)}% of your income (DSR). The median for Malaysian borrowers is ${BNM_MEDIAN_DSR}% (BNM, 2025).`,
  });

  // Plan: whether the surplus covers the goals.
  let planScore;
  let planReason;
  if (!(surplus > 0)) {
    planScore = 0;
    planReason = `Nothing is left over each month (${rm(surplus)}), so goals cannot move forward.`;
  } else if (!goals.length) {
    planScore = 12.5;
    planReason = `You have ${rm(surplus)} left each month but no active goal. A goal gives that money a job.`;
  } else {
    const onTrack = goals.filter((g) => g.feasibility === 'On Track').length;
    const atRisk = goals.filter((g) => g.feasibility === 'At Risk').length;
    planScore = (25 * (onTrack + 0.5 * atRisk)) / goals.length;
    planReason = `${onTrack} of ${goals.length} goal${goals.length === 1 ? ' is' : 's are'} on track${atRisk ? `, ${atRisk} at risk` : ''}.`;
  }
  pillars.push({ key: 'plan', label: 'Goals', score: round1(planScore), value: null, reason: planReason });

  const score = Math.round((pillars.reduce((s, p) => s + p.score, 0) / (25 * pillars.length)) * 100);
  const missing = [];
  if (emergencySavings === null || emergencySavings === undefined) missing.push('emergency_savings');
  if (monthlyOutgoings === null || monthlyOutgoings === undefined) missing.push('statements');
  return {
    score,
    band: BANDS.find((b) => score >= b.min).label,
    pillars,
    missing,
    note: missing.length ? `Scored on ${pillars.length} of 4 parts; add the missing figures for the full picture.` : null,
  };
}

module.exports = { BANDS, BNM_MEDIAN_DSR, piecewise, computeHealthIndex, clamp };
