/**
 * FinSight AI - Intelligent Malaysian Transaction Categorizer & Anomaly Detector
 * Accurately parses Malaysian bank statements (Bank Islam CASATIA, Maybank2u, CIMB, etc.)
 */

function categorizeTransaction(description = '', additionalContext = {}) {
  const desc = (description || '').toLowerCase().trim();
  const rawType = (additionalContext.txn_type || '').toLowerCase();
  const isCredit = Boolean(additionalContext.isCredit);

  // If flagged as credit/income
  if (isCredit) {
    return 'Income';
  }

  // Check explicit salary / income keywords
  if (
    desc.includes('salary') ||
    desc.includes('gaji') ||
    desc.includes('allowance') ||
    desc.includes('bonus') ||
    desc.includes('dividend') ||
    desc.includes('inw duitnow') ||
    desc.includes('inward transfer') ||
    desc.includes('hyratech') // Known freelance / employer
  ) {
    return 'Income';
  }

  // Transport & Mobility (Fuel, Parking, Taxis, Transit)
  if (
    desc.includes('myteksi') ||
    (desc.includes('grab') && !desc.includes('food')) ||
    desc.includes('airasia ride') ||
    desc.includes('petronas') ||
    desc.includes('shell') ||
    desc.includes('caltex') ||
    desc.includes('petron') ||
    desc.includes('bhp') ||
    desc.includes('esso') ||
    desc.includes('touch n go') ||
    desc.includes('tng') ||
    desc.includes('rapidkl') ||
    desc.includes('myrapid') ||
    desc.includes('lrt') ||
    desc.includes('mrt') ||
    desc.includes('ktm') ||
    desc.includes('parking') ||
    desc.includes('semasa parking') ||
    desc.includes('pss-') ||
    desc.includes('sales.cmp') || // Bank Islam (CASATIA) petrol station POS descriptor
    desc.includes('toll') ||
    desc.includes('plus expressways')
  ) {
    return 'Transport';
  }

  // Food & Dining (Restaurants, Cafes, Bakeries, Kopitiams, Fast Food)
  if (
    desc.includes('rotiboy') ||
    desc.includes('mcdonald') ||
    desc.includes('mcd') ||
    desc.includes('kfc') ||
    desc.includes('starbucks') ||
    desc.includes('tealive') ||
    desc.includes('zus coffee') ||
    desc.includes('zus') ||
    desc.includes('luckin') ||
    desc.includes('kopi saigon') ||
    desc.includes('kopi') ||
    desc.includes('cbtl') ||
    desc.includes('coffee bean') ||
    desc.includes('texas chicken') ||
    desc.includes('grabfood') ||
    desc.includes('foodpanda') ||
    desc.includes('restoran') ||
    desc.includes('restaurant') ||
    desc.includes('kopitiam') ||
    desc.includes('dodo korea') ||
    desc.includes('mon crispy') ||
    desc.includes('kabin hitam') ||
    desc.includes('fish & co') ||
    desc.includes('tcrs') ||
    desc.includes('chicken rice') ||
    desc.includes('bread history') ||
    desc.includes('subway') ||
    desc.includes('pizza') ||
    desc.includes('pizza hut') ||
    desc.includes('mamak') ||
    desc.includes('cafe') ||
    desc.includes('bakery') ||
    desc.includes('dunkin') ||
    desc.includes('secret recipe') ||
    desc.includes('marrybrown') ||
    desc.includes('bistro') ||
    desc.includes('nasi') ||
    desc.includes('wisma central') ||
    desc.includes('aqil maula') ||
    desc.includes('burger') ||
    desc.includes('cendol') ||
    desc.includes('boba') ||
    desc.includes('dining') ||
    desc.includes('kitchen')
  ) {
    return 'Food & Dining';
  }

  // Groceries & Supermarkets
  if (
    desc.includes('lotus') ||
    desc.includes('tesco') ||
    desc.includes('aeon') ||
    desc.includes('jaya grocer') ||
    desc.includes('village grocer') ||
    desc.includes('99 speedmart') ||
    desc.includes('speedmart') ||
    desc.includes('kk family mart') ||
    desc.includes('family mart') ||
    desc.includes('giant') ||
    desc.includes('hero market') ||
    desc.includes('supermarket') ||
    desc.includes('grocery') ||
    desc.includes('mydin') ||
    desc.includes('nsk') ||
    desc.includes('econsave') ||
    desc.includes('pasar')
  ) {
    return 'Groceries';
  }

  // Shopping & Retail
  if (
    desc.includes('shopee') ||
    desc.includes('lazada') ||
    desc.includes('tiktok shop') ||
    desc.includes('uniqlo') ||
    desc.includes('zara') ||
    desc.includes('watsons') ||
    desc.includes('guardian') ||
    desc.includes('h&m') ||
    desc.includes('ikea') ||
    desc.includes('padini') ||
    desc.includes('kaison') ||
    desc.includes('mr diy') ||
    desc.includes('mr. diy') ||
    desc.includes('popular') ||
    desc.includes('sephora') ||
    desc.includes('cotton on') ||
    desc.includes('elmina lakeside')
  ) {
    return 'Shopping';
  }

  // Utilities & Telco Bills
  if (
    desc.includes('tnb') ||
    desc.includes('tenaga') ||
    desc.includes('unifi') ||
    desc.includes('maxis') ||
    desc.includes('celcom') ||
    desc.includes('digi') ||
    desc.includes('umobile') ||
    desc.includes('u mobile') ||
    desc.includes('yoodo') ||
    desc.includes('astro') ||
    desc.includes('air selangor') ||
    desc.includes('syabas') ||
    desc.includes('water') ||
    desc.includes('telekom') ||
    desc.includes('tm point') ||
    desc.includes('indah water') ||
    desc.includes('time dotcom') ||
    desc.includes('bill')
  ) {
    return 'Utilities';
  }

  // Healthcare & Wellness
  if (
    desc.includes('clinic') ||
    desc.includes('klinik') ||
    desc.includes('hospital') ||
    desc.includes('pharmacy') ||
    desc.includes('farmasi') ||
    desc.includes('doctor') ||
    desc.includes('mediviron') ||
    desc.includes('caring') ||
    desc.includes('dental') ||
    desc.includes('gigi')
  ) {
    return 'Healthcare';
  }

  // Entertainment & Subscriptions
  if (
    desc.includes('ticketmelon') ||
    desc.includes('2c2p') ||
    desc.includes('netflix') ||
    desc.includes('spotify') ||
    desc.includes('youtube') ||
    desc.includes('cinema') ||
    desc.includes('tgv') ||
    desc.includes('gsc') ||
    desc.includes('steam') ||
    desc.includes('playstation') ||
    desc.includes('disney') ||
    desc.includes('nintendo')
  ) {
    return 'Entertainment';
  }

  // Education
  if (
    desc.includes('universiti') ||
    // Short university codes must be whole words: includes('um') matched "premium", "museum", "summit"
    /\b(uitm|um|ukm|upm|utm|usm)\b/.test(desc) ||
    desc.includes('college') ||
    desc.includes('ptptn') ||
    desc.includes('coursera') ||
    desc.includes('udemy')
  ) {
    return 'Education';
  }

  // Peer-to-peer personal transfers
  if (desc.includes('duitnow qr p2p') || desc.includes('duitnow transfer') || desc.includes('p2p')) {
    return 'Personal Transfer';
  }

  return 'Others';
}

/**
 * Anomaly detection — per-category Z-score (statistical method, NOT machine learning).
 *
 * A spending transaction is an anomaly when it lies more than Z_THRESHOLD standard
 * deviations ABOVE the mean of the OTHER transactions in the same category:
 *
 *     Z = (amount − mean_of_category_peers) / std_dev_of_category_peers
 *     flag if Z > 2.5   (one-sided: unusually HIGH spending only — a cheaper-than-usual
 *                        purchase is not a financial risk, so it is not alerted)
 *
 * - Leave-one-out: the transaction is compared against its peers, not including itself
 *   (otherwise a single outlier inflates the std dev and can never reach |Z| > 2.5 on small samples).
 * - Income is never flagged (only spending is analysed).
 * - A category needs at least MIN_PEERS other transactions before it can be judged.
 * - Materiality floor: the amount must ALSO differ from the peer mean by at least
 *   MIN_RELATIVE_DEVIATION (25%). Without it, very consistent spending (e.g. rent RM900 every
 *   month) gives a tiny std dev, so paying RM950 once would score Z ≈ 5 and be flagged even
 *   though it is not meaningful to the user. Flag = statistically AND practically significant.
 */
const Z_THRESHOLD = 2.5;
const MIN_PEERS = 5;
const MIN_RELATIVE_DEVIATION = 0.25;
const EXCLUDED_CATEGORIES = new Set(['Income']);

function toAmount(value) {
  return Math.abs(parseFloat(value) || 0);
}

/**
 * Compute anomaly flags for a list of transactions in one pass.
 * @param {Array<{amount:number|string, category:string}>} txns - ALL of a user's transactions
 * @returns {Array<{isAnomaly:boolean, zScore:number|null}>} same order as input
 */
function computeAnomalyFlags(txns = []) {
  // Per-category running totals so each leave-one-out mean/std is O(1)
  const stats = {};
  for (const t of txns) {
    const cat = t.category || 'Others';
    if (EXCLUDED_CATEGORIES.has(cat)) continue;
    const x = toAmount(t.amount);
    if (!stats[cat]) stats[cat] = { n: 0, sum: 0, sumSq: 0 };
    stats[cat].n += 1;
    stats[cat].sum += x;
    stats[cat].sumSq += x * x;
  }

  return txns.map((t) => {
    const cat = t.category || 'Others';
    if (EXCLUDED_CATEGORIES.has(cat) || !stats[cat]) return { isAnomaly: false, zScore: null };

    const x = toAmount(t.amount);
    const n = stats[cat].n - 1; // peers, excluding this transaction
    if (n < MIN_PEERS) return { isAnomaly: false, zScore: null };

    const sum = stats[cat].sum - x;
    const sumSq = stats[cat].sumSq - x * x;
    const mean = sum / n;
    // Sample variance of the peers (n − 1 denominator); clamp tiny negatives from float error
    const variance = Math.max(0, (sumSq - n * mean * mean) / (n - 1));
    const stdDev = Math.sqrt(variance);

    const deviation = Math.abs(x - mean);
    const isHigher = x > mean;
    const isMaterial = isHigher && (mean > 0 ? deviation / mean >= MIN_RELATIVE_DEVIATION : deviation > 0);

    // All peers (almost) identical → Z is undefined; flag only a material change
    // (e.g. a RM54.90 subscription that suddenly charges RM120)
    if (stdDev < 0.01) return { isAnomaly: isMaterial, zScore: null };

    const zScore = (x - mean) / stdDev;
    return {
      isAnomaly: zScore > Z_THRESHOLD && isMaterial,
      zScore: Math.round(zScore * 100) / 100,
    };
  });
}

/**
 * Robust alternative for comparison (Leys et al., 2013): the same leave-one-out peer group,
 * materiality floor and Income rule, but the centre is the peers' MEDIAN and the spread their
 * median absolute deviation, so one earlier big purchase cannot hide the next one.
 *   robust Z = 0.6745 × (amount − median) / MAD    (0.6745 makes MAD comparable to a std dev)
 * Evaluated against the Z-score rule in evaluation/behaviour/run.js before choosing which to deploy.
 */
const MAD_THRESHOLD = 3.5; // Iglewicz & Hoaglin (1993); Leys et al. also discuss 2.5 and 3

function medianOf(sorted) {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function computeAnomalyFlagsMad(txns = [], threshold = MAD_THRESHOLD) {
  const byCat = {};
  txns.forEach((t, i) => {
    const cat = t.category || 'Others';
    if (EXCLUDED_CATEGORIES.has(cat)) return;
    (byCat[cat] = byCat[cat] || []).push(i);
  });

  const out = txns.map(() => ({ isAnomaly: false, zScore: null }));
  for (const idx of Object.values(byCat)) {
    if (idx.length - 1 < MIN_PEERS) continue;
    const amounts = idx.map((i) => toAmount(txns[i].amount));
    amounts.forEach((x, k) => {
      const peers = amounts.filter((_, j) => j !== k).sort((a, b) => a - b);
      const med = medianOf(peers);
      const mad = medianOf(peers.map((p) => Math.abs(p - med)).sort((a, b) => a - b));
      const isMaterial = x > med && (med > 0 ? (x - med) / med >= MIN_RELATIVE_DEVIATION : x > 0);
      if (mad < 0.01) {
        out[idx[k]] = { isAnomaly: isMaterial, zScore: null };
        return;
      }
      const z = (0.6745 * (x - med)) / mad;
      out[idx[k]] = { isAnomaly: z > threshold && isMaterial, zScore: Math.round(z * 100) / 100 };
    });
  }
  return out;
}

/**
 * Single-transaction check against a list of peer transactions (kept for convenience).
 * @param {number} amount
 * @param {string} category
 * @param {Array<{amount, category}>} history - other transactions (must NOT include this one)
 */
function detectAnomaly(amount, category, history = []) {
  const flags = computeAnomalyFlags([...history, { amount, category }]);
  return flags[flags.length - 1].isAnomaly;
}

module.exports = {
  categorizeTransaction,
  computeAnomalyFlags,
  computeAnomalyFlagsMad,
  detectAnomaly,
  Z_THRESHOLD,
  MAD_THRESHOLD,
  MIN_PEERS,
  MIN_RELATIVE_DEVIATION,
};
