/**
 * PDF e-statement reader (Module 1).
 *
 * A PDF has no columns, only text placed on a page, so the reader works from positions:
 *  1. Each page's text is grouped into lines by height on the page.
 *  2. The transaction table starts under the header line (Date ... Balance / Tarikh ... Baki);
 *     the x position of the Debit/Withdrawal and Credit/Deposit headings marks those columns.
 *  3. A line whose first text is a date in the date column starts a transaction; indented lines
 *     under it are the rest of its description.
 *  4. Direction comes from the running balance (previous balance − amount = balance → money out),
 *     with the column as a fallback. Every row that does not add up is reported, never hidden.
 *
 * Tested on real CIMB (Savings Account-i) and Bank Islam (Savings Account) e-statements, 3 months
 * each, and AEON Bank (Savings Account-i, 2 months: "19 Sep 26" dates, "RM 36.00" amounts on the
 * line under the description, account summary totals without counts). Other banks go through the same general reader and get the same checks in the preview.
 * The password is used once to open the file and is never stored or logged.
 */

// Bank Islam prints 50 sen as ".50"; AEON Bank prints "RM 36.00" and "-RM 10.90"
const MONEY = /^-?(RM\s?)?(\d[\d,]*)?\.\d{2}-?$/i;
const DATE_NUM = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:\s+(.*))?$/; // 19/09/2026 (CIMB, Bank Islam)
const DATE_NAME = /^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2}|\d{4})(?:\s+(.*))?$/; // 19 Sep 26 (AEON Bank)
const MONTHS = { jan: 1, feb: 2, mar: 3, mac: 3, apr: 4, may: 5, mei: 5, jun: 6, jul: 7, aug: 8, ogo: 8, sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, dis: 12 };

/** A date at the start of a text: [whole, day, month, year, rest] with a numeric month, or null. */
function matchDate(s) {
  const num = s.match(DATE_NUM);
  if (num) return num;
  const named = s.match(DATE_NAME);
  const month = named && MONTHS[named[2].slice(0, 3).toLowerCase()];
  return month ? [named[0], named[1], String(month), named[3], named[4]] : null;
}
const HEADER_DATE = /^(date|tarikh)$/i;
const HEADER_BALANCE = /\b(balance|baki)\b/i;
const HEADER_DEBIT = /^(debit|withdrawals?|pengeluaran)$/i;
const HEADER_CREDIT = /^(credit|kredit|deposits?)$/i;
const OPENING = /OPENING BALANCE|BAL(ANCE)? B\/F|BALANCE BROUGHT FORWARD|BAKI AWAL|BAKI DIBAWA/i;
const CLOSING = /CLOSING BALANCE|BAKI PENUTUP|BAL(ANCE)? C\/F|BALANCE CARRIED FORWARD/i;
const TABLE_END = /CLOSING BALANCE|BAKI PENUTUP|End of Statement|RINGKASAN|SUMMARY OF ACCOUNT|TOTAL DEBIT|TOTAL CREDIT|MONTHLY AVERAGE|Important Notice|Notis Penting/i;

// Detail lines that carry no meaning for categorising: reference numbers and bank codes
const NOISE_LINE = [
  /^[\d\s-]+$/, // reference numbers, MCC codes
  /^[A-Z]{3,4}\d{3,}$/, // XEPL339, XRPP421, DCAR975, EFPX216
  /^QR\d+$/i,
  /^[A-Z]?\d{5,}$/, // R97435, T63924
  /^\d{6,}[A-Z]\d+[A-Z]*\d*$/i, // 20260627M0003261861OBW42391829
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, // uuid
  /^Transaction date:/i, // AEON Bank card purchases: the card date under the posting date
];
const HONORIFIC = /^(ENCIK|EN|CIK|PUAN|PN|TUAN|MR|MRS|MS|MISS|DR)\.?\s+/i;

const BANKS = [
  // Bank Islam prints the account holder's name under every outgoing payment and card purchase;
  // left in, every payment would look like a transfer to the user's own account.
  { id: 'bank_islam', name: 'Bank Islam', test: /bankislam|BANK ISLAM/i, dropHolderOnDebit: true, codePrefix: /^\d{4}\s+/ },
  { id: 'cimb', name: 'CIMB', test: /\bCIMB\b/, dropHolderOnDebit: false },
  { id: 'maybank', name: 'Maybank', test: /maybank/i, dropHolderOnDebit: false },
  { id: 'aeon', name: 'AEON Bank', test: /AEON Bank/i, dropHolderOnDebit: false },
];
const OTHER_BANK = { id: 'other', name: 'your bank', dropHolderOnDebit: false };

class PdfStatementError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

let pdfjsPromise = null;
function loadPdfjs() {
  if (!pdfjsPromise) pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjsPromise;
}

const money = (s) => {
  const t = String(s).replace(/,|RM\s*/gi, '');
  const n = parseFloat(t.replace(/-/g, ''));
  return t.includes('-') ? -n : n;
};
const round2 = (n) => Math.round(n * 100) / 100;
const close = (a, b) => Math.abs(a - b) < 0.005;

/** Text lines of every page: [{ y, items: [{ x, right, s }] }], top of the page first. */
async function readPdfLines(buffer, password) {
  const pdfjs = await loadPdfjs();
  let doc;
  try {
    doc = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      password: password || undefined,
      isEvalSupported: false,
      disableFontFace: true,
      verbosity: 0,
    }).promise;
  } catch (err) {
    if (err?.name === 'PasswordException') {
      // pdf.js: code 1 = a password is needed, code 2 = the one given is wrong
      throw err.code === 2
        ? new PdfStatementError('PDF_PASSWORD_WRONG', 'That password did not open the PDF. Check it and try again.')
        : new PdfStatementError('PDF_PASSWORD_REQUIRED', 'This PDF is locked. Enter the password you use to open your e-statement.');
    }
    throw new PdfStatementError('PDF_UNREADABLE', 'This PDF could not be opened. Download the e-statement again from your bank and retry.');
  }

  const pages = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const { items } = await page.getTextContent();
      const lines = [];
      for (const it of items) {
        const s = it.str.trim();
        if (!s) continue;
        const y = it.transform[5];
        const x = it.transform[4];
        let line = lines.find((l) => Math.abs(l.y - y) <= 2);
        if (!line) lines.push((line = { y, items: [] }));
        line.items.push({ x, right: x + (it.width || 0), s });
      }
      for (const l of lines) l.items.sort((a, b) => a.x - b.x);
      lines.sort((a, b) => b.y - a.y);
      pages.push(lines);
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return pages;
}

const lineText = (line) => line.items.map((i) => i.s).join(' ');
const center = (item) => (item.x + item.right) / 2;

/** The account holder's name as printed at the top of page 1 (it may wrap onto a second line). */
function findHolder(firstPage) {
  const idx = firstPage.findIndex((l) => l.items[0].x < 120 && /^[A-Z][A-Z .'@/-]+$/.test(lineText(l)) && lineText(l).split(' ').length >= 3);
  if (idx < 0) return null;
  const first = lineText(firstPage[idx]);
  const next = firstPage[idx + 1];
  const wrap = next && next.items[0].x < 120 && /^[A-Z]{1,12}$/.test(lineText(next)) ? lineText(next) : '';
  return { lines: [first, wrap].filter(Boolean), core: (first + wrap).replace(HONORIFIC, '') };
}

function isHolderLine(text, holder) {
  if (!holder) return false;
  const t = text.replace(HONORIFIC, '').trim();
  return (t.length >= 8 && holder.core.startsWith(t)) || holder.lines.includes(text);
}

/** Column positions from a table header line, or null if the line is not one. */
function readHeader(line) {
  const date = line.items.find((i) => HEADER_DATE.test(i.s));
  const balance = line.items.find((i) => HEADER_BALANCE.test(i.s));
  if (!date || !balance) return null;
  const debit = line.items.find((i) => HEADER_DEBIT.test(i.s));
  const credit = line.items.find((i) => HEADER_CREDIT.test(i.s));
  return {
    dateX: date.x,
    debitX: debit ? center(debit) : null,
    creditX: credit ? center(credit) : null,
    amountsFrom: Math.min(...[debit, credit, balance].filter(Boolean).map((i) => i.x)) - 40,
  };
}

function toIsoDate(d, m, y) {
  const year = y.length === 2 ? `20${y}` : y;
  return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/**
 * Parse the lines of a statement into transactions plus the checks shown in the preview.
 * Exported separately from the PDF reading so it can be unit-tested with plain line data.
 */
function parseStatementLines(pages) {
  const allText = pages.map((p) => p.map(lineText).join('\n')).join('\n');
  const bank = BANKS.find((b) => b.test.test(allText)) || OTHER_BANK;
  const holder = findHolder(pages[0] || []);

  const txns = [];
  let opening = null;
  let closing = null;
  const totals = {};

  for (const page of pages) {
    let cols = null; // each page repeats its header
    let current = null;
    let inTable = false;

    for (const line of page) {
      const text = lineText(line);

      const summary = text.match(/TOTAL (DEBIT|CREDIT)\s+(\d+)\s+([\d,]+\.\d{2})/i);
      if (summary) totals[summary[1].toLowerCase()] = { count: Number(summary[2]), amount: money(summary[3]) };
      // AEON Bank's account summary gives amounts only: "Total withdrawal -RM 32.50", "Total deposits RM 379.12"
      const amountOnly = !inTable && text.match(/\bTotal (withdrawals?|deposits?)\s+(-?RM\s?[\d,]+\.\d{2})$/i);
      if (amountOnly) totals[/^w/i.test(amountOnly[1]) ? 'debit' : 'credit'] = { count: null, amount: Math.abs(money(amountOnly[2])) };

      if (!inTable) {
        const header = readHeader(line);
        if (header) {
          cols = header;
          inTable = true;
        }
        continue;
      }
      const moneyItems = line.items.filter((i) => MONEY.test(i.s) && i.x >= cols.amountsFrom);

      if (OPENING.test(text) && moneyItems.length) {
        if (opening === null) opening = money(moneyItems[moneyItems.length - 1].s);
        continue;
      }
      if (CLOSING.test(text) && moneyItems.length) closing = money(moneyItems[moneyItems.length - 1].s);
      if (TABLE_END.test(text)) {
        current = null;
        inTable = false;
        continue;
      }
      // Further header lines (Malay headings, "(RM)") sit between the header and the first row
      if (/^\(RM\)/.test(text) || readHeader(line) || (HEADER_BALANCE.test(text) && !moneyItems.length && !current)) continue;

      const first = line.items[0];
      // AEON Bank prints a row's amounts on their own line just under its date and description
      if (current && !current.money.length && moneyItems.length && moneyItems.length === line.items.length) {
        current.money = moneyItems;
        continue;
      }
      const dateMatch = matchDate(first.s);
      if (dateMatch && Math.abs(first.x - cols.dateX) <= 20) {
        const words = [dateMatch[4] || '', ...line.items.slice(1).filter((i) => !MONEY.test(i.s) && !/^[A-Z]?\d{5,}$/.test(i.s)).map((i) => i.s)]
          .join(' ')
          .trim();
        current = {
          txn_date: toIsoDate(dateMatch[1], dateMatch[2], dateMatch[3]),
          type: bank.codePrefix ? words.replace(bank.codePrefix, '') : words,
          details: [],
          money: moneyItems,
          cols,
        };
        txns.push(current);
        continue;
      }

      // Indented line under a transaction: more of its description. Anything else ends it.
      if (current && first.x >= cols.dateX + 15 && !moneyItems.length) {
        current.details.push(text);
      } else {
        current = null;
      }
    }
  }

  // Amount and direction, checked against the running balance
  let prev = opening;
  const rows = [];
  let mismatches = 0;
  for (const t of txns) {
    const items = t.money;
    if (!items.length) continue;
    const balanceItem = items.length >= 2 ? items[items.length - 1] : null;
    const amountItem = items[0];
    const amount = Math.abs(money(amountItem.s));
    const balance = balanceItem ? money(balanceItem.s) : null;
    if (!amount) continue;

    let direction = null;
    let reconciled = false;
    if (prev !== null && balance !== null) {
      if (close(round2(prev - amount), balance)) direction = 'out';
      else if (close(round2(prev + amount), balance)) direction = 'in';
      reconciled = direction !== null;
    }
    if (!direction) {
      const c = center(amountItem);
      const dDebit = t.cols.debitX === null ? Infinity : Math.abs(c - t.cols.debitX);
      const dCredit = t.cols.creditX === null ? Infinity : Math.abs(c - t.cols.creditX);
      direction = dCredit < dDebit ? 'in' : 'out';
    }
    // Only a row after a known balance can fail the check; the very first one without an opening balance is unchecked
    if (!reconciled && prev !== null && balance !== null) mismatches++;
    if (balance !== null) prev = balance;

    const seen = new Set([t.type.toLowerCase()]);
    const details = [];
    let afterHolder = false;
    for (const raw of t.details) {
      const dated = matchDate(raw);
      const line = (dated ? dated[4] || '' : raw).trim();
      if (!line || NOISE_LINE.some((re) => re.test(line))) continue;
      if (bank.dropHolderOnDebit && direction === 'out') {
        // The name wraps at a fixed width, so its tail ("MIR") is the short line right after it
        const wrapTail = afterHolder && /^[A-Z]{1,12}$/.test(line);
        afterHolder = raw === holder?.lines[0];
        if (afterHolder || wrapTail || isHolderLine(raw, holder)) continue;
      }
      if (seen.has(line.toLowerCase())) continue;
      seen.add(line.toLowerCase());
      details.push(line);
    }
    const description = [t.type, ...details]
      .join(' ')
      .replace(/\s+/g, ' ')
      .replace(/\s+-\s*$/, '') // AEON Bank: "NAME - DuitNowQR -" when the reference line is dropped
      .trim()
      .slice(0, 255);

    rows.push({ txn_date: t.txn_date, description, amount: round2(amount), direction, balance, reconciled });
  }

  const sum = (dir) => round2(rows.filter((r) => r.direction === dir).reduce((s, r) => s + r.amount, 0));
  const checks = {
    opening_balance: opening,
    closing_balance: closing,
    rows_checked: rows.filter((r) => r.reconciled).length,
    rows_not_matching: mismatches,
    closing_matches: closing === null || !rows.length || rows[rows.length - 1].balance === null ? null : close(rows[rows.length - 1].balance, closing),
    money_out: { count: rows.filter((r) => r.direction === 'out').length, amount: sum('out') },
    money_in: { count: rows.filter((r) => r.direction === 'in').length, amount: sum('in') },
  };
  // A bank total with no count (AEON Bank) is checked on the amount only
  const totalMatches = (bankTotal, ours) => (bankTotal.count === null || bankTotal.count === ours.count) && close(bankTotal.amount, ours.amount);
  if (totals.debit) checks.bank_total_out = { ...totals.debit, matches: totalMatches(totals.debit, checks.money_out) };
  if (totals.credit) checks.bank_total_in = { ...totals.credit, matches: totalMatches(totals.credit, checks.money_in) };

  return { bank: { id: bank.id, name: bank.name }, rows, checks };
}

/** Open a PDF e-statement (with its password if locked) and parse its transactions. */
async function parsePdfStatement(buffer, password) {
  const pages = await readPdfLines(buffer, password);
  if (!pages.some((p) => p.length)) {
    throw new PdfStatementError('PDF_NO_TEXT', 'This PDF has no readable text. It may be a scan or photo; download the e-statement from your bank instead.');
  }
  const result = parseStatementLines(pages);
  if (!result.rows.length) {
    throw new PdfStatementError('PDF_NO_TABLE', 'No transaction table was found in this PDF. FinSight reads bank e-statements with Date, Description, Debit/Credit and Balance columns.');
  }
  return result;
}

module.exports = { parsePdfStatement, parseStatementLines, PdfStatementError };
