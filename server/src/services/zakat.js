/**
 * FinSight AI - Zakat estimate (savings and income), for planning only.
 * Lembaga Zakat Selangor: nisab = the value of 85 g of gold; rate 2.5%; savings held for one
 * lunar year (haul). https://www.zakatselangor.com.my/en/zakat-wang-simpanan-english/
 * Income zakat is shown with the no-deduction method (2.5% of gross yearly income when it is
 * at or above the nisab), which all state boards accept; the with-deduction method allowed
 * by some states gives a smaller figure. State boards announce the official nisab, so the
 * user can enter it instead of the gold-based estimate.
 */

const ZAKAT_CONFIG = {
  nisabGoldGrams: 85,
  rate: 0.025,
  // Used only when the gold price service is offline
  fallbackGoldPricePerGram: 565.05, // RM/g, Sep 2026 monthly price from the gold dataset in Module 4
  fallbackGoldMonth: '2026-09',
  source: 'Lembaga Zakat Selangor: nisab 85 g gold, 2.5%, one lunar year',
};

const round2 = (x) => Math.round(x * 100) / 100;

function calculateZakat({ savings = 0, annualIncome = 0, goldPricePerGram, nisabOverride = null, heldOneYear = true }) {
  const nisab = nisabOverride > 0 ? nisabOverride : ZAKAT_CONFIG.nisabGoldGrams * goldPricePerGram;
  const savingsDue = heldOneYear && savings >= nisab ? savings * ZAKAT_CONFIG.rate : 0;
  const incomeDue = annualIncome >= nisab ? annualIncome * ZAKAT_CONFIG.rate : 0;
  return {
    nisab: round2(nisab),
    nisab_source: nisabOverride > 0 ? 'entered' : 'gold_price',
    savings: { amount: round2(savings), above_nisab: savings >= nisab, held_one_year: heldOneYear, zakat: round2(savingsDue) },
    income: {
      annual: round2(annualIncome),
      above_nisab: annualIncome >= nisab,
      zakat: round2(incomeDue),
      monthly: round2(incomeDue / 12),
    },
    total: round2(savingsDue + incomeDue),
  };
}

module.exports = { ZAKAT_CONFIG, calculateZakat };
