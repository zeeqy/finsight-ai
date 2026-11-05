/**
 * FinSight AI - Recurring payment detection (Module 1). Statistical rules, no training:
 * the same payee, a regular gap between payments, and either a steady amount (subscriptions,
 * instalments, standing orders) or a bill-like payee whose amount varies (electricity, phone).
 * Evaluated on the Berka bank dataset's standing orders: evaluation/behaviour/run.js.
 */

const DAY_MS = 86400000;

const CONFIG = {
  minOccurrences: 3,
  cadences: {
    weekly: { median: [6, 8], gap: [5, 9], perMonth: 4.33 },
    monthly: { median: [26, 35], gap: [20, 40], perMonth: 1 },
  },
  regularShare: 0.75, // share of gaps that must fit the cadence
  fixedTolerance: 0.1, // fixed amount: every payment within ±10% of the median
  billMaxCv: 0.5, // bills may vary, but not wildly
  activeGrace: 1.5, // still active if the last payment is within 1.5 gaps of the latest statement date
};

// Payees whose amount changes every month but which are still a regular bill
const BILL_PATTERN =
  /\b(TENAGA|TNB|AIR SELANGOR|SYABAS|INDAH WATER|UNIFI|TELEKOM|TM NET|DIGI|CELCOM|MAXIS|U MOBILE|UMOBILE|YES 4G|ASTRO|TIME DOTCOM|JOMPAY|STANDING INSTRUCTION|AUTO ?DEBIT|INSURANCE|TAKAFUL|PRUDENTIAL|GREAT EASTERN|AIA|ETIQA|ALLIANZ|PTPTN|CUKAI|ASSESSMENT)\b/;
const BILL_CATEGORIES = new Set(['Utilities']);

/**
 * A payee key that survives statement noise: upper case, punctuation and short numbers
 * (store numbers, dates) removed, long digit runs (account numbers) kept, first 4 words.
 */
function merchantKey(description) {
  const tokens = String(description || '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !(/^\d+$/.test(t) && t.length < 6));
  return tokens.slice(0, 4).join(' ');
}

const toDay = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / DAY_MS;
const fromDay = (d) => new Date(d * DAY_MS).toISOString().slice(0, 10);
const round2 = (x) => Math.round(x * 100) / 100;

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mostCommon(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/** Which cadence the gaps fit, or null. */
function cadenceOf(gaps) {
  const mid = median(gaps);
  for (const [name, c] of Object.entries(CONFIG.cadences)) {
    if (mid < c.median[0] || mid > c.median[1]) continue;
    const fit = gaps.filter((g) => g >= c.gap[0] && g <= c.gap[1]).length / gaps.length;
    if (fit >= CONFIG.regularShare) return name;
  }
  return null;
}

/**
 * Finds regular payments in a list of transactions.
 * txns: [{ id?, date: 'YYYY-MM-DD', description, amount (positive), category }]; Income rows are ignored.
 * Returns one entry per payee, sorted by monthly cost, with the ids of the matching transactions.
 */
function detectRecurring(txns) {
  const outflows = txns.filter((t) => t.category !== 'Income' && parseFloat(t.amount) > 0);
  if (!outflows.length) return [];
  const latestDay = Math.max(...outflows.map((t) => toDay(t.date)));

  const groups = new Map();
  for (const t of outflows) {
    const key = merchantKey(t.description);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }

  const found = [];
  for (const [key, list] of groups) {
    if (list.length < CONFIG.minOccurrences) continue;
    const sorted = [...list].sort((a, b) => toDay(a.date) - toDay(b.date));
    const days = sorted.map((t) => toDay(t.date));
    const gaps = days.slice(1).map((d, i) => d - days[i]);
    if (gaps.some((g) => g === 0)) continue; // several payments on one day: a shop, not a bill
    const cadence = cadenceOf(gaps);
    if (!cadence) continue;

    const amounts = sorted.map((t) => parseFloat(t.amount));
    const mid = median(amounts);
    const fixed = amounts.every((a) => Math.abs(a - mid) <= mid * CONFIG.fixedTolerance);
    let kind = fixed ? 'fixed' : null;
    if (!kind && cadence === 'monthly') {
      const mean = amounts.reduce((s, a) => s + a, 0) / amounts.length;
      const cv = Math.sqrt(amounts.reduce((s, a) => s + (a - mean) ** 2, 0) / amounts.length) / mean;
      const category = mostCommon(sorted.map((t) => t.category));
      const billLike = BILL_CATEGORIES.has(category) || BILL_PATTERN.test(key) || BILL_PATTERN.test(String(sorted.at(-1).description).toUpperCase());
      if (billLike && cv <= CONFIG.billMaxCv) kind = 'bill';
    }
    if (!kind) continue;

    const gap = median(gaps);
    const last = days.at(-1);
    // Bills are planned at the average of the last three, fixed payments at their usual amount
    const typical = kind === 'bill' ? amounts.slice(-3).reduce((s, a) => s + a, 0) / Math.min(3, amounts.length) : mid;
    found.push({
      key,
      merchant: mostCommon(sorted.map((t) => t.description)),
      category: mostCommon(sorted.map((t) => t.category)),
      cadence,
      kind,
      typical_amount: round2(typical),
      monthly_amount: round2(typical * CONFIG.cadences[cadence].perMonth),
      occurrences: sorted.length,
      first_date: fromDay(days[0]),
      last_date: fromDay(last),
      next_date: fromDay(last + Math.round(gap)),
      active: latestDay - last <= gap * CONFIG.activeGrace,
      txn_ids: sorted.map((t) => t.id).filter((id) => id !== undefined),
    });
  }
  return found.sort((a, b) => b.monthly_amount - a.monthly_amount);
}

module.exports = { CONFIG, merchantKey, cadenceOf, detectRecurring };
