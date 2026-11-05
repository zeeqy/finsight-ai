/**
 * Finds which parsed statement rows are already stored, so re-uploads and overlapping
 * statements are not counted twice.
 *
 * Pass 1 (same file again): same day, description and amount.
 * Pass 2 (same account, other file type): a CSV and a PDF word the same payment differently,
 * so a row still unmatched counts as stored when an unused stored row has the same day,
 * amount and direction. Each stored row can match only one new row, so two real RM 5.00
 * payments on one day both stay unless both are already stored.
 */

function dayOf(date) {
  if (date instanceof Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  return String(date).slice(0, 10);
}

const exactKey = (date, description, amount) => `${dayOf(date)}|${description}|${Number(amount).toFixed(2)}`;
const looseKey = (date, amount, isCredit) => `${dayOf(date)}|${Number(amount).toFixed(2)}|${isCredit ? 'in' : 'out'}`;

/**
 * @param parsed  [{txn_date, description, amount, isCredit}]
 * @param stored  [{id, txn_date, description, amount, category}]  (money in = category 'Income')
 * @returns {newTxns, sameFile, otherFile}  counts of rows skipped by each pass
 */
function matchStored(parsed, stored) {
  const byExact = new Map();
  const byLoose = new Map();
  for (const row of stored) {
    const e = exactKey(row.txn_date, row.description, row.amount);
    const l = looseKey(row.txn_date, row.amount, row.category === 'Income');
    if (!byExact.has(e)) byExact.set(e, []);
    if (!byLoose.has(l)) byLoose.set(l, []);
    byExact.get(e).push(row);
    byLoose.get(l).push(row);
  }
  const used = new Set();
  const takeFrom = (list) => {
    const hit = list?.find((row) => !used.has(row));
    if (hit) used.add(hit);
    return Boolean(hit);
  };

  const afterExact = parsed.filter((t) => !takeFrom(byExact.get(exactKey(t.txn_date, t.description, t.amount))));
  const newTxns = afterExact.filter((t) => !takeFrom(byLoose.get(looseKey(t.txn_date, t.amount, t.isCredit))));
  return {
    newTxns,
    sameFile: parsed.length - afterExact.length,
    otherFile: afterExact.length - newTxns.length,
  };
}

/** The month most rows fall in (the later one on a tie), for opening the dashboard on it. */
function mainMonth(rows) {
  const counts = new Map();
  for (const t of rows) {
    const ym = dayOf(t.txn_date).slice(0, 7);
    counts.set(ym, (counts.get(ym) || 0) + 1);
  }
  let best = null;
  for (const [ym, n] of counts) {
    if (!best || n > best.n || (n === best.n && ym > best.ym)) best = { ym, n };
  }
  if (!best) return null;
  const [year, month] = best.ym.split('-').map(Number);
  return { year, month };
}

module.exports = { matchStored, mainMonth };
