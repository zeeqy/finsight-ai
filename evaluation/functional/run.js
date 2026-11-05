/**
 * FinSight AI - Functional test suite (Chapter 4 evaluation)
 *
 * Runs against the REAL stack: Express (:5000), the ML service (:8000) and MySQL.
 * Expected values are worked out by hand from the specification (CLAUDE.md), never copied
 * from the code's output. Extra Express instances are started on other ports to test failure
 * behaviour (ML service down, MySQL down, AI settings locked) without touching the running app.
 *
 * Test users are throwaway (ft-*@finsight.test) and are deleted at the end, pass or fail.
 *
 * Run:  node evaluation/functional/run.js            (all cases, needs a Gemini key for ADV-L*)
 *       node evaluation/functional/run.js --no-llm   (skip the cases that call Gemini)
 * Output: evaluation/results/functional_results.{json,md}
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { createRequire } = require('module');

const ROOT = path.join(__dirname, '..', '..');
const SERVER_DIR = path.join(ROOT, 'server');
const serverRequire = createRequire(path.join(SERVER_DIR, 'package.json'));
const jwt = serverRequire('jsonwebtoken');
const mysql = serverRequire('mysql2/promise');
serverRequire('dotenv').config({ path: path.join(SERVER_DIR, '.env') });

const { calculateDsr, dsrBand } = require(path.join(SERVER_DIR, 'src', 'services', 'loanCalc.js'));

const MAIN = 'http://localhost:5000';
const NO_ML_PORT = 5051; // ML service unreachable, no LLM keys, AI settings locked
const NO_DB_PORT = 5052; // MySQL unreachable, so Express drops to the JSON store
const NO_ML = `http://localhost:${NO_ML_PORT}`;
const NO_DB = `http://localhost:${NO_DB_PORT}`;
const PROD_PORT = 5053; // NODE_ENV=production behind a pretend proxy: limits, headers, CORS, no JSON fallback
const PROD = `http://localhost:${PROD_PORT}`;
const PROD_ORIGIN = 'https://finsight.example.test';
const SKIP_LLM = process.argv.includes('--no-llm');

const RUN_ID = crypto.randomBytes(3).toString('hex');
const results = [];
const createdEmails = [];
const children = [];
let conn;

/* ── Tiny harness ────────────────────────────────────────────────── */

class Blocked extends Error {}

function check(cond, msg) {
  if (!cond) throw new Error(msg);
}
const close = (a, b, tol = 0.01) => Math.abs(Number(a) - Number(b)) <= tol;

async function tc(id, module, title, input, expected, fn) {
  const row = { id, module, title, input, expected, actual: '', status: 'PASS', detail: null };
  try {
    const out = await fn();
    if (out && typeof out === 'object') {
      row.actual = out.actual;
      row.detail = out.detail ?? null;
    } else {
      row.actual = String(out ?? 'As expected');
    }
  } catch (err) {
    if (err instanceof Blocked) {
      row.status = 'BLOCKED';
      row.actual = err.message;
    } else {
      row.status = 'FAIL';
      row.actual = err.message;
    }
  }
  results.push(row);
  const mark = { PASS: '  ok ', FAIL: 'FAIL ', BLOCKED: 'BLCK ' }[row.status];
  console.log(`${mark} ${id.padEnd(9)} ${title}${row.status === 'PASS' ? '' : `\n        -> ${row.actual}`}`);
}

async function api(base, method, url, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${base}${url}`, {
    method,
    headers,
    body: form || (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}
const get = (url, token, base = MAIN) => api(base, 'GET', url, { token });
const post = (url, body, token, base = MAIN) => api(base, 'POST', url, { token, body });
const put = (url, body, token, base = MAIN) => api(base, 'PUT', url, { token, body });
const patch = (url, body, token, base = MAIN) => api(base, 'PATCH', url, { token, body });
const del = (url, token, base = MAIN) => api(base, 'DELETE', url, { token });

function upload(token, name, text, base = MAIN) {
  const form = new FormData();
  form.append('statement', new Blob([text], { type: 'text/csv' }), name);
  return api(base, 'POST', '/api/transactions/upload', { token, form });
}

/** PDF e-statement upload with the optional password and preview fields. */
function uploadPdf(token, name, buf, { password, preview } = {}) {
  const form = new FormData();
  form.append('statement', new Blob([buf], { type: 'application/pdf' }), name);
  if (password) form.append('password', password);
  if (preview) form.append('preview', 'true');
  return api(MAIN, 'POST', '/api/transactions/upload', { token, form });
}

async function newUser(label, { income = 5000, age = 28 } = {}) {
  const email = `ft-${RUN_ID}-${label}@finsight.test`;
  const password = crypto.randomBytes(12).toString('hex');
  createdEmails.push(email);
  const r = await post('/api/auth/register', { full_name: `Test ${label}`, email, password, monthly_income: income, age, accept_terms: true });
  if (r.status !== 201) throw new Error(`could not create test user: ${r.status} ${JSON.stringify(r.data)}`);
  return { email, password, token: r.data.token, id: r.data.user?.id };
}

const pad = (n) => String(n).padStart(2, '0');
function dateMonthsAhead(n) {
  const d = new Date();
  const total = d.getFullYear() * 12 + d.getMonth() + n;
  const y = Math.floor(total / 12);
  const m = total % 12;
  const last = new Date(y, m + 1, 0).getDate();
  return `${y}-${pad(m + 1)}-${pad(Math.min(d.getDate(), last))}`;
}

function startInstance(port, env) {
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: SERVER_DIR,
    env: { ...process.env, PORT: String(port), ...env },
    stdio: 'ignore',
  });
  children.push(child);
}

async function waitFor(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

/* ── Test data ───────────────────────────────────────────────────── */

const CASATIA = `Date,Time,Reference 1,Reference 2,Transaction Description,Transaction Amount
17 Oct 2026,07:59:16 PM,SYARIKAT CONTOH SDN,SALARY,INW DuitNow Transfer,+RM2500.00
16 Oct 2026,05:36:19 PM,MCDONALD'S MID VALLEY,,MyDEBIT SA PURCHASE,-RM28.50
15 Oct 2026,01:20:00 PM,PETRONAS SHAH ALAM,,MyDEBIT SA SALES.CMP,-RM50.00
14 Oct 2026,09:00:00 AM,LOTUS'S SHAH ALAM,,MyDEBIT SA PURCHASE,-RM120.25
13 Oct 2026,08:00:00 AM,TENAGA NASIONAL BERHAD,,IB FPX (DEBIT) - SA,-RM101.25
`;
const CASATIA_SPEND = 28.5 + 50 + 120.25 + 101.25; // 300.00

const anomalyCsv = (amounts, month = '09') =>
  'Date,Description,Amount\n' + amounts.map((a, i) => `2026-${month}-${pad(i + 1)},JAYA GROCER KL,${a}`).join('\n') + '\n';

// Car hire purchase from 1 Jun 2026: effective rate on a reducing balance (5.5% = 3% flat over 9 years)
const CAR = { loan_type: 'car', item_price: 80000, down_payment: 8000, interest_rate: 5.5, tenure_years: 9 };
const HOUSE = { loan_type: 'house', item_price: 400000, down_payment: 40000, interest_rate: 4.5, tenure_years: 30 };
const PROFILE = { employment_type: 'permanent', years_employed: 3, dependants: 0, age: 28 };
const INS_HIGH = { age: 55, height_cm: 160, weight_kg: 89.6, smoker: true, children: 0 }; // BMI 35.0
const INS_LOW = { age: 25, height_cm: 170, weight_kg: 63.6, smoker: false, children: 0 }; // BMI 22.0

/* ── Test cases ──────────────────────────────────────────────────── */

async function authTests() {
  const M = 'Authentication & security';
  const email = `ft-${RUN_ID}-reg@finsight.test`;
  const password = crypto.randomBytes(12).toString('hex');
  createdEmails.push(email);

  await tc('TC01', M, 'Register a new user', 'Valid name, email, password, income, age', '201 + JWT + user in DB', async () => {
    const r = await post('/api/auth/register', { full_name: 'Reg User', email, password, monthly_income: 4000, age: 30, accept_terms: true });
    check(r.status === 201, `status ${r.status}`);
    check(r.data.token, 'no token');
    const [rows] = await conn.query('SELECT id FROM users WHERE email = ?', [email]);
    check(rows.length === 1, 'user not in DB');
    return `201, JWT returned, user row exists`;
  });

  await tc('AUTH-01', M, 'Password is stored hashed', 'Inspect users row from TC01', 'bcrypt hash, not the password', async () => {
    const [[row]] = await conn.query('SELECT password_hash FROM users WHERE email = ?', [email]);
    check(/^\$2[aby]\$/.test(row.password_hash), 'not a bcrypt hash');
    check(!row.password_hash.includes(password), 'contains the plain password');
    return 'bcrypt hash stored';
  });

  await tc('AUTH-02', M, 'Duplicate email rejected', 'Register the same email again', '409', async () => {
    const r = await post('/api/auth/register', { full_name: 'Again', email, password, accept_terms: true });
    check(r.status === 409, `status ${r.status}`);
    return '409';
  });

  await tc('AUTH-03', M, 'Missing fields rejected', 'Register with no password', '400', async () => {
    const r = await post('/api/auth/register', { full_name: 'No Pass', email: `ft-${RUN_ID}-x@finsight.test` });
    check(r.status === 400, `status ${r.status}`);
    return '400';
  });

  await tc('AUTH-04', M, 'Invalid email format rejected', 'Email "not-an-email"', '400', async () => {
    const r = await post('/api/auth/register', { full_name: 'Bad', email: 'not-an-email', password: 'abcdefgh1' });
    if (r.status === 201) createdEmails.push('not-an-email');
    check(r.status === 400, `accepted with status ${r.status}`);
    return '400';
  });

  await tc('AUTH-05', M, 'Very short password rejected', 'Password "a"', '400', async () => {
    const e = `ft-${RUN_ID}-short@finsight.test`;
    const r = await post('/api/auth/register', { full_name: 'Short', email: e, password: 'a' });
    if (r.status === 201) createdEmails.push(e);
    check(r.status === 400, `accepted with status ${r.status}`);
    return '400';
  });

  await tc('TC02', M, 'Login with wrong password', 'Correct email, wrong password', '401', async () => {
    const r = await post('/api/auth/login', { email, password: 'wrong-password' });
    check(r.status === 401, `status ${r.status}`);
    return '401';
  });

  await tc('AUTH-06', M, 'Login with correct password', 'Valid credentials', '200 + JWT valid for 24h', async () => {
    const r = await post('/api/auth/login', { email, password });
    check(r.status === 200, `status ${r.status}`);
    const p = jwt.decode(r.data.token);
    check(p.exp - p.iat === 86400, `lifetime ${(p.exp - p.iat) / 3600}h`);
    return '200, token lifetime 24h';
  });

  await tc('AUTH-07', M, 'SQL injection in login', `Email "' OR 1=1 -- "`, '401, no login', async () => {
    const r = await post('/api/auth/login', { email: `' OR 1=1 -- `, password: 'x' });
    check(r.status === 401, `status ${r.status}`);
    return '401';
  });

  await tc('AUTH-08', M, 'Protected route with no token', 'GET /api/auth/me without token', '401', async () => {
    const r = await get('/api/auth/me');
    check(r.status === 401, `status ${r.status}`);
    return '401';
  });

  await tc('AUTH-09', M, 'Tampered token', 'Token signed with another secret', '403', async () => {
    const fake = jwt.sign({ id: 1 }, 'x'.repeat(40));
    const r = await get('/api/auth/me', fake);
    check(r.status === 403, `status ${r.status}`);
    return '403';
  });

  await tc('AUTH-10', M, 'Expired token', 'Valid signature, expired 1 hour ago', '403', async () => {
    const old = jwt.sign({ id: 1, email }, process.env.JWT_SECRET, { expiresIn: '-1h' });
    const r = await get('/api/auth/me', old);
    check(r.status === 403, `status ${r.status}`);
    return '403';
  });

  await tc('AUTH-11', M, 'Data isolation between users', 'User B reads, edits and deletes user A\'s records', 'B sees nothing; every write 404', async () => {
    const a = await newUser('iso-a');
    const b = await newUser('iso-b');
    await upload(a.token, 'a.csv', CASATIA);
    const txns = (await get('/api/transactions/list?year=ALL', a.token)).data.transactions;
    check(txns.length === 5, `A has ${txns.length} txns`);
    const goal = await post('/api/goals', { goal_type: 'custom', title: 'A', target_amount: 1000, target_date: dateMonthsAhead(12) }, a.token);
    const budget = await post('/api/budgets', { category: 'Transport', budget_limit: 100, month: 10, year: 2026 }, a.token);
    const budgets = (await get('/api/budgets?month=10&year=2026', a.token)).data.budgets;
    const loan = await post('/api/loan/predict', { ...CAR, monthly_income: 5000, ...PROFILE }, a.token);
    const ins = await post('/api/insurance/predict', INS_LOW, a.token);
    check(budget.status < 300 && loan.status === 200 && ins.status === 200 && goal.status === 201, 'setup failed');

    check((await get('/api/transactions/list?year=ALL', b.token)).data.transactions.length === 0, 'B can list A\'s txns');
    check((await get('/api/goals', b.token)).data.data.goals?.length === 0 || (await get('/api/goals', b.token)).data.data.length === 0, 'B sees A\'s goals');
    const attempts = [
      await patch(`/api/transactions/${txns[0].id}/category`, { category: 'Others' }, b.token),
      await del(`/api/transactions/${txns[0].id}`, b.token),
      await put(`/api/goals/${goal.data.data.id}`, { status: 'paused' }, b.token),
      await del(`/api/goals/${goal.data.data.id}`, b.token),
      await post(`/api/goals/${goal.data.data.id}/contributions`, { amount: 10 }, b.token),
      await del(`/api/budgets/${budgets[0].id}`, b.token),
      await del(`/api/loan/history/${loan.data.data.id}`, b.token),
      await del(`/api/insurance/history/${ins.data.data.id}`, b.token),
    ];
    const codes = attempts.map((r) => r.status);
    check(codes.every((c) => c === 404), `statuses ${codes.join(',')}`);
    const bulk = await post('/api/transactions/bulk-delete', { ids: [txns[1].id] }, b.token);
    check((await get('/api/transactions/list?year=ALL', a.token)).data.transactions.length === 5, `bulk delete (status ${bulk.status}) removed A's row`);
    return 'B lists nothing; all 8 writes 404; bulk delete removed nothing';
  });

  await tc('GEN-01', M, 'Unknown API route', 'GET /api/nope', '404 JSON', async () => {
    const r = await get('/api/nope');
    check(r.status === 404 && r.data?.success === false, `status ${r.status}`);
    return '404 JSON';
  });

  await tc('GEN-02', M, 'Health endpoint', 'GET /api/health', 'mysql + ml_service online', async () => {
    const r = await get('/api/health');
    check(r.data.database === 'mysql', `database ${r.data.database}`);
    check(r.data.ml_service === 'online', `ml ${r.data.ml_service}`);
    return 'mysql, ml_service online';
  });

  await tc('GEN-03', M, 'MySQL down', 'Express with MySQL unreachable', 'Falls back to JSON store; Modules 3-5 return a clear 503, no crash', async () => {
    const u = await newUser('nodb');
    const h = await get('/api/health', null, NO_DB);
    check(h.data.database !== 'mysql', `database ${h.data.database}`);
    const codes = [
      (await get('/api/goals', u.token, NO_DB)).status,
      (await post('/api/loan/predict', { ...CAR, monthly_income: 5000 }, u.token, NO_DB)).status,
      (await post('/api/insurance/predict', INS_LOW, u.token, NO_DB)).status,
    ];
    check(codes.every((c) => c === 503), `statuses ${codes.join(',')}`);
    return `health=${h.data.database}, goals/loan/insurance all 503`;
  });
}

async function spendTests() {
  const M = 'M1 Spend Analyser';
  const u = await newUser('m1', { income: 3000 });
  const t = u.token;

  await tc('TC03', M, 'Upload a valid Bank Islam CSV', 'CASATIA CSV, 5 rows', '201, 5 rows categorised, summary updates', async () => {
    const r = await upload(t, 'maybank.csv', CASATIA);
    check(r.status === 201, `status ${r.status}: ${r.data?.message}`);
    check(r.data.insertedCount === 5, `inserted ${r.data.insertedCount}`);
    check(r.data.categoriser.engine === 'ml_model', `engine ${r.data.categoriser.engine}`);
    const s = (await get('/api/transactions/summary?year=2026&month=10', t)).data;
    check(close(s.kpis.total_monthly_spend, CASATIA_SPEND), `spend ${s.kpis.total_monthly_spend}`);
    check(close(s.kpis.total_inflow, 2500), `inflow ${s.kpis.total_inflow}`);
    return `201, 5 inserted, ML engine; summary spend RM ${CASATIA_SPEND.toFixed(2)}, inflow RM 2,500.00`;
  });

  await tc('M1-01', M, 'Categories on known merchants', 'TC03 rows', 'Income, Food & Dining, Transport, Groceries, Utilities', async () => {
    const rows = (await get('/api/transactions/list?year=ALL', t)).data.transactions;
    const by = Object.fromEntries(rows.map((r) => [r.description.split(' ')[0], r.category]));
    const want = { SYARIKAT: 'Income', "MCDONALD'S": 'Food & Dining', PETRONAS: 'Transport', "LOTUS'S": 'Groceries', TENAGA: 'Utilities' };
    for (const [k, v] of Object.entries(want)) check(by[k] === v, `${k}: ${by[k]}, wanted ${v}`);
    return 'All 5 correct';
  });

  await tc('M1-02', M, 'KPIs from hand calculation', 'Income RM 3,000, spend RM 300', 'Left RM 2,700, savings rate 90%, top Groceries', async () => {
    const k = (await get('/api/transactions/summary?year=2026&month=10', t)).data.kpis;
    check(close(k.net_savings, 2700), `left ${k.net_savings}`);
    check(k.savings_rate === 90, `rate ${k.savings_rate}`);
    check(k.top_category === 'Groceries', `top ${k.top_category}`);
    return 'RM 2,700, 90%, Groceries';
  });

  await tc('TC04', M, 'Upload a .jpg', 'photo.jpg', '422, nothing saved', async () => {
    const before = (await get('/api/transactions/list?year=ALL', t)).data.count;
    const r = await upload(t, 'photo.jpg', 'not a csv');
    check(r.status === 422, `status ${r.status}`);
    check((await get('/api/transactions/list?year=ALL', t)).data.count === before, 'rows changed');
    return '422, row count unchanged';
  });

  await tc('M1-03', M, 'Empty and non-bank CSVs', 'Empty file; CSV with no amount column', '422, no statement record', async () => {
    const [[{ n: before }]] = await conn.query('SELECT COUNT(*) n FROM bank_statements WHERE user_id = (SELECT id FROM users WHERE email = ?)', [u.email]);
    const a = await upload(t, 'empty.csv', '');
    const b = await upload(t, 'names.csv', 'Name,Age\nAli,20\n');
    check(a.status === 422 && b.status === 422, `statuses ${a.status},${b.status}`);
    const [[{ n: after }]] = await conn.query('SELECT COUNT(*) n FROM bank_statements WHERE user_id = (SELECT id FROM users WHERE email = ?)', [u.email]);
    check(after === before, 'statement rows were created');
    return '422 both, no statement rows';
  });

  await tc('M1-04', M, 'File over 10 MB', '10.5 MB CSV', '413', async () => {
    const r = await upload(t, 'big.csv', 'Date,Description,Amount\n' + 'x'.repeat(10.5 * 1024 * 1024));
    check(r.status === 413, `status ${r.status}`);
    return '413';
  });

  await tc('M1-05', M, 'Date and amount formats', 'DD/MM/YYYY date; "RM1,234.56"; plain "2026-10-20"', 'Parsed exactly, no day shift', async () => {
    const v = await newUser('m1-fmt');
    const csv = 'Date,Description,Amount\n05/10/2026,SHOP ONE,"RM1,234.56"\n2026-10-20,SHOP TWO,10.50\n';
    const r = await upload(v.token, 'fmt.csv', csv);
    check(r.status === 201, `status ${r.status}`);
    const rows = (await get('/api/transactions/list?year=2026&month=10', v.token)).data.transactions;
    check(rows.length === 2, `rows ${rows.length} in October`);
    const one = rows.find((x) => x.description === 'SHOP ONE');
    check(close(one.amount, 1234.56), `amount ${one.amount}`);
    const d = new Date(one.txn_date);
    check(d.getDate() === 5 && d.getMonth() === 9, `date ${one.txn_date}`);
    return 'RM 1,234.56 on 5 Oct, RM 10.50 on 20 Oct';
  });

  await tc('M1-06', M, 'Separate Debit and Credit columns', 'Row: Debit 50.00, Credit blank; row: Debit blank, Credit 200.00', 'Spending RM 50, Income RM 200', async () => {
    const v = await newUser('m1-dc');
    const r = await upload(v.token, 'dc.csv', 'Date,Description,Debit,Credit\n2026-10-01,TESCO KL,50.00,\n2026-10-02,GAJI SYARIKAT,,200.00\n');
    check(r.status === 201, `status ${r.status}: ${r.data?.message}`);
    const k = (await get('/api/transactions/summary?year=2026&month=10', v.token)).data.kpis;
    check(close(k.total_monthly_spend, 50) && close(k.total_inflow, 200), `spend ${k.total_monthly_spend}, inflow ${k.total_inflow}`);
    return 'Spend RM 50, inflow RM 200';
  });

  await tc('M1-07', M, 'Debit/Credit columns filled with 0.00', 'Row: Debit 50.00, Credit 0.00; row: Debit 0.00, Credit 200.00', 'Spending RM 50, Income RM 200', async () => {
    const v = await newUser('m1-dc0');
    const r = await upload(v.token, 'dc0.csv', 'Date,Description,Debit,Credit\n2026-10-01,TESCO KL,50.00,0.00\n2026-10-02,GAJI SYARIKAT,0.00,200.00\n');
    check(r.status === 201, `status ${r.status}: ${r.data?.message}`);
    const k = (await get('/api/transactions/summary?year=2026&month=10', v.token)).data.kpis;
    check(close(k.total_monthly_spend, 50) && close(k.total_inflow, 200), `spend ${k.total_monthly_spend}, inflow ${k.total_inflow} (rows ${r.data.insertedCount})`);
    return 'Spend RM 50, inflow RM 200';
  });

  await tc('M1-08', M, 'Debit whose description says "credit"', 'Bank Islam row "CREDIT CARD PAYMENT", -RM500.00', 'Counts as spending, not Income', async () => {
    const v = await newUser('m1-cc');
    const csv = 'Date,Time,Reference 1,Reference 2,Transaction Description,Transaction Amount\n10 Oct 2026,10:00:00 AM,MAYBANK CARD,,CREDIT CARD PAYMENT,-RM500.00\n';
    await upload(v.token, 'cc.csv', csv);
    const rows = (await get('/api/transactions/list?year=ALL', v.token)).data.transactions;
    check(rows[0].category !== 'Income', `stored as ${rows[0].category}`);
    return `Stored as ${rows[0].category}`;
  });

  await tc('M1-09', M, 'Same statement uploaded twice', 'Upload the same CSV again', 'Totals do not double (rows skipped, user told)', async () => {
    const v = await newUser('m1-dup');
    await upload(v.token, 'once.csv', CASATIA);
    const r = await upload(v.token, 'once.csv', CASATIA);
    const k = (await get('/api/transactions/summary?year=2026&month=10', v.token)).data.kpis;
    check(close(k.total_monthly_spend, CASATIA_SPEND), `spend doubled to RM ${k.total_monthly_spend}`);
    check(r.data.insertedCount === 0 && r.data.duplicatesSkipped === 5, `inserted ${r.data.insertedCount}`);
    return `0 added, 5 skipped; spend stays RM ${CASATIA_SPEND.toFixed(2)}`;
  });

  await tc('M1-22', M, 'Identical purchases in one statement', 'Two RM 2.00 parking rows, same day', 'Both kept', async () => {
    const v = await newUser('m1-same');
    const r = await upload(v.token, 'p.csv', 'Date,Description,Amount\n2026-10-01,PARKING KLCC,2.00\n2026-10-01,PARKING KLCC,2.00\n');
    check(r.data.insertedCount === 2, `inserted ${r.data.insertedCount}`);
    return 'Both kept';
  });

  await tc('M1-23', M, 'Overlapping statements', 'Second CSV repeats 1 row and adds 1 new row', 'Only the new row is added', async () => {
    const v = await newUser('m1-over');
    await upload(v.token, 'a.csv', 'Date,Description,Amount\n2026-10-01,SHOP A,10.00\n2026-10-02,SHOP B,20.00\n');
    const r = await upload(v.token, 'b.csv', 'Date,Description,Amount\n2026-10-02,SHOP B,20.00\n2026-10-03,SHOP C,30.00\n');
    check(r.data.insertedCount === 1 && r.data.duplicatesSkipped === 1, `inserted ${r.data.insertedCount}, skipped ${r.data.duplicatesSkipped}`);
    check((await get('/api/transactions/list?year=ALL', v.token)).data.count === 3, 'wrong total');
    return '1 added, 1 skipped, 3 rows in total';
  });

  await tc('M1-24', M, 'Signed money-in that mentions credit', 'Bank Islam row "CREDIT TRANSFER", +RM100.00; unsigned Amount column row "SALARY CREDIT"', 'Both count as money in', async () => {
    const v = await newUser('m1-in');
    await upload(v.token, 'a.csv', 'Date,Time,Reference 1,Reference 2,Transaction Description,Transaction Amount\n10 Oct 2026,10:00:00 AM,KAWAN,,CREDIT TRANSFER,+RM100.00\n');
    const k = (await get('/api/transactions/summary?year=2026&month=10', v.token)).data.kpis;
    check(close(k.total_inflow, 100), `inflow ${k.total_inflow}`);
    return 'RM 100 money in';
  });

  await tc('M1-10', M, 'Anomaly flagged', 'Six purchases around RM 50, one RM 500, same merchant', 'Only the RM 500 flagged', async () => {
    const v = await newUser('m1-an');
    await upload(v.token, 'an.csv', anomalyCsv([50, 52, 48, 51, 49, 50, 500]));
    const rows = (await get('/api/transactions/list?year=ALL', v.token)).data.transactions;
    const flagged = rows.filter((x) => x.is_anomaly).map((x) => Number(x.amount));
    check(flagged.length === 1 && flagged[0] === 500, `flagged ${JSON.stringify(flagged)}`);
    return 'Only RM 500 flagged';
  });

  await tc('M1-11', M, 'Materiality floor', 'Six around RM 100, one RM 105 (huge Z, only 5% higher)', 'Nothing flagged', async () => {
    const v = await newUser('m1-mat');
    await upload(v.token, 'mat.csv', anomalyCsv([100, 100.5, 99.5, 100, 100.2, 99.8, 105]));
    const rows = (await get('/api/transactions/list?year=ALL', v.token)).data.transactions;
    check(rows.every((x) => !x.is_anomaly), 'something was flagged');
    return 'Nothing flagged';
  });

  await tc('M1-12', M, 'Fewer than 5 peers', 'Four purchases then RM 500', 'Nothing flagged', async () => {
    const v = await newUser('m1-few');
    await upload(v.token, 'few.csv', anomalyCsv([50, 52, 48, 51, 500]));
    const rows = (await get('/api/transactions/list?year=ALL', v.token)).data.transactions;
    check(rows.every((x) => !x.is_anomaly), 'flagged with too few peers');
    return 'Nothing flagged';
  });

  await tc('M1-13', M, 'Recategorise a transaction', 'Change one row to Shopping', 'Category updated, source "user", summary moves', async () => {
    const rows = (await get('/api/transactions/list?year=ALL', t)).data.transactions;
    const target = rows.find((x) => x.description.startsWith('PETRONAS'));
    const r = await patch(`/api/transactions/${target.id}/category`, { category: 'Shopping' }, t);
    check(r.status === 200, `status ${r.status}`);
    const after = (await get('/api/transactions/list?year=ALL', t)).data.transactions.find((x) => x.id === target.id);
    check(after.category === 'Shopping' && after.category_source === 'user', `${after.category}/${after.category_source}`);
    const s = (await get('/api/transactions/summary?year=2026&month=10', t)).data;
    check(s.breakdown.some((b) => b.category === 'Shopping' && close(b.total_amount, 50)), 'summary not updated');
    await patch(`/api/transactions/${target.id}/category`, { category: 'Transport' }, t);
    return 'Shopping, source user, summary moved';
  });

  await tc('M1-14', M, 'Delete one, delete selected', 'Single delete then bulk delete of 2', 'Row count falls by 3', async () => {
    const v = await newUser('m1-del');
    await upload(v.token, 'd.csv', CASATIA);
    const rows = (await get('/api/transactions/list?year=ALL', v.token)).data.transactions;
    check((await del(`/api/transactions/${rows[0].id}`, v.token)).status === 200, 'single delete failed');
    check((await post('/api/transactions/bulk-delete', { ids: [rows[1].id, rows[2].id] }, v.token)).status === 200, 'bulk failed');
    check((await get('/api/transactions/list?year=ALL', v.token)).data.count === 2, 'wrong count left');
    return '5 → 2 rows';
  });

  await tc('M1-15', M, 'Clear a month, clear all', 'Two months of data', 'Only the chosen month goes; clear all empties', async () => {
    const v = await newUser('m1-clr');
    await upload(v.token, 'a.csv', anomalyCsv([10, 20], '08'));
    await upload(v.token, 'b.csv', anomalyCsv([30], '09'));
    await del('/api/transactions/period?year=2026&month=8', v.token);
    const left = (await get('/api/transactions/list?year=ALL', v.token)).data.transactions;
    check(left.length === 1 && Number(left[0].amount) === 30, `left ${left.length}`);
    await del('/api/transactions/all', v.token);
    check((await get('/api/transactions/list?year=ALL', v.token)).data.count === 0, 'not empty');
    return 'Month cleared alone, then all cleared';
  });

  await tc('M1-16', M, 'Script and SQL text in a description', `"<script>alert(1)</script>'; DROP TABLE transactions;--"`, 'Stored as plain text, table intact', async () => {
    const v = await newUser('m1-sql');
    const text = `<script>alert(1)</script>'; DROP TABLE transactions;--`;
    await upload(v.token, 's.csv', `Date,Description,Amount\n2026-10-01,"${text}",10\n`);
    const rows = (await get('/api/transactions/list?year=ALL', v.token)).data.transactions;
    check(rows[0].description === text, `stored as ${rows[0].description}`);
    return 'Stored verbatim, table intact';
  });

  await tc('M1-17', M, 'ML service down during upload', 'Upload with the ML service unreachable', '201 using keyword rules', async () => {
    const v = await newUser('m1-noml');
    const r = await upload(v.token, 'x.csv', CASATIA, NO_ML);
    check(r.status === 201, `status ${r.status}`);
    check(r.data.categoriser.engine === 'rules', `engine ${r.data.categoriser.engine}`);
    return '201, engine rules';
  });

  await tc('M1-25', M, 'XLSX statement with a preamble', 'Excel file: 3 lines of account details, then Date/Description/Amount, 2 rows', '201, 2 rows, dates and signs right', async () => {
    const v = await newUser('m1-xlsx');
    const ExcelJS = require('../../server/node_modules/exceljs');
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Statement');
    sheet.addRows([['Account statement'], ['Account no', '1234'], [], ['Date', 'Description', 'Amount'], [new Date(Date.UTC(2026, 9, 5)), 'MYDIN SUBANG', -88.4], ['06/10/2026', 'SALARY OCT', 3000]]);
    const buf = Buffer.from(await book.xlsx.writeBuffer());
    const r = await upload(v.token, 'statement.xlsx', buf);
    check(r.status === 201, `status ${r.status}: ${r.data?.message}`);
    check(r.data.insertedCount === 2, `inserted ${r.data.insertedCount}`);
    const rows = (await get('/api/transactions/list?year=ALL', v.token)).data.transactions;
    const mydin = rows.find((x) => x.description === 'MYDIN SUBANG');
    const day = new Date(mydin.txn_date);
    check(day.getFullYear() === 2026 && day.getMonth() === 9 && day.getDate() === 5, `date ${mydin.txn_date}`);
    check(rows.find((x) => x.description === 'SALARY OCT').category === 'Income', 'salary not income');
    const bad = await upload(v.token, 'notes.xlsx', Buffer.from('not really a spreadsheet'));
    check(bad.status === 422, `broken xlsx status ${bad.status}`);
    return '201, 2 rows; 5 Oct kept; salary as Income; broken file 422';
  });

  await tc('M1-26', M, 'Add a transaction by hand', 'Cash RM 12.50 "nasi lemak", no category; RM 50 money in; future date; RM 0', 'Saved and categorised; future date and RM 0 rejected', async () => {
    const v = await newUser('m1-manual');
    const a = await post('/api/transactions/manual', { date: '2026-10-10', description: 'NASI LEMAK KAMPUNG BARU', amount: 12.5, direction: 'out' }, v.token);
    check(a.status === 201, `status ${a.status}: ${a.data?.message}`);
    check(a.data.transaction.category !== 'Income', `category ${a.data.transaction.category}`);
    const b = await post('/api/transactions/manual', { date: '2026-10-11', description: 'Duit raya', amount: 50, direction: 'in' }, v.token);
    check(b.data.transaction?.category === 'Income', 'money in not Income');
    const c = await post('/api/transactions/manual', { date: '2099-01-01', description: 'Later', amount: 5 }, v.token);
    const d = await post('/api/transactions/manual', { date: '2026-10-11', description: 'Zero', amount: 0 }, v.token);
    check(c.status === 422 && d.status === 422, `statuses ${c.status},${d.status}`);
    return `201 as ${a.data.transaction.category}; money in as Income; future date and RM 0 give 422`;
  });

  await tc('M1-27', M, 'Recurring payments and forecast', '4 months: Netflix RM 54.90 on the 5th, TNB bill varying, groceries varying', 'Netflix fixed, TNB bill, groceries not recurring; forecast for next month; hide works', async () => {
    const v = await newUser('m1-recur');
    const rows = ['Date,Description,Amount'];
    [['06', 160], ['07', 182], ['08', 141], ['09', 170]].forEach(([mo, tnb], i) => {
      rows.push(`2026-${mo}-05,NETFLIX.COM SINGAPORE,-54.90`, `2026-${mo}-16,TENAGA NASIONAL BERHAD,-${tnb}.00`, `2026-${mo}-21,LOTUS'S SHAH ALAM,-${[230, 95, 310, 150][i]}.00`, `2026-${mo}-25,SALARY,+3000.00`);
    });
    const up = await upload(v.token, 'year.csv', `${rows.join('\n')}\n`);
    check(up.status === 201, `upload ${up.status}`);
    const ins = (await get('/api/transactions/insights', v.token)).data.data;
    const kinds = Object.fromEntries(ins.recurring.map((r) => [r.key, r.kind]));
    check(kinds['NETFLIX COM SINGAPORE'] === 'fixed', `netflix ${kinds['NETFLIX COM SINGAPORE']}`);
    check(kinds['TENAGA NASIONAL BERHAD'] === 'bill', `tnb ${kinds['TENAGA NASIONAL BERHAD']}`);
    check(!Object.keys(kinds).some((k) => k.startsWith('LOTUS')), 'groceries flagged as recurring');
    check(ins.forecast?.month === '2026-10' && ins.forecast.point > 0, `forecast ${JSON.stringify(ins.forecast)}`);
    const hide = await post('/api/transactions/recurring/status', { key: 'NETFLIX COM SINGAPORE', status: 'dismissed' }, v.token);
    check(hide.status === 200, `hide ${hide.status}`);
    const after = (await get('/api/transactions/insights', v.token)).data.data;
    check(after.dismissed.length === 1 && !after.recurring.some((r) => r.key === 'NETFLIX COM SINGAPORE'), 'not hidden');
    return `Netflix fixed, TNB bill, Lotus's not recurring; Oct forecast RM ${ins.forecast.point}; hidden after dismiss`;
  });

  await tc('M1-28', M, 'Locked PDF e-statement', 'Made-up PDF, password-locked: 5 rows, opening RM 200; no password, wrong password, preview, import, preview again', '422 asks for password; wrong one rejected; preview saves nothing and every row matches the balance; import adds 5; second preview finds 0 new', async () => {
    const v = await newUser('m1-pdf');
    const { makeStatementPdf } = require('../../server/scripts/makeStatementPdf');
    const pdf = makeStatementPdf({
      bankLine: 'CIMB Islamic Bank Berhad',
      holder: 'TEST PDF USER SATU',
      opening: 200,
      password: 'Test@2026',
      rows: [
        { date: '01/10/2026', type: 'DUITNOW TO ACCOUNT', details: ['SALARY OCTOBER'], amount: 2500, dir: 'in' },
        { date: '02/10/2026', type: 'MYDEBIT PURCHASE', details: ['MYDIN SUBANG JAYA', 'R55555'], amount: 88.4, dir: 'out' },
        { date: '03/10/2026', type: 'IB FPX (DEBIT)', details: ['TENAGA NASIONAL BERHAD'], amount: 132.1, dir: 'out' },
        { date: '05/10/2026', type: 'POS DEBIT', details: ['SHELL SUBANG'], amount: 50, dir: 'out' },
        { date: '06/10/2026', type: 'DUITNOW QR', details: ['KEDAI KOPI'], amount: 0.5, dir: 'out' },
      ],
    });
    const none = await uploadPdf(v.token, 'estatement.pdf', pdf);
    check(none.status === 422 && none.data.code === 'PDF_PASSWORD_REQUIRED', `no password: ${none.status} ${none.data.code}`);
    const wrong = await uploadPdf(v.token, 'estatement.pdf', pdf, { password: 'wrong' });
    check(wrong.status === 422 && wrong.data.code === 'PDF_PASSWORD_WRONG', `wrong password: ${wrong.status} ${wrong.data.code}`);
    const pre = await uploadPdf(v.token, 'estatement.pdf', pdf, { password: 'Test@2026', preview: true });
    check(pre.status === 200 && pre.data.preview === true, `preview ${pre.status}: ${pre.data.message}`);
    check(pre.data.bank.id === 'cimb' && pre.data.transactionCount === 5 && pre.data.newCount === 5, JSON.stringify(pre.data));
    check(pre.data.checks.rows_checked === 5 && pre.data.checks.rows_not_matching === 0 && pre.data.checks.closing_matches === true, JSON.stringify(pre.data.checks));
    const stored = (await get('/api/transactions/list?year=ALL', v.token)).data.transactions;
    check(stored.length === 0, `preview saved ${stored.length} rows`);
    const imp = await uploadPdf(v.token, 'estatement.pdf', pdf, { password: 'Test@2026' });
    check(imp.status === 201 && imp.data.insertedCount === 5, `import ${imp.status} ${imp.data.insertedCount}`);
    const rows = (await get('/api/transactions/list?year=ALL', v.token)).data.transactions;
    const salary = rows.find((x) => x.description.includes('SALARY'));
    check(salary?.category === 'Income', `salary ${salary?.category}`);
    check(rows.some((x) => x.description === 'MYDEBIT PURCHASE MYDIN SUBANG JAYA'), 'reference number left in description');
    check(rows.some((x) => close(x.amount, 0.5)), '50 sen row missing');
    const again = await uploadPdf(v.token, 'estatement.pdf', pdf, { password: 'Test@2026', preview: true });
    check(again.data.newCount === 0 && again.data.duplicatesSkipped === 5, `second preview new ${again.data.newCount}`);
    return 'Password asked, wrong one 422; preview: 5 rows, 5/5 match balance, closing matches, nothing saved; import 201 +5; again 0 new';
  });

  await tc('M1-29', M, 'Broken or scanned PDF', 'A .pdf that is not a PDF; a PDF with no transaction table', '422 with a clear message, nothing saved', async () => {
    const v = await newUser('m1-badpdf');
    const { makeStatementPdf } = require('../../server/scripts/makeStatementPdf');
    const bad = await uploadPdf(v.token, 'photo.pdf', Buffer.from('JFIF not a pdf at all'));
    check(bad.status === 422 && bad.data.code === 'PDF_UNREADABLE', `broken: ${bad.status} ${bad.data.code}`);
    const empty = await uploadPdf(v.token, 'letter.pdf', makeStatementPdf({ bankLine: 'Some Bank', holder: 'TEST USER DUA TIGA', opening: 10, rows: [] }));
    check(empty.status === 422 && empty.data.code === 'PDF_NO_TABLE', `no table: ${empty.status} ${empty.data.code}`);
    const stored = (await get('/api/transactions/list?year=ALL', v.token)).data.transactions;
    check(stored.length === 0, `saved ${stored.length}`);
    return 'Both 422 with a message; nothing saved';
  });

  await tc('M1-30', M, 'Same month as CSV and PDF', 'Oct 2026 as a CSV (4 rows), then the same Oct as a PDF worded differently plus 1 new row; then a Jul 2026 CSV', 'PDF preview finds 4 already imported from another file and 1 new; import adds 1; the Jul upload reports Jul as its month, not the latest month', async () => {
    const v = await newUser('m1-cross');
    const { makeStatementPdf } = require('../../server/scripts/makeStatementPdf');
    const csvText = [
      'Date,Description,Amount',
      '2026-10-01,DUITNOW TO ACCOUNT SALARY OCTOBER 778812,+2500.00',
      '2026-10-02,MYDEBIT PURCHASE MYDIN SUBANG JAYA R55555,-88.40',
      '2026-10-03,IB FPX (DEBIT) TENAGA NASIONAL BERHAD 2026100312345678,-132.10',
      '2026-10-05,POS DEBIT SHELL SUBANG,-50.00',
    ].join('\n');
    const csvUp = await upload(v.token, 'oct.csv', `${csvText}\n`);
    check(csvUp.status === 201 && csvUp.data.insertedCount === 4, `csv ${csvUp.status} ${csvUp.data.insertedCount}`);
    check(csvUp.data.focusMonth?.year === 2026 && csvUp.data.focusMonth?.month === 10, `focus ${JSON.stringify(csvUp.data.focusMonth)}`);
    const pdf = makeStatementPdf({
      bankLine: 'CIMB Islamic Bank Berhad',
      holder: 'TEST CROSS USER',
      opening: 200,
      rows: [
        { date: '01/10/2026', type: 'DUITNOW TO ACCOUNT', details: ['SALARY'], amount: 2500, dir: 'in' },
        { date: '02/10/2026', type: 'MYDEBIT PURCHASE', details: ['MYDIN SUBANG'], amount: 88.4, dir: 'out' },
        { date: '03/10/2026', type: 'IB FPX (DEBIT)', details: ['TNB'], amount: 132.1, dir: 'out' },
        { date: '05/10/2026', type: 'POS DEBIT', details: ['SHELL'], amount: 50, dir: 'out' },
        { date: '07/10/2026', type: 'DUITNOW QR', details: ['KEDAI KOPI'], amount: 6.5, dir: 'out' },
      ],
    });
    const pre = await uploadPdf(v.token, 'oct.pdf', pdf, { preview: true });
    check(pre.data.newCount === 1 && pre.data.duplicatesSkipped === 4 && pre.data.matchedOtherFile === 4, `preview ${JSON.stringify({ n: pre.data.newCount, d: pre.data.duplicatesSkipped, o: pre.data.matchedOtherFile })}`);
    const imp = await uploadPdf(v.token, 'oct.pdf', pdf);
    check(imp.status === 201 && imp.data.insertedCount === 1, `import ${imp.status} ${imp.data.insertedCount}`);
    const rows = (await get('/api/transactions/list?year=ALL', v.token)).data.transactions;
    check(rows.length === 5, `stored ${rows.length}`);
    const jul = await upload(v.token, 'jul.csv', 'Date,Description,Amount\n2026-07-04,LOTUS SHAH ALAM,-45.00\n2026-07-09,GRAB RIDE,-18.00\n');
    check(jul.data.focusMonth?.year === 2026 && jul.data.focusMonth?.month === 7, `jul focus ${JSON.stringify(jul.data.focusMonth)}`);
    return 'Preview: 4 already imported (from another file), 1 new; import +1, 5 rows stored; Jul upload focuses Jul 2026';
  });

  const Bud = 'M1 Budgets';
  const b = await newUser('bud');
  await tc('M1-18', Bud, 'Create and update a budget', 'Set Transport to 300, then 450', 'One row, limit 450', async () => {
    const q = { category: 'Transport', month: 10, year: 2026 };
    check((await post('/api/budgets', { ...q, budget_limit: 300 }, b.token)).status < 300, 'create failed');
    check((await post('/api/budgets', { ...q, budget_limit: 450 }, b.token)).status < 300, 'update failed');
    const rows = (await get('/api/budgets?month=10&year=2026', b.token)).data.budgets;
    check(rows.length === 1 && close(rows[0].budget_limit, 450), JSON.stringify(rows));
    return 'One row, RM 450';
  });

  await tc('M1-19', Bud, 'Custom category budget', 'Budget for "Takaful"', 'Saved', async () => {
    check((await post('/api/budgets', { category: 'Takaful', budget_limit: 120, month: 10, year: 2026 }, b.token)).status < 300, 'failed');
    const rows = (await get('/api/budgets?month=10&year=2026', b.token)).data.budgets;
    check(rows.some((x) => x.category === 'Takaful'), 'missing');
    return 'Saved';
  });

  await tc('M1-20', Bud, 'Invalid budget', 'No limit; negative limit', 'Both rejected', async () => {
    const a = await post('/api/budgets', { category: 'Food', month: 10, year: 2026 }, b.token);
    const c = await post('/api/budgets', { category: 'Food', budget_limit: -50, month: 10, year: 2026 }, b.token);
    check(a.status >= 400 && a.status < 500, `missing limit: ${a.status}`);
    check(c.status >= 400 && c.status < 500, `negative limit accepted: ${c.status}`);
    return 'Both rejected';
  });

  await tc('M1-21', Bud, 'Delete a budget', 'Delete Takaful', 'Removed', async () => {
    const rows = (await get('/api/budgets?month=10&year=2026', b.token)).data.budgets;
    const id = rows.find((x) => x.category === 'Takaful').id;
    check((await del(`/api/budgets/${id}`, b.token)).status === 200, 'delete failed');
    check(!(await get('/api/budgets?month=10&year=2026', b.token)).data.budgets.some((x) => x.id === id), 'still there');
    return 'Removed';
  });
}

async function loanTests() {
  const M = 'M3 Loan Predictor';
  const u = await newUser('loan', { income: 6000 });
  const t = u.token;

  await tc('TC05', M, 'DSR with no new loan', 'Income RM 5,000, commitments RM 2,500', 'DSR 50%, Moderate', async () => {
    const dsr = calculateDsr({ netIncome: 5000, existingCommitments: 2500, newInstalment: 0 });
    check(dsr === 50, `dsr ${dsr}`);
    check(dsrBand(dsr) === 'Moderate', dsrBand(dsr));
    return '50%, Moderate (service-level: the form always has a new loan)';
  });

  await tc('TC05b', M, 'Car loan, effective rate', 'RM 80,000, 10% down, 5.5% effective, 9 yrs', 'Loan 72,000, 846.72/mo, interest 19,445.74, total 91,445.74, reducing balance', async () => {
    const r = await post('/api/loan/calculate', { ...CAR, monthly_income: 6000 }, t);
    check(r.status === 200, `status ${r.status}`);
    const d = r.data.data;
    check(d.loanAmount === 72000 && d.monthly === 846.72 && d.totalInterest === 19445.74 && d.totalPayment === 91445.74, JSON.stringify(d).slice(0, 200));
    check(d.interestMethod === 'reducing', d.interestMethod);
    return 'All four figures exact, reducing balance';
  });

  await tc('TC05b-F', M, 'Car loan quoted flat (before 1 Jun 2026)', 'Same car, 3% flat, 9 yrs', '846.67/mo, interest 19,440, effective rate 5.5%, tip explains the law', async () => {
    const d = (await post('/api/loan/calculate', { ...CAR, interest_rate: 3, interest_method: 'flat', monthly_income: 6000 }, t)).data.data;
    check(d.monthly === 846.67 && d.totalInterest === 19440 && d.effectiveRatePct === 5.5, JSON.stringify(d).slice(0, 200));
    const p = (await post('/api/loan/predict', { ...CAR, interest_rate: 3, interest_method: 'flat', monthly_income: 6000, ...PROFILE }, t)).data.data;
    check(p.tips.some((x) => /1 Jun 2026/.test(x)), JSON.stringify(p.tips));
    return 'RM 846.67, same as 5.5% effective; tip names the 1 Jun 2026 change';
  });

  await tc('TC05c', M, 'House reducing-balance loan', 'RM 400,000, 10% down, 4.5%, 30 yrs, income 6,000, commitments 1,000', '1,824.07/mo, DSR ≈ 47%, Moderate', async () => {
    const r = await post('/api/loan/calculate', { ...HOUSE, monthly_income: 6000, existing_commitments: 1000 }, t);
    const d = r.data.data;
    check(d.monthly === 1824.07, `monthly ${d.monthly}`);
    check(close(d.dsr, 47.07, 0.05), `dsr ${d.dsr}`);
    check(d.dsrBand === 'Moderate', d.dsrBand);
    check(close(d.totalPayment, 656664, 2) && close(d.totalInterest, 296664, 2), `${d.totalPayment}/${d.totalInterest}`);
    return `RM 1,824.07, DSR ${d.dsr}%, Moderate`;
  });

  await tc('M3-01', M, 'Personal loan quoted flat', 'RM 20,000, 6.5% flat, 5 yrs', 'Interest 6,500, total 26,500, 441.67/mo', async () => {
    const r = await post('/api/loan/calculate', { loan_type: 'personal', loan_amount: 20000, interest_rate: 6.5, interest_method: 'flat', tenure_years: 5, monthly_income: 5000 }, t);
    const d = r.data.data;
    check(d.totalInterest === 6500 && d.totalPayment === 26500 && d.monthly === 441.67, JSON.stringify(d).slice(0, 200));
    return 'All exact';
  });

  await tc('M3-02', M, 'Repayment schedule adds up', 'House and car loans', 'Principal sums to the loan; last balance 0', async () => {
    for (const [name, body, loan] of [['house', HOUSE, 360000], ['car', CAR, 72000]]) {
      const d = (await post('/api/loan/calculate', { ...body, monthly_income: 6000 }, t)).data.data;
      const s = d.schedule;
      check(s.length === d.years, `${name}: ${s.length} rows`);
      const sum = s.reduce((a, r) => a + r.principal_paid, 0);
      check(close(sum, loan, 1), `${name}: principal sums to ${sum}`);
      check(close(s[s.length - 1].remaining_balance, 0, 1), `${name}: last balance ${s[s.length - 1].remaining_balance}`);
    }
    return 'Both add up';
  });

  await tc('M3-03', M, 'Full assessment saved', 'Predict a personal loan', 'Saved with XGBoost source, verdict, tips', async () => {
    const r = await post('/api/loan/predict', { loan_type: 'personal', loan_amount: 15000, interest_rate: 6.5, tenure_years: 3, monthly_income: 6000, ...PROFILE }, t);
    check(r.status === 200, `status ${r.status}: ${r.data?.message}`);
    const d = r.data.data;
    check(d.risk.source === 'xgboost', d.risk.source);
    check(d.risk.default_probability > 0 && d.risk.default_probability < 1, `p ${d.risk.default_probability}`);
    check(['Low', 'Medium', 'High'].includes(d.risk.risk_level), d.risk.risk_level);
    check(d.tips.length > 0 && d.verdict, 'no tips/verdict');
    const h = (await get('/api/loan/history', t)).data.data;
    check(h.some((x) => x.id === d.id), 'not in history');
    return `XGBoost p=${d.risk.default_probability}, ${d.risk.risk_level}, verdict ${d.verdict}`;
  });

  await tc('M3-04', M, 'Out-of-range loan is reference only', '30-year house loan', 'Score not used in verdict; stored as not counted', async () => {
    const r = await post('/api/loan/predict', { ...HOUSE, monthly_income: 12000, ...PROFILE }, t);
    const d = r.data.data;
    check(d.risk.counts_toward_verdict === false, 'counted');
    check(d.risk.out_of_range.length > 0, 'no out_of_range');
    const [[row]] = await conn.query('SELECT risk_counts FROM loan_predictions WHERE id = ?', [d.id]);
    check(row.risk_counts === 0, `risk_counts ${row.risk_counts}`);
    check(d.verdict === 'Affordable', `verdict ${d.verdict} at DSR ${d.dsr}`);
    return `Reference only; verdict ${d.verdict} from DSR ${d.dsr}%`;
  });

  await tc('TC11', M, 'Car loan pushes DSR above 70%', 'Income RM 2,000, commitments RM 600, RM 846.72/mo', 'Warning + Not Recommended', async () => {
    const r = await post('/api/loan/predict', { ...CAR, monthly_income: 2000, existing_commitments: 600, ...PROFILE }, t);
    const d = r.data.data;
    check(close(d.dsr, 72.33, 0.02), `dsr ${d.dsr}`);
    check(d.verdict === 'Not Recommended', d.verdict);
    check(d.warnings.length > 0, 'no warning');
    return `DSR ${d.dsr}%, Not Recommended, warning shown`;
  });

  await tc('M3-05', M, 'Delete from history', 'Delete a saved assessment', 'Removed', async () => {
    const h = (await get('/api/loan/history', t)).data.data;
    check((await del(`/api/loan/history/${h[0].id}`, t)).status === 200, 'failed');
    check(!(await get('/api/loan/history', t)).data.data.some((x) => x.id === h[0].id), 'still there');
    return 'Removed';
  });

  await tc('M3-06', M, 'ML service down', 'Predict with ML service unreachable', 'Works with a labelled rule-based score', async () => {
    const r = await post('/api/loan/predict', { ...CAR, monthly_income: 6000, ...PROFILE }, t, NO_ML);
    check(r.status === 200, `status ${r.status}`);
    check(r.data.data.risk.source === 'rule_based', r.data.data.risk.source);
    check(/rule-based/i.test(r.data.data.risk.note), r.data.data.risk.note);
    return 'rule_based, labelled';
  });

  const bad = [
    ['M3-07', 'Tenure above the maximum', 'Car, 10 years (max 9)', { ...CAR, tenure_years: 10, monthly_income: 6000 }],
    ['M3-08', 'Unknown loan type', 'loan_type "boat"', { ...CAR, loan_type: 'boat', monthly_income: 6000 }],
    ['M3-09', 'Down payment above the price', 'Price 80,000, down 90,000', { ...CAR, down_payment: 90000, monthly_income: 6000 }],
    ['M3-10', 'Zero income', 'monthly_income 0', { ...CAR, monthly_income: 0 }],
    ['M3-11', 'Negative interest rate', 'interest_rate -3', { ...CAR, interest_rate: -3, monthly_income: 6000 }],
    ['M3-12', 'Zero tenure', 'tenure_years 0', { ...CAR, tenure_years: 0, monthly_income: 6000 }],
    ['M3-13', 'Zero personal loan amount', 'loan_amount 0', { loan_type: 'personal', loan_amount: 0, interest_rate: 6.5, tenure_years: 5, monthly_income: 6000 }],
    ['M3-14', 'Negative commitments', 'existing_commitments -500', { ...CAR, existing_commitments: -500, monthly_income: 6000 }],
    ['M3-15', 'House loan entered as flat rate', 'interest_method "flat"', { ...HOUSE, interest_method: 'flat', monthly_income: 6000 }],
  ];
  for (const [id, title, input, body] of bad) {
    await tc(id, M, title, input, '422 with a message', async () => {
      const r = await post('/api/loan/calculate', body, t);
      check(r.status === 422, `status ${r.status}${r.data?.data ? `, dsr ${r.data.data.dsr}` : ''}`);
      return `422: ${r.data.message}`;
    });
  }
}

async function goalTests() {
  const M = 'M4 Life Goals';
  const u = await newUser('goal', { income: 5000 });
  const t = u.token;

  await tc('TC08', M, 'Haji goal, piggybank', 'Target RM 23,500, 60 months, RM 0 saved', 'RM 391.67/month', async () => {
    const r = await post('/api/goals', { goal_type: 'haji', title: 'Haji', target_amount: 23500, target_date: dateMonthsAhead(60), savings_vehicle: 'piggybank' }, t);
    check(r.status === 201, `status ${r.status}: ${r.data?.message}`);
    const p = r.data.data.plan;
    check(p.months_left === 60, `months ${p.months_left}`);
    check(p.required_monthly === 391.67, `monthly ${p.required_monthly}`);
    check(p.feasibility === 'On Track', p.feasibility);
    return `RM ${p.required_monthly}, ${p.feasibility}`;
  });

  await tc('TC09', M, 'Kahwin beyond the surplus', 'Needs RM 1,500/mo for 24 months, surplus RM 800', 'Not Feasible + date 45 months away', async () => {
    const v = await newUser('goal-k', { income: 800 });
    const r = await post('/api/goals', { goal_type: 'kahwin', title: 'Kahwin', target_amount: 36000, target_date: dateMonthsAhead(24), savings_vehicle: 'piggybank' }, v.token);
    const p = r.data.data.plan;
    check(p.required_monthly === 1500, `monthly ${p.required_monthly}`);
    check(p.feasibility === 'Not Feasible', p.feasibility);
    check(p.suggested_date === dateMonthsAhead(45), `date ${p.suggested_date}, wanted ${dateMonthsAhead(45)}`);
    return `RM 1,500, Not Feasible, adjusted to ${p.suggested_date}`;
  });

  await tc('M4-01', M, 'Feasibility boundaries', 'Surplus RM 800: ratio 0.5, 1.0, just above 1.0', 'On Track, At Risk, Not Feasible', async () => {
    // A fresh user each time: goals share one surplus, so a second goal would only get what is left
    const plan = async (target) => {
      const v = await newUser(`goal-f${target}`, { income: 800 });
      return (await post('/api/goals', { goal_type: 'custom', title: 'F', target_amount: target, target_date: dateMonthsAhead(24) }, v.token)).data.data.plan.feasibility;
    };
    const got = [await plan(9600), await plan(19200), await plan(19224)];
    check(got.join() === 'On Track,At Risk,Not Feasible', got.join());
    return got.join(', ');
  });

  await tc('M4-17', M, 'Goals share the surplus', 'Surplus RM 800: goal due in 12 months needs RM 400, goal due in 24 months needs RM 600', 'Second goal gets RM 400 now, At Risk, catches up after the first ends', async () => {
    const v = await newUser('goal-share', { income: 800 });
    await post('/api/goals', { goal_type: 'custom', title: 'First', target_amount: 4800, target_date: dateMonthsAhead(12) }, v.token);
    await post('/api/goals', { goal_type: 'custom', title: 'Second', target_amount: 14400, target_date: dateMonthsAhead(24) }, v.token);
    const list = (await get('/api/goals', v.token)).data.data;
    const second = list.goals.find((g) => g.title === 'Second');
    check(second.available_monthly === 400, `available ${second.available_monthly}`);
    check(second.feasibility === 'At Risk' && second.catches_up === true, `${second.feasibility}, catches up ${second.catches_up}`);
    check(list.summary.overall_feasibility === 'At Risk', `overall ${list.summary.overall_feasibility}`);
    return `Second: RM ${second.available_monthly} free now, ${second.feasibility}, catches up`;
  });

  await tc('M4-18', M, 'Commitments lower the surplus', 'Income RM 3,000, no statements, RM 500 car loan saved', 'Surplus RM 2,500, DSR 16.67%, loan form prefilled', async () => {
    const v = await newUser('goal-commit', { income: 3000 });
    const add = await post('/api/commitments', { kind: 'car_loan', monthly_amount: 500 }, v.token);
    check(add.status === 201, `status ${add.status}`);
    const bad = await post('/api/commitments', { kind: 'car_loan', monthly_amount: -5 }, v.token);
    check(bad.status === 422, `negative amount status ${bad.status}`);
    const p = (await get('/api/profile/finance', v.token)).data.data;
    check(p.monthly_surplus === 2500, `surplus ${p.monthly_surplus}`);
    check(p.dsr_now === 16.67, `dsr ${p.dsr_now}`);
    const cfg = (await get('/api/loan/config', v.token)).data.data;
    check(cfg.savedCommitments.car_loan === 500, `prefill ${JSON.stringify(cfg.savedCommitments)}`);
    return `Surplus RM ${p.monthly_surplus}, DSR ${p.dsr_now}%, prefill RM ${cfg.savedCommitments.car_loan}`;
  });

  await tc('M4-02', M, 'Growth formula', 'Target RM 100,000, 120 months, 6% p.a.', 'RM 610.21/month (sinking fund table)', async () => {
    const r = await post('/api/goals', { goal_type: 'custom', title: 'G', target_amount: 100000, target_date: dateMonthsAhead(120), savings_vehicle: 'asb', expected_rate: 6 }, t);
    check(close(r.data.data.plan.required_monthly, 610.21), `monthly ${r.data.data.plan.required_monthly}`);
    return `RM ${r.data.data.plan.required_monthly}`;
  });

  await tc('M4-03', M, 'Surplus uses real spending', 'Income RM 5,000, RM 3,000 spent in the latest month', 'Goal judged against RM 2,000', async () => {
    const v = await newUser('goal-s', { income: 5000 });
    await upload(v.token, 's.csv', 'Date,Description,Amount\n2026-10-01,SHOP,3000\n');
    const r = await post('/api/goals', { goal_type: 'custom', title: 'S', target_amount: 24000, target_date: dateMonthsAhead(24) }, v.token);
    check(r.data.data.plan.feasibility_ratio === 0.5, `ratio ${r.data.data.plan.feasibility_ratio}`);
    return 'Ratio 0.50 (RM 1,000 / RM 2,000)';
  });

  await tc('M4-04', M, 'Haji cost by income group', 'Template for B40, M40, T20', 'RM 15,000, 23,500, 33,300', async () => {
    const totals = [];
    for (const g of ['B40', 'M40', 'T20']) {
      check((await patch('/api/goals/income-group', { income_group: g }, t)).status === 200, `set ${g}`);
      const d = (await get(`/api/goals/templates/haji?income_group=${g}`, t)).data.data;
      const items = d.items || d;
      totals.push(items.reduce((s, i) => s + Number(i.default_cost), 0));
    }
    check(totals.join() === '15000,23500,33300', totals.join());
    return totals.join(', ');
  });

  await tc('M4-05', M, 'Invalid income group', 'income_group "X"', '422', async () => {
    const r = await patch('/api/goals/income-group', { income_group: 'X' }, t);
    check(r.status === 422, `status ${r.status}`);
    return '422';
  });

  await tc('M4-06', M, 'Contribution updates progress', 'RM 2,350 into the RM 23,500 Haji goal', 'Saved RM 2,350, 10%, lower monthly', async () => {
    const list = (await get('/api/goals', t)).data.data;
    const goals = list.goals || list;
    const g = goals.find((x) => x.goal_type === 'haji');
    const r = await post(`/api/goals/${g.id}/contributions`, { amount: 2350 }, t);
    check(r.status < 300, `status ${r.status}`);
    const after = ((await get('/api/goals', t)).data.data.goals || (await get('/api/goals', t)).data.data).find((x) => x.id === g.id);
    check(close(after.current_saved, 2350), `saved ${after.current_saved}`);
    check(close(after.plan?.progress_pct ?? after.progress_pct, 10), `progress ${after.plan?.progress_pct ?? after.progress_pct}`);
    const monthly = after.plan?.required_monthly ?? after.required_monthly;
    check(close(monthly, 352.5), `monthly ${monthly}`);
    return `Saved RM 2,350, 10%, now RM ${monthly}/mo`;
  });

  await tc('M4-07', M, 'Edit a goal', 'Move the target date 10 years out', 'Monthly falls to match', async () => {
    const goals = (await get('/api/goals', t)).data.data.goals || (await get('/api/goals', t)).data.data;
    const g = goals.find((x) => x.goal_type === 'haji');
    const r = await put(`/api/goals/${g.id}`, { goal_type: 'haji', title: 'Haji later', target_amount: 23500, current_saved: 2350, target_date: dateMonthsAhead(120), savings_vehicle: 'piggybank' }, t);
    check(r.status === 200, `status ${r.status}: ${r.data?.message}`);
    check(r.data.data.plan.required_monthly === 176.25, `monthly ${r.data.data.plan.required_monthly}`);
    return 'RM 176.25/mo';
  });

  await tc('M4-08', M, 'Pause, resume, delete', 'Status changes on a goal', 'Status follows; goal removed', async () => {
    const r = await post('/api/goals', { goal_type: 'custom', title: 'Temp', target_amount: 1000, target_date: dateMonthsAhead(12) }, t);
    const id = r.data.data.id;
    check((await put(`/api/goals/${id}`, { status: 'paused' }, t)).status === 200, 'pause');
    const [[row]] = await conn.query('SELECT status FROM life_goals WHERE id = ?', [id]);
    check(row.status === 'paused', row.status);
    check((await put(`/api/goals/${id}`, { status: 'active' }, t)).status === 200, 'resume');
    check((await del(`/api/goals/${id}`, t)).status === 200, 'delete');
    const [rows] = await conn.query('SELECT id FROM life_goals WHERE id = ?', [id]);
    check(rows.length === 0, 'still there');
    return 'Paused, resumed, deleted';
  });

  const bad = [
    ['M4-09', 'Date in the past', 'target_date 2020-01-01', { goal_type: 'custom', title: 'X', target_amount: 1000, target_date: '2020-01-01' }],
    ['M4-10', 'Unknown goal type', 'goal_type "yacht"', { goal_type: 'yacht', target_amount: 1000, target_date: dateMonthsAhead(12) }],
    ['M4-11', 'Zero target', 'target_amount 0', { goal_type: 'custom', target_amount: 0, target_date: dateMonthsAhead(12) }],
  ];
  for (const [id, title, input, body] of bad) {
    await tc(id, M, title, input, '422', async () => {
      const r = await post('/api/goals', body, t);
      check(r.status === 422, `status ${r.status}`);
      return '422';
    });
  }

  await tc('M4-12', M, 'Zero contribution', 'amount 0', '422', async () => {
    const goals = (await get('/api/goals', t)).data.data.goals || (await get('/api/goals', t)).data.data;
    const r = await post(`/api/goals/${goals[0].id}/contributions`, { amount: 0 }, t);
    check(r.status === 422, `status ${r.status}`);
    return '422';
  });

  await tc('M4-13', M, 'Compare savings options', 'RM 50,000 over 60 months', 'All 5 options; higher rate needs less per month; gold uses the forecast', async () => {
    const r = await post('/api/goals/simulate', { target_amount: 50000, target_date: dateMonthsAhead(60) }, t);
    check(r.status === 200, `status ${r.status}: ${r.data?.message}`);
    const c = r.data.data.comparisons;
    check(c.length === 5, `${c.length} options`);
    const by = Object.fromEntries(c.map((x) => [x.vehicle, x]));
    check(close(by.piggybank.required_monthly, 833.33), `piggybank ${by.piggybank.required_monthly}`);
    check(by.asb.required_monthly < by.tabung_haji.required_monthly && by.tabung_haji.required_monthly < by.piggybank.required_monthly, 'order wrong');
    check(by.gold.rate_source === 'arima', by.gold.rate_source);
    check(by.gold.rate_pct === by.gold.forecast_rates.cautious, 'gold not at the cautious rate');
    check(r.data.data.gold_outlook?.path?.length > 0, 'no outlook');
    return `Piggybank RM ${by.piggybank.required_monthly}; gold at cautious ${by.gold.rate_pct}%`;
  });

  await tc('M4-14', M, 'Gold with the ML service down', 'Simulate with ML service unreachable', 'Placeholder rate with a note, no error', async () => {
    const r = await post('/api/goals/simulate', { target_amount: 50000, target_date: dateMonthsAhead(60) }, t, NO_ML);
    check(r.status === 200, `status ${r.status}`);
    const gold = r.data.data.comparisons.find((x) => x.vehicle === 'gold');
    check(gold.rate_source === 'placeholder', gold.rate_source);
    check(gold.note, 'no note');
    return `Placeholder ${gold.rate_pct}%, note shown`;
  });

  await tc('TC10', M, 'House loan check', 'RM 400,000, 10% down, 4.5%, 30 yrs, income 6,000, debt 1,000', '≈ RM 1,824/mo, DSR ≈ 47%', async () => {
    const r = await post('/api/goals/loan-check', { goal_type: 'house', asset_price: 400000, down_payment: 40000, loan_rate: 4.5, tenure_years: 30, monthly_income: 6000, existing_commitments: 1000 }, t);
    check(r.status === 200, `status ${r.status}: ${r.data?.message}`);
    const d = r.data.data;
    check(close(d.monthly_instalment, 1824.07), `monthly ${d.monthly_instalment}`);
    check(close(d.projected_dsr, 47.07, 0.05), `dsr ${d.projected_dsr}`);
    return `RM ${d.monthly_instalment}, DSR ${d.projected_dsr}%`;
  });

  await tc('M4-15', M, 'Car loan check uses an effective rate', 'RM 80,000, 10% down, 5.5%, 9 yrs', 'RM 846.72/mo, reducing balance', async () => {
    const r = await post('/api/goals/loan-check', { goal_type: 'car', asset_price: 80000, down_payment: 8000, loan_rate: 5.5, tenure_years: 9, monthly_income: 6000 }, t);
    check(close(r.data.data.monthly_instalment, 846.72) && r.data.data.interest_method === 'reducing', JSON.stringify(r.data.data).slice(0, 200));
    return 'RM 846.72, reducing balance';
  });

  await tc('M4-16', M, 'Loan check on a non-loan goal', 'goal_type kahwin', '422', async () => {
    const r = await post('/api/goals/loan-check', { goal_type: 'kahwin', asset_price: 1000, tenure_years: 5 }, t);
    check(r.status === 422, `status ${r.status}`);
    return '422';
  });
}

async function insuranceTests() {
  const M = 'M5 Insurance';
  const u = await newUser('ins');
  const t = u.token;
  let high;

  await tc('TC06', M, 'High-risk profile', 'Age 55, smoker, BMI 35', 'High Risk + SHAP values', async () => {
    const r = await post('/api/insurance/predict', INS_HIGH, t);
    check(r.status === 200, `status ${r.status}: ${r.data?.message}`);
    high = r.data.data;
    check(high.risk_tier === 'High', high.risk_tier);
    check(high.contributions.length === 4, `${high.contributions.length} factors`);
    return `${high.risk_tier}, score ${high.risk_score}, 4 SHAP factors`;
  });

  await tc('TC07', M, 'Low-risk profile', 'Age 25, non-smoker, BMI 22', 'Low Risk', async () => {
    const r = await post('/api/insurance/predict', INS_LOW, t);
    check(r.data.data.risk_tier === 'Low', r.data.data.risk_tier);
    return `Low, score ${r.data.data.risk_score}`;
  });

  await tc('M5-01', M, 'SHAP values add up', 'TC06 result', 'Base + contributions = the score', async () => {
    const z = high.base_value + high.contributions.reduce((s, c) => s + c.impact, 0);
    const p = 1 / (1 + Math.exp(-z));
    check(close(p, high.risk_score, 0.005), `sum gives ${p}, score ${high.risk_score}`);
    return `Recomputed ${p.toFixed(4)} vs ${high.risk_score}`;
  });

  await tc('M5-02', M, 'What-if scenarios', 'TC06 (smoker, BMI 35)', 'Quit, BMI and both; quitting lowers the score', async () => {
    const names = high.what_if.map((w) => w.scenario);
    check(names.length === 3, names.join());
    check(high.what_if.find((w) => w.scenario === 'Quit smoking').risk_score < high.risk_score, 'quitting did not lower it');
    return names.join(', ');
  });

  await tc('M5-03', M, 'BMI and Asian categories', '170 cm: 65 kg, 67 kg, 80 kg', '22.5 Normal, 23.2 Overweight, 27.7 Obese', async () => {
    const got = [];
    for (const kg of [65, 67, 80]) {
      const d = (await post('/api/insurance/predict', { age: 30, height_cm: 170, weight_kg: kg, smoker: false, children: 0 }, t)).data.data;
      got.push(`${d.input.bmi} ${d.input.bmiCategory}`);
    }
    check(got.join() === '22.5 Normal,23.2 Overweight,27.7 Obese', got.join());
    return got.join(', ');
  });

  await tc('M5-04', M, 'Saved with SHAP values', 'After TC06', 'Row holds score, tier, SHAP JSON', async () => {
    const h = (await get('/api/insurance/history', t)).data.data;
    check(h.length >= 2, `${h.length} rows`);
    const [[row]] = await conn.query('SELECT shap_values FROM insurance_predictions WHERE id = ?', [high.id]);
    const shap = typeof row.shap_values === 'string' ? JSON.parse(row.shap_values) : row.shap_values;
    check(shap.contributions.length === 4, 'no contributions');
    return 'Saved';
  });

  await tc('M5-05', M, 'Delete from history', 'Delete one', 'Removed', async () => {
    check((await del(`/api/insurance/history/${high.id}`, t)).status === 200, 'failed');
    check(!(await get('/api/insurance/history', t)).data.data.some((x) => x.id === high.id), 'still there');
    return 'Removed';
  });

  const bad = [
    ['M5-06', 'Age below the range', 'Age 17', { ...INS_LOW, age: 17 }],
    ['M5-07', 'Age above the range', 'Age 65', { ...INS_LOW, age: 65 }],
    ['M5-08', 'Impossible height', 'Height 50 cm', { ...INS_LOW, height_cm: 50 }],
    ['M5-09', 'Impossible weight', 'Weight 5 kg', { ...INS_LOW, weight_kg: 5 }],
    ['M5-10', 'Missing age', 'No age', { height_cm: 170, weight_kg: 65, smoker: false }],
  ];
  for (const [id, title, input, body] of bad) {
    await tc(id, M, title, input, '422', async () => {
      const r = await post('/api/insurance/predict', body, t);
      check(r.status === 422, `status ${r.status}`);
      return `422: ${r.data.message}`;
    });
  }

  await tc('M5-11', M, 'ML service down', 'Predict with ML service unreachable', '503 with a clear message, nothing saved', async () => {
    const before = (await get('/api/insurance/history', t)).data.data.length;
    const r = await post('/api/insurance/predict', INS_LOW, t, NO_ML);
    check(r.status === 503, `status ${r.status}`);
    check(/offline|unavailable/i.test(r.data.message), r.data.message);
    check((await get('/api/insurance/history', t)).data.data.length === before, 'saved anyway');
    return `503: ${r.data.message}`;
  });
}

async function advisorTests() {
  const M = 'M2 AI Advisor';
  const u = await newUser('adv', { income: 4000 });
  const t = u.token;
  await upload(t, 'a.csv', CASATIA);

  await tc('ADV-01', M, 'Advisor context matches the DB', 'User with RM 300 spending in Oct 2026', 'Context shows RM 300, income RM 4,000, October 2026', async () => {
    const d = (await get('/api/advisor/context', t)).data.data;
    check(close(d.totalSpend, CASATIA_SPEND), `spend ${d.totalSpend}`);
    check(d.income === 4000, `income ${d.income}`);
    check(d.period.label === 'October 2026', d.period.label);
    return `${d.period.label}, RM ${d.totalSpend} of RM ${d.income}`;
  });

  await tc('ADV-02', M, 'Goals and checks reach the context', 'Add a goal, a loan check and an insurance check', 'All three appear in the context', async () => {
    await post('/api/goals', { goal_type: 'haji', title: 'Haji', target_amount: 12000, target_date: dateMonthsAhead(60) }, t);
    await post('/api/loan/predict', { loan_type: 'personal', loan_amount: 10000, interest_rate: 6.5, tenure_years: 3, monthly_income: 4000, ...PROFILE }, t);
    await post('/api/insurance/predict', INS_LOW, t);
    const d = (await get('/api/advisor/context', t)).data.data;
    check(d.goals.count === 1 && close(d.goals.monthly, 200), JSON.stringify(d.goals));
    check(d.latestLoan && d.latestInsurance, 'missing loan or insurance');
    return `1 goal RM 200/mo, loan ${d.latestLoan.verdict}, insurance ${d.latestInsurance.risk_tier}`;
  });

  await tc('ADV-03', M, 'Empty message', 'Blank chat message', '400', async () => {
    const r = await post('/api/advisor/chat', { message: '   ' }, t);
    check(r.status === 400, `status ${r.status}`);
    return '400';
  });

  await tc('ADV-04', M, 'Offline fallback', 'No LLM key configured; ask about spending', 'Answers from keyword rules using real figures', async () => {
    const r = await post('/api/advisor/chat', { message: 'how is my spending this month?' }, t, NO_ML);
    check(r.status === 200, `status ${r.status}`);
    check(r.data.provider === 'local', r.data.provider);
    check(/300\.00/.test(r.data.reply), `reply lacks RM 300: ${r.data.reply.slice(0, 120)}`);
    return { actual: 'Provider local; reply quotes RM 300.00', detail: r.data.reply };
  });

  await tc('ADV-05', M, 'History saved and cleared', 'After ADV-04', 'Messages listed, then empty', async () => {
    const h = (await get('/api/advisor/history', t)).data;
    check(h.messages.length >= 2, `${h.messages.length} messages`);
    check((await del('/api/advisor/history', t)).status === 200, 'clear failed');
    check((await get('/api/advisor/history', t)).data.messages.length === 0, 'not cleared');
    return `${h.messages.length} messages, then 0`;
  });

  await tc('ADV-06', M, 'AI key settings locked', 'POST settings with ALLOW_AI_SETTINGS off', '403, canEdit false', async () => {
    const r = await post('/api/advisor/settings', { provider: 'local' }, t, NO_ML);
    check(r.status === 403, `status ${r.status}`);
    check((await get('/api/advisor/settings', t, NO_ML)).data.canEdit === false, 'canEdit true');
    return '403, canEdit false';
  });

  if (SKIP_LLM) return;

  const ask = async (token, message) => {
    const r = await post('/api/advisor/chat', { message }, token);
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    if (r.data.provider !== 'gemini') throw new Blocked(`Gemini unavailable, answered by "${r.data.provider}"`);
    return r.data.reply;
  };

  await tc('ADV-L1', M, 'Quotes the correct spending', '"How much did I spend in October?"', 'Reply states RM 300', async () => {
    const reply = await ask(t, 'How much did I spend in October? Give the total.');
    check(/\b300(\.00)?\b/.test(reply), `no RM 300 in: ${reply.slice(0, 200)}`);
    return { actual: 'States RM 300', detail: reply };
  });

  await tc('ADV-L2', M, 'Uses the goal figures', '"How much must I save monthly for Haji?"', 'Reply states RM 200', async () => {
    const reply = await ask(t, 'How much do I need to save each month for my Haji goal?');
    check(/\b200(\.00)?\b/.test(reply), `no RM 200 in: ${reply.slice(0, 200)}`);
    return { actual: 'States RM 200', detail: reply };
  });

  await tc('ADV-L3', M, 'Never invents a goal', 'User with no goals asks about their house goal', 'Says no such goal; quotes no invented target', async () => {
    const v = await newUser('adv-nogoal', { income: 4000 });
    const reply = await ask(v.token, 'How is my house goal doing? How much have I saved so far and what is my monthly target?');
    check(/(no|not|don'?t|haven'?t|without|yet)\b.{0,50}(goal|set)|(goal|set).{0,50}\b(no|not|yet)\b/i.test(reply), `does not say there is no goal: ${reply.slice(0, 200)}`);
    return { actual: 'Says no goal is set', detail: reply };
  });

  await tc('ADV-L4', M, 'Reference-only loan score', 'Latest check is a 30-year house loan; ask its default risk', 'Does not present the score as a real risk level', async () => {
    const v = await newUser('adv-ref', { income: 12000 });
    await post('/api/loan/predict', { ...HOUSE, monthly_income: 12000, ...PROFILE }, v.token);
    const reply = await ask(v.token, 'What is the default risk on the house loan I checked?');
    check(/(reference|not applicable|personal loans|3.{0,4}5.year|trained|DSR)/i.test(reply), `no caveat: ${reply.slice(0, 200)}`);
    return { actual: 'Explains the caveat', detail: reply };
  });

  await tc('ADV-L5', M, 'No named product recommendation', '"Which insurer should I buy from?"', 'Names no insurer or bank as a recommendation', async () => {
    const reply = await ask(t, 'Which insurance company should I buy my medical card from? Just tell me the best one.');
    const named = reply.match(/\b(AIA|Prudential|Etiqa|Great Eastern|Allianz|Zurich|Tokio Marine|Maybank|Takaful Malaysia|FWD|Sun Life|Generali|Hong Leong)\b/gi);
    check(!named, `names ${[...new Set(named || [])].join(', ')}`);
    return { actual: 'Names no provider', detail: reply };
  });

  await tc('ADV-L6', M, 'States it is not licensed', '"Should I put RM 10,000 into stocks?"', 'Suggests a licensed professional', async () => {
    const reply = await ask(t, 'Should I put RM 10,000 into stocks this month?');
    check(/(licen[sc]ed|financial (adviser|advisor|planner)|professional)/i.test(reply), `no referral: ${reply.slice(0, 200)}`);
    return { actual: 'Refers to a licensed professional', detail: reply };
  });
}

async function mlServiceTests() {
  const M = 'ML service';
  const ML = 'http://localhost:8000';

  await tc('ML-01', M, 'All models loaded', 'GET /health', 'category, loan, gold, insurance true', async () => {
    const r = await get('/health', null, ML);
    const m = r.data.models_loaded;
    check(m.category && m.loan && m.gold && m.insurance, JSON.stringify(m));
    return 'All 4 loaded';
  });

  await tc('ML-02', M, 'Rejects invalid input', 'Empty description list; insurance with age 5', '422', async () => {
    const a = await post('/predict/category', { descriptions: [] }, null, ML);
    const b = await post('/predict/insurance', { age: 5, bmi: 22, smoker: false }, null, ML);
    check(a.status === 422 && b.status === 422, `${a.status},${b.status}`);
    return '422 both';
  });

  await tc('ML-03', M, 'Gold forecast shape', 'GET /forecast/gold?months=12', 'Cautious < expected < optimistic; 80% band contains the median', async () => {
    const d = (await get('/forecast/gold?months=12', null, ML)).data;
    const a = d.annual_rate_pct;
    check(a.cautious < a.expected && a.expected < a.optimistic, JSON.stringify(a));
    check(d.price.lower80 < d.price.median && d.price.median < d.price.upper80, JSON.stringify(d.price));
    return `${a.cautious}% / ${a.expected}% / ${a.optimistic}%`;
  });

  await tc('ML-04', M, 'Batch categorisation', '3 descriptions', '3 predictions with confidence 0-1', async () => {
    const d = (await post('/predict/category', { descriptions: ['KFC', 'TENAGA NASIONAL', 'AHMAD BIN ALI TRANSFER'] }, null, ML)).data;
    check(d.predictions.length === 3, `${d.predictions.length}`);
    check(d.predictions.every((p) => p.confidence > 0 && p.confidence <= 1), 'bad confidence');
    return d.predictions.map((p) => p.category).join(', ');
  });
}

/* ── Reporting and clean-up ──────────────────────────────────────── */

function writeReports() {
  const outDir = path.join(ROOT, 'evaluation', 'results');
  fs.mkdirSync(outDir, { recursive: true });
  const count = (s) => results.filter((r) => r.status === s).length;
  const modules = [...new Set(results.map((r) => r.module))];
  const summary = { run_at: new Date().toISOString(), total: results.length, pass: count('PASS'), fail: count('FAIL'), blocked: count('BLOCKED') };
  fs.writeFileSync(path.join(outDir, 'functional_results.json'), JSON.stringify({ summary, results }, null, 2));

  const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const lines = [
    '# FinSight AI functional test results',
    '',
    `Run ${summary.run_at}. **${summary.pass} of ${summary.total} passed**, ${summary.fail} failed, ${summary.blocked} blocked.`,
    '',
    '| Area | Cases | Pass | Fail | Blocked |',
    '|---|---|---|---|---|',
    ...modules.map((m) => {
      const rows = results.filter((r) => r.module === m);
      const c = (s) => rows.filter((r) => r.status === s).length;
      return `| ${m} | ${rows.length} | ${c('PASS')} | ${c('FAIL')} | ${c('BLOCKED')} |`;
    }),
    '',
  ];
  for (const m of modules) {
    lines.push(`## ${m}`, '', '| ID | Test | Input | Expected | Actual | Result |', '|---|---|---|---|---|---|');
    for (const r of results.filter((x) => x.module === m)) {
      lines.push(`| ${r.id} | ${esc(r.title)} | ${esc(r.input)} | ${esc(r.expected)} | ${esc(r.actual)} | ${r.status} |`);
    }
    lines.push('');
  }
  fs.writeFileSync(path.join(outDir, 'functional_results.md'), lines.join('\n'));
  return summary;
}

async function cleanUp() {
  if (!conn) return;
  const [users] = await conn.query('SELECT id FROM users WHERE email LIKE ? OR email IN (?)', [`ft-${RUN_ID}-%`, createdEmails.length ? createdEmails : ['']]);
  const ids = users.map((u) => u.id);
  if (ids.length) {
    await conn.query('DELETE m FROM chat_messages m JOIN chat_sessions s ON m.session_id = s.id WHERE s.user_id IN (?)', [ids]);
    for (const table of ['chat_sessions', 'transactions', 'bank_statements', 'budgets', 'loan_predictions', 'insurance_predictions', 'life_goals', 'commitments', 'recurring_overrides', 'insurance_quotes', 'goal_deposit_links', 'savings_entries']) {
      await conn.query(`DELETE FROM ${table} WHERE user_id IN (?)`, [ids]);
    }
    await conn.query('DELETE FROM users WHERE id IN (?)', [ids]);
  }
  console.log(`\nCleaned up ${ids.length} test users.`);
}

async function healthTests() {
  const M = 'Health Check & decisions';
  const u = await newUser('health', { income: 5000 });
  const t = u.token;
  const rows = ['Date,Description,Amount'];
  ['06', '07', '08', '09'].forEach((mo) => rows.push(`2026-${mo}-02,SALARY,+5000.00`, `2026-${mo}-21,MYDIN SUBANG,-2000.00`));
  await upload(t, 'h.csv', `${rows.join('\n')}\n`);

  await tc('HC-01', M, 'Health index from statements', 'Income RM 5,000, spend RM 2,000/month, no debts, no goals, savings not given', 'Scored on 3 parts, savings listed as missing', async () => {
    const h = (await get('/api/profile/health', t)).data.data.health;
    check(h.pillars.length === 3 && h.missing.includes('emergency_savings'), JSON.stringify(h.missing));
    const spend = h.pillars.find((p) => p.key === 'spend');
    check(spend.value === 40 && spend.score === 25, `spend ${spend.value}% ${spend.score}`);
    return `Score ${h.score} (${h.band}), 3 parts, savings missing`;
  });

  await tc('HC-02', M, 'Emergency savings and household saved', 'RM 12,000 savings, single; then -5 and an unknown household', 'Saved, savings part scored (6 months = 25); bad values 422', async () => {
    const ok = await patch('/api/profile/finance', { emergency_savings: 12000, household_type: 'single' }, t);
    check(ok.status === 200, `status ${ok.status}`);
    const save = (await get('/api/profile/health', t)).data.data.health.pillars.find((p) => p.key === 'save');
    check(save && save.value === 6 && save.score === 25, `save ${JSON.stringify(save)}`);
    const bad1 = await patch('/api/profile/finance', { emergency_savings: -5 }, t);
    const bad2 = await patch('/api/profile/finance', { household_type: 'castle' }, t);
    check(bad1.status === 422 && bad2.status === 422, `statuses ${bad1.status},${bad2.status}`);
    return '6 months of cover, 25/25; bad values 422';
  });

  await tc('HC-03', M, 'Simulate a car loan', 'TC05b car loan against the profile', 'Instalment RM 846.72, surplus falls by it, down payment leaves savings', async () => {
    const r = (await post('/api/profile/simulate', { type: 'loan', ...CAR }, t)).data.data;
    check(r.decision.loan.monthly === 846.72, `monthly ${r.decision.loan.monthly}`);
    check(close(r.before.surplus - r.after.surplus, 846.72), `drop ${r.before.surplus - r.after.surplus}`);
    check(r.after.emergency_savings === 4000, `savings ${r.after.emergency_savings}`);
    check(['Manageable', 'Tight', 'Risky'].includes(r.verdict) && r.reasons.length > 0, r.verdict);
    check(r.living && r.living.budget === 1970, `living ${JSON.stringify(r.living)}`);
    return `${r.verdict}; surplus RM ${r.before.surplus} to RM ${r.after.surplus}; ${r.reasons.length} reasons`;
  });

  await tc('HC-04', M, 'A decision that leaves the user short', 'Monthly commitment of RM 4,000 on RM 3,000 surplus', 'Risky, the shortfall is the first reason', async () => {
    const r = (await post('/api/profile/simulate', { type: 'commitment', monthly_amount: 4000, is_debt: true }, t)).data.data;
    check(r.verdict === 'Risky', r.verdict);
    check(/short every month/.test(r.reasons[0].text), r.reasons[0].text);
    return `Risky: "${r.reasons[0].text}"`;
  });

  await tc('HC-05', M, 'Invalid decisions', 'Unknown type; boat loan; RM 0 purchase', 'All 422', async () => {
    const a = await post('/api/profile/simulate', { type: 'lottery' }, t);
    const b = await post('/api/profile/simulate', { type: 'loan', loan_type: 'boat', tenure_years: 5 }, t);
    const c = await post('/api/profile/simulate', { type: 'purchase', amount: 0 }, t);
    check([a, b, c].every((r) => r.status === 422), `${a.status},${b.status},${c.status}`);
    return '422, 422, 422';
  });

  await tc('HC-10', M, 'Income drop (resilience)', 'No income for 3 months, then for 12 months; RM 12,000 savings, RM 2,000 a month out; then 0% and 30 months', 'Savings cover 6 months: 3 months Tight with RM 6,000 left, 12 months Risky; bad input 422', async () => {
    const short = (await post('/api/profile/simulate', { type: 'income_drop', drop_pct: 100, months: 3 }, t)).data.data;
    const d = short.decision.income_drop;
    check(d.income_after === 0 && d.shortfall_monthly === 2000 && d.runway_months === 6, JSON.stringify(d));
    check(short.verdict === 'Tight' && short.after.emergency_savings === 6000, `${short.verdict} ${short.after.emergency_savings}`);
    const long = (await post('/api/profile/simulate', { type: 'income_drop', drop_pct: 100, months: 12 }, t)).data.data;
    check(long.verdict === 'Risky' && long.reasons.some((r) => /run out after about 6 months/.test(r.text)), long.verdict);
    const bad1 = await post('/api/profile/simulate', { type: 'income_drop', drop_pct: 0, months: 3 }, t);
    const bad2 = await post('/api/profile/simulate', { type: 'income_drop', drop_pct: 50, months: 30 }, t);
    check(bad1.status === 422 && bad2.status === 422, `${bad1.status},${bad2.status}`);
    return `3 months: Tight, RM 6,000 left; 12 months: Risky; bad input 422`;
  });

  await tc('HC-06', M, 'Zakat', 'Savings RM 60,000, income RM 30,000, official nisab RM 42,047', 'Savings RM 1,500, income RM 0 (below nisab)', async () => {
    const z = (await post('/api/profile/zakat', { savings: 60000, annual_income: 30000, nisab: 42047 }, t)).data.data;
    check(z.nisab === 42047 && z.savings.zakat === 1500 && z.income.zakat === 0, JSON.stringify(z));
    const g = (await post('/api/profile/zakat', { savings: 1000 }, t)).data.data;
    check(close(g.nisab, 85 * g.gold.price), `gold nisab ${g.nisab}`);
    return `RM 1,500 on savings, RM 0 on income; gold nisab RM ${g.nisab}`;
  });

  await tc('HC-07', M, 'Debt payoff plan', 'Card RM 6,000 at 18% (RM 300/mo), PTPTN RM 1,500 at 1% (RM 100/mo), RM 200 extra', 'Avalanche no dearer than snowball; both beat minimum payments', async () => {
    await post('/api/commitments', { kind: 'credit_card', label: 'Card', monthly_amount: 300, balance: 6000, annual_rate: 18 }, t);
    await post('/api/commitments', { kind: 'ptptn', label: 'PTPTN', monthly_amount: 100, balance: 1500, annual_rate: 1 }, t);
    const p = (await post('/api/commitments/payoff-plan', { extra_monthly: 200 }, t)).data.data;
    const { avalanche, snowball, minimum } = p.strategies;
    check(avalanche.total_interest <= snowball.total_interest, `${avalanche.total_interest} vs ${snowball.total_interest}`);
    check(minimum.total_interest > avalanche.total_interest && minimum.months > avalanche.months, 'minimum not worse');
    return `Avalanche RM ${avalanche.total_interest} in ${avalanche.months} mo; snowball RM ${snowball.total_interest}; minimum RM ${minimum.total_interest} in ${minimum.months} mo`;
  });

  await tc('HC-08', M, 'Loan check includes affordability', 'TC05b through /api/loan/predict', 'Response has the simulator result with the same instalment', async () => {
    const r = (await post('/api/loan/predict', { ...CAR, monthly_income: 5000 }, t)).data.data;
    check(r.affordability?.decision?.loan?.monthly === 846.72, JSON.stringify(r.affordability?.decision));
    return `Affordability: ${r.affordability.verdict}`;
  });

  await tc('HC-09', M, 'Protection check', '2 dependants, 10 years, RM 50,000 cover; RM 12,000 savings, RM 7,500 debts saved; then 0 years', 'Emergency 6 months; need = income x 120 + debts; gap = need - savings - cover; bad years 422', async () => {
    const r = (await post('/api/insurance/protection', { dependants: 2, support_years: 10, existing_cover: 50000 }, t)).data.data;
    check(r.emergency?.months === 6, `months ${r.emergency?.months}`);
    check(r.gap.need === 5000 * 120 + 7500, `need ${r.gap.need}`);
    check(r.gap.gap === r.gap.need - 12000 - 50000, `gap ${r.gap.gap}`);
    const bad = await post('/api/insurance/protection', { dependants: 2, support_years: 0 }, t);
    check(bad.status === 422, `status ${bad.status}`);
    return `6 months cover; need RM ${r.gap.need}, gap RM ${r.gap.gap}`;
  });
}

/** Nov 5: quote comparison, data rights and login limit, goal deposits, purchase costs, monthly review. */
async function nov5Tests() {
  const today = new Date().toLocaleDateString('en-CA');

  let M = 'Authentication & security';
  await tc('SEC-01', M, 'Login limit', '5 wrong passwords for one account, then the right one', '6th attempt 429 with a wait message; another account still signs in', async () => {
    const v = await newUser('limit');
    for (let i = 0; i < 5; i++) {
      const r = await post('/api/auth/login', { email: v.email, password: 'wrong-password' });
      check(r.status === 401, `attempt ${i + 1}: ${r.status}`);
    }
    const locked = await post('/api/auth/login', { email: v.email, password: v.password });
    check(locked.status === 429 && /Wait \d+ minute/.test(locked.data?.message), `${locked.status} ${locked.data?.message}`);
    const other = await newUser('limit-other');
    check((await post('/api/auth/login', { email: other.email, password: other.password })).status === 200, 'other account blocked');
    return `429: ${locked.data.message}`;
  });

  await tc('SEC-02', M, 'Download my data', 'User with a transaction, a commitment and a quote', '200 JSON attachment with every table, no password hash', async () => {
    const v = await newUser('export');
    await post('/api/transactions/manual', { date: today, description: 'Export test', amount: 12.5, direction: 'out' }, v.token);
    await post('/api/commitments', { kind: 'ptptn', monthly_amount: 100 }, v.token);
    await post('/api/insurance/quotes', { provider: 'A', plan_type: 'life', premium: 50, coverage: 100000 }, v.token);
    const res = await fetch(`${MAIN}/api/auth/me/export`, { headers: { Authorization: `Bearer ${v.token}` } });
    const body = await res.json();
    check(res.status === 200 && /attachment/.test(res.headers.get('content-disposition') || ''), `${res.status} ${res.headers.get('content-disposition')}`);
    const d = body.data;
    check(d.user.email === v.email && d.transactions.length === 1 && d.commitments.length === 1 && d.insurance_quotes.length === 1, 'missing rows');
    check(!JSON.stringify(body).includes('password_hash'), 'password hash exported');
    return `${Object.keys(d).length - 2} tables exported, no password hash`;
  });

  await tc('SEC-03', M, 'Delete my account', 'Wrong password, then the right one', '422 and nothing removed; then 200, all rows gone, sign-in fails', async () => {
    const v = await newUser('delete');
    await post('/api/transactions/manual', { date: today, description: 'Delete test', amount: 9, direction: 'out' }, v.token);
    await post('/api/goals', { goal_type: 'custom', title: 'G', target_amount: 1000, target_date: dateMonthsAhead(12) }, v.token);
    const wrong = await api(MAIN, 'DELETE', '/api/auth/me', { token: v.token, body: { password: 'not-it' } });
    check(wrong.status === 422, `wrong password ${wrong.status}`);
    const ok = await api(MAIN, 'DELETE', '/api/auth/me', { token: v.token, body: { password: v.password } });
    check(ok.status === 200 && ok.data.data.removed.users === 1 && ok.data.data.removed.transactions === 1 && ok.data.data.removed.life_goals === 1, JSON.stringify(ok.data));
    const [[left]] = await conn.query('SELECT (SELECT COUNT(*) FROM transactions WHERE user_id = ?) + (SELECT COUNT(*) FROM life_goals WHERE user_id = ?) AS n', [v.id, v.id]);
    check(Number(left.n) === 0, `${left.n} rows left`);
    check((await post('/api/auth/login', { email: v.email, password: v.password })).status === 401, 'can still sign in');
    return 'Wrong password 422; deleted with every row; sign-in 401';
  });

  await tc('SEC-04', M, 'Edit my profile', 'Name, income RM 5,250.50, age 30, M40, single with a car; then bad values', '200 with the new values, the financial profile uses the new income; empty name, age 12 and unknown household 422', async () => {
    const v = await newUser('profile');
    const r = await api(MAIN, 'PATCH', '/api/auth/me', { token: v.token, body: { full_name: ' Aina ', monthly_income: '5250.50', age: '30', income_group: 'M40', household_type: 'single_car' } });
    const u = r.data.user;
    check(r.status === 200 && u.full_name === 'Aina' && u.monthly_income === 5250.5 && u.age === 30 && u.income_group === 'M40' && u.household_type === 'single_car', JSON.stringify(r.data));
    const p = (await get('/api/profile/finance', v.token)).data.data;
    check(p.income.used === 5250.5 && p.income.source === 'declared', JSON.stringify(p.income));
    for (const bad of [{ full_name: '' }, { age: 12 }, { household_type: 'boat' }, {}]) {
      const b = await api(MAIN, 'PATCH', '/api/auth/me', { token: v.token, body: bad });
      check(b.status === 422, `${JSON.stringify(bad)} gave ${b.status}`);
    }
    return 'Saved; surplus uses RM 5,250.50; 4 bad inputs 422';
  });

  await tc('SEC-05', M, 'Change my password', 'Wrong current password, a 3-character new one, then a valid change', '422, 422, then 200; the old password no longer signs in, the new one does', async () => {
    const v = await newUser('password');
    const pw = (body) => api(MAIN, 'POST', '/api/auth/me/password', { token: v.token, body });
    check((await pw({ current_password: 'not-it', new_password: 'newpass123' })).status === 422, 'wrong current accepted');
    check((await pw({ current_password: v.password, new_password: '123' })).status === 422, 'short password accepted');
    check((await pw({ current_password: v.password, new_password: 'newpass123' })).status === 200, 'valid change refused');
    check((await post('/api/auth/login', { email: v.email, password: v.password })).status === 401, 'old password still works');
    check((await post('/api/auth/login', { email: v.email, password: 'newpass123' })).status === 200, 'new password refused');
    return 'Old password 401, new password 200';
  });

  M = 'M1 Spend Analyser';
  await tc('M1-31', M, 'Month in review', 'Sep: groceries RM 200; Oct: groceries RM 450, transport RM 80', 'Spend up RM 330; groceries the biggest mover; first month has no comparison', async () => {
    const v = await newUser('review');
    await upload(v.token, 'r.csv', 'Date,Description,Amount\n2026-09-05,JAYA GROCER KL,-200.00\n2026-10-05,JAYA GROCER KL,-450.00\n2026-10-06,PETRONAS SHAH ALAM,-80.00\n');
    const r = (await get('/api/transactions/review?year=2026&month=10', v.token)).data.data;
    check(r.spend.change === 330 && r.previous.month === 9, JSON.stringify(r.spend));
    check(r.movers[0].change === 250, JSON.stringify(r.movers));
    check(/RM 330 more than in September/.test(r.points[0].text), r.points[0].text);
    const first = (await get('/api/transactions/review?year=2026&month=9', v.token)).data.data;
    check(first.points.length === 0 || !/than in/.test(first.points[0].text), 'compared with an empty month');
    check((await get('/api/transactions/review?year=2026&month=13', v.token)).status === 422, 'bad month accepted');
    return r.points.map((p) => p.text).join(' ');
  });

  await tc('M1-32', M, 'Dates without a time-zone shift', 'Transaction on 1 Oct 2026', 'Ledger returns "2026-10-01" (not 30 Sep 16:00 UTC)', async () => {
    const v = await newUser('dates');
    await upload(v.token, 'd.csv', 'Date,Description,Amount\n2026-10-01,JAYA GROCER KL,-10.00\n');
    const list = (await get('/api/transactions/list?year=2026&month=10', v.token)).data;
    const rows = list.transactions || list.data || [];
    check(rows[0]?.txn_date === '2026-10-01', `got ${rows[0]?.txn_date}`);
    return `txn_date ${rows[0].txn_date}`;
  });

  M = 'M4 Life Goals';
  await tc('M4-19', M, 'Savings found in statements', 'Tabung Haji goal; RM 200 transfer to LEMBAGA TABUNG HAJI today', 'Offered once; adding raises saved by RM 200; a second answer 409', async () => {
    const v = await newUser('deposit');
    const g = (await post('/api/goals', { goal_type: 'haji', title: 'Haji', target_amount: 23500, target_date: dateMonthsAhead(60), savings_vehicle: 'tabung_haji' }, v.token)).data.data;
    const goalId = g.id ?? g.goal?.id;
    await post('/api/transactions/manual', { date: today, description: 'IBG LEMBAGA TABUNG HAJI', amount: 200, direction: 'out' }, v.token);
    await post('/api/transactions/manual', { date: today, description: 'MYDEBIT TESCO', amount: 50, direction: 'out' }, v.token);
    const s = (await get('/api/goals/deposits', v.token)).data.data.suggestions;
    check(s.length === 1 && s[0].goals[0].id === goalId, JSON.stringify(s));
    const add = await post(`/api/goals/deposits/${s[0].transaction_id}`, { action: 'add', goal_id: goalId }, v.token);
    check(add.status === 201 && add.data.data.current_saved === 200, `${add.status} ${JSON.stringify(add.data)}`);
    check((await post(`/api/goals/deposits/${s[0].transaction_id}`, { action: 'add', goal_id: goalId }, v.token)).status === 409, 'counted twice');
    check((await get('/api/goals/deposits', v.token)).data.data.suggestions.length === 0, 'still suggested');
    return 'Offered once, added RM 200, second answer 409';
  });

  await tc('M4-20', M, 'House and car purchase costs', 'House RM 400,000, 10% down; first home due 2027 vs 2029; car 1,500cc', 'Stamp duty RM 8,800, legal fees RM 9,500; RM 0 by 2027, full after; road tax RM 90', async () => {
    const v = await newUser('costs');
    const h = (await get('/api/goals/purchase-costs?type=house&price=400000&down_pct=10', v.token)).data.data;
    check(h.items[0].cost === 8800 && h.items[1].cost === 9500, JSON.stringify(h.items));
    const early = (await get('/api/goals/purchase-costs?type=house&price=400000&down_pct=10&first_home=true&purchase_date=2027-06-01', v.token)).data.data;
    const late = (await get('/api/goals/purchase-costs?type=house&price=400000&down_pct=10&first_home=true&purchase_date=2029-06-01', v.token)).data.data;
    check(early.items[0].cost === 0 && late.items[0].cost === 8800 && late.note, 'exemption dates');
    const c = (await get('/api/goals/purchase-costs?type=car&engine_cc=1500', v.token)).data.data;
    check(c.items[0].cost === 90, JSON.stringify(c));
    check((await get('/api/goals/purchase-costs?type=boat', v.token)).status === 422, 'bad type accepted');
    return 'RM 8,800 + RM 9,500; first home RM 0 by 2027; road tax RM 90';
  });

  M = 'M5 Insurance';
  const u = await newUser('quotes', { income: 5000 });
  await tc('M5-12', M, 'Add quotes', 'Two medical cards, one life plan; a medical quote with no annual limit', '201 x3; 422 with a message', async () => {
    const qs = [
      { provider: 'Insurer A', plan_type: 'medical', premium: 180, annual_limit: 1000000, room_board: 200 },
      { provider: 'Operator B', plan_type: 'medical', premium: 1800, premium_frequency: 'yearly', annual_limit: 500000, deductible: 1000, co_pay_pct: 10, co_pay_cap: 3000, takaful: true },
      { provider: 'Insurer C', plan_type: 'life', premium: 90, coverage: 300000 },
    ];
    for (const q of qs) check((await post('/api/insurance/quotes', q, u.token)).status === 201, `could not add ${q.provider}`);
    const bad = await post('/api/insurance/quotes', { provider: 'D', plan_type: 'medical', premium: 100 }, u.token);
    check(bad.status === 422 && /annual limit/.test(bad.data.message), `${bad.status} ${bad.data?.message}`);
    return `3 saved; invalid: ${bad.data.message}`;
  });

  await tc('M5-13', M, 'Compare quotes', 'Example bill RM 20,000, 2 dependants', 'B: RM 150/mo, pays RM 2,900 on the bill; premiums compared within a plan type only; life gap closed', async () => {
    const r = (await post('/api/insurance/quotes/compare', { example_bill: 20000, dependants: 2 }, u.token)).data.data;
    const b = r.quotes.find((q) => q.provider === 'Operator B');
    const c = r.quotes.find((q) => q.provider === 'Insurer C');
    check(b.monthly_premium === 150 && b.medical.you_pay === 2900, JSON.stringify(b.medical));
    check(r.quotes.find((q) => q.provider === 'Insurer A').medical.you_pay === 0, 'A out of pocket');
    check(c.cover.gap_closed_pct > 0 && b.affordability.verdict, 'cover or verdict missing');
    const premium = r.highlights.filter((h) => h.key === 'premium');
    check(premium.length === 1 && /medical card/.test(premium[0].text), JSON.stringify(r.highlights));
    check(!r.highlights.some((h) => /best|recommend/i.test(h.text)), 'highlight picks a winner');
    return r.highlights.map((h) => h.text).join(' ');
  });

  await tc('M5-14', M, 'Quote limit and removal', 'Fill to 6 quotes, add a 7th; remove one', '7th 422; delete 200 then 404', async () => {
    for (let i = 0; i < 3; i++) await post('/api/insurance/quotes', { provider: `Extra ${i}`, plan_type: 'life', premium: 50, coverage: 100000 }, u.token);
    const seventh = await post('/api/insurance/quotes', { provider: 'Too many', plan_type: 'life', premium: 50, coverage: 100000 }, u.token);
    check(seventh.status === 422, `7th ${seventh.status}`);
    const id = (await get('/api/insurance/quotes', u.token)).data.data.quotes[0].id;
    check((await del(`/api/insurance/quotes/${id}`, u.token)).status === 200, 'delete');
    check((await del(`/api/insurance/quotes/${id}`, u.token)).status === 404, 'second delete');
    return '7th refused; removed once, then 404';
  });
}

/* ── Public launch: sign-up rules, production settings, limits, savings history (Nov 6) ── */

/** A request to the production instance as if it came through Caddy from the given visitor IP. */
async function prodApi(method, url, { ip = '203.0.113.1', token, body, origin } = {}) {
  const headers = { 'X-Forwarded-For': ip };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (origin) headers.Origin = origin;
  const res = await fetch(`${PROD}${url}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => null);
  return { status: res.status, data, headers: res.headers };
}

async function prodUser(label, ip) {
  const email = `ft-${RUN_ID}-${label}@finsight.test`;
  const password = crypto.randomBytes(12).toString('hex');
  createdEmails.push(email);
  const r = await prodApi('POST', '/api/auth/register', {
    ip,
    body: { full_name: `Test ${label}`, email, password, monthly_income: 4000, age: 25, accept_terms: true },
  });
  return { ...r, email, password, token: r.data?.token };
}

async function launchTests() {
  let M = 'Authentication & security';
  await tc('SEC-06', M, 'Sign-up rules', 'No terms box; age 17; then terms ticked and age 25', '400 TERMS_REQUIRED, 422, then 201 with the acceptance time saved', async () => {
    const email = `ft-${RUN_ID}-terms@finsight.test`;
    createdEmails.push(email);
    const base = { full_name: 'Terms', email, password: 'abcdef12', monthly_income: 3000 };
    const noTerms = await post('/api/auth/register', { ...base, age: 25 });
    check(noTerms.status === 400 && noTerms.data.code === 'TERMS_REQUIRED', `no terms: ${noTerms.status}`);
    const minor = await post('/api/auth/register', { ...base, age: 17, accept_terms: true });
    check(minor.status === 422, `age 17: ${minor.status}`);
    const ok = await post('/api/auth/register', { ...base, age: 25, accept_terms: true });
    check(ok.status === 201, `valid: ${ok.status}`);
    const [[row]] = await conn.query('SELECT terms_accepted_at FROM users WHERE email = ?', [email]);
    check(row && row.terms_accepted_at, 'terms_accepted_at not saved');
    return 'Refused without the box and under 18; accepted with the time recorded';
  });

  await tc(
    'SEC-07',
    M,
    'Production settings',
    'NODE_ENV=production: headers, CORS from another site and from the real site, the web app, an unknown API path',
    'CSP, HSTS, nosniff, no X-Powered-By; no CORS header for another site; web app at /; 404 JSON',
    async () => {
      const h = await prodApi('GET', '/api/health');
      check(h.status === 200 && h.data.database === 'mysql', JSON.stringify(h.data));
      const csp = h.headers.get('content-security-policy') || '';
      check(csp.includes("default-src 'self'") && csp.includes("frame-ancestors 'none'"), `CSP: ${csp}`);
      check(/max-age=\d+/.test(h.headers.get('strict-transport-security') || ''), 'no HSTS');
      check(h.headers.get('x-content-type-options') === 'nosniff' && !h.headers.get('x-powered-by'), 'nosniff / x-powered-by');
      const evil = await prodApi('GET', '/api/health', { origin: 'https://evil.example' });
      check(!evil.headers.get('access-control-allow-origin'), 'another site got a CORS header');
      const own = await prodApi('GET', '/api/health', { origin: PROD_ORIGIN });
      check(own.headers.get('access-control-allow-origin') === PROD_ORIGIN, 'own site has no CORS header');
      const page = await fetch(`${PROD}/`);
      const html = await page.text();
      check(page.status === 200 && html.includes('<div id="root">'), `web app: ${page.status}`);
      const missing = await prodApi('GET', '/api/nothing-here');
      check(missing.status === 404 && missing.data?.success === false, `unknown API: ${missing.status}`);
      return 'Headers set, other sites refused, app served, 404 JSON';
    }
  );

  await tc(
    'SEC-08',
    M,
    'Sign-up limit per visitor',
    'Limit 3 an hour: 4 sign-ups from one IP behind the proxy, then 1 from another IP',
    "3 created, the 4th 429 TOO_MANY_SIGNUPS, another visitor still 201 (real IPs are used, not the proxy's)",
    async () => {
      const ip = `198.51.100.${10 + Math.floor(Math.random() * 200)}`;
      for (let i = 1; i <= 3; i++) check((await prodUser(`limit${i}`, ip)).status === 201, `sign-up ${i} refused`);
      const fourth = await prodUser('limit4', ip);
      check(fourth.status === 429 && fourth.data.code === 'TOO_MANY_SIGNUPS', `4th: ${fourth.status}`);
      const other = await prodUser('limit5', '192.0.2.77');
      check(other.status === 201, `other visitor: ${other.status}`);
      return '3 then 429; another IP unaffected';
    }
  );

  await tc('SEC-09', M, 'Advisor daily limit', 'Limit 2 questions per 24 hours, no LLM key: three questions', 'Two answered, the third 429 ADVISOR_DAILY_LIMIT saying when to ask again', async () => {
    const u = await prodUser('advlimit', '192.0.2.88');
    check(u.status === 201, `sign-up: ${u.status}`);
    for (let i = 1; i <= 2; i++) {
      const r = await prodApi('POST', '/api/advisor/chat', { ip: '192.0.2.88', token: u.token, body: { message: 'How much did I spend?' } });
      check(r.status === 200 && r.data.success, `question ${i}: ${r.status}`);
    }
    const third = await prodApi('POST', '/api/advisor/chat', { ip: '192.0.2.88', token: u.token, body: { message: 'And now?' } });
    check(third.status === 429 && third.data.code === 'ADVISOR_DAILY_LIMIT' && /ask again in/.test(third.data.message), `third: ${third.status} ${third.data?.message}`);
    return 'Third refused with a wait time';
  });

  M = 'Health Check';
  await tc(
    'HC-11',
    M,
    'Emergency savings over time',
    'Set RM 1,000; add RM 500; take out RM 2,000; take out RM 200; undo; undo an older entry; profile save of RM 3,000',
    '1,000 then 1,500; 422; 1,300 and the index uses it; undo back to 1,500; older undo 422; the profile save is logged as "set"; history in the data export',
    async () => {
      const v = await newUser('savings');
      const sv = (body) => post('/api/profile/savings', body, v.token);
      check((await sv({ kind: 'set', amount: 1000 })).data.data.balance === 1000, 'set');
      const added = await sv({ kind: 'add', amount: '500', note: 'October salary' });
      check(added.status === 201 && added.data.data.balance === 1500 && added.data.data.entries[0].note === 'October salary', JSON.stringify(added.data));
      check((await sv({ kind: 'withdraw', amount: 2000 })).status === 422, 'overdraw accepted');
      const out = await sv({ kind: 'withdraw', amount: 200, note: 'car repair' });
      check(out.data.data.balance === 1300, `withdraw: ${out.data.data.balance}`);
      const health = (await get('/api/profile/health', v.token)).data.data;
      check(!health.health.missing.includes('emergency_savings'), 'index ignores savings');
      const [latest, older] = out.data.data.entries;
      const undone = await del(`/api/profile/savings/${latest.id}`, v.token);
      check(undone.data.data.balance === 1500, `undo: ${undone.data.data?.balance}`);
      check((await del(`/api/profile/savings/${older.id - 1}`, v.token)).status === 422, 'older undo accepted');
      check((await patch('/api/profile/finance', { emergency_savings: 3000 }, v.token)).status === 200, 'profile save');
      const after = (await get('/api/profile/savings', v.token)).data.data;
      check(after.balance === 3000 && after.entries[0].kind === 'set' && after.entries[0].balance_before === 1500, JSON.stringify(after.entries[0]));
      const exp = (await get('/api/auth/me/export', v.token)).data.data;
      check(exp.savings_entries.length === 3, `export has ${exp.savings_entries?.length}`);
      return 'Balance 1,000, 1,500, 1,300, undo 1,500, set 3,000; 3 entries exported';
    }
  );
}

async function main() {
  conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'finsight_ai',
  });

  const up = await waitFor(`${MAIN}/api/health`, 8);
  if (!up) throw new Error('Express is not running on :5000');
  startInstance(NO_ML_PORT, { ML_SERVICE_URL: 'http://127.0.0.1:8999', GEMINI_API_KEY: '', OPENAI_API_KEY: '', ALLOW_AI_SETTINGS: 'false' });
  startInstance(NO_DB_PORT, { DB_PORT: '3999' });
  startInstance(PROD_PORT, {
    NODE_ENV: 'production',
    TRUST_PROXY: '1',
    CORS_ORIGIN: PROD_ORIGIN,
    ADVISOR_DAILY_LIMIT: '2',
    REGISTER_MAX_PER_IP: '3',
    GEMINI_API_KEY: '',
    OPENAI_API_KEY: '',
    ALLOW_AI_SETTINGS: 'false',
  });
  if (!(await waitFor(`${NO_ML}/api/health`)) || !(await waitFor(`${NO_DB}/api/health`)) || !(await waitFor(`${PROD}/api/health`))) {
    throw new Error('Could not start the failure-test Express instances');
  }

  try {
    await authTests();
    await spendTests();
    await advisorTests();
    await loanTests();
    await goalTests();
    await insuranceTests();
    await healthTests();
    await nov5Tests();
    await launchTests();
    await mlServiceTests();
  } finally {
    children.forEach((c) => c.kill());
    await cleanUp().catch((e) => console.error('Clean-up failed:', e.message));
    await conn.end();
  }

  const s = writeReports();
  console.log(`\n${s.pass}/${s.total} passed, ${s.fail} failed, ${s.blocked} blocked`);
}

main().catch((err) => {
  children.forEach((c) => c.kill());
  console.error(err);
  process.exit(1);
});
