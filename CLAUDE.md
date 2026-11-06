# FinSight AI — Project Context for Claude Code

> **Last updated:** November 5, 2026 (public launch prep: Docker + Caddy, production hardening, Terms + 18+ sign-up, savings history; UI3.6: line art per module, glass cards; UI3.5: Intelligent Oyen mascot, Home page, dark theme; quote comparison, data rights, cited rates, effective-rate loans)
> Rename this file to `CLAUDE.md` in the project root (`Finsight AI Builds/`). Claude Code reads it automatically every session.

> **Read first — two decisions that override older docs/report drafts:**
> 1. **Backend is Node.js + Express (already built), NOT FastAPI.** All ML runs in a separate **Python FastAPI ML service** that Express calls over HTTP (hybrid architecture). Do not rewrite the Express backend.
> 2. **Module numbering is final (Oct 27): Module 3 = Loan Default Predictor, Module 4 = Life Goals Planner.** An earlier request to swap them was reverted. Ignore any doc that numbers them the other way.
> 3. **Module 4 Stock Sentiment (FinBERT/NewsAPI) is removed** (agreed with supervisor, Oct 2026). Replaced by **Module 4 — Life Goals Planner** (Kahwin / Children / Haji / House / Car). Ignore any reference to FinBERT, NewsAPI, Bursa stocks or `stock_sentiments`.

---

## Who I Am

- **Name:** Zeeq (Muhammad Haziq Danish Bin Haidil Amir)
- **University:** Universiti Teknologi MARA (UiTM), Malaysia
- **Programme:** Bachelor of Computer Science (Hons.) — Net-Centric Computing (CDCS251)
- **Supervisor:** Assoc. Prof. Ts Dr Nor Shahniza Binti Kamal Bashah
- **Submission:** January 2027
- **Career aim:** Internship at Etiqa / Maybank — project deliberately targets banking + insurance use cases
- **Dev environment:** Windows, XAMPP MySQL, VS Code / Antigravity / Claude Code

---

## Project Overview

**Official title (updated Oct 27, supervisor request):** FINSIGHT AI – AN AI-POWERED PERSONALISED FINANCIAL MANAGEMENT WEB APPLICATION
(British spelling "Personalised"; use this exact title in the report, slides, Lean Canvas and app header.)

**FinSight AI** is an AI-powered personalised financial management web application for Malaysian users aged 18–40. Five intelligent financial modules in one dashboard.

### The Problem It Solves
- Only 36% of Malaysians understand basic financial concepts (below 42% global average)
- 53% cannot survive 3 months without income (RinggitPlus 2023)
- 20%+ of bankruptcies (2018–2022) involved Malaysians under 34
- Major life goals (marriage, children, Haji, house, car) are the biggest expenses Malaysians face, yet most save for them informally with no plan
- No existing app combines spend tracking + loan risk + insurance risk + culturally relevant life-goal planning for Malaysia

### SDG Alignment
- **SDG 1** No Poverty · **SDG 8** Decent Work & Economic Growth · **SDG 10** Reduced Inequalities (B40/M40/T20-aware planning)

---

## The Five Modules

| # | Module | What it does | AI/ML | Status |
|---|--------|-------------|-------|--------|
| 1 | **Spend Analyser** | Upload bank PDF e-statement / CSV / XLSX → categorise → dashboard, budgets, anomaly alerts | TF-IDF + Logistic Regression merged with keyword rules (Random Forest compared) + Z-score anomalies | ✅ Built; LogReg categoriser live Oct 29 (hybrid 72% vs rules 45% on unseen merchants) |
| 2 | **AI Financial Advisor** | Chat; LLM reads user's real spending (and later goals) as context | LLM prompting (Gemini / OpenAI), no trained model | ✅ Built |
| 3 | **Loan Default Predictor** | Personal/car/house loan self-check: price + down payment → monthly instalment, total payment, total interest, repayment schedule, DSR, default probability | XGBoost + loan maths (flat vs reducing balance) | ✅ Built; XGBoost trained on Lending Club (test ROC-AUC 0.697), rule-based fallback if the ML service is down |
| 4 | **Life Goals Planner** | Kahwin/Children/Haji/House/Car savings plans, vehicle comparison, feasibility, DSR check for House/Car | Gold price forecast (ARIMA) + feasibility scoring | ✅ Built; gold ARIMA forecast live (12-month backtest MAPE 11.6% vs 18.4% naive). Savings/TH/ASB rates still placeholders |
| + | **Health Check** (Nov 4) | Health index from all modules, "Can I afford this?" simulator, emergency savings and household | Deterministic (FinHealth-style pillars, decision simulator) | ✅ Built; the integration layer, 6th nav item |
| 5 | **Insurance Risk Predictor** | Age, height/weight (BMI), smoker, children → risk score, SHAP chart, what-if scenarios, tips | Logistic Regression + exact linear SHAP | ✅ Built Oct 28 (test ROC-AUC 0.953, accuracy 89.9%) |

---

## Tech Stack (actual)

```
Frontend:    React 19 + Vite 8 + Tailwind CSS v4 + Recharts 3 + lucide-react + motion (LazyMotion) + three 0.187 (mascot, lazy chunk)
             Self-hosted fonts: Bricolage Grotesque (headings), Hanken Grotesk (body)
             JWT held in React state (AuthContext), NOT localStorage
Backend API: Node.js + Express 4 (port 5000)
             jsonwebtoken, bcryptjs, multer (CSV upload), csv-parser, mysql2, dotenv
ML service:  Python 3.14 + FastAPI (port 8000), venv at ml-service/.venv (all pinned deps install on 3.14)
             scikit-learn, xgboost (built-in TreeSHAP via pred_contribs), joblib, pandas, matplotlib, statsmodels 0.15 (ARIMA)
Database:    MySQL (XAMPP), with a local JSON fallback store (server/data_store.json)
LLM:         Google Gemini API (gemini-3.5-flash → 3.5-flash-lite → 3.8-flash; override with GEMINI_MODELS) or OpenAI gpt-4o-mini; offline keyword fallback
```

---

## System Architecture (3-tier + ML service)

```
┌──────────────────────────────────────────┐
│  PRESENTATION TIER                        │
│  React + Vite (localhost:5173)            │
│  Vite proxies /api → localhost:5000       │
└──────────────────┬───────────────────────┘
                   │ REST/JSON + Bearer JWT
┌──────────────────▼───────────────────────┐
│  APPLICATION TIER — Express API (:5000)   │
│  auth, transactions, budgets, advisor,    │
│  loan*, goals*, insurance*                │
│  JWT middleware, CSV parsing, DSR/savings │
│  maths, LLM calls                         │
└───────┬──────────────────────┬───────────┘
        │ mysql2               │ HTTP/JSON (internal)
┌───────▼────────┐   ┌─────────▼────────────────┐
│ DATA TIER      │   │ ML SERVICE — FastAPI     │
│ MySQL (XAMPP)  │   │ (:8000), stateless        │
│ + JSON fallback│   │ /predict/category (LogReg)│
└────────────────┘   │ /predict/loan   (XGBoost) │
                     │ /predict/insurance(LR+SHAP)│
                     │ /forecast/gold (ARIMA)    │
                     └──────────────────────────┘
* = to build
```

**Rules for the hybrid:**
- The browser only ever talks to Express. The ML service is internal: no auth, no DB access, just takes features and returns predictions.
- Express owns validation, auth, DB writes and saving results (e.g. `loan_predictions`).
- If the ML service is down, Express returns a clear error (or a rule-based fallback for categorisation). Never crash.
- Config: add `ML_SERVICE_URL=http://localhost:8000` to `server/.env`.
- **Viva justification:** Express handles I/O-heavy web concerns well, and Python is the standard ML ecosystem. Separating them is a common microservice pattern, and each can be scaled or replaced on its own.

---

## Current Folder Structure (actual + planned)

```
Finsight AI Builds/
├── CLAUDE.md                      ← this file
├── package.json                   ← root scripts: npm run server / npm run client
├── README.md
├── .claude/launch.json            ← dev servers for the app's Browser pane (client, server, ml-service)
├── ui-versions/                   ← saved looks UI1, UI2, UI3; `node ui-versions/restore.js UI2` switches the client
├── evaluation/                    ← Chapter 4 evidence
│   ├── functional/run.js          ← functional suite (needs MySQL, Express, ML service)
│   ├── performance/run.js         ← backend benchmark (latency, upload, load test)
│   └── results/                   ← functional_*, defect_log.md, performance_summary.md, performance_results.*, lighthouse_summary.json
├── client/
│   ├── DESIGN.md                  ← design system rules: read before any UI work
│   ├── vite.config.js             ← Tailwind v4 plugin + /api proxy
│   └── src/
│       ├── App.jsx                ← tab switching via activeTab state (no router); module pages lazy-loaded
│       ├── index.css              ← all colour tokens as CSS variables + component classes
│       ├── lib/motion.js          ← shared easing, spring, variants, bringIntoView
│       ├── lib/modules.js         ← the five modules: names, plain descriptions, icons, colours (sidebar, page headers, sign-in)
│       ├── context/AuthContext.jsx← in-memory JWT + authenticated fetch helper; NavContext.jsx ← useGoTo() opens another module
│       ├── components/Sidebar.jsx (left sidebar, tablet icon rail, phone bars, account menu), ServiceStatus.jsx (footer + outage banner)
│       ├── components/ui/         ← design system: Card, PageHeader, RollingNumber, Reveal, Stamp, Modal, Controls, chartTheme, Logo, Guilloche (sign-in rosette, Spend Analyser band)
│       ├── components/dashboard/  ← Module 1 UI: GettingStarted, PeriodBar, KpiCards, CategoryBreakdown (SVG donut), SpendingTrend,
│       │                         BudgetTracker (+ 50/30/20 check), TransactionLedger, DashboardModals, dashboardUtils.js
│       └── pages/
│           ├── AuthLayout.jsx, LoginPage.jsx, RegisterPage.jsx
│           ├── DashboardPage.jsx  ← Module 1 (data loading + actions only, ~300 lines)
│           ├── AdvisorPage.jsx    ← Module 2
│           ├── LoanPage.jsx       ← Module 3 (to build)
│           ├── GoalsPlannerPage.jsx ← Module 4 (to build)
│           ├── InsurancePage.jsx  ← Module 5 (+ ProtectionCard)
│           └── HealthPage.jsx     ← Health Check: index + decision simulator (Nov 4)
├── server/
│   ├── .env / .env.example        ← PORT, JWT_SECRET, DB_*, GEMINI_API_KEY, OPENAI_API_KEY
│   ├── schema.sql                 ← MySQL DDL (6 tables now)
│   ├── data_store.json            ← JSON fallback DB (may hold real data — never commit)
│   ├── scripts/seedDemo.js        ← creates the demo account (5 months of statements, budgets, goals); needs the API running
│   ├── sample_statements/         ← maybank_sample.csv, cimb_sample.csv
│   └── src/
│       ├── index.js               ← Express entry, CORS, routes, /api/health
│       ├── db.js                  ← MySQL pool + JSON fallback query engine
│       ├── middleware/auth.js     ← Bearer JWT verification
│       ├── routes/auth.js, transactions.js, budgets.js, advisor.js
│       ├── routes/loan.js, goals.js, insurance.js
│       ├── services/mlClient.js   ← to build: fetch wrapper for ML service
│       ├── services/savingsCalc.js← to build: FV / PMT / feasibility
│       ├── services/loanCalc.js   ← to build: flat + reducing instalment, totals, schedule, DSR (shared M3/M4)
│       └── utils/categorizer.js   ← rule-based Malaysian categoriser + detectAnomaly
└── ml-service/                    ← to build (Python)
    ├── main.py                    ← FastAPI app
    ├── requirements.txt
    ├── models/                    ← .pkl files (joblib)
    └── notebooks/                 ← training notebooks per model
```

---

## Database Schema

### Existing (`server/schema.sql`)
```sql
users          (id, full_name, email UNIQUE, password_hash, monthly_income, age, created_at)
bank_statements(id, user_id FK, filename, uploaded_at)
transactions   (id, statement_id FK NULL, user_id FK, txn_date, description, amount,
                category DEFAULT 'Others', is_anomaly, created_at)
budgets        (id, user_id FK, category, budget_limit, month, year, updated_at,
                UNIQUE(user_id, category, month, year))
chat_sessions  (id, user_id FK, started_at)
chat_messages  (id, session_id FK, role ENUM('user','assistant'), content, sent_at)
```
Amounts are stored **positive** for both spending and inflows; inflows are identified by `category = 'Income'` (set from `+RM` / DuitNow inward / salary keywords).

### To add
```sql
ALTER TABLE users ADD income_group ENUM('B40','M40','T20') NULL;

loan_predictions (
  id, user_id FK,
  loan_type ENUM('personal','car','house'), interest_method ENUM('flat','reducing'),
  item_price DECIMAL(12,2), down_payment DECIMAL(12,2), loan_amount DECIMAL(12,2),
  interest_rate FLOAT, tenure_years INT,
  monthly_income DECIMAL(10,2), existing_commitments DECIMAL(10,2),
  employment_type VARCHAR(30), years_employed FLOAT, dependants INT, age INT,
  monthly_instalment DECIMAL(10,2), total_payment DECIMAL(12,2), total_interest DECIMAL(12,2),
  dsr FLOAT, dsr_band VARCHAR(20),
  default_probability FLOAT, risk_level VARCHAR(20), overall_verdict VARCHAR(20),
  predicted_at
)

insurance_predictions (   -- built Oct 28; region dropped (US-only in the dataset), height/weight added
  id, user_id FK, age, height_cm FLOAT, weight_kg FLOAT, bmi FLOAT, smoker BOOL, children INT,
  risk_score FLOAT, risk_tier VARCHAR(20), shap_values JSON {base_value, contributions}, predicted_at
)

life_goals (
  id, user_id FK,
  goal_type ENUM('kahwin','children','haji','house','car','custom'),
  title, target_amount DECIMAL(12,2),     -- house/car = down payment + upfront costs
  current_saved DECIMAL(12,2) DEFAULT 0, target_date DATE,
  savings_vehicle ENUM('piggybank','savings','tabung_haji','asb','gold'),
  expected_rate FLOAT NULL,               -- annual %, NULL for gold (uses forecast)
  required_monthly DECIMAL(10,2), feasibility VARCHAR(20),
  asset_price DECIMAL(12,2) NULL, loan_rate FLOAT NULL, loan_tenure_months INT NULL,
  est_monthly_instalment DECIMAL(10,2) NULL, projected_dsr FLOAT NULL,
  status ENUM('active','completed','paused') DEFAULT 'active', created_at
)

goal_cost_items   (id, goal_id FK CASCADE, item_name, estimated_cost)
goal_contributions(id, goal_id FK CASCADE, amount, contributed_at DATE)
cost_templates    (id, goal_type, income_group ENUM('B40','M40','T20','ALL'),
                   item_name, default_cost, source VARCHAR(255))   -- seed data, cite source
commitments       (id, user_id FK, kind ENUM('car_loan','house_loan','personal_loan','ptptn','credit_card','insurance','other'),
                   label, monthly_amount, balance NULL, annual_rate NULL, end_date NULL,
                   paid_from_statement BOOL DEFAULT TRUE, created_at)   -- built Nov 3; loan/PTPTN/card kinds count toward DSR
recurring_overrides (id, user_id, merchant_key, status ENUM('confirmed','dismissed'), updated_at,
                   UNIQUE(user_id, merchant_key))   -- built Nov 3 (Phase 2)
```
**Every new table must also be supported in the JSON fallback engine in `db.js`**, or we drop the fallback once MySQL is reliable (preferred for Modules 3–5).

---

## API Endpoints

### Built (Express)
| Method | Endpoint | Notes |
|--------|----------|-------|
| POST | `/api/auth/register` | bcrypt hash, returns JWT; server checks email format and password ≥ 6 chars |
| POST | `/api/auth/login` | returns JWT (expires **24h**, `JWT_EXPIRES_IN`; server refuses to start without a ≥32-char `JWT_SECRET`) |
| GET | `/api/auth/me` | current user |
| GET | `/api/health` | shows `mysql` or `local_resilient_store` |
| POST | `/api/transactions/upload` | multer field `statement`; parses Bank Islam CASATIA / Maybank2u / CIMB CSV, XLSX and **PDF e-statements** (fields `password`, `preview=true`; Nov 4); 201, or 200 with `insertedCount: 0` if every row is already imported; duplicates skipped (`duplicatesSkipped`): same day + description + amount, then same day + amount + direction for the same month uploaded as another file type (`matchedOtherFile`, `services/statementDedupe.js`, each stored row matches once); returns `focusMonth` (the month most rows fall in) so the dashboard opens on it |
| GET | `/api/transactions/periods` | months that have data |
| GET | `/api/transactions/summary` | KPIs + category breakdown + anomaly count for a month |
| GET | `/api/transactions/list` | ledger (month or all-time) |
| PATCH | `/api/transactions/:id/category` | inline recategorise |
| DELETE | `/api/transactions/period` · `/all` · `/:id` | clear month / clear all / single |
| POST | `/api/transactions/bulk-delete` | checkbox delete |
| POST | `/api/transactions/recompute-anomalies` | re-run anomaly detection on all user txns |
| GET/POST/DELETE | `/api/budgets` , `/api/budgets/:id` | custom category budgets |
| POST | `/api/advisor/chat` | context injection → Gemini / OpenAI / offline fallback |
| GET/DELETE | `/api/advisor/history` | chat history |
| GET/POST | `/api/advisor/settings` | view LLM provider (+ `canEdit`); POST only when `ALLOW_AI_SETTINGS=true` in server/.env, else 403 |
| GET | `/api/advisor/context` | exactly what the advisor sees (latest month spend, goals, latest loan + insurance check) for the chat banner |

### Built Oct 27 (Modules 3 & 4, MySQL-only via `middleware/requireMysql.js`)
Loan: `GET /api/loan/config`, `POST /api/loan/calculate`, `POST /api/loan/predict`, `GET /api/loan/history`, `DELETE /api/loan/history/:id`
Goals: `GET /api/goals/config`, `PATCH /api/goals/income-group`, `GET /api/goals/templates/:goalType`, `GET/POST /api/goals`, `PUT/DELETE /api/goals/:id` (PUT with only `{status}` = pause/resume), `POST /api/goals/:id/contributions`, `POST /api/goals/simulate`, `POST /api/goals/loan-check`
`/api/health` now also reports `ml_service: online|offline`.

### Built Oct 28 (Module 5, MySQL-only)
Insurance: `GET /api/insurance/config` (age range, Asian BMI bands, profile age, `modelAvailable`), `POST /api/insurance/predict` (validates, computes BMI, calls ML, saves row; 503 with a clear message if the ML service is down, no rule-based fallback), `GET /api/insurance/history`, `DELETE /api/insurance/history/:id`

### Built Nov 4 (Phases 4-5)
- **Phase 4, advisor grounding** (`services/advisorGrounding.js`): computed facts (profile, health index, recurring, forecast) in the prompt; "can I afford RM X" answered by the decision simulator (PRE-COMPUTED CHECK); rules against doing arithmetic; last 6 chat turns sent (Gemini + OpenAI); reply validator marks each RM/% figure grounded / derived (one sum or difference) / unsupported, regenerates once, then appends a visible note. Response has `validation`; the chat shows "N figures checked against your data". `ADVISOR_EVAL=true` lets the request pick `mode` baseline|computed|validated (evaluation only). Insights logic moved to `services/spendingInsights.js`.
- **Evaluation** `node evaluation/advisor/run.js` (own Express on :5071, 16 questions × 3 set-ups, real Gemini) → `evaluation/results/advisor_results.md`: expected figure present 5/10 baseline vs 10/10 computed and validated; replies with an unsupported figure 6/16 vs 0/16; baseline worked from one month instead of the average and gave a wrong car-loan total (RM 101,600 vs RM 91,440). Validator never had to regenerate (computed context already fixed it): its value as a safety net is not measured. It also cannot recognise percentage-of arithmetic, so "unsupported" means untraceable, not wrong.
- **Phase 5, protection** (Insurance page, additive; the LR model is unchanged): `POST /api/insurance/protection` {dependants, existing_cover, support_years} → `services/protection.js`: emergency months from real spending and saved emergency savings; needs-based life-cover gap = income × 12 × years + saved debt balances − savings − existing cover. `components/insurance/ProtectionCard.jsx`. **Tell the supervisor:** Module 5 now also answers "how protected am I?".
- **Phase 6:** English/Malay on hold until Zeeq asks. **PDF e-statements ✅ (Nov 4)**:
  - **Reader:** `services/pdfStatement.js` (pdfjs-dist 5.7.284) finds the table by its Date…Balance header, decides money in/out from the running balance (column position is only a fallback) and reports every row that does not add up. It also checks the closing balance and, for Bank Islam, its TOTAL DEBIT/CREDIT counts and amounts.
  - **Descriptions:** reference numbers and bank codes are dropped. For Bank Islam, the holder's name is dropped from money out, because it is printed under every payment.
  - **Upload errors:** a locked PDF returns 422 `code: PDF_PASSWORD_REQUIRED` (or `PDF_PASSWORD_WRONG`). Other failures are `PDF_UNREADABLE` and `PDF_NO_TABLE`, the latter also for scans, which have no text.
  - **Password:** the password is sent with the file, used once and never stored.
  - **Preview:** `preview=true` returns the bank, period, counts, duplicates, checks and the first 8 rows, and saves nothing. The upload dialog always previews a PDF before importing; CSV/XLSX import straight away. The dialog has a "Where do I get my statement?" note that only claims what was tested.
  - **Real statements:** 3 CIMB + 3 Bank Islam (private, in `../Real Bank csv/`): 312/312 rows match the balance, all closing balances and bank totals match, import 58–376 ms. The first run found two bugs: ".50" without a leading zero, and the last page clearing the columns.
  - **Test PDFs:** made up by `server/scripts/makeStatementPdf.js`, with optional RC4 password. Do not put it under `test/`, because `node --test` runs every file there.
  - **Tests:** unit `test/pdfStatement.test.js`; functional M1-28 (locked PDF flow) and M1-29 (broken PDF / no table).
  - **Write-up:** `evaluation/results/pdf_import_results.md`.
  - **Same account and month as CSV and PDF (real):** Bank Islam July 2026, CASATIA CSV + PDF e-statement, both orders: 75 imported, then 0 new (75 matched from the other file); 5 genuine same-day repeats of the same amount were kept. The `CASATIA_Report_*.csv` files are **Bank Islam** exports (earlier docs wrongly called them Maybank).
  - **AEON Bank (Nov 5):** e-statements print "19 Sep 26" dates, "RM 36.00" / "-RM 10.90" amounts on the line under the description, a "Transaction date:" line under card purchases, and summary totals without counts (checked on the amount only). 2 real months (Sep, Oct 2026): 25/25 rows match the balance, both closing balances and both bank totals match. Unit test with made-up names in `test/pdfStatement.test.js`.
  - **Maybank (Nov 5):** one real 14-page Maybank Islamic statement (June 2026): headings "ENTRY DATE / TARIKH MASUK", one signed amount column ("10.10-", "30.00+"), BEGINNING/ENDING BALANCE, "TOTAL DEBIT : x" totals (amount only), descriptions continued over a page break, "*" on cut-off names. 142/142 rows match the balance, ending balance and both totals match. Card holds ("PRE-AUTH") and their releases ("REV PREAUTH", "PRE-AUTH REFUND") with the same amount and merchant are left out after the checks (`card_holds_left_out`, 9 pairs), so 124 rows import; a hold whose other half is in another month stays. Bank is detected from the top of page 1 first ("Maybank Islamic" contains "bank Islam", and transfer descriptions name other banks).
  - **Upload dialog:** a "Tested with real statements" box (AEON Bank, Bank Islam, CIMB, Maybank; savings/current accounts only; others untested but checked in the preview; no credit card or scanned statements). Keep `TESTED_BANKS` in `DashboardModals.jsx` in step with the reader.
  - **Your uploads (Nov 6):** `bank_statements` now has `bank` (from the PDF reader, or "Bank Islam" for a CASATIA CSV) and `file_type` (pdf|csv|xlsx). `GET /api/transactions/statements` lists each file that still has transactions (bank, dates covered, counts, money in/out, plus `manual_count`); `DELETE /api/transactions/statements/:id` removes only that file's transactions and the file record, then recomputes anomalies (404 for another user's file). Both MySQL-only. UI: `components/dashboard/UploadsCard.jsx` above the ledger, with a confirm dialog; the clear dialog points to it. So a user with three banks in one month can remove one bank's file without clearing the month. Functional M1-33. The card follows the dashboard month (`?year&month`: only files with rows in that month, with `month_count`/`month_in`/`month_out` and `total_files`; all-time view lists every file); a file covering several months shows under each, says "Also has N transactions in other months", and the remove dialog warns that all of them go. Functional M1-34 (141/141 `--no-llm`).
  - **Not tested:** Maybank CSVs, other banks, credit-card statements (no balance column → "no table"), OCR.
- **Functional re-run after PDF import (Nov 4):** 124/124 with Gemini, 0 blocked (new M1-28, M1-29); unit 64/64.
- **Cross-file duplicates + upload month (Nov 4):** a CSV and a PDF of the same month no longer double count (matched by day, amount and direction once the description differs), and after an upload the dashboard opens on that statement's month instead of the latest month. Unit 69/69 (`test/statementDedupe.test.js`), functional `--no-llm` 119/119 (new M1-30).
- **Nov 5 additions:**
  - **Money inputs:** shared `MoneyInput` (Controls.jsx) on every ringgit field (cents allowed, `1,234.50` when not editing); rate fields step 0.01. The old `type="number"` fields had no step, so the browser rejected "1500.50".
  - **Quote comparison (Module 5):** `GET/POST /api/insurance/quotes`, `PUT/DELETE /api/insurance/quotes/:id`, `POST /api/insurance/quotes/compare` {example_bill, dependants, support_years, existing_cover} → `services/quoteCompare.js`. The user enters quotes they received (medical: annual limit, deductible, co-pay % and cap, room and board; life/CI: cover). Each premium goes through the decision simulator as a new commitment; medical: out-of-pocket on an example bill (deductible, then co-pay up to its cap, then above the limit); life: share of the protection gap closed. Highlights are facts within one plan type, never "best". Max 6 quotes. Links to 13 insurers' own sites (alphabetical), the FEN medical insurance guide and BNM's licensed list. FinSight shows no prices of its own (advice rules, no public quote data).
  - **Data rights (PDPA 2010):** `GET /api/auth/me/export` (JSON attachment, no password hash), `DELETE /api/auth/me` {password} (422 on a wrong password so the client does not sign out; one transaction over `services/accountData.js` USER_TABLES). "Your data and privacy" in the account menu; privacy notice on the register page; the advisor says which provider gets the question and figures.
  - **Login limit:** `middleware/loginLimiter.js`, in memory: 5 failures per email per IP or 30 per IP in 15 min → 429 with Retry-After; success clears the account's count (`LOGIN_MAX_FAILURES`, `LOGIN_MAX_FAILURES_PER_IP`, `LOGIN_WINDOW_MINUTES`).
  - **Goal deposits:** `GET /api/goals/deposits`, `POST /api/goals/deposits/:transactionId` {action add|dismiss, goal_id} → `services/goalDeposits.js`: transfers to Tabung Haji / ASNB in the last 180 days, after the goal was created, offered to the active goal in that vehicle; `goal_deposit_links` (unique per transaction, 409 on a second answer).
  - **Purchase costs:** `GET /api/goals/purchase-costs?type=house&price&down_pct&first_home&purchase_date | type=car&engine_cc` → `services/purchaseCosts.js`; the goal form fills these lines and leaves lines the user edited.
  - **Monthly review:** `GET /api/transactions/review?year&month` → `services/monthlyReview.js`: spend and money in against the month before, top 3 category moves (≥ RM 20), unusual payments; "Month in review" card under the KPI cards.
  - **New tables:** `insurance_quotes`, `goal_deposit_links` (MySQL only).
  - **Tests:** unit 94/94; functional `--no-llm` 129/129 (new SEC-01 to SEC-03, M1-31, M1-32, M4-19, M4-20, M5-12 to M5-14). Not re-run: Gemini tests, performance, Lighthouse.
- **Phase 7 re-run (Nov 4):** unit 57/57; functional 122/122 with Gemini (HC-01 to HC-09, M1-25 to M1-27, M4-17, M4-18 new); performance re-run with the new endpoints (all p95 ≤ 12 ms one at a time; 25 users 0 failures, reads p95 151 ms with the heavier read mix; loan predict p95 33 ms with the simulator); Lighthouse mobile 95, LCP 2.42 s, TBT 22 ms, CLS 0, desktop 100 (`lighthouse_phase7.json`). All targets met. Health page had sideways scroll at 375 px from a long stamp note; fixed.

### Built Nov 4 (Phase 3: decisions, MySQL-only)
- `GET /api/profile/health` → Financial Health Index (`services/healthIndex.js`): Spend, Save, Borrow, Plan pillars, 25 points each (FinHealth-inspired, scored from data, not a validated scale); a pillar with missing data is left out and the rest scaled to 100; bands Vulnerable < 40 ≤ Coping < 80 ≤ Healthy. Borrow cites BNM FSR 1H2025 median DSR 33%.
- `PATCH /api/profile/finance` {emergency_savings, household_type} (new `users` columns). Household picks the EPF Belanjawanku 2024/25 Klang Valley budget (`data/referenceBudgets.js`: single RM1,970, single with car RM2,800, couple + 2 children RM7,440; NST/Malay Mail 17 Dec 2024); car owners are compared with the public-transport budget so a car loan is not counted twice.
- `POST /api/profile/simulate` {type: loan|purchase|commitment|pause_goal|income_drop, ...} → `services/decisionSimulator.js`: before/after surplus, DSR, emergency months, every goal's status/date (shared surplus), health index; reasons as sentences; verdict Manageable/Tight/Risky; +2-point rate stress test for reducing-balance loans; Belanjawanku living check. `/api/loan/predict` now also returns `affordability` (the simulator on the saved profile).
- `POST /api/commitments/payoff-plan` {extra_monthly} → `services/debtPlanner.js`: avalanche vs snowball vs minimum-only, month by month with rollover; debts without balance/rate are listed as left out; flat-rate car HP caveat (rebate under the Hire-Purchase Act).
- `POST /api/profile/zakat` → `services/zakat.js`: nisab = 85 g gold × latest RM/g from the gold dataset (or the official nisab the user enters), 2.5%; savings need one lunar year; income uses the no-deduction method (LZS).
- UI: new **Health Check** page (6th nav item, teal `--teal` tokens, `pages/HealthPage.jsx`): index card, "Your figures", "Can I afford this?" simulator. Loan page: "Can you afford it?" card above default probability (`components/loan/AffordabilityCard.jsx`) and `DebtPlannerCard`. Goals page: `components/goals/ZakatCard.jsx`.
- Tests: unit 52/52 (`test/decisions.test.js`); functional HC-01 to HC-08, `--no-llm` 115/115.

### Built Nov 3 (Phase 2: behaviour)
- `POST /api/transactions/upload` also takes **.xlsx** (first sheet; header row found in the first 20 rows, so bank preambles are skipped; exceljs 4.4.0).
- `POST /api/transactions/manual` `{date, description, amount, direction: out|in, category?}` (no category → same ML/rules categoriser; future dates and RM 0 → 422).
- `GET /api/transactions/insights` → recurring payments (`services/recurring.js`) + next-month forecast (`services/spendForecast.js`, method split_usual) + `recurring_monthly_total`.
- `POST /api/transactions/recurring/status` `{key, status: confirmed|dismissed|null}` (MySQL-only, `recurring_overrides` table).
- Evaluation on the Berka PKDD'99 bank dataset: `node evaluation/behaviour/run.js` → `evaluation/results/behaviour_results.md`. Recurring: precision 99.5%, recall 98.5% (6-month window) vs 55% precision for "paid 3+ times". Forecast: recurring + SES on usual spending (flagged one-offs left out) beat naive, 3-month mean and plain SES (median MASE 0.582 vs 0.749 naive, 6-month history); 80% range covers 69% (6 mo) / 79% (12 mo). Anomaly: Z-score kept over median/MAD (MAD caught more injected outliers but flagged ~12% of ordinary transactions vs ~2.6%).

### Built Nov 3 (Phase 1 of the integration plan, MySQL-only)
Commitments: `GET/POST /api/commitments`, `PUT/DELETE /api/commitments/:id` (kind, label, monthly_amount, optional balance/rate/end date, `paid_from_statement`). Profile: `GET /api/profile/finance`. `GET /api/loan/config` now also returns `savedCommitments` (debt kinds summed per form field) to prefill the loan form; `/api/goals/loan-check` and goal saves use saved debts when the form gives none.

### Original spec (Express → ML service where marked)
| Method | Endpoint | Notes |
|--------|----------|-------|
| POST | `/api/loan/calculate` | maths only (instalment, totals, schedule, DSR); no ML, no save; for live preview while typing |
| POST | `/api/loan/predict` | calculate + XGBoost via ML `/predict/loan` + verdict + tips; saves to `loan_predictions` |
| GET | `/api/loan/history` | |
| GET | `/api/goals/templates/:goalType` | from `cost_templates` |
| GET/POST | `/api/goals` | list (with progress + feasibility) / create with cost items |
| PUT/DELETE | `/api/goals/:id` | |
| POST | `/api/goals/:id/contributions` | |
| POST | `/api/goals/simulate` | compare vehicles; gold via ML `/forecast/gold` |
| POST | `/api/goals/loan-check` | house/car instalment + projected DSR |
| POST | `/api/insurance/predict` | ML `/predict/insurance` → score + SHAP; save row |

### ML service (FastAPI, internal, :8000)
`POST /predict/category` · `POST /predict/loan` · `POST /predict/insurance` · `GET /forecast/gold?months=60` · `GET /health`

---

## Module 1 — Transaction categoriser (built Oct 28; switched to Logistic Regression Oct 29)

- **Why ML:** the keyword rules only know merchants someone typed in. Several were copied from one real statement (`aqil maula`, `wisma central`, `kabin hitam`, `hyratech` as Income), and `includes('um')` sent "premium"/"museum" to Education (fixed: short university codes are whole-word now).
- **Training data** (`ml-service/features/category_data.py`): no public labelled Malaysian dataset exists, so the project labels its own: ~330 real Malaysian merchants across 9 categories + generated Malay/Chinese/Indian payee names (Personal Transfer), written in Bank Islam (CASATIA)/CIMB formats (20-char truncation, location + country codes, channel text such as "MyDEBIT SA PURCHASE" / "IB FPX"). 4,344 rows, 644 merchants/payees. Plus 300 rows per category from the public US set (DoDataThings v2, MIT), mapped to FinSight categories; Income dropped (set by the + sign). **Others** = cash withdrawals, bank fees, insurance/takaful, tax, zakat, council payments.
- **Model (deployed Oct 29):** TF-IDF char n-grams (2-5, survive truncation) + word 1-2 grams, numbers replaced by one token → **Logistic Regression** (C=5, balanced class weights). Random Forest (300 trees, balanced) was the proposal's model and is kept as the comparison (`--model rf`).
- **Evaluation** (`notebooks/train_category.py`): merchant-grouped 5-fold CV, so every score is on shops the model never saw.
  | Data | Rules | RF alone | LogReg alone | RF + rules | **LogReg + rules (deployed)** |
  |---|---|---|---|---|---|
  | Unseen merchants, grouped CV (4,344) | 44.8% | 58.4% | 65.2% | 68.3% | **72.1%** (macro-F1 0.714) |
  | Unseen merchants, hand-labelled (43) | 34.9% | 60.5% | 69.8% | 65.1% | **72.1%** |
  | Sample statements (23) | 95.7% | 87.0% | 95.7% | 95.7% | **95.7%** |
  | Real Bank Islam statement (43, private) | 86.0%* | 72.1% | 79.1% | 90.7% | **97.7%** |
  *the rules were written from this statement. RF alone plateaus at ~57% whatever the settings (trees, max_features, more US data): a never-seen shop name carries little signal. More US data than 300/category didn't help Malaysian scores. LogReg model file 1.1 MB vs RF 39 MB, ~2x faster.
- **Hybrid decision rule** (chosen on out-of-fold CV over 3 strategies × 12 thresholds, independently for each model; both picked the same): `ml_first_guess`, threshold 0.6 → model if ≥ 60% sure, else a specific rule match, else the model's best guess, marked `model_low_confidence`. Express mirrors it in `services/categoryModel.js` (`combine`, unit-tested).
- **LogReg vs RF (why the switch):** LogReg + rules beat RF + rules on every test set. TF-IDF gives tens of thousands of sparse features; a linear model weighs all of them, while each RF split only samples a few. The proposal named RF, so tell the supervisor and present it in Chapter 4 as "two classifiers compared on unseen merchants, the better one deployed".
- **App:** one ML call per upload (`POST /predict/category`, batch; model file `models/category_model.pkl`). New `transactions.category_source` column: `model` | `model_low_confidence` | `rules` | `sign` | `user` (set by the edit). Ledger tooltip says who categorised each row; low-confidence rows get an amber "?" so the user checks them. Upload message says which engine ran. ML service down → rules only, never fails.
- **Limitations for the report:** training descriptions are generated from a hand-built merchant list (realistic formats, but not real statements); small real test set; categories are fixed (no Travel/Insurance class); no retraining from user corrections (they are recorded in `category_source = 'user'` and could become training data later).

## Module 3 — Loan Default Predictor (detail)

**Purpose:** a "can I afford this loan?" self-check BEFORE applying to a bank. Not a bank approval tool.

### Inputs
| Group | Fields |
|-------|--------|
| Loan | **Loan type** (personal / car / house), **item price**, **down payment** (RM or %; also called "lump sum"; always 0 for personal loan), interest rate (% p.a.), tenure (years) |
| Income & debt | Monthly net income (prefill from `users.monthly_income`), existing monthly commitments: car loan, house loan, PTPTN, credit card, personal loan, other |
| Profile | Age (prefill), employment type (permanent / contract / self-employed / gig), years employed, number of dependants |

`loan_amount = item_price − down_payment` (personal loan: user enters the amount directly).

**Defaults per loan type** (config, user-editable; sources in `research/sources_rates_costs_nov2026.md`):
- Personal: effective rate on a reducing balance (example 11.68% = 6.5% flat over 5 yrs), tenure ≤ 10 yrs (BNM cap), no down payment. Flat allowed as an option until flat-rate personal financing ends on 1 Jan 2027 (BNM Policy Document on Personal Financing, 30 Sep 2025)
- Car (hire purchase): effective rate on a reducing balance (example 5.50% = 3% flat over 9 yrs), tenure ≤ 9 yrs, down payment typically 10%. Required for new agreements from 1 Jun 2026 (Hire-Purchase (Amendment) Act 2026); flat kept as an option for agreements signed before then
- House: reducing balance (floating), tenure ≤ 35 yrs, down payment typically 10%; flat is refused (422)

### Calculations (`server/src/services/loanCalc.js`, deterministic, shared with Module 4 loan-check)
Malaysian loans do NOT all use the same interest method, and the rules changed in 2026. This is a deliberate domain-correctness point.
Default (Nov 5): every loan type uses REDUCING BALANCE at an effective rate. FLAT is an option for car HP signed before 1 Jun 2026 and
personal loans quoted flat before 2027; a flat result also returns `effectiveRatePct` (`effectiveFromFlat`, bisection: the effective
rate with the same instalment). The +2-point stress test applies to house loans only (car HP and personal financing are fixed-rate).
```
FLAT RATE (older car hire purchase, personal loans quoted flat before 2027):
  total_interest  = loan_amount × annual_rate × years
  total_payment   = loan_amount + total_interest
  monthly         = total_payment / (years × 12)

REDUCING BALANCE (house; car HP from 1 Jun 2026; personal financing from 1 Jan 2027):
  r = annual_rate / 12,  n = years × 12
  monthly         = loan_amount × r(1+r)^n / ((1+r)^n − 1)     (if r = 0: loan_amount / n)
  total_payment   = monthly × n
  total_interest  = total_payment − loan_amount

DSR after loan    = (existing_commitments + monthly) / net_income × 100
Instalment-to-income = monthly / net_income
Down payment ratio   = down_payment / item_price
```
Worked examples (use as unit tests):
- Car RM80,000, 10% down, 5.5% effective, 9 yrs → loan RM72,000, interest RM19,445.74, total RM91,445.74, **RM846.72/month**
- The same car at 3% flat (agreement before 1 Jun 2026) → interest RM19,440, total RM91,440, **RM846.67/month**, effective rate 5.50%
- House RM400,000, 10% down, 4.5% reducing, 30 yrs → **RM1,824.07/month**, total ≈ RM656,664, interest ≈ RM296,664

**Repayment schedule:** yearly rows `{year, principal_paid, interest_paid, remaining_balance}`.
Reducing balance: standard amortisation. Flat rate: equal interest per month (simple split), balance falls linearly. Optionally show Rule of 78 for car loans as an advanced note only.

### ML part (XGBoost, via ML service `POST /predict/loan`) — trained Oct 28
- **Dataset (changed Oct 28): Lending Club accepted loans 2007-2016**, `lending_club_loan_two.csv`, 396,022 loans, 19.6% charged off.
  Source: Hugging Face mirror `ghty123/lending_club_loan_dataset` (public, no login; full CC0 version at `codesignal/lending-club-loan-accepted`).
  Replaced Home Credit, which needs a Kaggle login and has no existing-debt column. Target: `loan_status == "Charged Off"`.
- **Train ONLY on features the form can supply.** Ratios only (data is USD). `int_rate`, `grade`, `sub_grade` are excluded because Lending Club derives them from its own risk assessment (leakage).
- Feature mapping (`ml-service/features/loan_features.py`):
  | Form input | Lending Club column / derived |
  |------------|------------------------------|
  | loan amount ÷ annual income | `loan_amnt / annual_inc` |
  | instalment ÷ monthly income | `installment / (annual_inc/12)` |
  | existing commitments ÷ income | `dti / 100` (existing debt payments excl. the new loan) |
  | DSR after loan | existing_dti + instalment ratio |
  | tenure | `term` (36 / 60 months) |
  | years employed | `emp_length` (`< 1 year` = 0, `10+` = 10; form capped at 10) |
  | loan type | `purpose` (car → car; house, home_improvement → house; rest → personal) |
- **Not in the dataset, so not in the model:** age, dependants, employment type. They still feed the DSR/verdict logic in Express.
- **Out-of-range guard:** the data only has 3- and 5-year personal loans (≤ $40k). Inputs above the training 99th percentile (most car and house loans: 9–35 yr tenures, large loan/income) are returned in `out_of_range`; Express then marks the score **"Reference only"** and the verdict uses DSR only (`counts_toward_verdict: false`).
- **Results (stratified 70/15/15, seed 42, test set of 59,404):** ROC-AUC **0.697** (LogReg baseline 0.671; `scale_pos_weight` variant 0.698), PR-AUC 0.356, Brier 0.145. At the F1-optimal threshold 0.205: precision 0.316, recall 0.604, F1 0.415 (TN 32,542 · FP 15,211 · FN 4,614 · TP 7,037).
- **Risk bands** (relative to the 19.6% base rate): Low < 0.75× (14.7%) ≤ Medium < 1.5× (29.4%) ≤ High. Actual test default rate: Low 9.8% (42% of loans) · Medium 21.1% · High 38.8% (19%). The F1-optimal threshold sits almost on the base rate, so it is used for the confusion matrix, not as a band edge.
- **Mean |SHAP|:** instalment/income 0.92 · loan/income 0.90 · tenure 0.67 · DSR after 0.27 · years employed 0.08 · existing DTI 0.05 · loan type ~0.01.
- Outputs: `models/loan_xgb.pkl` (+ thresholds, feature ranges), `models/loan_xgb_metrics.json`, `notebooks/outputs/loan_xgb_evaluation.png` (ROC, confusion matrix, SHAP bar chart for Chapter 4).
- **Limitations for the report:** US data (2007–2016), personal loans only, lender-approved applicants only (selection bias), no age/employment type. AUC is modest but honest; Lending Club models using grade/int_rate score higher because those leak the lender's decision.

### Result screen
1. **Monthly instalment**, **total payment**, **total interest** (big KPI cards)
2. **Repayment chart** (Recharts): remaining balance line + stacked principal/interest bars per year
3. **DSR after loan**: band ≤ 40% Healthy · 40–60% Moderate · > 60% High (exceeds typical bank limit 60–70%)
4. **Default probability** + risk level (Low / Medium / High; probability cut-offs set from validation results after training, not guessed)
5. **Overall verdict** = the worse of DSR band and model risk level
6. **Tips** (rule-based): e.g. "A down payment of RMxx or a tenure of yy years brings DSR under 60%" (solve the formulas backwards)
7. Disclaimer: estimate only, not financial advice; banks use their own criteria

---

## Module 4 — Life Goals Planner (detail)

| Goal | Plans | Default template (editable, must cite) |
|------|-------|----------------------|
| **Kahwin** | Hantaran, mas kahwin, catering, venue, attire, photo, rings, honeymoon | Malay wedding RM30k–80k; hantaran RM5k–10k (RM10k–15k+ KL); catering 35–50% (iMoney 2026) |
| **Children** | By stage: infant, preschool, primary, secondary, tertiary, health, daily needs | Birth–18: B40 RM93k–155k, T20 RM250k–470k (NST, Aug 2025) |
| **Haji** | Cost by income tier | 1447H/2026: full RM33,300; B40 pays RM15,000, M40 RM23,500, T20 RM33,300 (Utusan, Oct 2025) |
| **House** | Down payment, SPA/loan legal fees, stamp duty, valuation, renovation, moving | Stamp duty (Stamp Act 1949 scale, 0.5% on the loan, first-home exemption ≤ RM500k to 31 Dec 2027) and legal fees (Solicitors' Remuneration Order 2023) worked out from the price in `services/purchaseCosts.js`; valuation, renovation, moving entered by the user (no credible published figure) |
| **Car** | Down payment, road tax, insurance, registration, accessories | Road tax from engine cc (JPJ Peninsular rates, via iMoney/Bernama); insurance, registration, accessories entered by the user (insurers set motor premiums since 2017) |
| **Custom** | User-defined | — |

**Savings vehicles:** piggybank (0%), savings account, Tabung Haji, ASB (rates are config, not hardcoded), gold (ML forecast with confidence band). Shariah-compliant framing is deliberate.

**Where the AI is:** (1) gold price forecast (ARIMA, evaluated by MAE/RMSE/MAPE); (2) feasibility score using real surplus from Module 1; (3) goals are fed into the Module 2 advisor context (to do, fix #10).

### Gold price forecast (built Oct 28)
- **Data (public, monthly, Jan 2000 – Sep 2026, 321 months):** gold USD/oz from the World Bank Commodity Markets "Pink Sheet" (via datahub.io/core/gold-prices) × USD/MYR from FRED `EXMAUS` (US Federal Reserve) ÷ 31.1035 → **RM per gram** (latest RM 565.05/g, Sep 2026). Files in `ml-service/data/raw/gold/` (gitignored; download commands in the ML README).
- **Model:** ARIMA(2,1,0) with drift on log price (`notebooks/train_gold_arima.py`). Order chosen by AIC over p,q ∈ {0,1,2} on data **before** the evaluation window. Implied long-run drift ≈ 11.0%/yr (MYR gold 2000–2026). Prophet skipped: no Python 3.14 build, and ARIMA is the standard, explainable baseline.
- **Evaluation:** rolling-origin backtest over the last 60 months (refit monthly, forecast 1–12 months ahead) vs naive (last price) and random walk with drift:
  | Horizon | ARIMA MAPE | Drift MAPE | Naive MAPE | ARIMA 80% interval coverage |
  |---|---|---|---|---|
  | 1 mo | 2.59% | 2.61% | 2.74% | 76% |
  | 3 mo | 5.35% | 5.36% | 6.11% | 74% |
  | 6 mo | 8.08% | 8.05% | 10.41% | 61% |
  | 12 mo | 11.57% (MAE RM 53.28/g, RMSE RM 70.93/g) | 11.54% | 18.38% | 65% |
  Honest reading: ARIMA ≈ drift (gold is close to a random walk with trend) and both clearly beat naive at 6–12 months. Coverage below 80% because 2024–26 was an unusually strong rally: intervals are somewhat too narrow, a limitation to state.
- **Serving:** `GET /forecast/gold?months=N` (ML service) → median path, 80/95% intervals, and annualised growth to the horizon: `expected` (median), `cautious` (80% lower bound), `optimistic` (80% upper). Express `services/goldForecast.js` caches per horizon for 1 h.
- **How plans use it:** gold goals are planned at the **cautious** rate (e.g. 5-yr horizon: 3.52% cautious / 10.86% expected / 18.72% optimistic; 1-yr: −5.0% / 10.3% / 28.0%). `/api/goals/simulate` also returns the required monthly at the expected and optimistic rates plus `gold_outlook` for the chart. If the ML service is down, gold falls back to the config placeholder (5%) with a note. A user-entered `expected_rate` overrides the forecast.
- UI: gold row shows the three forecast rates; selecting gold shows a history + forecast chart with the 80% band (Recharts) and the backtest error.

**Formulas (in `services/savingsCalc.js`):**
```
Required monthly (no growth) = (target − current_saved) / months_left
FV  = P(1+r)^n + PMT × ((1+r)^n − 1) / r                 (r = annual/12)
PMT = (target − P(1+r)^n) × r / ((1+r)^n − 1)
Monthly surplus = income − avg monthly spending (last ≤6 full months) − commitments not paid from the uploaded account
                  (services/financialProfile.js, Nov 3: declared income first, statement income as fallback; a latest month
                  ending before the 20th is treated as partly uploaded; transfers to TH/ASB/ASNB/EPF or to the user's own
                  given name count as saving, not spending)
Shared surplus (Nov 3, services/goalPlanner.js allocateSurplus): goals due first take their required monthly first; each goal's
                  status is judged against what is left. A goal short today is "At Risk" (catches_up) if a month-by-month
                  simulation, where earlier goals free their share after their target date, still reaches it in time;
                  otherwise "Not Feasible" with that simulated date. Overall status = weakest goal.
Feasibility ratio = required_PMT / surplus  → ≤0.5 On Track | 0.5–1.0 At Risk | >1.0 Not Feasible
House/Car:  reuse services/loanCalc.js (both reducing balance at an effective rate)
            projected DSR = (existing monthly debt + M) / monthly_income × 100
```
Guard r = 0 (use simple division). If the user has no transactions, fall back to `monthly_income` and show a warning.

---

## Module 5 — Insurance Risk Predictor (built Oct 28)

**Purpose:** show a young Malaysian how their lifestyle affects insurance risk, and *why*, before they shop for medical or life cover. Not a premium quote.

- **Dataset:** Medical Cost Personal Datasets (`insurance.csv`, 1,338 people, 1 duplicate dropped; Lantz, *Machine Learning with R*; Kaggle mirichoi0218/insurance). US data.
- **Target:** annual medical charges **above the dataset median** (USD 9,386) = "higher-cost profile" (50/50 balanced).
  Why not the top quartile: above the 75th percentile is 93% smokers, so the model collapses to "do you smoke?" and age/BMI barely register. The median split keeps age and smoking both meaningful for the explanation chart.
- **Features:** age, BMI, smoker, children (`ml-service/features/insurance_features.py`, shared by training and serving).
  Excluded: **region** (US regions, no Malaysian equivalent) and **sex** (no accuracy gain, CV AUC 0.947 with or without, and gender pricing is a fairness concern).
- **Model:** standardised Logistic Regression (`notebooks/train_insurance_lr.py`), stratified 80/20 split, seed 42.
- **Results (test set of 268):** ROC-AUC **0.953**, accuracy **89.9%**, precision 0.891, recall 0.910, F1 0.900, Brier 0.077 (TN 119 · FP 15 · FN 12 · TP 122). 5-fold CV on train: AUC 0.946 ± 0.010.
  Baselines: majority class 50% / AUC 0.5; smoker-only rule 75.8% / AUC 0.758; depth-3 decision tree 93.3% / AUC 0.949 (similar accuracy, but LR was chosen for exact, additive explanations).
- **Odds ratios per unit:** age ×1.17 per year · smoker ×2,619 (near-separation: almost every smoker is above the median) · children ×1.13 per child · BMI ×1.02 per point.
  **Mean |SHAP|:** smoking 2.76 · age 1.86 · children 0.12 · BMI 0.11. BMI matters little in this data *for this target*: its big effect is among smokers (median charges USD 20k vs 41k for obese smokers), who are already above the median. State this as a limitation.
- **SHAP:** computed exactly as coef × (x − training mean) / scale (linear SHAP, interventional), so the `shap` package isn't needed; the training script asserts base value + contributions = model log-odds.
- **Risk tiers** on P(higher-cost): Low < 0.30 ≤ Medium < 0.70 ≤ High. Actual higher-cost rate on test: Low 7.5% (40% of people) · Medium 26.1% (17%) · High 99.1% (43%).
- **What-if scenarios** (ML service): quit smoking, BMI down to 22.9, both. TC06 (55, smoker, BMI 35): >99.9% High → quit smoking 79.8%. TC07 (25, non-smoker, BMI 22): 2.7% Low.
- **Express:** BMI from height/weight; categories use **Asian cut-offs from the Malaysian CPG Management of Obesity (2004)**: <18.5 under, 18.5–22.9 normal, 23–27.4 overweight, ≥27.5 obese. Age limited to 18–64 (training range) → 422 outside it. Rule-based tips from inputs + what-if.
- **UI:** score + tier gauge, SHAP diverging bar chart (Recharts), what-if cards, tips, model card, disclaimer, history table.
- Outputs: `models/insurance_lr.pkl`, `models/insurance_lr_metrics.json`, `notebooks/outputs/insurance_lr_evaluation.png` (ROC vs smoker-only rule, confusion matrix, SHAP summary) for Chapter 4.
- **Limitations for the report:** US data and costs (the score ranks lifestyle risk, it is not a ringgit premium); small dataset; no medical history/occupation; smoker coefficient near-separation; BMI effect understated.

---

## Other Key Formulas
- **DSR** = total monthly debt / monthly net income × 100. Malaysian banks typically cap at 60–70%.
- **Anomaly (Z-score, statistical, not ML)** — implemented in `utils/categorizer.js` `computeAnomalyFlags()`:
  `Z = (amount − mean of OTHER txns in same category) / sample std dev of those txns`
  Flag when **Z > 2.5** (one-sided: unusually high spending only) **AND** amount is ≥ 25% above the category mean (materiality floor).
  Leave-one-out (txn excluded from its own stats), needs ≥ 5 peers in the category, `Income` never flagged, zero spread → flag only a material change.
  Recomputed over the user's full history after every upload and every recategorisation; `POST /api/transactions/recompute-anomalies` re-runs it manually.
  *Report must say Z > 2.5 one-sided + 25% floor (not |Z| > 2.5).*

---

## Known Issues / Fix List (from code review, Oct 26 2026)

| # | Issue | Where | Fix |
|---|-------|-------|-----|
| 1 | ✅ DONE (Oct 26) — anomaly was RM800 rule + global Z-score | `utils/categorizer.js`, `routes/transactions.js` | Now per-category leave-one-out Z-score + 25% floor; recomputed on upload/recategorise |
| 2 | ✅ DONE (Oct 26) — root `.gitignore` added | root | Covers `.env`, `data_store.json`, `Real Bank csv/`, `*CASATIA*.csv`, temp uploads, Python/ML artefacts |
| 3 | ✅ DONE (Oct 26) — upload validation | `routes/transactions.js` | `.csv` only → 422; empty/garbage/non-bank CSV → 422; >10MB → 413; two-pass upload so rejected files create no DB records. TC04 passes |
| 4 | ✅ DONE (Oct 28) — offline engine was labelled "FinSight Pro" | `AdvisorPage.jsx`, `routes/advisor.js` | UI now says "Offline fallback (keyword rules, no LLM)" on the badge, each reply and the settings dialog. Report: call it a rule-based fallback, not AI |
| 5 | ✅ DONE (Oct 28) — any user could overwrite the server LLM key | `POST /api/advisor/settings` | 403 unless `ALLOW_AI_SETTINGS=true` (dev only; local `.env` has it on, `.env.example` off). UI shows a "Settings are locked" note |
| 6 | ✅ DONE (Oct 28) — JWT 7d + hardcoded fallback secret | `middleware/auth.js`, `routes/auth.js` | 24h expiry (`JWT_EXPIRES_IN`), no fallback secret (startup fails without a ≥32-char `JWT_SECRET`); local `.env` got a new random secret. The old secret was published in the source and `.env.example`, so never reuse it |
| 7 | JSON fallback parses SQL strings, so every new query must be mirrored | `db.js` | Prefer MySQL-only for Modules 3–5 |
| 8 | ✅ DONE (Oct 28) — DashboardPage.jsx was ~60KB | client | Split into `components/dashboard/*` (8 files) |
| 9 | ✅ DONE (Nov 1) — branding was Maybank-inspired ("Maybank-Powered" on register) | client | Own identity now (yellow theme, rosette mark). Never use the Maybank logo or name as the app's identity |
| 10 | ✅ DONE (Oct 28) — advisor context now includes active goals | `routes/advisor.js`, `services/goalPlanner.js` | Prompt lists each active goal (progress, required monthly, vehicle/rate, feasibility, realistic date) + total vs surplus; affordability answers subtract goal commitments; offline fallback has a goals intent |
| 13 | ✅ DONE (Nov 1) — 7 defects from functional testing | `routes/transactions.js`, `auth.js`, `budgets.js`, `services/loanCalc.js` | Debit/Credit columns with 0.00, "credit" in a debit description, double-counted re-uploads, weak register validation, negative budgets, RM 0 personal loans. See `evaluation/results/defect_log.md` |
| 12 | ✅ DONE (Nov 5) — mysql2 returned DATE columns as UTC timestamps of local midnight | `db.js` pool | `dateStrings: ['DATE']` (TIMESTAMPs unchanged); client reads dates with `lib/dates.js` `parseDay`; functional M1-32 checks the ledger returns `2026-10-01` |
| 11 | ✅ DONE (Oct 28) — Gemini was silently failing every request | `routes/advisor.js` `callGeminiAPI` | AQ. key was also sent as `Authorization: Bearer` (→ 401) and all three model names were retired (→ 404), so every chat used the offline fallback. Now header-only auth, current models, 25 s timeout per model, multi-part replies joined |

---

## ML Models & Datasets

| Module | Model | Dataset | Evaluation |
|--------|-------|---------|-----------|
| Spend Analyser | TF-IDF (char 2-5 + word 1-2) + Logistic Regression, merged with keyword rules (Random Forest compared) | Own labelled Malaysian data (4,344 rows, 644 merchants/payees) + public US set (DoDataThings v2, MIT, 3,000 rows) | Merchant-grouped 5-fold CV vs rules and LogReg; 3 hand-labelled test sets; confusion matrix |
| Loan Default | XGBoost | Lending Club 2007–2016 (Hugging Face mirror); imbalance handled at the threshold, `scale_pos_weight` compared | ROC-AUC 0.697, PR-AUC, precision/recall/F1, band default rates |
| Life Goals | ARIMA(2,1,0) + drift on log price | World Bank gold USD/oz × FRED USD/MYR → RM/gram, 2000–2026 | Rolling backtest MAE/RMSE/MAPE at 1–12 months vs naive & drift; 80% interval coverage |
| Insurance Risk | Logistic Regression + exact linear SHAP | Medical Cost Personal (1,337 rows after dedup; target = charges > median) | Test ROC-AUC 0.953, accuracy 89.9%, vs majority/smoker-only/decision-tree baselines; SHAP plot; tier calibration |
| AI Advisor | None (prompting) | Live DB context | Scenario-based functional tests (figures match the DB, no invented goals, disclaimers, fallback works) + response time |

Models are trained in notebooks, saved with `joblib`, loaded once at ML-service startup, and static once deployed (no retraining on user data).

---

## Implementation Conventions
1. Express responses use `{ success: boolean, message?, data? }`, matching the existing routes.
2. All new Express routers use `router.use(authenticateToken)` and scope every query by `req.user.id`.
3. Use parameterised queries (`?`). Never concatenate SQL.
4. Money uses `DECIMAL`, displayed as `RM 1,234.56` (`en-MY`).
5. Dates are `YYYY-MM-DD` strings. No UTC shifting (see `parseTxnDate`).
6. Rates, cost templates and thresholds are data or config, not hardcoded.
7. Show an "estimates, not financial advice" disclaimer on Modules 3, 4 and 5.
8. UI follows `client/DESIGN.md` (UI3): yellow theme, white cards, small colour accents, tokens only (no hex in JSX), `m` from `motion/react`. Dark theme is planned: it only needs the `:root` token block in `index.css` redefined under `[data-theme="dark"]` plus a toggle.
9. New pages are added to `pageLoaders` in `App.jsx` and to `MODULES` in `lib/modules.js` (each needs a `:root[data-module=...]` accent block in `index.css`; Health Check uses teal).
10. Figures shown to users or given to the advisor are computed in code (services), never by the LLM.

---

## Run Locally
```bash
# 1. Start MySQL in XAMPP, import server/schema.sql
cd server && npm run dev            # Express → http://localhost:5000
cd client && npm run dev            # React  → http://localhost:5173
cd ml-service && .venv\Scripts\python -m uvicorn main:app --reload --port 8000
```

---

## Implementation notes (Oct 27)
- Services: `services/loanCalc.js` (flat + reducing, schedule, DSR, inverse solvers for tips), `services/savingsCalc.js` (FV/PMT, feasibility, months-to-reach), `services/loanRisk.js` (calls ML `/predict/loan` when the model is loaded, else a labelled rule-based logistic score), `services/userFinance.js` (surplus = income − avg spend of last ≤6 months), `services/mlClient.js`, `services/goldForecast.js` (cached ARIMA outlook → cautious planning rate), `services/goalPlanner.js` (computePlan/planGoal/getActiveGoalPlans, shared by goals routes and the advisor).
- Unit tests: `cd server && npm test` (node:test, 97 tests as of Nov 5, incl. PDF statements, TC05, TC05b, TC05c/TC10, TC08, TC09, BMI/Asian cut-offs, financial profile, shared goal surplus, recurring detection, forecast, MAD vs Z-score).
- `services/insuranceRisk.js`: BMI, Asian BMI category, tips. TC06/TC07 verified end to end through the API and UI on Oct 28.
- Tables are auto-created in `db.js` on startup and also appended to `schema.sql`. `cost_templates` is seeded once from `server/src/data/costTemplates.js` (TRUNCATE to reseed). `loan_predictions` has an extra `risk_source` column (`rule_based` | `xgboost`).
- **Cited figures (Nov 5, replacing the placeholders):** savings 0.65% (BNM average savings deposit rate, end-June 2026, in MOF Q2 2026 report), Tabung Haji 3.50% (FY2025, Malay Mail 18 Mar 2026), ASB 5.75 sen (FY2025, The Star 19 Dec 2025); sources shown under "Where these rates come from" on the Goals form. Loan default rates are labelled example rates with their sources (`loanTypes[*].rateSource`, shown on the Loan page): personal 6.5% (RinggitPlus listings from 3.31%), car 3% (2.2–3.75%), house 4.5% (BNM base rate 3.39%, ALR 4.69%). Fallback risk cut-offs now match the XGBoost bands (0.147 / 0.294). Gold 5% is only the offline fallback. Kahwin and children figures are midpoints of the cited ranges. `cost_templates` reseeds itself when `data/costTemplates.js` changes.
- **✅ Loan maths follow the 2026 rules (Nov 5, Zeeq's decision):** the Hire-Purchase (Amendment) Act 2026 moves new car HP agreements from 1 Jun 2026 to an effective rate on a reducing balance (NST, 16 Mar 2026), and BNM's Policy Document on Personal Financing (30 Sep 2025) bans flat-rate personal financing from 1 Jan 2027. Car and personal now default to reducing balance; the Loan page asks "How is the rate quoted?" (Effective rate / Flat rate) for those two and shows a flat quote's effective equal; flat results add tips naming the law. Tests: unit 97/97, functional `--no-llm` 131/131 (TC05b now effective, new TC05b-F flat, M3-15 house flat refused, M4-15 effective).
- **XGBoost pipeline (Oct 28):** `ml-service/notebooks/train_loan_xgb.py` (VS Code `# %%` cells, ~2 min) → `models/loan_xgb.pkl` + `loan_xgb_metrics.json` + `notebooks/outputs/loan_xgb_evaluation.png`. Features in `ml-service/features/loan_features.py`, shared by training and `/predict/loan`. Deployed model is unweighted (calibrated probabilities). Express uses the model's `risk_level` unless `out_of_range` is non-empty, then the verdict is DSR-only. Falls back to the rule-based score when the service/model is missing. Full results under Module 3 → ML part.
- Verdict: worse of DSR band and risk level; DSR > 70% (`bankDsrLimit`) forces "Not Recommended" with a warning (TC11).

## Current Status (Week 18 of 28)

**Done:** Ch1–3 drafts (need Module 4 + Express/hybrid updates) · auth · 6-table schema · Module 1 backend + dashboard (periods, budgets, recategorise, bulk delete) · Module 2 advisor with Gemini/OpenAI + history.

**Build order (revised Oct 27):** Modules 3 and 4 built in parallel (working UI + maths, ML held) → train XGBoost + gold forecast and plug into the ML service → polish M1 & M2 → Insurance Risk Predictor (M5).

**Next up:**
1. ~~Fix list items 1–3~~ ✅ done Oct 26
2. ~~ML-service scaffold, mlClient.js, loanCalc.js + savingsCalc.js with tests~~ ✅ done Oct 27
3. ~~Module 3 + Module 4 backend + UI (first working version)~~ ✅ done Oct 27
4. Research + cite: House/Car cost templates, savings vehicle rates, loan default rates
5. ~~Train XGBoost~~ ✅ done Oct 28 on Lending Club (ROC-AUC 0.697), integrated with out-of-range guard. Optional later: a temporal split (train ≤2014, test 2015–16) as a robustness check
6. ~~Gold forecast~~ ✅ done Oct 28: ARIMA → `GET /forecast/gold`, used for gold in goal plans, simulate and the UI chart
7. ~~Goal edit form + goals in the advisor context~~ ✅ done Oct 28 (pencil button on each goal card reuses the create dialog with `PUT`; existing monthly debt is not stored, so re-enter it for the DSR check)
8. ~~Module 5 Insurance Risk Predictor~~ ✅ done Oct 28 (LogReg + linear SHAP, what-if, UI). ~~Polish Modules 1 & 2~~ ✅ done Oct 28:
   - **M1:** opens on the latest month with data; KPI cards say where income comes from and show overspending; budgets only show real limits ("Set budget" link otherwise, no fake RM500); real **50/30/20 check** (needs = Groceries/Utilities/Transport/Healthcare/Education, wants = Food & Dining/Shopping/Entertainment, transfers/other shown separately); **monthly trend chart** (spend vs money in, last 6 months, click to open a month); all-time view explains that cards show the latest month; clear dialog fits the view; actions surface errors; sample CSV anonymised; ledger can mark a row as Income
   - **M2:** "Advisor sees" chips from `/api/advisor/context`; prompt no longer claims to be "certified", adds not-licensed + no-product-names rules, and includes the latest loan check (with the reference-only caveat, new `loan_predictions.risk_counts` column) and insurance check; markdown renderer handles headings, `*`/`-` bullets, numbered lists, dividers; new suggested questions
9. ~~ML categoriser~~ ✅ done Oct 28, switched from Random Forest to Logistic Regression Oct 29 (see Module 1 categoriser section). **Tell the supervisor about the switch from the proposal.**

| Weeks | Task |
|-------|------|
| W18–W19 | Polish M1 & M2 UI, ML-service scaffold, loanCalc.js + tests |
| W19–W21 | Module 4 Life Goals Planner: templates, CRUD, savings calc, gold forecast, feasibility, loan-check |
| W21–W23 | Module 3 Loan: form, loan maths + schedule chart, XGBoost training + integration |
| (parallel) | Start XGBoost + gold forecast notebooks early; RF categoriser training |
| W23–W25 | Module 5 Insurance: LogReg + SHAP chart |
| — | Report updates (Module 4, hybrid architecture, Module 3 spec, anomaly rule) — parked, do before W26 |
| W25–W26 | Functional testing (TC01–TC11, extended per module) + ML evaluation |
| W26–W27 | Performance evaluation (API/ML latency, load test, frontend) + Chapter 4 |
| W27–W28 | Chapter 5, final report, slides |

---

## Public launch prep (Nov 5)
Zeeq wants FinSight open to everyone: free hosting first (Oracle Cloud Always Free recommended), a paid server later. Full steps and the pre-launch checklist: `DEPLOY.md`.
- **Deploy files:** `Dockerfile` (builds the client, runs Express, which now serves `client/dist` in production), `ml-service/Dockerfile` (python:3.14-slim, models only), `docker-compose.yml` (mysql 8.4, ml (no public port), app, caddy), `deploy/Caddyfile` (automatic HTTPS), `deploy/backup.sh` (daily mysqldump, keeps 14), `.env.production.example`. Docker is not installed on Zeeq's laptop, so the images have **not been built yet**; first build happens on the server.
- **Git:** `git init` done Nov 5, **nothing committed**. `.gitignore` now keeps `ml-service/models/*.pkl` (4 MB, the server needs them) and ignores `backups/`. Repo must be private: `utils/categorizer.js` has merchant names from Zeeq's own statement.
- **Production mode** (`NODE_ENV=production`, `middleware/security.js`):
  - `trust proxy` 1 (else every visitor shares Caddy's IP and the login limit blocks everyone)
  - CORS only `CORS_ORIGIN`
  - Headers: nosniff, frame DENY, referrer, permissions, COOP, HSTS, and a CSP (inline theme script allowed by hash; `wasm-unsafe-eval` for the mascot's mesh decoder; `font-src data:` for Vite-inlined fonts)
  - JSON bodies ≤ 200 kb; 500s give a plain message; `error.message` no longer returned on register/login/upload
  - **JSON fallback off** (`DB_FALLBACK`): the app retries MySQL 20 × 3 s, then exits
- **Limits:** advisor 30 questions per user per rolling 24 h (`ADVISOR_DAILY_LIMIT`, 429 `ADVISOR_DAILY_LIMIT`, counted from `chat_messages`; questions ≤ 2,000 chars); sign-ups 5 per IP per hour (`middleware/registerLimiter.js`, `REGISTER_MAX_PER_IP`). Both off by default outside production so tests and evaluation scripts still run.
- **Sign-up:** a box "I am 18 or older and agree to the Terms of use" (`accept_terms: true` required, 400 `TERMS_REQUIRED`); age 18–100 at sign-up and in the profile (was 16); `users.terms_accepted_at`. Test and seed scripts send `accept_terms`.
- **Terms of use** (`components/TermsOfUse.jsx`): link on the register page, also in "Your data and privacy". Site facts come from build-time env (`lib/site.js`: `VITE_CONTACT_EMAIL`, `VITE_DATA_LOCATION`, `VITE_OPERATOR`), shown in the privacy notice (new "Where it is kept" point, contact for data requests).
- **Advisor privacy:** the user's name is no longer put in the LLM prompt ("not shared with the AI (data minimisation)"); the privacy notice says name and email are not sent. Only change to the prompt since the advisor evaluation.
- **Emergency savings history** (Zeeq's request): `savings_entries` (kind add|withdraw|set, amount, balance_before, balance_after, note, entry_date); `services/emergencySavings.js`; `GET/POST /api/profile/savings`, `DELETE /api/profile/savings/:id` (only the latest can be undone, so every balance stays true; taking out more than recorded is 422). `users.emergency_savings` stays the one figure every module reads; `PATCH /api/profile/finance` with a number now logs a "set" entry. UI: `components/health/EmergencySavings.jsx` in "Your figures" (balance, Add / Take out / Set the total, note, last 5 changes with Undo); household has its own save button. Included in data export and account deletion.
- **Local production check:** `.claude/launch.json` "app-production" runs the built app in production mode on :5070 (not 5060: Chrome blocks that port as SIP). Signed in, Home with 3D Oyen and Health savings checked there with no CSP errors.
- **Tests:** unit 102/102 (new `test/emergencySavings.test.js`); functional `--no-llm` 139/139 (new SEC-06 sign-up rules, SEC-07 production settings, SEC-08 sign-up limit behind a proxy, SEC-09 advisor limit, HC-11 savings history; the suite starts a third Express on :5053 with `NODE_ENV=production`). Not re-run: Gemini tests, performance, Lighthouse.
- **Not done (Zeeq's decision pending):** Google sign-in and notifications. Advice given: Gmail sign-in does not by itself allow notifications; push needs Web Push (service worker, any account) and email needs a mail service.

## UI3.6 (Nov 5, current)
UI3.5 plus line art for every module, a page background and glass cards. Saved in `ui-versions/UI3.6`; UI3.5 is kept as it was.
- **Line art per module** (`MOTIFS`, `MODULE_MOTIF` in `components/ui/Guilloche.jsx`, drawn by `PageHeader` on every module page):
  - **Drawings:** Spend Analyser woven band (unchanged), Advisor sound-wave arcs, Loan nested balances on the real amortisation curve, Goals contour map to a summit, Insurance safety net, Health heartbeat traces.
  - **What moves them:** `energy` comes from the page: share of income spent, health index / 100, and a reply being written on the Advisor. They animate only after an event and then stop.
- **Background** (`components/Backdrop.jsx`, `.backdrop`): soft light in the module colour, yellow and sky blue, plus a large faint copy of the module's drawing in two corners. It is painted once per module, theme or resize and never animates.
- **Glass cards:** every `.card` is frosted glass (blur 20px, 38–66% white in light, 46–62% navy in dark) under `:root[data-glass='on']`.
  - **Stays solid:** `.card-gold`, dialogs, menus, form fields and `.card-solid`.
  - **Switch:** "Glass effect" in the account menu and a layers button in the sidebar card (`ThemeContext` `glass`, localStorage `finsight-glass`, applied before first paint in `index.html`). It is also off when the device asks for reduced transparency.
- **Checks:** no sideways scroll at 375 px on any page; client build clean; Lighthouse on the sign-in page (median of 3, `evaluation/results/lighthouse_ui36.json`): mobile 95, LCP 2.53 s (26 ms over the 2.5 s target; UI3.5 was 2.50 s, so within run-to-run noise but not met), TBT 35 ms, CLS 0.009; desktop 100.
- **Not checked:** scrolling smoothness on a slow machine (the preview window was hidden, so the browser was not drawing frames). The glass switch is the fallback.

### Health Check refocused (Nov 5, Zeeq's decision)
Zeeq felt the "Can I afford this?" loan option repeated the Loan page (which already shows the same simulator as its affordability card). So:
- **Loan option removed from the Health page.** A link sends loans to the Loan page. The server still accepts `type: loan`, because `/api/loan/predict` uses it.
- **New scenario `income_drop`** {drop_pct 1–100, months 1–24} in `services/decisionSimulator.js`, a resilience check. It answers "what if I lose my job / take unpaid leave / my contract ends?"
  - **Maths:** income × (1 − pct); shortfall = −surplus; savings runway = savings ÷ shortfall; savings after = savings − shortfall × months.
  - **Verdict:** Tight if savings last the whole period, Risky if they run out first (or DSR > 70%).
  - **Reasons:** say how long savings last. Goal checks assume the lower income continues.
  - **UI:** presets Down 25% / Down 50% / No income, and a "Check your protection" link to Insurance.
- **Viva line:** the Loan page asks "can I afford this loan?"; Health Check asks "how does one decision, or a shock, change my whole picture?" It also ties to the "53% cannot survive 3 months without income" problem statement.
- **Tests:** unit 99/99 (2 new in `test/decisions.test.js`); functional `--no-llm` 132/132 (new HC-10).
- **Follow-up (Nov 5):** the "It is a loan or card repayment" box was also removed from "A monthly cost" (debts belong on the Loan page or in My commitments; the server still takes `is_debt`). The living check uses the lower income after an income drop.

### Profile, theme, tooltips and budgets (Nov 5)
- **Edit profile** (account menu and sidebar card, `components/ProfileModal.jsx`): name, monthly net income, age, income group (DOSM 2022 bands), household; change password. Email cannot be changed (it is the sign-in).
  - `PATCH /api/auth/me` {full_name?, monthly_income?, age?, income_group?, household_type?} → 422 on an empty name, income outside RM 0–1,000,000, age not a whole number 16–100, unknown group or household, or nothing to update; returns the new user (`updateUser` in AuthContext refreshes the sidebar; `COMMITMENTS_CHANGED` reloads surplus pages).
  - `POST /api/auth/me/password` {current_password, new_password ≥ 6} → 422 on a wrong current password (not 401, so the client stays signed in).
  - `GET /api/auth/me` now also returns income_group, household_type and `households` (the Belanjawanku list).
  - In the small account menu the dialogs are mounted outside the menu, so a click inside a dialog no longer closes it.
- **Household explained** (`components/HouseholdField.jsx`, profile dialog and Health page): the RM in brackets is EPF Belanjawanku 2024/2025 Klang Valley monthly budget for a reasonable standard of living (single, public transport RM 1,970; single with a car RM 2,800; couple with two children RM 7,440, whole household); FinSight checks income minus loan repayments still covers it. Only the profile income is counted, so for a couple with a working spouse the check is strict. Belanjawanku figures for other households (e.g. a couple without children) are not in `data/referenceBudgets.js` yet.
- **Light theme is the default** for a new visitor (`ThemeContext`, `index.html`); Device must be chosen.
- **InfoTip** is a portal on `document.body` (fixed, z 70): glass cards (each blurred card is its own layer) no longer cover it.
- **Budgets over income:** the Budgets card shows the total against income and a red notice when the budgets add up to more than income; the budget dialog warns before saving a limit that would do so (saving is still allowed).
- **Tests:** unit 99/99; functional `--no-llm` 134/134 (new SEC-04 edit profile, SEC-05 change password).

## UI3.5 (Nov 5)
UI3 plus the mascot, a Home page, a dark theme and more motion. Saved in `ui-versions/UI3.5`; UI3 is kept as it was.
- **Intelligent Oyen** is an orange cat in a pale-blue hoodie (Zeeq's Blender model v6; source files in `Documents\CatMascot`, see MASCOT_HANDOFF.md). He is the mascot and the face of the AI advisor.
  - **Model:** `client/public/models/oyen.glb`, meshopt-compressed from 3.2 MB to 0.74 MB, with the clips Idle, Wave and Hop.
  - **Component:** `components/mascot/Oyen3D.jsx` (three.js, a lazy 167 KB gzipped chunk, loaded when the browser is idle) behind `Oyen.jsx`, which shows a still image first.
  - **Reactions:** "think" and "worry" are poses layered on Idle in code. The other Blender file was open with unsaved work, so no new clips were added.
  - **Where he appears:** 3D on Home and in the Advisor side column; `OyenAvatar` (2D head) on chat replies; a still render on the sign-in screen (desktop only).
  - **Triggering reactions:** `oyen('wave'|'hop'|'think'|'worry'|'idle')` in `lib/oyen.js`. The advisor thinks while waiting and hops on a reply; Home hops for a Healthy index and worries when spending exceeds income.
  - **Advisor wording:** the UI now names the advisor "Intelligent Oyen". The LLM prompt and figure rules are unchanged, so the advisor evaluation still stands.
- **Home** (`pages/HomePage.jsx`) is the first nav item and the landing page after sign-in.
  - **Content:** "Good morning/afternoon/evening, Name" (skipping Muhammad/Mohd/Nur/Siti), spent this month, left after spending, health index, one suggested next step, Oyen with a speech bubble built from the figures, and a tile per module.
  - **Data:** `/api/transactions/periods` + `summary`, `/api/profile/health`, `/api/goals`, `/api/loan/history`, `/api/insurance/history`.
- **Theme:** Light / Dark / Device (`context/ThemeContext.jsx`, saved in localStorage, applied before first paint by an inline script in `index.html`).
  - **Colours:** dark mode is a navy palette under `:root[data-theme='dark']`.
  - **Yellow surfaces:** `.card-gold`, `.on-gold` and `.btn-primary` keep navy text and light inner panels in both themes.
  - **Brand bar:** the sidebar and phone bar use `bg-bar` / `.on-bar`.
- **Glass:** only Oyen's bubble, the phone bars, the account menu and the dialog scrim. Light text is now navy, taken from the mascot.
- **Motion:** cards glow in the module colour and tiles lift on hover; buttons rise; nav chips tilt; a scroll-progress line runs across the top; the Home hero has a decorative parallax; Oyen follows the pointer and leans on scroll. Content never waits for scrolling, and reduced motion is respected.
- **Performance (Lighthouse, sign-in page):** mobile 95, LCP 2.50 s (at the 2.5 s limit; UI3 2.42 s), desktop 100 (`evaluation/results/lighthouse_ui35.json`, `performance_summary.md`).
  - **How it was kept under 2.5 s:** the signed-in app shell (`components/AppShell.jsx`) and the register page load on demand (sign-in JS 73 KB gzipped), and the headline font is preloaded.
- **Checks done:** checked at 375, 768 and 1280 px in both themes with no sideways scroll; client build clean. Not re-run: the API tests, since this round changed no server code.

## UI versions (Nov 2)
Before Nov 5 the project was not in git, so looks are kept in `ui-versions/` (`node ui-versions/restore.js UI2`). **UI1** dark charcoal, sidebar, stat cards (rebuilt from edit history). **UI2** light jade, banknote style, top bar, sentence headlines, heavy motion: Zeeq found it uneasy to browse and likely to confuse new users. **UI3 (current)** yellow theme: yellow sidebar with plain descriptions, pale yellow page, white cards, fixed page names with a plain sentence, summary cards, donut chart back (hand-drawn SVG, hover or tap a slice), one colour per module on small things (Spending blue, Advisor purple, Loan green, Goals orange, Insurance pink), first-run "Start here" guides, results scroll into view, goal tiles open the right form. UI2's engraved band is kept behind the Spend Analyser header, swelling with the share of income spent. Motion is short and answers actions; nothing waits for scrolling. Dark theme is planned later. Rules: `client/DESIGN.md`.

## Evaluation scope (decided Oct 29)
Chapter 4 evaluates **functionality and performance** of the web app against the proposal's objectives, **not UAT** (no user study).
- **Functional:** TC01–TC11 extended per module, run against the real API/UI, expected vs actual recorded.
- **Performance:** API and ML-service response times (p50/p95) per key endpoint, upload time vs CSV size, concurrent-user load test, frontend load/bundle size.
- **ML:** the model metrics already recorded per module (grouped CV, test sets, backtests).

**Functional results (Nov 1):** `node evaluation/functional/run.js` (`--no-llm` skips Gemini). Run 1: 97/105, all TC01–TC11 passed, 7 real defects + 1 test-script error. Run 2 after fixes: **108/108**, plus a UI smoke test of login, upload and all 5 pages with no console errors. Results and limits: `evaluation/results/functional_results.md`, `defect_log.md`. The suite starts its own Express instances on :5051 (no ML, no LLM, settings locked) and :5052 (no MySQL) and deletes its `ft-*@finsight.test` users.
**Performance results (Nov 1):** `node evaluation/performance/run.js` plus Lighthouse. All targets met: reads p95 ≤ 14 ms, ML through the API p95 ≤ 28 ms, Gemini p50 2.0 s (slowest 5.5 s, n=10), 5,000-row upload 6.0 s, 25 users 0 failures (reads p95 75 ms, ML p95 401 ms). Reads level off at ~600–800 req/s, ML at ~95 req/s. Mobile LCP missed at 2.76 s, fixed to 2.30 s by lazy-loading module pages in `App.jsx` (login JS 229 → 78 KB gzip). After UI3 (Nov 2): mobile score 96, LCP 2.42 s, FCP 2.12 s (still above Lighthouse's 1.8 s "good" level), TBT 17 ms, CLS 0; desktop 100; functional suite re-run 108/108. Targets are published limits (Nielsen 1993, Core Web Vitals) because Chapter 3 sets none. Summary and limits: `evaluation/results/performance_summary.md`.
**Report to-do:** Chapter 3 mentions functionality and ML evaluation only, so add the performance evaluation and these targets to it.
**Functional re-run (Nov 3, after Phase 1):** 109/110 passed, 0 failed, 1 blocked (ADV-L5: Gemini did not answer that one request, so the offline fallback replied). M4-01 now uses a fresh user per boundary because goals share the surplus; new M4-17 (shared surplus) and M4-18 (commitments lower the surplus, DSR, loan prefill).

**Functional re-run (Nov 3, after Phase 2):** 110/113 passed, 0 failed, 3 blocked (ADV-L2, L5, L6: Gemini returned 503 "high demand" / timed out, server log confirms; the offline fallback answered). `--no-llm` run: 107/107. New M1-25 (XLSX with preamble), M1-26 (manual entry), M1-27 (recurring + forecast + hide).

## Integration plan (Nov 3)
Critical review, related work (Belanje, Malaysian bank apps, Monarch, DBS NAV, Credit Karma…) and the phased plan: `research/system_review_nov2026.md`. Main finding: no reviewed app documents one "can I afford this?" check joining real spending, DSR/default risk and goal readiness; FinSight has the parts. Phases: 1 foundation ✅ Nov 3 (commitments, financial profile, shared goal surplus, ledger sort/filter, years to target, InfoTip) · 2 behaviour ✅ Nov 3 (recurring detection, spending forecast vs baselines, XLSX + manual entry, MAD anomaly comparison; evaluated on Berka) · 3 decisions ✅ Nov 4 (decision simulator, Financial Health Index, loan page affordability-first + stress test, debt payoff planner, zakat) · 4 advisor grounding (history turns, computed context, reply validator, evaluation) · 5 insurance reframed as protection/resilience (check with supervisor) · 6 PDF e-statements (needs the user's real PDFs) + English/Malay · 7 re-verify.
Facts to fix in the report: "36% vs 42% global" literacy figure is unconfirmed (S&P global ≈ 33%; use Loke et al. 2022); "53% cannot survive 3 months" is RinggitPlus **2020**, not 2023.

## Functional Test Cases

| Code | Input | Expected |
|------|-------|----------|
| TC01 | Register new user | 201 + JWT + user in DB |
| TC02 | Login wrong password | 401 |
| TC03 | Upload valid Bank Islam CSV | 201 + categorised + charts update |
| TC04 | Upload .jpg | 422 + error, nothing saved |
| TC05 | Loan: income RM5,000, existing commitments RM2,500, no new loan | DSR = 50% → Moderate band |
| TC05b | Car RM80,000, 10% down, 5.5% effective, 9 yrs | Loan RM72,000, RM846.72/month, interest RM19,445.74, total RM91,445.74 (reducing balance) |
| TC05b-F | Same car at 3% flat (agreement before 1 Jun 2026) | RM846.67/month, interest RM19,440, effective rate 5.5%, tip names the law change |
| TC05c | House RM400,000, 10% down, 4.5% reducing, 30 yrs, income RM6,000, commitments RM1,000 | RM1,824.07/month, DSR ≈ 47% → Moderate |
| TC06 | Insurance: age 55, smoker, BMI 35 | High Risk + SHAP chart |
| TC07 | Insurance: age 25, non-smoker, BMI 22 | Low Risk |
| TC08 | Haji, M40, target RM23,500, 60 months, piggybank, RM0 saved | Required ≈ RM391.67/month |
| TC09 | Kahwin needs RM1,500/month, surplus RM800 | Not Feasible + adjusted date |
| TC10 | House RM400,000, 10% down, 4.5%, 30 yrs, income RM6,000, debt RM1,000 | Instalment ≈ RM1,824; DSR ≈ 47% |
| TC11 | Car loan pushing DSR > 70% | Warning + "Not recommended" |

---

## Related Work (Chapter 2)
YNAB · Mint · Credit Karma · Seedly · PolicyStreet · **replace Robinhood** with StashAway (Goals) or myTH (Tabung Haji app).

---

## Viva Quick Reference

| Question | Answer |
|----------|--------|
| Why Node/Express + a Python service? | Express handles web/I/O (auth, uploads, CRUD, LLM calls). Python is the ML ecosystem (scikit-learn, XGBoost, SHAP). A separate stateless ML microservice keeps concerns apart and is a common industry pattern. |
| Why different interest formulas for car and house loans? | Until 2026 Malaysian car hire purchase and most personal loans were quoted at a flat rate, which hides the real cost: 3% flat over 9 years costs the same as 5.5% on a reducing balance. The Hire-Purchase (Amendment) Act 2026 moved new car HP to an effective rate from 1 Jun 2026, and BNM bans flat-rate personal financing from 1 Jan 2027, so FinSight now defaults to the effective rate for every loan, keeps flat only for older or still-flat quotes, and always shows a flat quote's effective equal. House loans float, so only they get the +2-point rate stress test. |
| Why train XGBoost on fewer features than Kaggle solutions? | Only features a normal user can provide at input time; grade/interest rate (Lending Club's own risk verdict) are excluded to avoid leakage. Ratio features handle the non-MYR currency. Trade-off: lower AUC (0.697), but the model is usable in the real app. |
| Why Lending Club, not Home Credit? | It has the borrower's existing debt ratio (DTI), which maps directly to DSR, plus instalment, term and purpose. It is public with no login. Home Credit has no existing-debt column. |
| Why is the score "reference only" for house/car loans? | The training data only has 3–5 year personal loans. For inputs beyond the training range the model would extrapolate, so the verdict falls back to DSR. Knowing where a model applies is part of using it responsibly. |
| Why XGBoost for loan, LogReg for insurance? | Loan prioritises accuracy; insurance prioritises interpretability (SHAP). A depth-3 tree scored about the same on insurance (AUC 0.949 vs 0.953), so LR costs nothing in accuracy and gives exact, additive explanations. |
| Why "above the median" as the insurance target? | The top quartile is 93% smokers, so the model would just ask "do you smoke?". The median split keeps age and smoking both meaningful, which the explanation needs. |
| Why no gender or region in the insurance model? | Region is US-only. Gender added no accuracy (CV AUC 0.947 either way) and pricing on gender raises fairness concerns. |
| Is your SHAP real SHAP? | Yes. For a linear model with independent features, SHAP values are exactly coefficient × (value − mean) on the model's scale. The training script checks that they add up to the model output. |
| Why Asian BMI cut-offs? | The Malaysian CPG on obesity uses lower cut-offs (23 overweight, 27.5 obese) because Asians have higher health risk at the same BMI. |
| Is anomaly detection ML? | No. Per-category Z-score, a statistical method. |
| Where does the categoriser's training data come from? | No labelled Malaysian bank dataset is public, so I labelled ~330 real Malaysian merchants and generated statement-style descriptions in the real Bank Islam/CIMB formats, plus a public US set. It is tested on merchants it never saw (grouped CV), a hand-labelled unseen set and a real statement. |
| Why not just use the keyword rules? | They only know merchants someone typed in: 45% on unseen merchants vs 72% for the hybrid. The hybrid keeps rule matches when the model is unsure, so it is at least as good as the rules on every test set. |
| The proposal said Random Forest. Why Logistic Regression? | I trained both and compared them on merchants neither had seen. LogReg + rules won on every test set (72% vs 68% in grouped CV, 98% vs 91% on a real statement) and is 35x smaller. TF-IDF text features are sparse and high-dimensional, which suits a linear model; RF only samples a few features per split. Choosing by evidence is the point of the comparison. |
| Why no live bank API? | Malaysia's open banking is still fragmented. FinSight imports what users already receive: the monthly PDF e-statement (most users can't find a CSV export, and many banks have none), plus CSV/XLSX exports. |
| Why doesn't FinSight show insurers' prices? | Recommending specific insurance products is regulated work for licensed agents and advisers, real premiums depend on underwriting, and there is no public quote data. So the user brings quotes they received and FinSight checks each against their own budget, protection gap and an example hospital bill, without naming a best insurer. |
| How does FinSight handle personal data? | It follows the PDPA 2010 rights: a privacy notice says what is kept and that the advisor sends a summary of figures to the LLM provider; users can download all their data or delete the account (one database transaction over every table). Uploaded files are deleted after reading, PDF passwords are never stored, and sign-in is rate-limited. |
| How do you know the PDF reader read the statement correctly? | Every statement checks itself: each row must turn the previous balance into the printed new balance, and the result must match the closing balance or the bank's own debit/credit totals. On 6 real CIMB and Bank Islam statements, 312/312 rows passed and every total matched. The user sees these checks in a preview before anything is saved, and any row that fails is reported, not hidden. |
| How is the AI Advisor evaluated? | Scenario-based functional tests: answers use the right figures from the DB, never invent goals or amounts, give the not-licensed disclaimer, and fall back cleanly when the LLM fails; plus response time. It is prompting with live data, not a classifier. |
| Why drop stock sentiment? | Supervisor decision: low relevance to 18–40 users and weak Malaysian news coverage. Life-goal planning is a more common, culturally specific need. |
| Where's the AI in the Life Goals Planner? | Gold price forecasting (ARIMA, rolling backtest: 11.6% MAPE at 12 months vs 18.4% for naive), feasibility scoring from real spending, and goals fed into the AI Advisor. The savings maths is deterministic by design. |
| Why plan gold goals at the cautious rate? | Gold is volatile (1-year cautious rate is negative). Planning at the 80% lower bound means the plan still works if prices come in low; the expected and optimistic figures are shown alongside. |
| Why ARIMA and not Prophet or LSTM? | Monthly gold prices are close to a random walk with drift; ARIMA is the standard, explainable model for that and is benchmarked against naive and drift baselines. Prophet's strengths (seasonality, holidays) don't apply to gold, and it has no Python 3.14 build. |
| Why these five goals? | They are the largest common life expenses for Malaysians aged 18–40. House/Car connect to Module 3 via DSR. |
| What joins the modules together? | The financial profile (one surplus, DSR and savings for every module), shared goal surplus, and the Health Check: a health index from all modules and a "Can I afford this?" simulator that re-runs goals, DSR, savings and the index for one decision and explains each change. No reviewed app (Belanje, Monarch, DBS NAV, Credit Karma) documents that combination. |
| How do you stop the advisor inventing numbers? | Figures are computed in code and put in the prompt, affordability is pre-computed by the simulator, and every RM/% in the reply is checked against the user's data, with one regeneration and a visible note. Measured: expected figure 10/10 vs 5/10 for the original prompt; replies with untraceable figures 0/16 vs 6/16. |
| How were recurring detection and the forecast evaluated? | On the Berka PKDD'99 Czech bank dataset (4,500 real accounts): standing orders as ground truth (precision 99.5%, recall 98.5% vs 55% precision for "paid 3+ times"); rolling-origin backtest with MASE vs naive, 3-month mean and SES. Leaving anomaly-flagged one-offs out of the history gave the best forecast. |
| Does the model retrain on user data? | No. Models are static once deployed. |
| Why Waterfall? | Fixed 28-week timeline, requirements defined upfront, FYP documentation rules. |

---

## Sources for Module 4 templates
- Utusan Malaysia (Oct 2025), *Kos haji kekal RM33,300 seorang*: https://www.utusan.com.my/nasional/2025/10/kos-haji-kekal-rm33300-seorang/
- iMoney (2026), *Wedding costs 2026*: https://www.imoney.my/articles/wedding-cost-malaysia-2026
- New Straits Times (Aug 2025), *The cost of raising a child in Malaysia*: https://www.nst.com.my/news/nation/2025/08/1260793/cost-raising-child-malaysia

*Update the "Current Status" and "Fix List" sections as you progress.*
