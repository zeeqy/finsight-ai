/**
 * FinSight AI - "How protected am I?" (Module 5, Phase 5). Two plain checks that use the
 * user's real figures, alongside the existing lifestyle risk model:
 *   1. Emergency cover: months of usual spending the emergency savings would last.
 *   2. Protection gap: a needs-based estimate of the life cover dependants would need,
 *        need = yearly income x years of support + debts left to repay
 *        gap  = need - savings - existing life cover
 *      "Years of support" is the user's own choice (default 10). It is a standard needs
 *      approach with every assumption shown, not an insurer's quote or a recommendation.
 */

const DEFAULT_SUPPORT_YEARS = 10;
const round2 = (x) => Math.round(x * 100) / 100;

function protectionCheck({ monthlyIncome, monthlyOutgoings, emergencySavings, debtsOutstanding = 0, dependants = 0, existingCover = 0, supportYears = DEFAULT_SUPPORT_YEARS }) {
  const emergency =
    emergencySavings === null || emergencySavings === undefined || !(monthlyOutgoings > 0)
      ? null
      : {
          savings: round2(emergencySavings),
          months: round2(emergencySavings / monthlyOutgoings),
          target_3: round2(monthlyOutgoings * 3),
          target_6: round2(monthlyOutgoings * 6),
          short_of_3: round2(Math.max(0, monthlyOutgoings * 3 - emergencySavings)),
        };

  let gap = null;
  if (dependants > 0 && monthlyIncome > 0) {
    const incomeNeed = monthlyIncome * 12 * supportYears;
    const need = incomeNeed + debtsOutstanding;
    const covered = (emergencySavings || 0) + existingCover;
    gap = {
      support_years: supportYears,
      income_need: round2(incomeNeed),
      debts: round2(debtsOutstanding),
      need: round2(need),
      savings: round2(emergencySavings || 0),
      existing_cover: round2(existingCover),
      gap: round2(Math.max(0, need - covered)),
      covered_pct: round2(Math.min(100, (covered / need) * 100)),
    };
  }
  return { emergency, gap, dependants };
}

module.exports = { DEFAULT_SUPPORT_YEARS, protectionCheck };
