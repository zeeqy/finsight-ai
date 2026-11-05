/**
 * FinSight AI - Savings Calculator (Module 4 Life Goals Planner)
 * Deterministic by design: future value, required monthly saving, feasibility.
 * Rates are annual PERCENT, compounded monthly (r = annual / 12).
 */

const SAVINGS_CONFIG = {
  // Feasibility ratio = required monthly / monthly surplus
  feasibility: { onTrackMax: 0.5, atRiskMax: 1.0 },
  // Expected annual rates (%) per savings vehicle: the latest published rate, used as the planning
  // rate. Past rates do not guarantee future ones; the user can enter their own.
  // Gold's rate comes from the ARIMA forecast (services/goldForecast.js); ratePct here is only
  // the fallback when the ML service is offline.
  vehicles: {
    piggybank: { label: 'Piggybank / cash', ratePct: 0, shariah: true, source: 'Cash earns nothing' },
    savings: {
      label: 'Savings account',
      ratePct: 0.65,
      shariah: false,
      source: 'Average commercial bank savings deposit rate, end-June 2026 (Bank Negara Malaysia, in MOF Malaysian Economy Q2 2026)',
    },
    tabung_haji: {
      label: 'Tabung Haji',
      ratePct: 3.5,
      shariah: true,
      source: 'Tabung Haji profit distribution for 2025, after zakat (Malay Mail, 18 Mar 2026); 3.10% to 3.50% from 2020 to 2025',
    },
    asb: {
      label: 'ASB',
      ratePct: 5.75,
      shariah: true,
      source: 'ASB distribution for FY2025: 5.20 sen dividend + 0.55 sen bonus per RM1 unit (The Star, 19 Dec 2025); 4.25 to 5.75 sen from 2020 to 2025',
    },
    gold: { label: 'Gold', ratePct: 5.0, shariah: true, forecast: true, source: 'ARIMA forecast of the gold price; 5% only when the forecast service is offline' },
  },
};

const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

/** Whole months from `from` to `to` (YYYY-MM-DD strings, no UTC shifting). Partial months round up. */
function monthsBetween(from, to) {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  let months = (ty - fy) * 12 + (tm - fm);
  if (td > fd) months += 1;
  return Math.max(0, months);
}

/** Adds n months to a YYYY-MM-DD string, clamping the day to the month's length. */
function addMonths(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const lastDay = new Date(ny, nm, 0).getDate();
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(d, lastDay)).padStart(2, '0')}`;
}

/** Required monthly saving with no growth. */
function requiredMonthlySimple({ target, currentSaved = 0, months }) {
  const remaining = Math.max(0, target - currentSaved);
  if (remaining === 0) return 0;
  if (months <= 0) return round2(remaining);
  return round2(remaining / months);
}

/** FV = P(1+r)^n + PMT x ((1+r)^n - 1) / r */
function futureValue({ principal = 0, monthly = 0, annualRatePct = 0, months }) {
  const r = annualRatePct / 100 / 12;
  if (r === 0) return round2(principal + monthly * months);
  const growth = Math.pow(1 + r, months);
  return round2(principal * growth + (monthly * (growth - 1)) / r);
}

/** PMT = (target - P(1+r)^n) x r / ((1+r)^n - 1) */
function requiredMonthlyWithGrowth({ target, currentSaved = 0, annualRatePct = 0, months }) {
  const r = annualRatePct / 100 / 12;
  if (r === 0) return requiredMonthlySimple({ target, currentSaved, months });
  if (months <= 0) return round2(Math.max(0, target - currentSaved));
  const growth = Math.pow(1 + r, months);
  const shortfall = target - currentSaved * growth;
  if (shortfall <= 0) return 0;
  return round2((shortfall * r) / (growth - 1));
}

/** Months needed to reach target saving `monthly` each month, or null if never. */
function monthsToReach({ target, currentSaved = 0, monthly, annualRatePct = 0 }) {
  if (currentSaved >= target) return 0;
  if (!(monthly > 0)) return null;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return Math.ceil((target - currentSaved) / monthly);
  const n = Math.log((target * r + monthly) / (currentSaved * r + monthly)) / Math.log(1 + r);
  // A negative rate (e.g. a cautious gold forecast) can make the target unreachable
  return Number.isFinite(n) && n >= 0 ? Math.ceil(n) : null;
}

/** Feasibility ratio = required / surplus -> On Track | At Risk | Not Feasible */
function feasibility({ requiredMonthly, monthlySurplus }) {
  if (requiredMonthly <= 0) return { ratio: 0, status: 'On Track' };
  if (!(monthlySurplus > 0)) return { ratio: null, status: 'Not Feasible' };
  const ratio = requiredMonthly / monthlySurplus;
  const { onTrackMax, atRiskMax } = SAVINGS_CONFIG.feasibility;
  let status = 'Not Feasible';
  if (ratio <= onTrackMax) status = 'On Track';
  else if (ratio <= atRiskMax) status = 'At Risk';
  return { ratio: round2(ratio), status };
}

module.exports = {
  SAVINGS_CONFIG,
  monthsBetween,
  addMonths,
  requiredMonthlySimple,
  futureValue,
  requiredMonthlyWithGrowth,
  monthsToReach,
  feasibility,
};
