/**
 * FinSight AI - Loan Calculator (deterministic, shared by Module 3 and Module 4 loan-check)
 *
 * Interest methods in Malaysia, as of Nov 2026:
 *   - REDUCING BALANCE (effective rate): housing loans; new car hire-purchase agreements from
 *     1 Jun 2026 (Hire-Purchase (Amendment) Act 2026); new personal financing from 1 Jan 2027
 *     (BNM Policy Document on Personal Financing, 30 Sep 2025, bans flat rates).
 *   - FLAT RATE: car hire purchase signed before 1 Jun 2026, and personal loans still quoted flat
 *     until the end of 2026. Kept as an option, with its effective-rate equal shown.
 * Rates are passed as annual PERCENT (3 = 3% p.a.). Maths runs unrounded; outputs are rounded to 2 dp.
 */

const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

/**
 * The effective (reducing-balance) annual rate with the same instalment as a flat rate over the
 * same tenure, found by bisection. 3% flat over 9 years is about 5.50% effective.
 */
function effectiveFromFlat(flatRatePct, years) {
  if (!(flatRatePct > 0) || !(years > 0)) return 0;
  const n = years * 12;
  const target = (1 + (flatRatePct / 100) * years) / n; // flat instalment per RM 1 borrowed
  const instalment = (annualPct) => {
    const r = annualPct / 1200;
    const g = Math.pow(1 + r, n);
    return (r * g) / (g - 1);
  };
  let lo = 0;
  let hi = 100;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (instalment(mid) > target) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

// Example flat rates from the published listings, turned into the effective rate quoted from 2026
const CAR_EXAMPLE_FLAT = { ratePct: 3, years: 9 };
const PERSONAL_EXAMPLE_FLAT = { ratePct: 6.5, years: 5 };

const LOAN_CONFIG = {
  // DSR bands (%): <= healthyMax Healthy, <= moderateMax Moderate, above that High
  dsrBands: { healthyMax: 40, moderateMax: 60 },
  // Typical upper limit Malaysian banks accept; above this a new loan is "Not recommended"
  bankDsrLimit: 70,
  // Per-loan-type defaults: example rates inside the published ranges, prefilled for the user to
  // replace with the rate they are quoted. flatAllowed: the user may enter a flat-rate quote.
  loanTypes: {
    personal: {
      method: 'reducing',
      flatAllowed: true,
      maxTenureYears: 10,
      defaultTenureYears: 5,
      downPaymentPct: 0,
      defaultRatePct: round2(effectiveFromFlat(PERSONAL_EXAMPLE_FLAT.ratePct, PERSONAL_EXAMPLE_FLAT.years)),
      rateSource:
        'Example: the effective rate equal to 6.5% flat over 5 years. Bank personal financing listed on RinggitPlus started at 3.31% p.a. (Oct 2026); licensed moneylenders charge up to 18%. Flat-rate personal financing ends on 1 Jan 2027 and tenure is capped at 10 years (BNM, Sep 2025).',
    },
    car: {
      method: 'reducing',
      flatAllowed: true,
      maxTenureYears: 9,
      defaultTenureYears: 9,
      downPaymentPct: 10,
      defaultRatePct: round2(effectiveFromFlat(CAR_EXAMPLE_FLAT.ratePct, CAR_EXAMPLE_FLAT.years)),
      rateSource:
        'Example: the effective rate equal to 3% flat over 9 years, inside the 2.2% to 3.75% car financing rates listed on RinggitPlus. New hire-purchase agreements from 1 Jun 2026 use an effective rate on a reducing balance (Hire-Purchase (Amendment) Act 2026).',
    },
    house: {
      method: 'reducing',
      maxTenureYears: 35,
      defaultTenureYears: 30,
      downPaymentPct: 10,
      defaultRatePct: 4.5,
      rateSource: 'Example rate between the banks\' weighted base rate (3.39%) and the average lending rate on all loans (4.69%), end-June 2026 (Bank Negara Malaysia).',
    },
  },
};

function assertNonNegative(name, value) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative number.`);
  }
}

function assertPositive(name, value) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be greater than 0.`);
  }
}

/** Unrounded monthly instalment for either method. */
function rawMonthly(loanAmount, annualRatePct, years, method) {
  const n = years * 12;
  const annual = annualRatePct / 100;
  if (method === 'flat') {
    return (loanAmount + loanAmount * annual * years) / n;
  }
  const r = annual / 12;
  if (r === 0) return loanAmount / n;
  const growth = Math.pow(1 + r, n);
  return (loanAmount * r * growth) / (growth - 1);
}

function validateLoanInputs({ loanAmount, annualRatePct, years }) {
  assertNonNegative('Loan amount', loanAmount);
  assertNonNegative('Interest rate', annualRatePct);
  assertPositive('Tenure (years)', years);
}

/** Flat rate: interest = principal x rate x years, spread evenly over the tenure. */
function flatRateLoan({ loanAmount, annualRatePct, years }) {
  validateLoanInputs({ loanAmount, annualRatePct, years });
  const totalInterest = loanAmount * (annualRatePct / 100) * years;
  const totalPayment = loanAmount + totalInterest;
  return {
    monthly: round2(totalPayment / (years * 12)),
    totalPayment: round2(totalPayment),
    totalInterest: round2(totalInterest),
  };
}

/** Reducing balance (standard annuity / amortisation). */
function reducingBalanceLoan({ loanAmount, annualRatePct, years }) {
  validateLoanInputs({ loanAmount, annualRatePct, years });
  const monthly = rawMonthly(loanAmount, annualRatePct, years, 'reducing');
  const totalPayment = monthly * years * 12;
  return {
    monthly: round2(monthly),
    totalPayment: round2(totalPayment),
    totalInterest: round2(totalPayment - loanAmount),
  };
}

function methodFor(loanType, override) {
  const cfg = LOAN_CONFIG.loanTypes[loanType];
  if (!cfg) throw new RangeError(`Unknown loan type "${loanType}".`);
  if (override === 'flat' && !cfg.flatAllowed) throw new RangeError('Housing loans are charged on a reducing balance, not a flat rate.');
  if (override === 'flat' || override === 'reducing') return override;
  return cfg.method;
}

/**
 * Yearly repayment schedule: [{ year, principal_paid, interest_paid, remaining_balance }]
 * Reducing: true amortisation. Flat: equal interest each month, balance falls linearly.
 */
function repaymentSchedule({ loanAmount, annualRatePct, years, method }) {
  validateLoanInputs({ loanAmount, annualRatePct, years });
  const n = Math.round(years * 12);
  const monthly = rawMonthly(loanAmount, annualRatePct, years, method);
  const r = annualRatePct / 100 / 12;
  const flatInterestPerMonth = (loanAmount * (annualRatePct / 100) * years) / n;

  const rows = [];
  let balance = loanAmount;
  let yearPrincipal = 0;
  let yearInterest = 0;

  for (let m = 1; m <= n; m++) {
    let interest;
    let principal;
    if (method === 'flat') {
      interest = flatInterestPerMonth;
      principal = loanAmount / n;
    } else {
      interest = balance * r;
      principal = monthly - interest;
    }
    if (m === n) principal = balance; // absorb floating-point drift on the last instalment
    balance -= principal;
    yearPrincipal += principal;
    yearInterest += interest;

    if (m % 12 === 0 || m === n) {
      rows.push({
        year: Math.ceil(m / 12),
        principal_paid: round2(yearPrincipal),
        interest_paid: round2(yearInterest),
        remaining_balance: round2(Math.max(0, balance)),
      });
      yearPrincipal = 0;
      yearInterest = 0;
    }
  }
  return rows;
}

/**
 * Full calculation for a loan request.
 * Personal loans pass loanAmount directly; car/house derive it from itemPrice - downPayment.
 */
function calculateLoan({ loanType, itemPrice = 0, downPayment = 0, loanAmount, annualRatePct, years, method }) {
  const interestMethod = methodFor(loanType, method);

  let principal;
  if (loanType === 'personal') {
    principal = Number(loanAmount ?? itemPrice);
    assertPositive('Loan amount', principal);
    downPayment = 0;
    itemPrice = principal;
  } else {
    assertPositive('Item price', itemPrice);
    assertNonNegative('Down payment', downPayment);
    if (downPayment > itemPrice) throw new RangeError('Down payment cannot exceed the item price.');
    principal = itemPrice - downPayment;
  }

  const result =
    interestMethod === 'flat'
      ? flatRateLoan({ loanAmount: principal, annualRatePct, years })
      : reducingBalanceLoan({ loanAmount: principal, annualRatePct, years });

  return {
    loanType,
    interestMethod,
    itemPrice: round2(itemPrice),
    downPayment: round2(downPayment),
    downPaymentRatio: itemPrice > 0 ? round2((downPayment / itemPrice) * 100) : 0,
    loanAmount: round2(principal),
    annualRatePct,
    // A flat quote's true cost, as the effective rate with the same instalment
    effectiveRatePct: interestMethod === 'flat' ? round2(effectiveFromFlat(annualRatePct, years)) : annualRatePct,
    years,
    ...result,
    schedule: repaymentSchedule({ loanAmount: principal, annualRatePct, years, method: interestMethod }),
  };
}

/** DSR (%) = (existing commitments + new instalment) / net income x 100 */
function calculateDsr({ netIncome, existingCommitments = 0, newInstalment = 0 }) {
  assertPositive('Monthly net income', netIncome);
  assertNonNegative('Existing commitments', existingCommitments);
  return round2(((existingCommitments + newInstalment) / netIncome) * 100);
}

function dsrBand(dsr) {
  const { healthyMax, moderateMax } = LOAN_CONFIG.dsrBands;
  if (dsr <= healthyMax) return 'Healthy';
  if (dsr <= moderateMax) return 'Moderate';
  return 'High';
}

/** Largest loan whose instalment does not exceed maxMonthly (inverse of the instalment formulas). */
function maxLoanForInstalment({ maxMonthly, annualRatePct, years, method }) {
  if (maxMonthly <= 0) return 0;
  const n = years * 12;
  const annual = annualRatePct / 100;
  if (method === 'flat') return (maxMonthly * n) / (1 + annual * years);
  const r = annual / 12;
  if (r === 0) return maxMonthly * n;
  const growth = Math.pow(1 + r, n);
  return (maxMonthly * (growth - 1)) / (r * growth);
}

/** Shortest whole-year tenure (<= maxYears) whose instalment fits under maxMonthly, or null. */
function minTenureForInstalment({ loanAmount, maxMonthly, annualRatePct, method, maxYears }) {
  for (let y = 1; y <= maxYears; y++) {
    if (rawMonthly(loanAmount, annualRatePct, y, method) <= maxMonthly) return y;
  }
  return null;
}

module.exports = {
  LOAN_CONFIG,
  round2,
  effectiveFromFlat,
  flatRateLoan,
  reducingBalanceLoan,
  repaymentSchedule,
  calculateLoan,
  calculateDsr,
  dsrBand,
  maxLoanForInstalment,
  minTenureForInstalment,
};
