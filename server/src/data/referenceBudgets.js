/**
 * FinSight AI - Reference living costs from EPF's Belanjawanku 2024/2025 guide (Klang Valley),
 * prepared with Universiti Malaya's Social Wellbeing Research Centre. Used as a "reasonable
 * minimum to live on" check after a new loan. Figures as reported when the guide was launched:
 *   New Straits Times, 17 Dec 2024, "Klang Valley living costs climb 6.7pct, EPF report reveals"
 *   https://www.nst.com.my/news/nation/2024/12/1147614/klang-valley-living-costs-climb-67pct-epf-report-reveals
 *   Malay Mail, 17 Dec 2024, "Belanjawanku guide: from Alor Setar to Klang Valley..."
 * The car budget includes running a car, so a car loan is not counted twice: FinSight compares
 * the public-transport budget with income minus all loan repayments.
 */
const SOURCE = 'EPF Belanjawanku 2024/2025, Klang Valley (NST and Malay Mail, 17 Dec 2024)';

const REFERENCE_BUDGETS = {
  single: { label: 'Single, uses public transport', monthly: 1970, source: SOURCE },
  single_car: { label: 'Single, owns a car', monthly: 2800, source: SOURCE, includesCar: true },
  couple_two_children: { label: 'Couple with two children', monthly: 7440, source: SOURCE },
};

module.exports = { REFERENCE_BUDGETS };
