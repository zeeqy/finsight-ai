/**
 * FinSight AI - Gold price outlook (Module 4)
 *
 * Wraps the ML service's ARIMA forecast (GET /forecast/gold). The forecast turns into an
 * annual growth rate to the goal's target date, so the deterministic savings maths in
 * savingsCalc.js can treat gold like any other vehicle. Plans use the CAUTIOUS rate (the
 * 80% interval's lower bound): gold is volatile, so the plan should still work if prices
 * come in at the low end. Returns null when the service or model is unavailable.
 */

const { mlGet } = require('./mlClient');

const CACHE_TTL_MS = 60 * 60 * 1000; // the model is static; an hour avoids refitting per request
const cache = new Map();

async function getGoldOutlook(months) {
  const key = Math.max(1, Math.round(months));
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

  try {
    const data = await mlGet(`/forecast/gold?months=${key}`, { timeoutMs: 3000 });
    cache.set(key, { at: Date.now(), data });
    return data;
  } catch (err) {
    console.warn('[Gold] forecast unavailable, using placeholder rate:', err.message);
    return null;
  }
}

/** Planning rate for gold over `months`: { ratePct, rates, source, note }. */
async function goldPlanningRate(months, fallbackRatePct) {
  const outlook = await getGoldOutlook(months);
  if (!outlook) {
    return {
      ratePct: fallbackRatePct,
      rates: null,
      source: 'placeholder',
      note: 'Placeholder rate. The gold price forecast service is offline.',
    };
  }
  const r = outlook.annual_rate_pct;
  return {
    ratePct: r.cautious,
    rates: r,
    source: 'arima',
    note: `Planned at the cautious forecast rate (${r.cautious}% a year), the low end of the ARIMA model's 80% range. Expected: ${r.expected}%, optimistic: ${r.optimistic}%. Gold prices can fall.`,
  };
}

module.exports = { getGoldOutlook, goldPlanningRate };
