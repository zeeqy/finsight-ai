/**
 * FinSight AI - Phase 4 evaluation of the AI advisor's grounding (Chapter 4).
 *
 * Asks the same 16 questions under three prompt set-ups on one test user with known figures:
 *   baseline  - the original prompt (raw context, the LLM does its own arithmetic)
 *   computed  - figures worked out in code + pre-computed affordability checks + history
 *   validated - computed + every RM amount and % in the reply checked, one regeneration
 * and records, per reply: how many figures trace to the user's data (grounded), are one step of
 * arithmetic on it (derived) or match nothing (unsupported); whether the key expected figure
 * appears; and response time.
 *
 * Starts its own Express on :5071 with ADVISOR_EVAL=true (the only way to pick a mode), uses
 * the real Gemini key from server/.env, and deletes its test user at the end.
 * Usage: node evaluation/advisor/run.js   → evaluation/results/advisor_results.{json,md}
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { createRequire } = require('module');

const ROOT = path.join(__dirname, '..', '..');
const SERVER_DIR = path.join(ROOT, 'server');
const serverRequire = createRequire(path.join(SERVER_DIR, 'package.json'));
const mysql = serverRequire('mysql2/promise');
serverRequire('dotenv').config({ path: path.join(SERVER_DIR, '.env') });
const { extractFigures } = require(path.join(SERVER_DIR, 'src', 'services', 'advisorGrounding.js'));

const PORT = 5071;
const BASE = `http://localhost:${PORT}`;
const MODES = ['baseline', 'computed', 'validated'];
const EMAIL = `eval-advisor-${crypto.randomBytes(3).toString('hex')}@finsight.test`;

const api = async (method, url, token, body, form) => {
  const res = await fetch(BASE + url, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: form || (body ? JSON.stringify(body) : undefined),
  });
  return res.json();
};

// Five months of statements in the demo account's format (same generator as server/scripts/seedDemo.js)
const SPENDING = [
  ['RESTORAN AL-AZIZ SHAH ALAM', 14], ['DAILY KOPITIAM KUALA LUMPUR', 12], ['FISH & CO KUALA LUMPUR', 74], ["MCDONALD'S-BS COALFIELDS", 28],
  ['SHELL - SKYN 13 SHAH ALAM', 95], ['PETRON KG KEBUN BUNGA', 80], ['99 SPEEDMART-1535 SELANGOR', 86], ["LOTUS'S SHAH ALAM", 210],
  ['MYDIN SUBANG', 120], ['UNIQLO SUNWAY PYRAMID', 129], ['DIGI TELECOMMUNICATIONS', 68], ['TENAGA NASIONAL BERHAD', 142],
  ['AIR SELANGOR', 38], ['GSC SETIA CITY MALL', 44], ['GUARDIAN PHARMACY I-CITY', 36],
];
const MONTHS = [[6, 1.05], [7, 0.92], [8, 1.18], [9, 0.97], [10, 1.1]];
const NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function statement(month, scale) {
  const d = (day) => `${String(day).padStart(2, '0')} ${NAMES[month - 1]} 2026`;
  const rows = [`${d(1)},09:00:00 AM,SYARIKAT CONTOH SDN BHD,SALARY PAYMENT,DuitNow QR OU,+RM4500.00`];
  SPENDING.forEach(([m, base], i) => rows.push(`${d((i % 27) + 2)},0${(i % 9) + 1}:15:00 PM,${m},,MyDEBIT SA PURCHASE,-RM${(base * scale * (0.85 + ((i * 7 + month * 3) % 10) / 16)).toFixed(2)}`));
  return `Date,Time,Reference 1,Reference 2,Transaction Description,Transaction Amount\n${rows.join('\n')}\n`;
}

/** Each question, with the figure a correct answer should contain (or null when none is expected). */
function scenarios(truth) {
  return [
    { id: 'Q01', q: 'How much money do I have left each month?', expect: truth.surplus },
    { id: 'Q02', q: 'What is my monthly income?', expect: truth.income },
    { id: 'Q03', q: 'How much did I spend in October 2026?', expect: truth.octSpend },
    { id: 'Q04', q: 'Can I afford a RM 1,500 laptop?', expect: truth.savings - 1500 },
    { id: 'Q05', q: 'Can I afford RM 300 a month for a gym membership?', expect: truth.surplus - 300 },
    { id: 'Q06', q: 'Are my life goals on track?', expect: truth.goalsMonthly },
    { id: 'Q07', q: 'How much do I need to save each month for my Kahwin goal?', expect: truth.kahwinMonthly },
    { id: 'Q08', q: 'What is my debt service ratio?', expect: truth.dsr, percent: true },
    { id: 'Q09', q: 'How much will I probably spend next month?', expect: truth.forecast },
    { id: 'Q10', q: 'What are my recurring bills and how much do they cost a month?', expect: truth.recurring },
    { id: 'Q11', q: 'How many months would my emergency savings last?', expect: null },
    { id: 'Q12', q: 'What is my financial health score?', expect: null },
    { id: 'Q13', q: 'If I cut my shopping by half, how much more could I save each month?', expect: null },
    { id: 'Q14', q: 'How much interest would I pay on an RM 80,000 car loan at 3% for 9 years?', expect: null },
    { id: 'Q15', q: 'Should I save for Haji in Tabung Haji or ASB?', expect: null },
    { id: 'Q16', q: 'Give me a budget for next month using the 50/30/20 rule.', expect: null },
  ];
}

const contains = (reply, value, percent) =>
  extractFigures(reply).some((f) => (percent ? f.kind === 'percent' : f.kind === 'money') && Math.abs(f.value - value) <= Math.max(1, Math.abs(value) * 0.01));

async function ask(token, message, mode) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await api('DELETE', '/api/advisor/history', token); // every question starts a fresh conversation
    const t0 = Date.now();
    const r = await api('POST', '/api/advisor/chat', token, { message, mode });
    const ms = Date.now() - t0;
    if (r.success && r.provider !== 'local') return { ...r, ms };
    await new Promise((res) => setTimeout(res, 8000)); // Gemini busy: wait and retry
  }
  return null;
}

(async () => {
  const child = spawn(process.execPath, ['src/index.js'], { cwd: SERVER_DIR, env: { ...process.env, PORT: String(PORT), ADVISOR_EVAL: 'true' }, stdio: 'ignore' });
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'finsight_ai',
  });
  const results = [];
  try {
    for (let i = 0; i < 40; i += 1) {
      try {
        if ((await fetch(`${BASE}/api/health`)).ok) break;
      } catch {
        /* starting */
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    // Test user with the demo account's data, plus savings and one commitment
    const reg = await api('POST', '/api/auth/register', null, { full_name: 'Aina Eval', email: EMAIL, password: crypto.randomBytes(12).toString('hex'), monthly_income: 4500, age: 26, accept_terms: true });
    const t = reg.token;
    for (const [mo, sc] of MONTHS) {
      const form = new FormData();
      form.append('statement', new Blob([statement(mo, sc)], { type: 'text/csv' }), `m${mo}.csv`);
      await api('POST', '/api/transactions/upload', t, null, form);
    }
    await api('PATCH', '/api/profile/finance', t, { emergency_savings: 8000, household_type: 'single' });
    await api('POST', '/api/commitments', t, { kind: 'ptptn', monthly_amount: 150, balance: 9000, annual_rate: 1, paid_from_statement: false });
    for (const g of [
      { goal_type: 'kahwin', title: 'Kahwin', target_amount: 45000, current_saved: 6500, target_date: '2028-06-15', savings_vehicle: 'savings' },
      { goal_type: 'haji', title: 'Haji', target_amount: 23500, current_saved: 3000, target_date: '2031-03-01', savings_vehicle: 'tabung_haji' },
    ]) await api('POST', '/api/goals', t, g);

    // Ground truth from the API (the figures FinSight itself computes)
    const health = (await api('GET', '/api/profile/health', t)).data;
    const insights = (await api('GET', '/api/transactions/insights', t)).data;
    const goals = (await api('GET', '/api/goals', t)).data;
    const summary = await api('GET', '/api/transactions/summary?year=2026&month=10', t);
    const truth = {
      surplus: health.surplus,
      income: health.income,
      octSpend: summary.kpis.total_monthly_spend,
      savings: health.emergency_savings,
      goalsMonthly: goals.summary.total_required_monthly,
      kahwinMonthly: goals.goals.find((g) => g.title === 'Kahwin').required_monthly,
      dsr: health.dsr,
      forecast: insights.forecast?.point,
      recurring: insights.recurring_monthly_total,
    };
    console.log('Truth', truth);

    for (const s of scenarios(truth)) {
      for (const mode of MODES) {
        const r = await ask(t, s.q, mode);
        const row = { id: s.id, question: s.q, mode };
        if (!r) {
          results.push({ ...row, blocked: true });
          console.log(`${s.id} ${mode}: blocked (LLM unavailable)`);
          continue;
        }
        const v = r.validation;
        Object.assign(row, {
          blocked: false,
          ms: r.ms,
          figures: v.checked,
          grounded: v.grounded,
          derived: v.derived,
          unsupported: v.unsupported,
          regenerated: v.regenerated,
          expected: s.expect,
          expected_found: s.expect === null || s.expect === undefined ? null : contains(r.reply, s.expect, s.percent),
          reply: r.reply,
        });
        results.push(row);
        console.log(`${s.id} ${mode}: ${v.checked} figures, ${v.unsupported.length} unsupported${row.expected_found === null ? '' : `, expected ${row.expected_found ? 'found' : 'MISSING'}`}, ${r.ms} ms`);
      }
    }

    const by = Object.fromEntries(
      MODES.map((m) => {
        const rows = results.filter((r) => r.mode === m && !r.blocked);
        const figs = rows.reduce((s, r) => s + r.figures, 0);
        const unsup = rows.reduce((s, r) => s + r.unsupported.length, 0);
        const exp = rows.filter((r) => r.expected_found !== null);
        const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
        return [
          m,
          {
            answered: rows.length,
            blocked: results.filter((r) => r.mode === m && r.blocked).length,
            figures: figs,
            grounded_pct: +((100 * rows.reduce((s, r) => s + r.grounded, 0)) / figs).toFixed(1),
            derived_pct: +((100 * rows.reduce((s, r) => s + r.derived, 0)) / figs).toFixed(1),
            unsupported_pct: +((100 * unsup) / figs).toFixed(1),
            replies_with_unsupported: rows.filter((r) => r.unsupported.length).length,
            expected_figure_correct: `${exp.filter((r) => r.expected_found).length}/${exp.length}`,
            regenerated: rows.filter((r) => r.regenerated).length,
            median_ms: ms[Math.floor(ms.length / 2)],
          },
        ];
      })
    );
    const out = { run_at: new Date().toISOString(), model: process.env.GEMINI_MODELS || 'gemini-3.5-flash (default list)', truth, summary: by, results };
    fs.writeFileSync(path.join(ROOT, 'evaluation', 'results', 'advisor_results.json'), JSON.stringify(out, null, 2));
    console.log(JSON.stringify(by, null, 2));
  } finally {
    const [[u]] = await conn.query('SELECT id FROM users WHERE email = ?', [EMAIL]);
    if (u) {
      await conn.query('DELETE m FROM chat_messages m JOIN chat_sessions s ON m.session_id = s.id WHERE s.user_id = ?', [u.id]);
      for (const table of ['chat_sessions', 'transactions', 'bank_statements', 'budgets', 'life_goals', 'commitments', 'recurring_overrides']) {
        await conn.query(`DELETE FROM ${table} WHERE user_id = ?`, [u.id]);
      }
      await conn.query('DELETE FROM users WHERE id = ?', [u.id]);
    }
    await conn.end();
    child.kill();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
