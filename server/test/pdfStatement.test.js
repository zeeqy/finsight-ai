const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePdfStatement, PdfStatementError } = require('../src/services/pdfStatement');
const { makeStatementPdf } = require('../scripts/makeStatementPdf');

const ROWS = [
  { date: '02/03/2026', type: 'MYDEBIT PURCHASE', details: ['KEDAI RUNCIT MAJU', '02/03/2026 5411', 'R12345'], amount: 23.4, dir: 'out' },
  { date: '03/03/2026', type: 'DUITNOW TO ACCOUNT', details: ['GAJI SYARIKAT CONTOH'], amount: 1500, dir: 'in' },
  { date: '03/03/2026', type: 'DUITNOW QR P2P', details: ['ENCIK ALI BIN ABU BAKAR SEBAGAI', 'NAMA', 'NASI LEMAK MAK SU', 'XEPL123'], amount: 0.5, dir: 'out' },
  { date: '05/03/2026', type: 'IB FPX (DEBIT)', details: ['2603052245050724', 'TNB BILL'], amount: 120, dir: 'out' },
];
const base = { bankLine: 'Test Bank Berhad', holder: 'ENCIK ALI BIN ABU BAKAR SEBAGAI', opening: 100, rows: ROWS };

test('PDF statement: rows, directions and balance checks', async () => {
  const r = await parsePdfStatement(makeStatementPdf({ ...base, totals: true }));
  assert.equal(r.rows.length, 4);
  assert.deepEqual(r.rows.map((x) => x.direction), ['out', 'in', 'out', 'out']);
  assert.deepEqual(r.rows.map((x) => x.txn_date), ['2026-03-02', '2026-03-03', '2026-03-03', '2026-03-05']);
  assert.equal(r.rows[2].amount, 0.5); // printed as ".50"
  assert.equal(r.checks.opening_balance, 100);
  assert.equal(r.checks.rows_checked, 4);
  assert.equal(r.checks.rows_not_matching, 0);
  assert.equal(r.checks.closing_matches, true);
  assert.equal(r.checks.bank_total_out.matches, true);
  assert.equal(r.checks.bank_total_in.matches, true);
});

test('PDF statement: descriptions keep the merchant and drop reference numbers', async () => {
  const r = await parsePdfStatement(makeStatementPdf(base));
  assert.equal(r.rows[0].description, 'MYDEBIT PURCHASE KEDAI RUNCIT MAJU');
  assert.equal(r.rows[3].description, 'IB FPX (DEBIT) TNB BILL');
  // A general reader keeps name lines: only Bank Islam's layout prints the holder under every payment
  assert.match(r.rows[2].description, /NASI LEMAK MAK SU$/);
});

test('PDF statement: Bank Islam layout drops the holder name from payments, keeps it on money in', async () => {
  const r = await parsePdfStatement(makeStatementPdf({ ...base, bankLine: 'Bank Islam Malaysia Berhad' }));
  assert.equal(r.bank.id, 'bank_islam');
  assert.equal(r.rows[2].description, 'DUITNOW QR P2P NASI LEMAK MAK SU');
  const own = makeStatementPdf({
    ...base,
    bankLine: 'Bank Islam Malaysia Berhad',
    rows: [{ date: '01/03/2026', type: 'INW DuitNow QR P2P', details: ['ALI BIN ABU BAKAR SEBAGAINAMA'], amount: 50, dir: 'in' }],
  });
  assert.match((await parsePdfStatement(own)).rows[0].description, /ALI BIN ABU BAKAR/);
});

test('PDF statement: rows over several pages, header repeated', async () => {
  const many = Array.from({ length: 30 }, (_, i) => ({
    date: `${String((i % 28) + 1).padStart(2, '0')}/04/2026`, type: 'POS DEBIT', details: [`SHOP ${i}`], amount: 1 + i, dir: i % 5 === 0 ? 'in' : 'out',
  }));
  const r = await parsePdfStatement(makeStatementPdf({ ...base, opening: 1000, rows: many, rowsPerPage: 8 }));
  assert.equal(r.rows.length, 30);
  assert.equal(r.checks.rows_not_matching, 0);
  assert.equal(r.checks.closing_matches, true);
});

test('PDF statement: a wrong amount is reported, not hidden', async () => {
  const pdf = makeStatementPdf(base).toString('latin1').replace('(120.00)', '(102.00)');
  const r = await parsePdfStatement(Buffer.from(pdf, 'latin1'));
  assert.equal(r.checks.rows_not_matching, 1);
});

test('PDF statement: locked file needs the right password', async () => {
  const pdf = makeStatementPdf({ ...base, password: 'Rahsia@123' });
  await assert.rejects(parsePdfStatement(pdf), (e) => e instanceof PdfStatementError && e.code === 'PDF_PASSWORD_REQUIRED');
  await assert.rejects(parsePdfStatement(pdf, 'salah'), (e) => e.code === 'PDF_PASSWORD_WRONG');
  const r = await parsePdfStatement(pdf, 'Rahsia@123');
  assert.equal(r.rows.length, 4);
});

test('PDF statement: not a PDF, or a PDF with no table', async () => {
  await assert.rejects(parsePdfStatement(Buffer.from('hello')), (e) => e.code === 'PDF_UNREADABLE');
  const noTable = makeStatementPdf({ ...base, rows: [] });
  await assert.rejects(parsePdfStatement(noTable), (e) => e.code === 'PDF_NO_TABLE');
});
