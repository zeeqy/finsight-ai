/**
 * FinSight AI - Transactions & Spend Analyser Routes (Module 1)
 * Supports real Malaysian bank statements (Bank Islam CASATIA, Maybank2u, CIMB, generic CSVs)
 */

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const db = require('../db');
const authenticateToken = require('../middleware/auth');
const { computeAnomalyFlags } = require('../utils/categorizer');
const { categoriseBatch } = require('../services/categoryModel');
const { getSpendingInsights } = require('../services/spendingInsights');
const { parsePdfStatement, PdfStatementError } = require('../services/pdfStatement');
const { matchStored, mainMonth } = require('../services/statementDedupe');
const requireMysql = require('../middleware/requireMysql');
const { monthlyReview } = require('../services/monthlyReview');

const router = express.Router();

// Multer storage in temp directory
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB
const STATEMENT_TYPES = ['.csv', '.xlsx', '.pdf'];
// Header cells that mark the start of the transaction table in a spreadsheet export
const HEADER_WORDS = ['date', 'description', 'amount', 'debit', 'credit', 'transaction', 'particulars', 'details'];

const upload = multer({
  dest: path.join(__dirname, '..', 'temp_uploads'),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  // Only accept .csv, .xlsx and .pdf files. Checked by extension because Windows/Excel often sends CSVs
  // as application/vnd.ms-excel or application/octet-stream instead of text/csv.
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!STATEMENT_TYPES.includes(ext)) {
      const err = new Error(
        `Invalid file type "${ext || 'unknown'}". Please upload your bank's PDF e-statement, or a .csv or .xlsx export.`
      );
      err.code = 'INVALID_FILE_TYPE';
      return cb(err);
    }
    return cb(null, true);
  },
});

/**
 * Wraps multer so its errors become clean JSON responses instead of the global 500 handler.
 *  - wrong file type   → 422 Unprocessable Entity (TC04)
 *  - file too large    → 413 Payload Too Large
 *  - other multer error→ 400 Bad Request
 */
function handleStatementUpload(req, res, next) {
  upload.single('statement')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'INVALID_FILE_TYPE') {
      return res.status(422).json({ success: false, message: err.message });
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ success: false, message: 'File is too large. Maximum size is 10MB.' });
    }
    return res.status(400).json({ success: false, message: `Upload failed: ${err.message}` });
  });
}

// Column names we recognise as the amount column (lower-cased, trimmed)
const AMOUNT_COLUMNS = ['transaction amount', 'txn amount', 'amount', 'debit', 'withdrawal', 'credit', 'total'];

/**
 * Recalculate anomaly flags for ALL of a user's transactions (per-category Z-score)
 * and persist only the rows whose flag changed.
 * Called after an upload and after a category change, because both change the peer groups.
 * @returns {Promise<Map<number, boolean>>} transaction id → isAnomaly
 */
async function recomputeUserAnomalies(userId) {
  const [txns] = await db.query('SELECT id, amount, category, is_anomaly FROM transactions WHERE user_id = ?', [userId]);
  const flags = computeAnomalyFlags(txns);
  const result = new Map();

  for (let i = 0; i < txns.length; i++) {
    const newFlag = flags[i].isAnomaly ? 1 : 0;
    const oldFlag = txns[i].is_anomaly ? 1 : 0;
    result.set(txns[i].id, Boolean(newFlag));
    if (newFlag !== oldFlag) {
      await db.query('UPDATE transactions SET is_anomaly = ? WHERE id = ? AND user_id = ?', [newFlag, txns[i].id, userId]);
    }
  }
  return result;
}

/** Plain text for one spreadsheet cell: dates as YYYY-MM-DD (local), formulas as their result. */
function cellText(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    // Excel stores dates without a time zone; exceljs reads them as UTC midnight
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
  }
  if (typeof value === 'object') {
    if ('result' in value) return cellText(value.result);
    if ('text' in value) return String(value.text);
    if (Array.isArray(value.richText)) return value.richText.map((r) => r.text).join('');
  }
  return String(value);
}

/**
 * Rows of the first worksheet as objects keyed by the header row, like csv-parser gives.
 * Bank exports often start with a few lines of account details, so the header is the first row
 * (of the first 20) that has an amount-like column and at least one other statement heading.
 */
async function readXlsxRows(filePath) {
  const ExcelJS = require('exceljs');
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(filePath);
  const sheet = book.worksheets[0];
  if (!sheet) return [];
  const grid = [];
  sheet.eachRow({ includeEmpty: false }, (row) => grid.push(row.values.slice(1).map(cellText)));

  const headerAt = grid.slice(0, 20).findIndex((cells) => {
    const lower = cells.map((c) => c.trim().toLowerCase());
    return lower.some((c) => AMOUNT_COLUMNS.includes(c)) && lower.filter((c) => HEADER_WORDS.some((w) => c.includes(w))).length >= 2;
  });
  if (headerAt < 0) return [];
  const header = grid[headerAt].map((h) => h.trim());
  return grid
    .slice(headerAt + 1)
    .filter((cells) => cells.some((c) => c.trim()))
    .map((cells) => Object.fromEntries(header.map((h, i) => [h || `col${i + 1}`, cells[i] ?? ''])));
}

const moneyValue = (v) => parseFloat(String(v ?? '').replace(/[^0-9.]/g, '')) || 0;

/**
 * Amount and direction of one statement row. The sign on the amount decides when there is one;
 * description keywords are only a hint for unsigned amounts ("CREDIT CARD PAYMENT" is a debit).
 * Debit/Credit columns are compared by value because banks fill the unused one with 0.00.
 */
function parseAmount(row, txnDesc) {
  const single = String(row['transaction amount'] || row['txn amount'] || row['amount'] || row['total'] || '').trim();
  const debit = moneyValue(row['debit']) || moneyValue(row['withdrawal']);
  const credit = moneyValue(row['credit']);

  if (!single) return { amount: debit || credit, isCredit: credit > 0 && debit === 0 };

  const desc = txnDesc.toLowerCase();
  const isNegative = /^-|-$/.test(single);
  const isPositive = /^\+|\+$/.test(single);
  const isCredit = isPositive || (!isNegative && (credit > 0 || desc.includes('inw duitnow') || desc.includes('credit')));
  return { amount: moneyValue(single), isCredit };
}

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Ensure temp_uploads folder exists
const tempUploadsDir = path.join(__dirname, '..', 'temp_uploads');
if (!fs.existsSync(tempUploadsDir)) {
  fs.mkdirSync(tempUploadsDir, { recursive: true });
}

// All endpoints in this router require authentication
router.use(authenticateToken);

const MONTH_NAMES = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

/**
 * Universal date parser that handles:
 * - "17 Oct 2026" / "01 Oct 2026" (Bank Islam CASATIA format)
 * - "17/10/2026" / "17-10-2026" (DD/MM/YYYY)
 * - "2026-10-17" (YYYY-MM-DD)
 * - "2026/10/17"
 * Guaranteed NO UTC timezone shifting!
 */
function parseTxnDate(rawDate) {
  if (!rawDate) {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }

  const str = String(rawDate).trim();

  // 1. Check "17 Oct 2026" or "17-Oct-2026"
  const textMonthMatch = str.match(/^(\d{1,2})[\s\-\/]([a-zA-Z]{3,})[\s\-\/](\d{4})$/);
  if (textMonthMatch) {
    const day = textMonthMatch[1].padStart(2, '0');
    const monthKey = textMonthMatch[2].toLowerCase().substring(0, 3);
    const month = MONTH_NAMES[monthKey] || '01';
    const year = textMonthMatch[3];
    return `${year}-${month}-${day}`;
  }

  // 2. Check "YYYY-MM-DD"
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // 3. Check "DD/MM/YYYY" or "DD-MM-YYYY"
  const parts = str.split(/[/.-]/);
  if (parts.length === 3) {
    if (parts[0].length <= 2 && parts[2].length === 4) {
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const year = parts[2];
      return `${year}-${month}-${day}`;
    }
    if (parts[0].length === 4 && parts[1].length <= 2 && parts[2].length <= 2) {
      const year = parts[0];
      const month = parts[1].padStart(2, '0');
      const day = parts[2].padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }

  // Fallback
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

/**
 * POST /api/transactions/upload
 * Multi-bank statement ingestion: CSV, XLSX or PDF e-statement.
 * Form fields: `statement` (the file), `password` (locked PDFs only; used once, never stored)
 * and `preview=true` (PDF: read and check the file, return what would be imported, save nothing).
 */
router.post('/upload', handleStatementUpload, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Please attach a bank statement: a PDF e-statement, CSV or XLSX file.' });
  }

  const filePath = req.file.path;
  const originalName = req.file.originalname;
  const userId = req.user.id;
  const ext = path.extname(originalName || '').toLowerCase();
  const isXlsx = ext === '.xlsx';
  const isPdf = ext === '.pdf';
  const previewOnly = String(req.body?.preview) === 'true';

  let rows = [];
  let parsedTxns = [];
  let pdf = null;

  try {
    if (isPdf) {
      try {
        pdf = await parsePdfStatement(fs.readFileSync(filePath), req.body?.password);
      } catch (err) {
        if (err instanceof PdfStatementError) return res.status(422).json({ success: false, code: err.code, message: err.message });
        throw err;
      }
      parsedTxns = pdf.rows.map((r) => ({
        txn_date: r.txn_date,
        description: r.description,
        amount: r.amount,
        context: r.description,
        isCredit: r.direction === 'in',
      }));
    } else {
      // 1. Read and parse CSV or the first worksheet of an XLSX
      if (isXlsx) {
        try {
          rows = await readXlsxRows(filePath);
        } catch {
          return res.status(422).json({ success: false, message: 'This .xlsx file could not be opened. Save it again from Excel or export the statement as CSV.' });
        }
      } else {
        await new Promise((resolve, reject) => {
          fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (data) => rows.push(data))
            .on('end', resolve)
            .on('error', reject);
        });
      }

      if (rows.length === 0) {
        return res.status(422).json({
          success: false,
          message: isXlsx
            ? 'No transaction table was found in the first sheet. It needs a header row with a date, description and amount column.'
            : 'The uploaded CSV file is empty or could not be parsed.',
        });
      }

      // 2. Check the header looks like a bank statement (must have an amount column)
      const headerKeys = Object.keys(rows[0]).map((k) => k.trim().toLowerCase());
      if (!headerKeys.some((k) => AMOUNT_COLUMNS.includes(k))) {
        return res.status(422).json({
          success: false,
          message: 'This file does not look like a bank statement. Expected an amount column (e.g. "Amount" or "Transaction Amount").',
        });
      }

      // 3. Pass 1: parse + categorise every row in memory (nothing is written yet)
      for (const row of rows) {
        // Normalize column keys to lowercase without extra spaces
        const normalized = {};
        for (const key of Object.keys(row)) {
          normalized[key.trim().toLowerCase()] = row[key];
        }

        // 1. Date Detection
        const rawDate =
          normalized['date'] ||
          normalized['txn_date'] ||
          normalized['txn date'] ||
          normalized['transaction date'] ||
          normalized['posting date'] ||
          normalized['value date'] ||
          Object.values(row)[0];

        // 2. Description / Merchant Detection (Supports Bank Islam CASATIA & Generic CSVs)
        const ref1 = normalized['reference 1'] || '';
        const ref2 = normalized['reference 2'] || '';
        const txnDesc = normalized['transaction description'] || '';
        const standardDesc =
          normalized['description'] ||
          normalized['particulars'] ||
          normalized['details'] ||
          normalized['narrative'] ||
          normalized['transaction details'] ||
          normalized['payee'] ||
          '';

        let description = '';
        if (ref1 || txnDesc) {
          // Clean up CASATIA whitespace formatting e.g. "ROTIBOY-BDR SAUJANA   SG BULOH     SELMY"
          description = (ref1 || txnDesc).replace(/\s+/g, ' ').trim();
        } else if (standardDesc) {
          description = standardDesc.replace(/\s+/g, ' ').trim();
        } else {
          description = 'Bank Transfer / Purchase';
        }

        // Rich context for categorizer
        const categorizerContext = [ref1, txnDesc, ref2, standardDesc].filter(Boolean).join(' ');

        // 3. Amount Detection (Supports "+RM36.85", "-RM15.90", "120.00", Debit/Credit cols)
        const { amount: cleanNum, isCredit } = parseAmount(normalized, txnDesc);
        if (cleanNum <= 0) continue; // skip zero or invalid rows

        const txnDate = parseTxnDate(rawDate);
        parsedTxns.push({ txn_date: txnDate, description, amount: cleanNum, context: categorizerContext, isCredit });
      }
    }

    // Nothing usable → reject without creating an empty statement record
    if (parsedTxns.length === 0) {
      return res.status(422).json({
        success: false,
        message: 'No valid transactions found in this file. Check that it has date, description and amount columns.',
      });
    }

    // Skip rows already imported (re-uploaded or overlapping statements, or the same month as CSV and PDF)
    const [existingRows] = await db.query(
      'SELECT id, txn_date, description, amount, category FROM transactions WHERE user_id = ?',
      [userId]
    );
    const { newTxns, otherFile: matchedOtherFile } = matchStored(parsedTxns, existingRows);
    const duplicatesSkipped = parsedTxns.length - newTxns.length;
    const focusMonth = mainMonth(newTxns.length ? newTxns : parsedTxns);

    // PDF preview: what the reader found and whether it adds up, before anything is saved
    if (previewOnly && pdf) {
      const dates = parsedTxns.map((t) => t.txn_date).sort();
      return res.json({
        success: true,
        preview: true,
        bank: pdf.bank,
        checks: pdf.checks,
        transactionCount: parsedTxns.length,
        newCount: newTxns.length,
        duplicatesSkipped,
        matchedOtherFile,
        from: dates[0],
        to: dates[dates.length - 1],
        rows: pdf.rows.slice(0, 8).map(({ txn_date, description, amount, direction }) => ({ txn_date, description, amount, direction })),
      });
    }

    if (newTxns.length === 0) {
      return res.status(200).json({
        success: true,
        message: `All ${duplicatesSkipped} transactions in ${originalName} were already imported, so nothing was added.`,
        insertedCount: 0,
        duplicatesSkipped,
        matchedOtherFile,
        focusMonth,
        anomalyCount: 0,
        sample: [],
      });
    }

    // Categorise all rows in one ML call (Logistic Regression + keyword rules; rules only if the ML service is down)
    const categorised = await categoriseBatch(newTxns.map((t) => ({ text: t.context, isCredit: t.isCredit })));
    newTxns.forEach((t, i) => {
      t.category = categorised.categories[i];
      t.categorySource = categorised.sources[i];
    });
    const categorisedBy = categorised.sources.reduce((acc, src) => ({ ...acc, [src]: (acc[src] || 0) + 1 }), {});

    // 4. Pass 2: write statement + transactions
    const [statementResult] = await db.query(
      'INSERT INTO bank_statements (user_id, filename) VALUES (?, ?)',
      [userId, originalName]
    );
    const statementId = statementResult.insertId;

    const insertedIds = [];
    for (const t of newTxns) {
      const [insertResult] = await db.query(
        'INSERT INTO transactions (statement_id, user_id, txn_date, description, amount, category, is_anomaly, category_source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [statementId, userId, t.txn_date, t.description, t.amount, t.category, 0, t.categorySource]
      );
      insertedIds.push(insertResult.insertId);
    }

    // 5. Per-category Z-score over the user's full history (new + existing rows)
    const anomalyMap = await recomputeUserAnomalies(userId);
    const processedTxns = newTxns.map(({ context, isCredit, categorySource, ...t }, i) => ({
      ...t,
      is_anomaly: anomalyMap.get(insertedIds[i]) ? 1 : 0,
    }));
    const anomalyCount = processedTxns.filter((t) => t.is_anomaly).length;

    return res.status(201).json({
      success: true,
      message: `Successfully processed ${processedTxns.length} transactions from ${originalName}.`,
      statementId,
      insertedCount: processedTxns.length,
      duplicatesSkipped,
      matchedOtherFile,
      focusMonth,
      anomalyCount,
      categoriser: { engine: categorised.engine, model: categorised.modelName || null, categorisedBy },
      ...(pdf && { bank: pdf.bank, checks: pdf.checks }),
      sample: processedTxns.slice(0, 5),
    });
  } catch (error) {
    console.error('Statement upload error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process the statement.',
    });
  } finally {
    // Clean up temporary file
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {}
    }
  }
});

/**
 * POST /api/transactions/manual
 * One transaction typed in by the user (cash spending, or a bank with no export).
 * Categorised like an upload unless the user picks a category.
 */
router.post('/manual', async (req, res) => {
  try {
    const userId = req.user.id;
    const date = String(req.body.date || '');
    const description = String(req.body.description || '').replace(/\s+/g, ' ').trim().slice(0, 255);
    const amount = Math.round(parseFloat(req.body.amount) * 100) / 100;
    const direction = req.body.direction === 'in' ? 'in' : 'out';
    const chosen = String(req.body.category || '').trim().slice(0, 50);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00`).getTime())) {
      return res.status(422).json({ success: false, message: 'Enter the date as YYYY-MM-DD.' });
    }
    if (date > localDateStr(new Date())) {
      return res.status(422).json({ success: false, message: 'The date cannot be in the future.' });
    }
    if (!description) return res.status(422).json({ success: false, message: 'Enter what the payment was for.' });
    if (!(amount > 0) || amount > 1e7) {
      return res.status(422).json({ success: false, message: 'Amount must be more than RM 0.' });
    }

    let category;
    let source;
    if (direction === 'in') {
      category = 'Income';
      source = 'sign';
    } else if (chosen && chosen !== 'Income') {
      category = chosen;
      source = 'user';
    } else {
      const result = await categoriseBatch([{ text: description, isCredit: false }]);
      category = result.categories[0];
      source = result.sources[0];
    }

    const [insert] = await db.query(
      'INSERT INTO transactions (statement_id, user_id, txn_date, description, amount, category, is_anomaly, category_source) VALUES (NULL, ?, ?, ?, ?, ?, 0, ?)',
      [userId, date, description, amount, category, source]
    );
    const anomalyMap = await recomputeUserAnomalies(userId);
    return res.status(201).json({
      success: true,
      message: `Added ${description} (${category}).`,
      transaction: { id: insert.insertId, txn_date: date, description, amount, category, category_source: source, is_anomaly: anomalyMap.get(insert.insertId) ? 1 : 0 },
    });
  } catch (error) {
    console.error('Manual transaction error:', error);
    return res.status(500).json({ success: false, message: 'Failed to add the transaction.' });
  }
});

/**
 * GET /api/transactions/insights
 * Recurring payments found in the statements, and next month's spending forecast
 * (recurring payments at their usual amount + exponential smoothing on the rest).
 */
router.get('/insights', async (req, res) => {
  try {
    return res.json({ success: true, data: await getSpendingInsights(req.user.id) });
  } catch (error) {
    console.error('Insights error:', error);
    return res.status(500).json({ success: false, message: 'Failed to work out recurring payments and the forecast.' });
  }
});

/**
 * POST /api/transactions/recurring/status  { key, status: 'confirmed' | 'dismissed' | null }
 * The user confirms a detected recurring payment, hides one that is not, or resets it.
 */
// GET /api/transactions/review?year=&month= - this month against the month before (MySQL only)
router.get('/review', requireMysql, async (req, res) => {
  try {
    const year = parseInt(req.query.year, 10);
    const month = parseInt(req.query.month, 10);
    if (!(year >= 2000 && year <= 2100) || !(month >= 1 && month <= 12)) {
      return res.status(422).json({ success: false, message: 'Choose a month to review.' });
    }
    return res.json({ success: true, data: await monthlyReview(req.user.id, year, month) });
  } catch (error) {
    console.error('Monthly review error:', error);
    return res.status(500).json({ success: false, message: 'Failed to compare this month with the last.' });
  }
});

router.post('/recurring/status', requireMysql, async (req, res) => {
  try {
    const key = String(req.body.key || '').slice(0, 100);
    const status = req.body.status;
    if (!key) return res.status(422).json({ success: false, message: 'Missing the payment to update.' });
    if (status === null || status === 'detected') {
      await db.query('DELETE FROM recurring_overrides WHERE user_id = ? AND merchant_key = ?', [req.user.id, key]);
    } else if (['confirmed', 'dismissed'].includes(status)) {
      await db.query(
        'INSERT INTO recurring_overrides (user_id, merchant_key, status) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE status = VALUES(status)',
        [req.user.id, key, status]
      );
    } else {
      return res.status(422).json({ success: false, message: 'Status must be confirmed, dismissed or reset.' });
    }
    return res.json({ success: true, message: status === 'dismissed' ? 'Hidden from recurring payments.' : 'Saved.' });
  } catch (error) {
    console.error('Recurring status error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update the recurring payment.' });
  }
});

/**
 * POST /api/transactions/recompute-anomalies
 * Re-run per-category Z-score anomaly detection over all of the user's transactions.
 * Useful after changing the detection rules (fixes rows flagged by the old RM800 rule).
 */
router.post('/recompute-anomalies', async (req, res) => {
  try {
    const anomalyMap = await recomputeUserAnomalies(req.user.id);
    const anomalyCount = [...anomalyMap.values()].filter(Boolean).length;
    return res.json({
      success: true,
      message: `Anomaly detection re-run on ${anomalyMap.size} transactions. ${anomalyCount} flagged.`,
      total: anomalyMap.size,
      anomalyCount,
    });
  } catch (error) {
    console.error('Recompute anomalies error:', error);
    return res.status(500).json({ success: false, message: 'Failed to recompute anomalies.' });
  }
});

/**
 * GET /api/transactions/periods
 * Returns distinct available months and years that contain transactions for this user
 */
router.get('/periods', async (req, res) => {
  try {
    const userId = req.user.id;
    const [periods] = await db.query(
      `SELECT DISTINCT YEAR(txn_date) AS year, MONTH(txn_date) AS month, COUNT(id) AS count, SUM(amount) AS total_spend
       FROM transactions
       WHERE user_id = ?
       GROUP BY YEAR(txn_date), MONTH(txn_date)
       ORDER BY year DESC, month DESC`,
      [userId]
    );

    return res.json({
      success: true,
      periods: periods || [],
    });
  } catch (error) {
    console.error('Periods error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch periods.' });
  }
});

/**
 * GET /api/transactions/summary
 * Total spending per category for selected month/year, plus overall KPIs and budget comparisons
 */
router.get('/summary', async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();

    let targetYear = req.query.year ? parseInt(req.query.year, 10) : null;
    let targetMonth = req.query.month ? parseInt(req.query.month, 10) : null;

    // If month/year not explicitly specified, find the latest month that has transactions
    if (!targetYear || !targetMonth) {
      const [latest] = await db.query(
        'SELECT YEAR(txn_date) AS year, MONTH(txn_date) AS month FROM transactions WHERE user_id = ? ORDER BY txn_date DESC LIMIT 1',
        [userId]
      );
      if (latest && latest.length > 0 && latest[0].year && latest[0].month) {
        targetYear = latest[0].year;
        targetMonth = latest[0].month;
      } else {
        targetYear = now.getFullYear();
        targetMonth = now.getMonth() + 1;
      }
    }

    // 1. Category breakdown for month (excluding Income from spending totals)
    const [categoryRows] = await db.query(
      `SELECT category, SUM(amount) AS total_amount, COUNT(id) AS transaction_count 
       FROM transactions 
       WHERE user_id = ? AND YEAR(txn_date) = ? AND MONTH(txn_date) = ? 
       GROUP BY category 
       ORDER BY total_amount DESC`,
      [userId, targetYear, targetMonth]
    );

    // 2. Fetch user's set budgets for this month/year
    const [budgetRows] = await db.query(
      'SELECT category, budget_limit FROM budgets WHERE user_id = ? AND month = ? AND year = ?',
      [userId, targetMonth, targetYear]
    );

    // 3. User monthly income
    const [userRows] = await db.query('SELECT monthly_income FROM users WHERE id = ?', [userId]);
    const monthlyIncome = userRows && userRows.length > 0 ? parseFloat(userRows[0].monthly_income) || 0 : 0;

    const budgetMap = {};
    (budgetRows || []).forEach((b) => {
      budgetMap[b.category] = parseFloat(b.budget_limit);
    });

    let totalMonthSpend = 0;
    let totalInflow = 0;

    const breakdown = (categoryRows || []).map((row) => {
      const amount = parseFloat(row.total_amount) || 0;
      if (row.category === 'Income') {
        totalInflow += amount;
      } else {
        totalMonthSpend += amount;
      }

      const budgetLimit = budgetMap[row.category] || null;
      const percentOfBudget = budgetLimit ? Math.round((amount / budgetLimit) * 100) : null;

      return {
        category: row.category,
        total_amount: amount,
        transaction_count: parseInt(row.transaction_count, 10),
        budget_limit: budgetLimit,
        percent_of_budget: percentOfBudget,
      };
    });

    // Filter out Income from spend breakdown chart to give accurate expense distribution
    const expenseBreakdown = breakdown.filter((item) => item.category !== 'Income');

    // Effective monthly income = registered base income + any statement recorded deposits
    const effectiveIncome = monthlyIncome > 0 ? monthlyIncome : totalInflow;

    // Anomaly count in this month
    const [anomalyRows] = await db.query(
      'SELECT COUNT(id) AS anomaly_count FROM transactions WHERE user_id = ? AND is_anomaly = 1 AND YEAR(txn_date) = ? AND MONTH(txn_date) = ?',
      [userId, targetYear, targetMonth]
    );
    const anomalyCount = anomalyRows && anomalyRows[0] ? parseInt(anomalyRows[0].anomaly_count, 10) || 0 : 0;

    return res.json({
      success: true,
      period: {
        year: targetYear,
        month: targetMonth,
      },
      kpis: {
        total_monthly_spend: totalMonthSpend,
        monthly_income: effectiveIncome,
        total_inflow: totalInflow,
        net_savings: Math.max(0, effectiveIncome - totalMonthSpend),
        savings_rate: effectiveIncome > 0 ? Math.max(0, Math.round(((effectiveIncome - totalMonthSpend) / effectiveIncome) * 100)) : 0,
        anomaly_count: anomalyCount,
        top_category: expenseBreakdown[0]?.category || 'None',
      },
      breakdown: expenseBreakdown,
      allCategories: breakdown,
    });
  } catch (error) {
    console.error('Summary error:', error);
    return res.status(500).json({ success: false, message: 'Failed to generate financial summary.' });
  }
});

/**
 * GET /api/transactions/list
 * Return list of transactions, optionally filtered by month, year, category, or search
 */
router.get('/list', async (req, res) => {
  try {
    const userId = req.user.id;
    const { year, month } = req.query;

    let transactions = [];

    if (year && month && year !== 'ALL') {
      const [rows] = await db.query(
        `SELECT id, statement_id, txn_date, description, amount, category, category_source, is_anomaly, created_at 
         FROM transactions 
         WHERE user_id = ? AND YEAR(txn_date) = ? AND MONTH(txn_date) = ? 
         ORDER BY txn_date DESC, id DESC`,
        [userId, parseInt(year, 10), parseInt(month, 10)]
      );
      transactions = rows;
    } else {
      const [rows] = await db.query(
        `SELECT id, statement_id, txn_date, description, amount, category, category_source, is_anomaly, created_at 
         FROM transactions 
         WHERE user_id = ? 
         ORDER BY txn_date DESC, id DESC`,
        [userId]
      );
      transactions = rows;
    }

    return res.json({
      success: true,
      count: transactions.length,
      transactions,
    });
  } catch (error) {
    console.error('Transactions list error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch transactions list.' });
  }
});

/**
 * PATCH /api/transactions/:id/category
 * Quick category re-classification for any transaction
 */
router.patch('/:id/category', async (req, res) => {
  try {
    const txnId = parseInt(req.params.id, 10);
    const userId = req.user.id;
    const { category } = req.body;

    if (!category || !category.trim()) {
      return res.status(400).json({ success: false, message: 'Category is required.' });
    }

    const [result] = await db.query(
      "UPDATE transactions SET category = ?, category_source = 'user' WHERE id = ? AND user_id = ?",
      [category.trim(), txnId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Transaction not found or unauthorized.' });
    }

    // Category changed → peer groups changed → refresh anomaly flags
    const anomalyMap = await recomputeUserAnomalies(userId);

    return res.json({
      success: true,
      message: `Category updated to ${category.trim()}`,
      is_anomaly: anomalyMap.get(txnId) ? 1 : 0,
      id: txnId,
      category: category.trim(),
    });
  } catch (error) {
    console.error('Update category error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update category.' });
  }
});

/**
 * DELETE /api/transactions/period
 * Delete all transactions for a specific month and year
 */
router.delete('/period', async (req, res) => {
  try {
    const userId = req.user.id;
    const { year, month } = req.query;

    if (!year || !month) {
      return res.status(400).json({ success: false, message: 'Year and Month query parameters are required.' });
    }

    const [result] = await db.query(
      'DELETE FROM transactions WHERE user_id = ? AND YEAR(txn_date) = ? AND MONTH(txn_date) = ?',
      [userId, parseInt(year, 10), parseInt(month, 10)]
    );

    return res.json({
      success: true,
      message: `Cleared ${result.affectedRows || 0} transactions for period ${month}/${year}.`,
      affectedRows: result.affectedRows,
    });
  } catch (error) {
    console.error('Clear month error:', error);
    return res.status(500).json({ success: false, message: 'Failed to clear monthly transactions.' });
  }
});

/**
 * DELETE /api/transactions/all
 * Clear all transactions for the user
 */
router.delete('/all', async (req, res) => {
  try {
    const userId = req.user.id;
    const [result] = await db.query('DELETE FROM transactions WHERE user_id = ?', [userId]);

    return res.json({
      success: true,
      message: `Cleared all ${result.affectedRows || 0} transactions.`,
      affectedRows: result.affectedRows,
    });
  } catch (error) {
    console.error('Clear all error:', error);
    return res.status(500).json({ success: false, message: 'Failed to clear all transactions.' });
  }
});

/**
 * POST /api/transactions/bulk-delete
 * Delete multiple transactions by array of IDs
 */
router.post('/bulk-delete', async (req, res) => {
  try {
    const userId = req.user.id;
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Array of transaction IDs is required.' });
    }

    const cleanIds = ids.map((id) => parseInt(id, 10)).filter((id) => !isNaN(id));
    const placeholders = cleanIds.map(() => '?').join(',');

    const [result] = await db.query(
      `DELETE FROM transactions WHERE user_id = ? AND id IN (${placeholders})`,
      [userId, ...cleanIds]
    );

    return res.json({
      success: true,
      message: `Deleted ${result.affectedRows || cleanIds.length} transactions.`,
      affectedRows: result.affectedRows,
    });
  } catch (error) {
    console.error('Bulk delete error:', error);
    return res.status(500).json({ success: false, message: 'Failed to bulk delete transactions.' });
  }
});

/**
 * DELETE /api/transactions/:id
 * Delete a specific transaction
 */
router.delete('/:id', async (req, res) => {
  try {
    const txnId = parseInt(req.params.id, 10);
    const userId = req.user.id;

    const [result] = await db.query('DELETE FROM transactions WHERE id = ? AND user_id = ?', [txnId, userId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Transaction not found or unauthorized.' });
    }

    return res.json({
      success: true,
      message: 'Transaction successfully deleted.',
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to delete transaction.' });
  }
});

module.exports = router;
