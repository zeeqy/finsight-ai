// Creates the demo account behind the "Use the demo account" button, with five months of sample
// statements and budgets. Needs the API running on :5000. Usage: node server/scripts/seedDemo.js
const API = process.env.API || 'http://localhost:5000';
const EMAIL = 'haziq@example.com';
// Local default. On the public server pass your own: DEMO_PASSWORD=... node scripts/seedDemo.js
const PASSWORD = process.env.DEMO_PASSWORD || 'oyen-demo-2026';
const OLD_PASSWORD = 'password123'; // before the 8-character, not-common rule (Nov 2026)

const SPENDING = [
  ['RESTORAN AL-AZIZ SHAH ALAM', 'MyDEBIT SA PURCHASE', 14],
  ['DAILY KOPITIAM KUALA LUMPUR', 'MyDEBIT SA PURCHASE', 12],
  ['BIC TEALIVE-GSTAND Sepang', 'MyDEBIT SA PURCHASE', 16],
  ['FISH & CO KUALA LUMPUR', 'MyDEBIT SA PURCHASE', 74],
  ["MCDONALD'S-BS COALFIELDS", 'BIDC RTL POST NON US', 28],
  ['SHELL - SKYN 13 SHAH ALAM', 'MyDEBIT SA SALES.CMP', 95],
  ['PETRON KG KEBUN BUNGA', 'MyDEBIT SA SALES.CMP', 80],
  ['CENTRAL I-CITY - PARKING', 'MyDEBIT SA PURCHASE', 12],
  ['99 SPEEDMART-1535 SELANGOR', 'MyDEBIT SA PURCHASE', 86],
  ["LOTUS'S SHAH ALAM", 'MyDEBIT SA PURCHASE', 210],
  ['MYDIN SUBANG', 'MyDEBIT SA PURCHASE', 120],
  ['TikTok Shop Seller Pulau Pinang', 'BIDC RTL POST NON US', 68],
  ['UNIQLO SUNWAY PYRAMID', 'MyDEBIT SA PURCHASE', 129],
  ['DIGI TELECOMMUNICATIONS', 'IB FPX (DEBIT) - SA', 68],
  ['TENAGA NASIONAL BERHAD', 'IB FPX (DEBIT) - SA', 142],
  ['AIR SELANGOR', 'IB FPX (DEBIT) - SA', 38],
  ['GSC SETIA CITY MALL', 'MyDEBIT SA PURCHASE', 44],
  ['GUARDIAN PHARMACY I-CITY', 'MyDEBIT SA PURCHASE', 36],
];
const MONTHS = [
  [2026, 6, 1.05],
  [2026, 7, 0.92],
  [2026, 8, 1.18],
  [2026, 9, 0.97],
  [2026, 10, 1.1],
];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function statement(year, month, scale) {
  const stamp = (day) => `${String(day).padStart(2, '0')} ${MONTH_NAMES[month - 1]} ${year}`;
  const rows = [`${stamp(1)},09:00:00 AM,SYARIKAT CONTOH SDN BHD,SALARY PAYMENT,DuitNow QR OU,+RM4500.00`];
  SPENDING.forEach(([merchant, channel, base], i) => {
    // Small month-to-month variation, repeatable between runs
    const wobble = 0.85 + ((i * 7 + month * 3) % 10) / 16;
    const amount = (base * scale * wobble).toFixed(2);
    rows.push(`${stamp((i % 27) + 2)},0${(i % 9) + 1}:15:00 PM,${merchant},,${channel},-RM${amount}`);
  });
  // One large purchase in October, for the unusual-spending check
  if (month === 10) rows.push(`${stamp(24)},07:30:00 PM,HARVEY NORMAN IOI CITY,,MyDEBIT SA PURCHASE,-RM1899.00`);
  return `Date,Time,Reference 1,Reference 2,Transaction Description,Transaction Amount\n${rows.join('\n')}\n`;
}

const post = (path, body, token) =>
  fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  }).then((r) => r.json());

(async () => {
  let auth = await post('/api/auth/login', { email: EMAIL, password: PASSWORD });
  if (!auth.token) {
    // An older demo account still has the old password: move it to the new one
    const old = await post('/api/auth/login', { email: EMAIL, password: OLD_PASSWORD });
    if (old.token) {
      const changed = await post('/api/auth/me/password', { current_password: OLD_PASSWORD, new_password: PASSWORD }, old.token);
      if (changed.token) auth = { ...old, token: changed.token };
    }
  }
  if (!auth.token) {
    auth = await post('/api/auth/register', { full_name: 'Haziq Danish', email: EMAIL, password: PASSWORD, monthly_income: 4500, age: 24, accept_terms: true });
  }
  if (!auth.token) throw new Error(`Could not sign in: ${auth.message}`);

  for (const [year, month, scale] of MONTHS) {
    const form = new FormData();
    form.append('statement', new Blob([statement(year, month, scale)], { type: 'text/csv' }), `demo_${year}_${month}.csv`);
    const res = await fetch(`${API}/api/transactions/upload`, { method: 'POST', headers: { Authorization: `Bearer ${auth.token}` }, body: form });
    const data = await res.json();
    console.log(`${MONTH_NAMES[month - 1]} ${year}: ${data.message || data.insertedCount}`);
  }
  for (const [category, limit] of [['Food & Dining', 300], ['Groceries', 450], ['Shopping', 250]]) {
    await post('/api/budgets', { category, budget_limit: limit, month: 10, year: 2026 }, auth.token);
  }
  const existing = await fetch(`${API}/api/goals`, { headers: { Authorization: `Bearer ${auth.token}` } }).then((r) => r.json());
  if (!existing.data?.goals?.length && !existing.goals?.length) {
    const goals = [
      { goal_type: 'kahwin', title: 'Kahwin', target_amount: 45000, current_saved: 6500, target_date: '2028-06-15', savings_vehicle: 'savings' },
      { goal_type: 'haji', title: 'Haji', target_amount: 23500, current_saved: 3000, target_date: '2031-03-01', savings_vehicle: 'tabung_haji' },
      { goal_type: 'car', title: 'First car', target_amount: 12000, current_saved: 2500, target_date: '2027-09-01', savings_vehicle: 'asb' },
    ];
    for (const goal of goals) {
      const res = await post('/api/goals', goal, auth.token);
      console.log(`${goal.title}: ${res.success ? 'saved' : res.message}`);
    }
  }
  console.log('Demo account ready.');
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
