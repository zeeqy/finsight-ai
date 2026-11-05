/**
 * FinSight AI - Upfront costs of buying a house or car (Module 4 templates), worked out from the
 * published scales instead of fixed guesses. Every item carries its source. Items with no credible
 * published figure (valuation fee, car insurance, registration) are left for the user to enter.
 */

const round2 = (x) => Math.round(x * 100) / 100;

const SOURCES = {
  stampAct: 'Stamp Act 1949, First Schedule items 32(a) and 27(a)(iii) (LHDN reprint, 1 Jan 2024)',
  firstHome: 'Budget 2026: full stamp duty exemption for first homes up to RM500,000 until 31 Dec 2027 (The Star, 10 Oct 2025)',
  legal: "Solicitors' Remuneration Order 2023 [P.U.(A) 207/2023], Table A and Third Schedule (Malaysian Bar Circular 185/2023)",
  roadTax: 'JPJ road tax rates, Peninsular Malaysia, private petrol car (iMoney, Apr 2024; Bernama, Jan 2026)',
};

const FIRST_HOME = { maxPrice: 500000, until: '2027-12-31' };

/** Tiered scale: [[upTo, rate], ...] applied to each slice of the amount. */
function tiered(amount, tiers) {
  let left = amount;
  let from = 0;
  let total = 0;
  for (const [upTo, rate] of tiers) {
    const slice = Math.min(left, upTo - from);
    if (slice <= 0) break;
    total += slice * rate;
    left -= slice;
    from = upTo;
  }
  return total;
}

/** Stamp duty on the memorandum of transfer: 1% / 2% / 3% / 4% on each slice of the price. */
const motStampDuty = (price) => round2(tiered(price, [[100000, 0.01], [500000, 0.02], [1000000, 0.03], [Infinity, 0.04]]));
/** Stamp duty on the loan agreement: RM5 per RM1,000, i.e. 0.5%. */
const loanStampDuty = (loan) => round2(loan * 0.005);
/** SRO 2023 scale fee (SPA, Table A; loan agreement, Third Schedule): 1.25% of the first RM500,000 (min RM500), then 1%. */
const scaleLegalFee = (amount) => (amount > 0 ? round2(Math.max(500, tiered(amount, [[500000, 0.0125], [7500000, 0.01]]))) : 0);

/**
 * Road tax for a privately owned petrol car in Peninsular Malaysia, by engine size. Returns null above
 * 3,000cc, where the published table this follows stops.
 */
function roadTax(cc) {
  if (!(cc > 0) || cc > 3000) return null;
  if (cc <= 1000) return 20;
  if (cc <= 1200) return 55;
  if (cc <= 1400) return 70;
  if (cc <= 1600) return 90;
  if (cc <= 1800) return round2(200 + 0.4 * (cc - 1600));
  if (cc <= 2000) return round2(280 + 0.5 * (cc - 1800));
  if (cc <= 2500) return round2(380 + 1.0 * (cc - 2000));
  return round2(880 + 2.5 * (cc - 2500));
}

/**
 * House upfront costs. firstHome applies the Budget 2026 exemption only when the price is within
 * the cap and the purchase is due by the exemption's end date.
 */
function houseCosts({ price, loanAmount, firstHome = false, purchaseDate = null }) {
  const exemptionApplies = firstHome && price <= FIRST_HOME.maxPrice && (!purchaseDate || purchaseDate <= FIRST_HOME.until);
  const mot = exemptionApplies ? 0 : motStampDuty(price);
  const loanDuty = exemptionApplies ? 0 : loanStampDuty(loanAmount);
  let note = null;
  if (firstHome && !exemptionApplies) {
    note =
      price > FIRST_HOME.maxPrice
        ? 'The first-home exemption covers homes up to RM500,000, so full stamp duty is shown.'
        : 'The first-home exemption announced runs to 31 Dec 2027. Budget 2027 proposes extending it, but that is not law yet, so full stamp duty is shown.';
  }
  return {
    items: [
      {
        item_name: 'Stamp duty (MOT & loan)',
        cost: round2(mot + loanDuty),
        source: exemptionApplies ? `${SOURCES.firstHome}` : `${SOURCES.stampAct}: transfer RM ${mot.toLocaleString('en-MY')} + loan RM ${loanDuty.toLocaleString('en-MY')}`,
      },
      {
        item_name: 'SPA & loan agreement legal fees',
        cost: round2(scaleLegalFee(price) + scaleLegalFee(loanAmount)),
        source: `${SOURCES.legal}: scale fees before discount, SST and disbursements; a developer purchase is charged less`,
      },
    ],
    exemption_applied: exemptionApplies,
    note,
  };
}

function carCosts({ engineCc }) {
  const tax = roadTax(engineCc);
  return {
    items: tax === null ? [] : [{ item_name: 'Road tax (first year)', cost: tax, source: `${SOURCES.roadTax}, ${engineCc}cc` }],
    note: engineCc > 3000 ? 'Road tax above 3,000cc is not worked out here. Check the JPJ rate for your car.' : null,
  };
}

module.exports = { FIRST_HOME, SOURCES, motStampDuty, loanStampDuty, scaleLegalFee, roadTax, houseCosts, carCosts };
