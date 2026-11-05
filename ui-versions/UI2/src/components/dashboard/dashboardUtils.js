/**
 * Shared helpers for the Spend Analyser (Module 1) dashboard components.
 */

export const DEFAULT_CATEGORY_COLORS = {
  'Food & Dining': 'var(--cat-food)',
  Transport: 'var(--cat-transport)',
  Shopping: 'var(--cat-shopping)',
  Utilities: 'var(--cat-utilities)',
  Groceries: 'var(--cat-groceries)',
  Healthcare: 'var(--cat-healthcare)',
  Entertainment: 'var(--cat-entertainment)',
  Education: 'var(--cat-education)',
  'Personal Transfer': 'var(--cat-transfer)',
  Income: 'var(--cat-income)',
  Others: 'var(--cat-others)',
};

const EXTRA_PALETTE = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((k) => `var(--cat-${k})`);

export const DEFAULT_CATEGORIES = [
  'Food & Dining',
  'Transport',
  'Groceries',
  'Shopping',
  'Utilities',
  'Healthcare',
  'Entertainment',
  'Education',
  'Personal Transfer',
];

/** Stable colour per category: fixed for the defaults, hashed into a palette for custom ones. */
export function getCategoryColor(catName) {
  if (DEFAULT_CATEGORY_COLORS[catName]) return DEFAULT_CATEGORY_COLORS[catName];
  let hash = 0;
  for (let i = 0; i < catName.length; i++) {
    hash = catName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return EXTRA_PALETTE[Math.abs(hash) % EXTRA_PALETTE.length];
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const monthName = (m) => MONTH_NAMES[m - 1] || `Month ${m}`;
export const shortMonth = (m) => monthName(m).slice(0, 3);

export const fmtRM = (n) =>
  `RM ${Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmtRM0 = (n) => `RM ${Math.round(Number(n || 0)).toLocaleString('en-MY')}`;

/**
 * 50/30/20 rule groups. Needs = essentials, wants = discretionary. Transfers and
 * uncategorised spending can be either, so they are shown separately, not guessed.
 */
export const NEEDS_CATEGORIES = ['Groceries', 'Utilities', 'Transport', 'Healthcare', 'Education'];
export const WANTS_CATEGORIES = ['Food & Dining', 'Shopping', 'Entertainment'];

/** Monthly spend and inflow per month, from the all-time ledger, oldest first. */
export function monthlyTotals(transactions, limit = 6) {
  const byMonth = new Map();
  for (const t of transactions) {
    // mysql2 sends DATE columns as UTC timestamps of local midnight (1 Oct arrives as 30 Sep 16:00Z),
    // so group by the browser's local date, the same way the ledger displays it
    const d = new Date(t.txn_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const row = byMonth.get(key) || { key, spend: 0, inflow: 0 };
    if (t.category === 'Income') row.inflow += Number(t.amount);
    else row.spend += Number(t.amount);
    byMonth.set(key, row);
  }
  return [...byMonth.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(-limit)
    .map((r) => {
      const [y, m] = r.key.split('-').map(Number);
      return { ...r, year: y, month: m, label: `${shortMonth(m)} ${String(y).slice(2)}` };
    });
}

// Anonymised sample in the Maybank CASATIA export format (Date, Time, Reference 1/2, Description, +/-RM)
const SAMPLE_CSV =
  'Date,Time,Reference 1,Reference 2,Transaction Description,Transaction Amount\n' +
  '17 Oct 2026,07:59:16 PM,MYTEKSI SDN. BHD.,AHMAD BIN ALI,INW DuitNow Transfer,+RM36.85\n' +
  '16 Oct 2026,05:36:19 PM,ROTIBOY-BDR SAUJANA SG BULOH,,MyDEBIT SA PURCHASE,-RM15.90\n' +
  '16 Oct 2026,02:32:44 PM,SHELL - SKYN 13 SHAH ALAM,,MyDEBIT SA SALES.CMP,-RM24.98\n' +
  '15 Oct 2026,12:35:38 PM,RESTORAN AL-AZIZ SHAH ALAM,,MyDEBIT SA PURCHASE,-RM3.00\n' +
  '14 Oct 2026,06:22:50 PM,DAILY KOPITIAM KUALA LUMPUR,,MyDEBIT SA PURCHASE,-RM1.00\n' +
  '14 Oct 2026,01:51:29 PM,PETRON KG KEBUN BUNGA,,MyDEBIT SA SALES.CMP,-RM10.00\n' +
  '13 Oct 2026,11:00:09 PM,CENTRAL I-CITY - PARKING,,MyDEBIT SA PURCHASE,-RM4.00\n' +
  "11 Oct 2026,08:15:03 AM,MCDONALD'S-BS COALFIELDS,,BIDC RTL POST NON US,-RM6.20\n" +
  '10 Oct 2026,04:23:52 PM,KOPI SAIGON - I-CITY,,MyDEBIT SA PURCHASE,-RM10.49\n' +
  '09 Oct 2026,09:10:20 PM,99 SPEEDMART-1535 SELANGOR,,MyDEBIT SA PURCHASE,-RM11.05\n' +
  '08 Oct 2026,07:40:44 PM,FISH & CO KUALA LUMPUR,,MyDEBIT SA PURCHASE,-RM74.10\n' +
  '07 Oct 2026,08:21:59 AM,TikTok Shop Seller Pulau Pinang,,BIDC RTL POST NON US,-RM12.97\n' +
  '05 Oct 2026,12:31:48 PM,SYARIKAT CONTOH SDN BHD,SALARY PAYMENT,DuitNow QR OU,+RM500.00\n' +
  '05 Oct 2026,02:40:39 PM,DIGI TELECOMMUNICATIONS,POSTPAID BILL,IB FPX (DEBIT) - SA,-RM30.00\n' +
  '03 Oct 2026,02:49:08 PM,BIC TEALIVE-GSTAND Sepang,,MyDEBIT SA PURCHASE,-RM16.00\n' +
  "01 Oct 2026,01:51:29 PM,LOTUS'S SHAH ALAM,,MyDEBIT SA PURCHASE,-RM32.55\n";

export function downloadSampleCsv() {
  const blob = new Blob([SAMPLE_CSV], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'bank_statement_sample.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
