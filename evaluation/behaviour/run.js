/**
 * FinSight AI - Phase 2 evaluation on real bank data (Berka / PKDD'99 Czech bank dataset).
 * Runs the exact functions the app uses:
 *   1. Recurring payment detection vs the bank's own standing orders (order.asc) as ground truth
 *   2. Next-month spending forecast: naive, 3-month mean, SES, recurring + SES, rolling origin, MASE
 *   3. Anomaly rules: leave-one-out Z-score (deployed) vs median/MAD, on injected known anomalies
 *
 * Data: ml-service/data/raw/berka/{trans,order}.asc (gitignored; mirror of the original files at
 * https://github.com/jlacko/berka-dataset). Usage: node evaluation/behaviour/run.js
 * Writes evaluation/results/behaviour_results.{json,md}.
 */
const fs = require('fs');
const path = require('path');
const { detectRecurring, merchantKey } = require('../../server/src/services/recurring');
const { naive, mean3, ses, split, forecastNext } = require('../../server/src/services/spendForecast');
const { computeAnomalyFlags, computeAnomalyFlagsMad } = require('../../server/src/utils/categorizer');

const DATA = path.join(__dirname, '..', '..', 'ml-service', 'data', 'raw', 'berka');
const OUT = path.join(__dirname, '..', 'results');
const WINDOW_MONTHS = 6; // what a FinSight user typically uploads
const LAST_MONTH = '1998-12';

// ---------- load ----------
const unq = (s) => s.replace(/^"|"$/g, '');
function readAsc(file) {
  const lines = fs.readFileSync(path.join(DATA, file), 'utf8').split(/\r?\n/).filter(Boolean);
  const head = lines[0].split(';').map(unq);
  return lines.slice(1).map((l) => {
    const cells = l.split(';').map(unq);
    return Object.fromEntries(head.map((h, i) => [h, cells[i]]));
  });
}

const ymd = (d) => `19${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4, 6)}`;
const OPERATION = {
  'VYBER KARTOU': ['CARD WITHDRAWAL', 'Card'],
  VYBER: ['CASH WITHDRAWAL', 'Cash'],
  'PREVOD NA JINOU BANKU': [null, 'Transfer'],
};

console.log('Loading Berka data...');
const orders = readAsc('order.asc');
const trans = readAsc('trans.asc');
console.log(`  ${trans.length.toLocaleString()} transactions, ${orders.length.toLocaleString()} standing orders`);

// Debits only, written like a statement line. Bank-generated lines with no payee (statement fees,
// penalty interest) are left out: they are not payments a user sets up.
const byAccount = new Map();
for (const t of trans) {
  if (t.type === 'PRIJEM') continue;
  const payee = t.bank && t.account ? `${t.bank}${t.account}` : null;
  const op = OPERATION[t.operation];
  let description;
  let category;
  if (payee) {
    description = `TRANSFER ${payee}`;
    category = 'Transfer';
  } else if (op && op[0]) {
    [description, category] = op;
  } else continue;
  const row = { id: +t.trans_id, date: ymd(t.date), description, amount: parseFloat(t.amount), category, payee };
  if (!byAccount.has(t.account_id)) byAccount.set(t.account_id, []);
  byAccount.get(t.account_id).push(row);
}

const ordersByAccount = new Map();
for (const o of orders) {
  if (!ordersByAccount.has(o.account_id)) ordersByAccount.set(o.account_id, []);
  ordersByAccount.get(o.account_id).push({ payee: `${o.bank_to}${o.account_to}`, kind: o.k_symbol || 'other' });
}

const monthOf = (d) => d.slice(0, 7);
function monthsBack(ym, n) {
  let [y, m] = ym.split('-').map(Number);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    out.unshift(`${y}-${String(m).padStart(2, '0')}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

// ---------- 1. recurring ----------
function evaluateRecurring(windowMonths) {
  const months = new Set(monthsBack(LAST_MONTH, windowMonths));
  const tally = { tp: 0, fp: 0, fn: 0 };
  const naiveTally = { tp: 0, fp: 0, fn: 0 };
  const byKind = {};
  let accounts = 0;
  for (const [acc, txns] of byAccount) {
    const win = txns.filter((t) => months.has(monthOf(t.date)));
    if (!win.length) continue;
    accounts += 1;
    // Ground truth: standing-order payees that were actually paid in the window
    const paid = new Set(win.filter((t) => t.payee).map((t) => t.payee));
    const truth = new Map((ordersByAccount.get(acc) || []).filter((o) => paid.has(o.payee)).map((o) => [o.payee, o.kind]));

    // A "payee" is the transfer account, or the withdrawal line itself (never a standing order,
    // so flagging regular cash withdrawals as a recurring payment counts as a false positive)
    const payeeOf = (t) => t.payee || t.description;
    const found = new Set(
      detectRecurring(win)
        .filter((r) => r.active)
        .map((r) => payeeOf(win.find((t) => merchantKey(t.description) === r.key)))
    );
    // Baseline: anything paid 3+ times in the window counts as recurring
    const counts = new Map();
    win.forEach((t) => counts.set(payeeOf(t), (counts.get(payeeOf(t)) || 0) + 1));
    const naiveFound = new Set([...counts].filter(([, c]) => c >= 3).map(([p]) => p));

    for (const [set, t] of [[found, tally], [naiveFound, naiveTally]]) {
      for (const p of set) (truth.has(p) ? t.tp++ : t.fp++);
      for (const p of truth.keys()) if (!set.has(p)) t.fn++;
    }
    for (const [p, kind] of truth) {
      byKind[kind] = byKind[kind] || { total: 0, found: 0 };
      byKind[kind].total += 1;
      if (found.has(p)) byKind[kind].found += 1;
    }
  }
  const score = ({ tp, fp, fn }) => {
    const precision = tp / (tp + fp);
    const recall = tp / (tp + fn);
    return { tp, fp, fn, precision: +precision.toFixed(4), recall: +recall.toFixed(4), f1: +((2 * precision * recall) / (precision + recall)).toFixed(4) };
  };
  return { window_months: windowMonths, accounts, detector: score(tally), baseline_3_payments: score(naiveTally), recall_by_order_type: byKind };
}

// ---------- 2. forecast ----------
function evaluateForecast(historyMonths) {
  const targets = monthsBack(LAST_MONTH, 12);
  const methods = ['naive', 'mean3', 'ses', 'split', 'split_usual'];
  const err = Object.fromEntries(methods.map((m) => [m, { mase: [], ape: [], abs: [] }]));
  const coverage = { inside: 0, total: 0 };
  let series = 0;

  for (const [, txns] of byAccount) {
    const totals = new Map();
    for (const t of txns) totals.set(monthOf(t.date), (totals.get(monthOf(t.date)) || 0) + t.amount);
    for (const target of targets) {
      const hist = monthsBack(target, historyMonths + 1).slice(0, -1);
      if (!hist.every((m) => totals.has(m)) || !totals.has(target)) continue;
      const y = hist.map((m) => totals.get(m));
      const actual = totals.get(target);
      // In-sample naive error as the MASE scale (Hyndman & Koehler, 2006)
      const scale = y.slice(1).reduce((s, v, i) => s + Math.abs(v - y[i]), 0) / (y.length - 1);
      if (!(scale > 0) || !(actual > 0)) continue;

      const histSet = new Set(hist);
      const histTxns = txns.filter((t) => histSet.has(monthOf(t.date)));
      const recurring = detectRecurring(histTxns);
      const recurringIds = new Set(recurring.flatMap((r) => r.txn_ids));
      const recurringSeries = hist.map((m) => histTxns.filter((t) => monthOf(t.date) === m && recurringIds.has(t.id)).reduce((s, t) => s + t.amount, 0));
      const recurringNext = recurring.filter((r) => r.active).reduce((s, r) => s + r.monthly_amount, 0);

      // Same, but purchases the anomaly rule flags as unusual are left out of the history
      const flags = computeAnomalyFlags(histTxns);
      const unusual = new Set(histTxns.filter((t, i) => flags[i].isAnomaly).map((t) => t.id));
      const yUsual = hist.map((m) => histTxns.filter((t) => monthOf(t.date) === m && !unusual.has(t.id)).reduce((s, t) => s + t.amount, 0));

      const guesses = {
        naive: naive(y),
        mean3: mean3(y),
        ses: ses(y),
        split: split(y, recurringSeries, recurringNext),
        split_usual: split(yUsual, recurringSeries, recurringNext),
      };
      for (const m of methods) {
        const e = Math.abs(actual - guesses[m]);
        err[m].mase.push(e / scale);
        err[m].ape.push(e / actual);
        err[m].abs.push(e);
      }
      // Range coverage of the deployed forecast (split on usual spending)
      const f = forecastNext(yUsual, { method: 'split', recurringSeries, recurringNext, actualSeries: y });
      coverage.total += 1;
      if (actual >= f.low && actual <= f.high) coverage.inside += 1;
      series += 1;
    }
  }
  const med = (a) => [...a].sort((x, z) => x - z)[Math.floor(a.length / 2)];
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  return {
    history_months: historyMonths,
    forecasts: series,
    methods: Object.fromEntries(
      methods.map((m) => [m, { mean_mase: +mean(err[m].mase).toFixed(3), median_mase: +med(err[m].mase).toFixed(3), median_ape: +med(err[m].ape).toFixed(4), mae_czk: +mean(err[m].abs).toFixed(0) }])
    ),
    deployed_80pct_range_coverage: +(coverage.inside / coverage.total).toFixed(3),
  };
}

// ---------- 3. anomalies ----------
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function evaluateAnomalies(factor) {
  const months = new Set(monthsBack(LAST_MONTH, WINDOW_MONTHS));
  const rand = rng(42);
  const rules = {
    zscore_2_5: (t) => computeAnomalyFlags(t),
    mad_3_5: (t) => computeAnomalyFlagsMad(t, 3.5),
    mad_2_5: (t) => computeAnomalyFlagsMad(t, 2.5),
  };
  const res = Object.fromEntries(Object.keys(rules).map((k) => [k, { caught: 0, injected: 0, falseFlags: 0, normal: 0 }]));
  for (const [, txns] of byAccount) {
    const win = txns.filter((t) => months.has(monthOf(t.date)));
    if (win.length < 12) continue;
    // One injected purchase per account: a copy of a random real debit at `factor` times its category median
    const base = win[Math.floor(rand() * win.length)];
    const peers = win.filter((t) => t.category === base.category).map((t) => t.amount).sort((a, b) => a - b);
    const injected = { ...base, id: -1, amount: peers[Math.floor(peers.length / 2)] * factor };
    const all = [...win, injected];
    for (const [name, rule] of Object.entries(rules)) {
      const flags = rule(all);
      const r = res[name];
      flags.forEach((f, i) => {
        if (all[i].id === -1) {
          r.injected += 1;
          if (f.isAnomaly) r.caught += 1;
        } else {
          r.normal += 1;
          if (f.isAnomaly) r.falseFlags += 1;
        }
      });
    }
  }
  return {
    factor,
    rules: Object.fromEntries(
      Object.entries(res).map(([k, r]) => [k, { detection_rate: +(r.caught / r.injected).toFixed(4), flag_rate_on_real: +(r.falseFlags / r.normal).toFixed(4), injected: r.injected }])
    ),
  };
}

// ---------- run ----------
const t0 = Date.now();
const results = {
  dataset: 'Berka PKDD99 Czech bank (debits with a payee, plus cash and card withdrawals)',
  accounts: byAccount.size,
  recurring: [evaluateRecurring(6), evaluateRecurring(12)],
  forecast: [evaluateForecast(6), evaluateForecast(12)],
  anomalies: [evaluateAnomalies(2), evaluateAnomalies(3), evaluateAnomalies(5)],
};
results.seconds = +((Date.now() - t0) / 1000).toFixed(1);
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'behaviour_results.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
