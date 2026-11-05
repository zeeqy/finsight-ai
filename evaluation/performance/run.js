/**
 * FinSight AI - Backend performance evaluation (Chapter 4)
 *
 * Measures the real stack on one machine: Express (:5000), the ML service (:8000), MySQL.
 *   A. Response time per endpoint, one request at a time (mean, p50, p95, p99)
 *   B. ML service response time, called directly, including batch size
 *   C. Statement upload time as the CSV grows
 *   D. Load test: N simulated users looping for a fixed time
 *
 * Targets are set here, BEFORE measuring, from published limits (Chapter 3 sets none):
 *   Nielsen (1993) response-time limits: 1 s keeps the user's flow of thought, 10 s keeps attention.
 *   So: reads, calculations and ML predictions p95 <= 1 s; AI chat and uploads <= 10 s.
 *   Load: no failed requests and p95 <= 1 s at 25 simultaneous users.
 *
 * Test users (perf-*@finsight.test) are deleted at the end.
 *
 * Run:  node evaluation/performance/run.js            (full, about 6 minutes)
 *       node evaluation/performance/run.js --no-llm   (skip the Gemini timing)
 * Output: evaluation/results/performance_results.{json,md}
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { createRequire } = require('module');

const ROOT = path.join(__dirname, '..', '..');
const SERVER_DIR = path.join(ROOT, 'server');
const serverRequire = createRequire(path.join(SERVER_DIR, 'package.json'));
const mysql = serverRequire('mysql2/promise');
serverRequire('dotenv').config({ path: path.join(SERVER_DIR, '.env') });

const API = 'http://localhost:5000';
const ML = 'http://localhost:8000';
const OFFLINE_PORT = 5053; // same app with no LLM key, to time the offline advisor
const OFFLINE = `http://localhost:${OFFLINE_PORT}`;
const SKIP_LLM = process.argv.includes('--no-llm');

const TARGET_MS = { interactive: 1000, slow: 10000 };
const LOAD_TARGET = { users: 25, p95: 1000 };
const LOAD_SECONDS = 15;

const RUN_ID = crypto.randomBytes(3).toString('hex');
const emails = [];
let conn;
let child;

/* ── Helpers ─────────────────────────────────────────────────────── */

function percentile(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

function stats(samples) {
  const s = [...samples].sort((a, b) => a - b);
  const round = (v) => Math.round(v * 10) / 10;
  return {
    n: s.length,
    mean: round(s.reduce((a, b) => a + b, 0) / s.length),
    p50: round(percentile(s, 50)),
    p95: round(percentile(s, 95)),
    p99: round(percentile(s, 99)),
    max: round(s[s.length - 1]),
  };
}

async function call(base, method, url, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const t0 = performance.now();
  const res = await fetch(`${base}${url}`, { method, headers, body: form || (body !== undefined ? JSON.stringify(body) : undefined) });
  const text = await res.text();
  const ms = performance.now() - t0;
  return { ms, status: res.status, text };
}

async function newUser(label, income = 5000) {
  const email = `perf-${RUN_ID}-${label}@finsight.test`;
  emails.push(email);
  const password = crypto.randomBytes(12).toString('hex');
  const r = await call(API, 'POST', '/api/auth/register', { body: { full_name: `Perf ${label}`, email, password, monthly_income: income, age: 28, accept_terms: true } });
  if (r.status !== 201) throw new Error(`register failed: ${r.status}`);
  return { email, password, token: JSON.parse(r.text).token };
}

function uploadForm(name, csv) {
  const form = new FormData();
  form.append('statement', new Blob([csv], { type: 'text/csv' }), name);
  return form;
}

const MERCHANTS = ['MCDONALDS MID VALLEY', 'PETRONAS SHAH ALAM', 'LOTUSS KLANG', 'SHOPEE MY ORDER', 'TENAGA NASIONAL', 'GRAB KL SENTRAL', 'KLINIK MEDIVIRON', 'NETFLIX', 'UNIFI HOME', 'ZUS COFFEE KLCC', 'RESTORAN AL BAIK', 'WATSONS PAVILION', 'MYDIN BANGI', 'SHELL TTDI', 'GSC CINEMA'];

function statementCsv(rows, months = 6) {
  const lines = ['Date,Description,Amount'];
  for (let i = 0; i < rows; i++) {
    const month = String(5 + (i % months)).padStart(2, '0');
    const day = String(1 + (i % 28)).padStart(2, '0');
    const amount = (5 + ((i * 37) % 300) + (i % 100) / 100).toFixed(2);
    lines.push(`2026-${month}-${day},${MERCHANTS[i % MERCHANTS.length]} ${i},${amount}`);
  }
  return lines.join('\n') + '\n';
}

const dateAhead = (months) => {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
};

const LOAN = { loan_type: 'personal', loan_amount: 15000, interest_rate: 6.5, tenure_years: 3, monthly_income: 5000, employment_type: 'permanent', years_employed: 3, dependants: 0, age: 28 };
const INSURANCE = { age: 30, height_cm: 170, weight_kg: 68, smoker: false, children: 1 };

async function timeEndpoint(label, n, fn) {
  const samples = [];
  let failures = 0;
  for (let i = 0; i < n; i++) {
    const r = await fn();
    samples.push(r.ms);
    if (r.status >= 400) failures++;
  }
  const s = { label, ...stats(samples), failures };
  console.log(`${label.padEnd(44)} p50 ${String(s.p50).padStart(8)}  p95 ${String(s.p95).padStart(8)}  fail ${failures}`);
  return s;
}

/* ── Sections ────────────────────────────────────────────────────── */

async function latencySection(u) {
  const t = u.token;
  const tok = { token: t };
  const q = 'year=2026&month=10';
  const out = [];
  const add = async (group, target, label, n, fn) => out.push({ group, target_ms: target, ...(await timeEndpoint(label, n, fn)) });
  const I = TARGET_MS.interactive;

  await add('General', I, 'GET /api/health', 100, () => call(API, 'GET', '/api/health'));
  await add('General', I, 'POST /api/auth/login (bcrypt)', 30, () => call(API, 'POST', '/api/auth/login', { body: { email: u.email, password: u.password } }));
  await add('Spend Analyser', I, 'GET summary (one month)', 100, () => call(API, 'GET', `/api/transactions/summary?${q}`, tok));
  await add('Spend Analyser', I, 'GET list (one month)', 100, () => call(API, 'GET', `/api/transactions/list?${q}`, tok));
  await add('Spend Analyser', I, 'GET list (all 500 rows)', 100, () => call(API, 'GET', '/api/transactions/list?year=ALL', tok));
  await add('Spend Analyser', I, 'GET budgets', 100, () => call(API, 'GET', `/api/budgets?${q}`, tok));
  await add('AI Advisor', I, 'GET advisor context', 100, () => call(API, 'GET', '/api/advisor/context', tok));
  await add('Loan', I, 'POST loan calculate (maths only)', 100, () => call(API, 'POST', '/api/loan/calculate', { ...tok, body: LOAN }));
  await add('Loan', I, 'POST loan predict (XGBoost + save)', 100, () => call(API, 'POST', '/api/loan/predict', { ...tok, body: LOAN }));
  await add('Goals', I, 'GET goals list', 100, () => call(API, 'GET', '/api/goals', tok));
  await add('Goals', I, 'POST goals simulate (gold cached)', 100, () => call(API, 'POST', '/api/goals/simulate', { ...tok, body: { target_amount: 50000, target_date: dateAhead(60) } }));
  await add('Insurance', I, 'POST insurance predict (+ SHAP + save)', 100, () => call(API, 'POST', '/api/insurance/predict', { ...tok, body: INSURANCE }));
  // Phases 2 to 5: the integration layer
  await add('Spend Analyser', I, 'GET insights (recurring + forecast, 500 rows)', 100, () => call(API, 'GET', '/api/transactions/insights', tok));
  await add('Health Check', I, 'GET health index', 100, () => call(API, 'GET', '/api/profile/health', tok));
  await add('Health Check', I, 'POST simulate a car loan', 100, () => call(API, 'POST', '/api/profile/simulate', { ...tok, body: { type: 'loan', ...LOAN } }));
  await add('Loan', I, 'POST debt payoff plan', 100, () => call(API, 'POST', '/api/commitments/payoff-plan', { ...tok, body: { extra_monthly: 200 } }));
  await add('Insurance', I, 'POST protection check', 100, () => call(API, 'POST', '/api/insurance/protection', { ...tok, body: { dependants: 2 } }));

  const S = TARGET_MS.slow;
  await add('AI Advisor', S, 'POST chat (offline fallback)', 50, () => call(OFFLINE, 'POST', '/api/advisor/chat', { ...tok, body: { message: 'how is my spending this month?' } }));
  if (!SKIP_LLM) {
    await add('AI Advisor', S, 'POST chat (Gemini, live)', 10, () => call(API, 'POST', '/api/advisor/chat', { ...tok, body: { message: 'Give me one tip to reduce my spending this month.' } }));
  }
  return out;
}

async function mlSection() {
  const out = [];
  const I = TARGET_MS.interactive;
  const add = async (label, n, fn) => out.push({ group: 'ML service', target_ms: I, ...(await timeEndpoint(label, n, fn)) });
  const desc = (k) => ({ descriptions: Array.from({ length: k }, (_, i) => `${MERCHANTS[i % MERCHANTS.length]} ${i}`) });
  const loan = { ...LOAN, monthly_instalment: 498.61, existing_commitments: 500 };

  await add('Categoriser, 1 description', 100, () => call(ML, 'POST', '/predict/category', { body: desc(1) }));
  await add('Categoriser, 100 descriptions', 50, () => call(ML, 'POST', '/predict/category', { body: desc(100) }));
  await add('Categoriser, 1,000 descriptions', 20, () => call(ML, 'POST', '/predict/category', { body: desc(1000) }));
  await add('Categoriser, 5,000 descriptions', 10, () => call(ML, 'POST', '/predict/category', { body: desc(5000) }));
  await add('XGBoost loan default', 100, () => call(ML, 'POST', '/predict/loan', { body: loan }));
  await add('Logistic Regression insurance + SHAP', 100, () => call(ML, 'POST', '/predict/insurance', { body: { age: 30, bmi: 23.5, smoker: false, children: 1 } }));
  await add('ARIMA gold forecast, 60 months', 50, () => call(ML, 'GET', '/forecast/gold?months=60'));
  return out;
}

async function uploadSection() {
  const out = [];
  for (const [rows, repeats] of [[50, 5], [500, 5], [2000, 3], [5000, 3]]) {
    const samples = [];
    let engine = null;
    for (let i = 0; i < repeats; i++) {
      const u = await newUser(`up${rows}-${i}`);
      const r = await call(API, 'POST', '/api/transactions/upload', { token: u.token, form: uploadForm('s.csv', statementCsv(rows)) });
      if (r.status !== 201) throw new Error(`upload ${rows}: ${r.status} ${r.text.slice(0, 120)}`);
      engine = JSON.parse(r.text).categoriser.engine;
      samples.push(r.ms);
    }
    const s = stats(samples);
    out.push({ rows, repeats, engine, ...s, ms_per_row: Math.round((s.p50 / rows) * 100) / 100, target_ms: TARGET_MS.slow });
    console.log(`Upload ${String(rows).padStart(5)} rows: p50 ${s.p50} ms (${engine})`);
  }
  return out;
}

async function loadLevel(label, users, requestsFor) {
  const latencies = [];
  let failures = 0;
  let requests = 0;
  const deadline = performance.now() + LOAD_SECONDS * 1000;

  const worker = async (id) => {
    const reqs = requestsFor(id);
    let i = id; // users start at different points in the loop
    while (performance.now() < deadline) {
      try {
        const r = await reqs[i++ % reqs.length]();
        latencies.push(r.ms);
        if (r.status >= 400) failures++;
      } catch {
        failures++;
      }
      requests++;
    }
  };
  await Promise.all(Array.from({ length: users }, (_, id) => worker(id)));

  const s = stats(latencies);
  const row = { mix: label, users, seconds: LOAD_SECONDS, requests, throughput_rps: Math.round((requests / LOAD_SECONDS) * 10) / 10, failures, error_pct: Math.round((failures / requests) * 10000) / 100, ...s };
  console.log(`${label.padEnd(10)} ${String(users).padStart(3)} users: ${String(row.throughput_rps).padStart(7)} req/s  p50 ${s.p50}  p95 ${s.p95}  p99 ${s.p99}  fail ${failures}`);
  return row;
}

async function loadSection(u) {
  const out = [];
  const tok = { token: u.token };
  const q = 'year=2026&month=10';
  // What the app really sends: opening the dashboard, then looking at goals and the advisor
  const reads = () => [
    () => call(API, 'GET', `/api/transactions/summary?${q}`, tok),
    () => call(API, 'GET', `/api/transactions/list?${q}`, tok),
    () => call(API, 'GET', `/api/budgets?${q}`, tok),
    () => call(API, 'GET', '/api/goals', tok),
    () => call(API, 'GET', '/api/advisor/context', tok),
    // Added Nov 4: the dashboard also loads insights, and the Health Check the health index
    () => call(API, 'GET', '/api/transactions/insights', tok),
    () => call(API, 'GET', '/api/profile/health', tok),
  ];
  const predicts = () => [
    () => call(API, 'POST', '/api/loan/predict', { ...tok, body: LOAN }),
    () => call(API, 'POST', '/api/insurance/predict', { ...tok, body: INSURANCE }),
  ];
  for (const users of [1, 10, 25, 50, 100]) out.push(await loadLevel('Reads', users, reads));
  for (const users of [1, 10, 25, 50]) out.push(await loadLevel('ML', users, predicts));
  return out;
}

/* ── Reporting ───────────────────────────────────────────────────── */

function report(data) {
  const outDir = path.join(ROOT, 'evaluation', 'results');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'performance_results.json'), JSON.stringify(data, null, 2));

  const ok = (v, t) => (v <= t ? 'Met' : 'NOT met');
  const L = [
    '# FinSight AI performance results (backend)',
    '',
    `Run ${data.run_at}. ${data.environment.cpu}, ${data.environment.threads} threads, ${data.environment.ram_gb} GB RAM, ${data.environment.os}, Node ${data.environment.node}.`,
    'Client, Express, ML service and MySQL all ran on this one laptop, over localhost, so network delay is not included and the test client shares the CPU with the servers.',
    `Express ran under nodemon in development mode. Seed data: one user with 500 transactions over 6 months, 3 goals, 3 budgets.`,
    '',
    'Times are milliseconds. Targets were fixed before measuring: p95 ≤ 1,000 ms for reads, calculations and ML; ≤ 10,000 ms for AI chat and uploads (Nielsen 1993).',
    '',
    '## A. Response time, one request at a time',
    '',
    '| Area | Endpoint | n | Mean | p50 | p95 | p99 | Target | Result |',
    '|---|---|---|---|---|---|---|---|---|',
    ...data.latency.map((r) => `| ${r.group} | ${r.label} | ${r.n} | ${r.mean} | ${r.p50} | ${r.p95} | ${r.p99} | ${r.target_ms} | ${r.failures ? `FAILED ${r.failures}` : ok(r.p95, r.target_ms)} |`),
    '',
    '## B. ML service, called directly',
    '',
    '| Model | n | Mean | p50 | p95 | p99 | Result |',
    '|---|---|---|---|---|---|---|',
    ...data.ml.map((r) => `| ${r.label} | ${r.n} | ${r.mean} | ${r.p50} | ${r.p95} | ${r.p99} | ${r.failures ? `FAILED ${r.failures}` : ok(r.p95, r.target_ms)} |`),
    '',
    '## C. Statement upload time',
    '',
    '| Rows | Repeats | Engine | p50 (ms) | Max (ms) | ms per row | Target | Result |',
    '|---|---|---|---|---|---|---|---|',
    ...data.upload.map((r) => `| ${r.rows} | ${r.repeats} | ${r.engine} | ${r.p50} | ${r.max} | ${r.ms_per_row} | ${r.target_ms} | ${ok(r.max, r.target_ms)} |`),
    '',
    `## D. Load test, ${LOAD_SECONDS} seconds per level`,
    '',
    '"Reads" loops the requests behind the dashboard, goals and advisor pages. "ML" loops loan and insurance predictions, each writing a row to MySQL. Each simulated user sends its next request as soon as the last one returns, with no thinking time, so 25 here means far more traffic than 25 real people.',
    '',
    '| Mix | Users | Requests | Req/s | Failed | p50 | p95 | p99 | Max |',
    '|---|---|---|---|---|---|---|---|---|',
    ...data.load.map((r) => `| ${r.mix} | ${r.users} | ${r.requests} | ${r.throughput_rps} | ${r.failures} | ${r.p50} | ${r.p95} | ${r.p99} | ${r.max} |`),
    '',
  ];
  fs.writeFileSync(path.join(outDir, 'performance_results.md'), L.join('\n'));
}

async function cleanUp() {
  const [users] = await conn.query('SELECT id FROM users WHERE email LIKE ?', [`perf-${RUN_ID}-%`]);
  const ids = users.map((u) => u.id);
  if (ids.length) {
    await conn.query('DELETE m FROM chat_messages m JOIN chat_sessions s ON m.session_id = s.id WHERE s.user_id IN (?)', [ids]);
    for (const table of ['chat_sessions', 'transactions', 'bank_statements', 'budgets', 'loan_predictions', 'insurance_predictions', 'life_goals']) {
      await conn.query(`DELETE FROM ${table} WHERE user_id IN (?)`, [ids]);
    }
    await conn.query('DELETE FROM users WHERE id IN (?)', [ids]);
  }
  console.log(`Cleaned up ${ids.length} test users.`);
}

async function main() {
  conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'finsight_ai',
  });

  child = spawn(process.execPath, ['src/index.js'], {
    cwd: SERVER_DIR,
    env: { ...process.env, PORT: String(OFFLINE_PORT), GEMINI_API_KEY: '', OPENAI_API_KEY: '' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(`${OFFLINE}/api/health`)).ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  try {
    const u = await newUser('main');
    const seeded = await call(API, 'POST', '/api/transactions/upload', { token: u.token, form: uploadForm('seed.csv', statementCsv(500)) });
    if (seeded.status !== 201) throw new Error(`seed failed: ${seeded.text}`);
    for (const c of ['Transport', 'Groceries', 'Shopping']) {
      await call(API, 'POST', '/api/budgets', { token: u.token, body: { category: c, budget_limit: 500, month: 10, year: 2026 } });
    }
    for (const [goal_type, target_amount, savings_vehicle] of [['haji', 23500, 'tabung_haji'], ['kahwin', 30000, 'asb'], ['car', 20000, 'gold']]) {
      await call(API, 'POST', '/api/goals', { token: u.token, body: { goal_type, title: goal_type, target_amount, target_date: dateAhead(48), savings_vehicle } });
    }
    await call(API, 'POST', '/api/goals/simulate', { token: u.token, body: { target_amount: 50000, target_date: dateAhead(60) } }); // warm the gold cache

    const data = {
      run_at: new Date().toISOString(),
      environment: {
        cpu: os.cpus()[0].model.trim(),
        threads: os.cpus().length,
        ram_gb: Math.round(os.totalmem() / 2 ** 30),
        os: `${os.type()} ${os.release()}`,
        node: process.version,
      },
    };
    console.log('\n-- A. Response time --');
    data.latency = await latencySection(u);
    console.log('\n-- B. ML service --');
    data.ml = await mlSection();
    console.log('\n-- C. Upload --');
    data.upload = await uploadSection();
    console.log('\n-- D. Load --');
    data.load = await loadSection(u);
    report(data);
    console.log('\nWritten to evaluation/results/performance_results.md');
  } finally {
    child.kill();
    await cleanUp().catch((e) => console.error('Clean-up failed:', e.message));
    await conn.end();
  }
}

main().catch((err) => {
  if (child) child.kill();
  console.error(err);
  process.exit(1);
});
