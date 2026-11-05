/**
 * FinSight AI - Next month's spending (Module 1). Simple, explainable forecasts compared on
 * real bank data before one was chosen (evaluation/behaviour/run.js, Berka dataset):
 *   naive  - last month again
 *   mean3  - average of the last 3 months
 *   ses    - simple exponential smoothing, alpha picked on the user's own history
 *   split  - recurring payments at their known amount + SES on everything else
 * Short histories are normal here (most users upload 3-6 months), so nothing needs a year of data.
 */

const ALPHAS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
const round2 = (x) => Math.round(x * 100) / 100;

const naive = (series) => (series.length ? series.at(-1) : null);

function mean3(series) {
  if (!series.length) return null;
  const last = series.slice(-3);
  return last.reduce((s, v) => s + v, 0) / last.length;
}

/** SES level after running through the series with a given alpha, starting from the first value. */
function sesLevel(series, alpha) {
  let level = series[0];
  for (let i = 1; i < series.length; i += 1) level = alpha * series[i] + (1 - alpha) * level;
  return level;
}

/** Alpha with the smallest one-step-ahead squared error on the series itself (0.3 when too short to tell). */
function bestAlpha(series) {
  if (series.length < 4) return 0.3;
  let best = { alpha: 0.3, sse: Infinity };
  for (const alpha of ALPHAS) {
    let level = series[0];
    let sse = 0;
    for (let i = 1; i < series.length; i += 1) {
      sse += (series[i] - level) ** 2;
      level = alpha * series[i] + (1 - alpha) * level;
    }
    if (sse < best.sse) best = { alpha, sse };
  }
  return best.alpha;
}

function ses(series) {
  if (!series.length) return null;
  return sesLevel(series, bestAlpha(series));
}

/** Recurring part at its latest known monthly amount, plus SES on the rest. */
function split(series, recurringSeries, recurringNext) {
  if (!series.length) return null;
  const rest = series.map((v, i) => Math.max(0, v - (recurringSeries[i] || 0)));
  return recurringNext + ses(rest);
}

const METHODS = { naive, mean3, ses };

/**
 * Next month's forecast with an 80% range from the method's own one-step errors on the history
 * (when there are at least 4 months; otherwise ±20% as a stated rough guess).
 */
function forecastNext(series, { method = 'split', recurringSeries = [], recurringNext = 0, actualSeries = series } = {}) {
  const run = (s, r) => (method === 'split' ? split(s, r, recurringNext) : METHODS[method](s));
  const point = run(series, recurringSeries);
  if (point === null) return null;

  // The low end comes from errors on usual spending; the high end from errors against what was
  // really spent (`actualSeries`, which may include one-off purchases the forecast leaves out),
  // because surprises only push spending up
  const usualErrors = [];
  const actualErrors = [];
  for (let i = 3; i < series.length; i += 1) {
    const past = series.slice(0, i);
    const pastRecurring = recurringSeries.slice(0, i);
    const guess = method === 'split' ? split(past, pastRecurring, recurringSeries[i] || 0) : METHODS[method](past);
    usualErrors.push(series[i] - guess);
    actualErrors.push(actualSeries[i] - guess);
  }
  const rms = (errs) => Math.sqrt(errs.reduce((s, e) => s + e * e, 0) / errs.length);
  let below;
  let above;
  let rangeSource;
  if (usualErrors.length >= 2) {
    below = 1.2816 * rms(usualErrors);
    above = 1.2816 * rms(actualErrors);
    rangeSource = 'past_errors';
  } else {
    below = 0.2 * point;
    above = 0.2 * point;
    rangeSource = 'rough';
  }
  return {
    point: round2(point),
    low: round2(Math.max(0, point - below)),
    high: round2(point + above),
    range_source: rangeSource,
    method,
  };
}

module.exports = { naive, mean3, ses, bestAlpha, split, forecastNext };
