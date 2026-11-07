# FinSight AI: report review and next steps (6 Nov 2026)

What this is: a check of your report drafts against the app as built, how to make each part academically defensible, and a to-do list up to the presentation.

Drafts checked:
- `Chapter1_Introduction.docx` (29 Apr)
- `Chapter_2_Literature_Review_v4.docx` (20 May)
- `Chapter_3_Methodology_Final.docx` (10 Jun)
- the F.BERC-4 ethics exemption form (22 Jun)

Ground rule for everything below: every number in the report must come from a file in `evaluation/results/` or `ml-service/models/*_metrics.json`, and every citation must be one you have opened yourself. Where this note suggests a new test or study, its result does not exist until you run it.

---

## 1. Read this first: two things that could hurt you at the viva

### 1.1 Your ethics form and your evidence don't match

The exemption form says:
- the project involves no human participants;
- it collects no sensitive or identifiable data.

But:
- **UAT is promised.** Objective 3 in Chapter 1 and in the form says usability will be evaluated by UAT. UAT means human participants.
- **Real bank statements were used.** The PDF import evaluation and the categoriser test used real statements. Most are yours, which is easier to defend. But the Maybank statement belongs to someone else: a third party's identifiable financial data.

What to do:
- **Show your supervisor** this mismatch before writing Chapter 4.
- **The other person's Maybank statement:** get their written consent. Report only totals (rows checked, rows matched), never content. Ask your supervisor whether the exemption covers it. If it doesn't, drop that statement from the report and keep the synthetic Maybank unit test.
- **Your own statements:** say so in the report ("the developer's own statements, used with his consent, reported only as counts").
- **UAT:** either get ethics cover for a small usability study (section 4.10), or formally replace the UAT objective with your supervisor's agreement. Don't leave a promised UAT with no result.
- **The public launch:** keep it separate from the research. Do not report anything about public users (counts, behaviour, feedback) unless ethics approval covers it.

### 1.2 The drafts describe a different system

Chapters 1–3 were written before the build, and much of them is now wrong:

| Draft says | Built system |
|---|---|
| Backend: Flask (Ch1), FastAPI (Ch2, Ch3) | Express API + separate FastAPI ML service (hybrid) |
| Module 4: Stock sentiment with FinBERT | Life Goals Planner (Kahwin/Children/Haji/House/Car) with ARIMA gold forecast |
| Categoriser: Random Forest | TF-IDF + Logistic Regression merged with rules; RF compared and rejected |
| Forecasting: Linear Regression (Ch1) | SES on usual spending + recurring payments, compared with naive, 3-month mean and plain SES (Berka) |
| CSV only (Maybank, CIMB) | PDF e-statements (AEON, Bank Islam, CIMB, Maybank), CSV, XLSX, manual entry |
| ERD: USER, TRANSACTION, CATEGORY, BUDGET, RISK_PROFILE | 17 tables; no CATEGORY or RISK_PROFILE table |
| UI: Shadcn, glassmorphism | Own design system (UI3.6): yellow theme, glass cards with a switch, Oyen mascot |
| Evaluation: accuracy, precision, recall, F1, confusion matrix, UAT | Also ROC-AUC, PR-AUC, Brier, grouped CV, MAPE/MAE/RMSE, MASE, interval coverage, latency, load, Lighthouse; no UAT |
| Health Check, decision simulator, debt planner, zakat, quote comparison, data rights | Not mentioned anywhere |

The title has also changed: it is now "…Personalised Financial Management…". Rewrite the drafts from the built system, not by patching sentences.

---

## 2. Strengths to make visible

These are real and documented. The report should lead with them.

1. **Every model is compared with a simpler baseline.** Report each one as "candidates compared, evidence decided":

   | Task | Comparison | Result |
   |---|---|---|
   | Categoriser | LogReg vs RF vs rules | Hybrid 72.1% vs rules 44.8%, unseen merchants, grouped CV |
   | Loan model | XGBoost vs LogReg | AUC 0.697 vs 0.671 |
   | Insurance model | LR vs smoker-only rule vs depth-3 tree | AUC 0.953 vs 0.758 vs 0.949 |
   | Gold forecast | ARIMA vs naive vs drift | 12-month MAPE 11.6% vs 18.4% vs 11.5% |
   | Anomalies | Z-score vs MAD | |
   | Spending forecast | Several methods vs naive | Median MASE 0.582 vs 0.749 naive |

2. **Leakage was avoided on purpose.** The loan model leaves out `grade` and `int_rate`, and has an out-of-range guard. It's a lower AUC, but you can defend it.
3. **Explanations are exact.** SHAP for the linear model is computed exactly, and the training script checks it.
4. **LLM figures are checked.** Advisor grounding was measured:
   - expected figure present: 10/10 vs 5/10
   - replies with an untraceable figure: 0/16 vs 6/16
5. **The PDF reader checks itself.** On real statements, every row reconciled with the running balance and every closing balance and bank total matched.
6. **Testing is broad.** 141 automated functional tests, 104 unit tests, a performance benchmark, Lighthouse, and a defect log with fixes.
7. **The domain detail is Malaysian.** DSR, the 2026 hire-purchase and personal-financing rules, Asian BMI cut-offs, Belanjawanku, zakat nisab, Tabung Haji/ASB rates, all with sources (`research/sources_rates_costs_nov2026.md`).

## 3. Weaknesses, and how to deal with them honestly

| Weakness | How to present it | Possible strengthening (only counts once actually done) |
|---|---|---|
| Loan, insurance and categoriser models were trained on US data or generated text | Limitation plus why: no public labelled Malaysian data exists | None realistic before January; name it as future work |
| Loan AUC is modest (0.697) | Leakage-free and only uses features a user can give; band default rates show it ranks risk (Low 9.8%, High 38.8%) | Temporal split (train ≤2014, test 2015–16); bootstrap CI for AUC |
| Small real test sets for the categoriser (43 rows) | Say n, and call it a sanity check, not the main result | McNemar test on the grouped-CV predictions, hybrid vs rules (same rows, paired) |
| Advisor evaluation: 16 questions, one run, one LLM | Say so; LLM output varies | Repeat 3 runs and report the spread |
| Gold intervals cover 61–76% (target 80%) | Already stated: the 2024–26 rally made them too narrow | None needed; it's an honest finding |
| No user study | Section 3.10 | SUS study if ethics allows |
| Health index weights are a design choice, not validated | "Inspired by FinHealth, scored from data, not a validated scale" | None needed; state it |

---

## 4. Section-by-section: how to strengthen the report

### 4.1 Problem statement (Ch1)

- **Fix the two facts:**
  - "36% vs 42% global" is unconfirmed. Use Loke et al. (2022): fewer than 40% of Malaysians reach the minimum knowledge score.
  - "53% cannot survive 3 months" is RinggitPlus **2020**, not 2023.
- **Remove uncited claims or find a source**, e.g. "Most users abandon spreadsheet-based tracking within weeks". There's also a "- citate" note left in the draft.
- **Grammar:** "the lack of financial illiterate" should be "low financial literacy".
- **Rewrite as 3–4 problems the system actually answers:**
  1. Spending data is hard to analyse (statements are PDFs; categories are manual).
  2. Big decisions (loans, goals) are made without checking affordability against real spending and DSR.
  3. Major Malaysian life goals are saved for informally.
  4. Generic AI chat gives unverified figures.

  Each problem should map to one module and one research question.

### 4.2 Research objectives

Three is fine, but they must match the build. Suggested wording:
1. **To design** a web application for Malaysians aged 18–40 that combines statement analysis, an AI advisor, loan affordability and default-risk checking, life-goal planning and insurance risk explanation in one account.
2. **To develop** it as a three-tier web application (React, Express, MySQL) with a separate Python ML service: a transaction categoriser, a loan default model, an insurance risk model with SHAP explanations, a gold price forecast, and an LLM advisor grounded in computed figures.
3. **To evaluate** the system:
   - functionality: automated functional tests against requirements;
   - performance: API latency, load, page load;
   - each model against simpler baselines on held-out data;
   - (usability, only if done).

Tell your supervisor that the objectives changed and why: the module swap was agreed with them, RF was replaced by LogReg on evidence, and UAT depends on ethics.

### 4.3 Research questions (currently none)

Add them only if each has a measured answer. Ones you can already answer from existing results:
- **RQ1:** How accurately can a hybrid ML + rule categoriser label Malaysian statement descriptions from merchants it has never seen, compared with keyword rules? (`category_logreg` metrics, grouped CV)
- **RQ2:** How well can a default-risk model trained only on features a user can supply rank borrowers, and where does it stop applying? (`loan_xgb_metrics.json`, band default rates, out-of-range guard)
- **RQ3:** Does giving an LLM advisor computed figures and checking its replies reduce unsupported figures? (`advisor_results.md`)
- **RQ4:** Can bank PDF e-statements be imported reliably without bank-specific APIs? (`pdf_import_results.md`, balance reconciliation)
- **Optional RQ5:** Does an ARIMA gold forecast beat naive and drift baselines for 1–12 month planning horizons? (`gold_arima` backtest)

### 4.4 Literature review (Ch2): the weakest chapter now

Problems:
- **Too thin.** About 1,900 words, 4 references, many sections only one sentence long.
- **Comparison tables make claims with no citations.** For example "SVM: Low scalability", "Decision trees: overfitting very high", "XGBoost industry leading". Some contradict your own results (the table picks RF for categorisation).
- **Related work includes Simply Wall St (sentiment), which is no longer relevant.** MAE, Cleo, CTOS and Mint are described in one line each.

How to strengthen it:
- **One section per technique, each with peer-reviewed sources:**

  | Topic | Sources |
  |---|---|
  | Transaction categorisation | Lesner et al. 2019 (AAAI); Dong et al. 2025 |
  | Credit scoring | Lessmann et al. 2015 (EJOR benchmark); Gunnarsson et al. 2021 |
  | SHAP | Lundberg & Lee 2017 |
  | Forecast evaluation | Hyndman & Koehler 2006 (MASE); Makridakis et al. 2018 |
  | Outliers | Leys et al. 2013 |
  | LLM hallucination in finance | Kang & Liu 2023 |
  | LLM financial advice | Hean et al. 2025; Schlosky et al. 2024 |
  | Malaysian literacy | Loke et al. 2022 |
  | Young adults' financial behaviour | Sabri et al. 2022 |
  | Debt repayment behaviour | Amar et al. 2011; Kettle et al. 2016; Gal & McShane 2012 |
  | Financial health | FinHealth Score |
  | DSR, Open Finance | BNM FSR 1H2025; BNM Open Finance exposure draft |

  These are listed with DOIs in `research/system_review_nov2026.md` §8. **Open each DOI yourself before citing.** Read at least the abstract and results, and cite what the paper actually says.
- **Rewrite the comparison tables** so each cell is backed by a citation or by your own measured result. Otherwise use qualitative wording ("commonly reported to…") with a source. Replace the FinBERT table with the gold forecasting comparison (ARIMA, naive, drift, Prophet/LSTM, with why rejected).
- **Rebuild related work** from the feature grid in `research/system_review_nov2026.md` §3:
  - Malaysian: Belanje, MAE, OCTO, AKPK, Belanjawanku, RinggitPlus/iMoney, CTOS.
  - International: Monarch, Copilot, Credit Karma, DBS NAV, YNAB.
  - Keep the "Unknown means nothing public was found" wording, and add the date you checked.
- **End the chapter with the research gap** (next section).

### 4.5 Research gap

Use the gaps in `research/system_review_nov2026.md` §3.4, but phrase them carefully:
- "Among the products reviewed (list, date), none publicly documents…", not "no app does…".
- Strongest claims, each backed by your evidence:
  1. One affordability check that joins real spending, DSR, default risk and goal readiness.
  2. LLM financial replies checked against the user's own data.
  3. Categorisation of unseen Malaysian merchants, evaluated with grouped CV.

### 4.6 Methodology (Ch3)

- **Waterfall:** your actual process had iterations: UI1→UI3.6 and integration phases 1–7. Examiners notice this. Describe it honestly as Waterfall at the project level with iterative refinement inside implementation and testing. Royce (1970) himself described feedback between phases, so that's citable. The evaluation phases (functional, performance, ML) were planned and then extended.
- **Add an "ML development method" subsection.** For each model:
  - dataset (source, licence, size, preprocessing);
  - feature choice (with the leakage reasoning);
  - split / CV design (grouped, stratified, rolling origin);
  - baselines;
  - metrics and why each fits (ROC-AUC for ranking, Brier for calibration, MAPE/MASE for forecasts).
- **Datasets table:**
  - categoriser data: 4,344 own rows + 3,000 DoDataThings rows;
  - Lending Club: 396,022 loans;
  - Medical Cost: 1,337 rows;
  - gold: 321 months;
  - Berka: 4,500 accounts;
  - with licences and links. The numbers are in CLAUDE.md and the metrics files: copy them from there.
- **Requirements:** add a functional / non-functional requirements list (FR-01…, NFR-01…). These become the traceability links in section 4.9.
- **Hardware/software tables:** update them: Node 24, Python 3.14, React 19, Vite, Express, FastAPI, XGBoost, statsmodels, pdfjs, Docker, Caddy.

### 4.7 System architecture

Redraw `System_Architecture.drawio` to match the built system:
- browser → Express (:5000) → MySQL;
- Express → FastAPI ML service (internal, no auth, no DB);
- Express → Gemini/OpenAI (external, only computed figures sent, no name);
- production: Caddy (HTTPS) → app container; ML container not exposed; daily backup.

Explain why it's hybrid (CLAUDE.md viva table). Also redo:
- the **ERD**, from `server/schema.sql` + `db.js` (17 tables);
- the **use case diagram**, with Home, the 5 modules, Health Check and account/data rights;
- the **flowcharts**: drop `flowchart_sentiment_analyser_module.png`; add Life Goals, Health Check and PDF import with preview.

### 4.8 Algorithm selection

For each model, a short "candidates → evidence → choice" paragraph from your measured results (section 2, point 1). Use the RF→LogReg switch as the clearest example: "the proposal named RF; both were trained and compared on unseen merchants; LogReg + rules won on every test set". This turns a deviation into a strength.

### 4.9 Model evaluation and functional testing (Ch4)

- **Copy figures exactly** from the metrics and results files. Include the evaluation charts in `ml-service/notebooks/outputs/` (categoriser, loan, insurance, gold).
- **Report n with every percentage,** e.g. "72.1% of 4,344 rows, grouped 5-fold CV".
- **Add a traceability table:** objective → requirement → test IDs (TC01–TC11, M1-xx … SEC-xx, HC-xx) → result. 141/141 is stronger when the examiner can see what it covers.
- **Show that testing found real bugs:**
  - Run 1 was 97/105, with 7 defects; they were fixed and then 108/108 passed (`defect_log.md`).
  - The PDF reader found 2 bugs on real statements.
- **Re-run before submitting** and quote only the final run:
  - functional with Gemini, plus `--no-llm`;
  - performance;
  - Lighthouse (also turn on the accessibility category: no accessibility score is recorded yet).
- **Optional strengthening** (only report if run): McNemar for categoriser hybrid vs rules; bootstrap CIs for AUCs; temporal split for the loan model; 3 repeated advisor runs.

### 4.10 Usability testing

Current state: none done. Pick one option with your supervisor:
- **Option A (no participants, fits the exemption):**
  - **Heuristic evaluation:** go through the app against Nielsen's 10 heuristics yourself and label it clearly as a self-assessment.
  - **Accessibility audit:** Lighthouse accessibility plus WCAG 2.1 AA spot checks (contrast, keyboard, 375 px).
  - **Report it honestly:** it shows design care but is not evidence of user satisfaction, so say so.
- **Option B (small study, needs ethics confirmation first):**
  - **Who:** 5–10 participants, anonymous.
  - **Data:** the seeded demo account only, so no participant's financial data.
  - **Procedure:** set tasks (upload a sample statement, check a loan, create a Haji goal), then the System Usability Scale (Brooke 1996).
  - **Ethics:** form C2 item 4 ("consumer acceptability tests that do not collect sensitive / identifiable data") may cover this, but the ethics committee or supervisor must confirm before you run anything.
  - **What to report:** only the scores you actually collect, with n.

### 4.11 Discussion and limitations (Ch5)

Structure them as threats to validity:
- **Internal:**
  - generated categoriser text;
  - single-run LLM evaluation;
  - the developer wrote both the system and the tests.
- **External:**
  - US loan and insurance data;
  - 4 banks tested, savings and current accounts only;
  - small real statement sets.
- **Construct:**
  - "default" in Lending Club ≠ Malaysian bank default;
  - "higher-cost profile" ≠ a premium;
  - the health index is not a validated scale.

Each limitation should come with future work:
- BNM Open Finance (proposed from 1 Jan 2027);
- local OCR feeding the same balance-checked reader;
- learning from user category corrections;
- a Malaysian loan dataset if one becomes available;
- Bahasa Malaysia.

---

## 5. To-do list

### A. Before anything else (this week)
- [ ] Meet your supervisor. Show the app and these changes:
  - [ ] the module swap (already agreed)
  - [ ] RF → LogReg
  - [ ] Health Check and the decision simulator
  - [ ] Module 5 protection and quote comparison
  - [ ] PDF import
  - [ ] the new title
- [ ] Settle ethics: the UAT objective, the third party's Maybank statement, and whether usability Option A or B.
- [ ] Ask whether the public launch is wanted for assessment, or a demo is enough.
- [ ] Confirm the submission date, the report template and the page limits.

### B. Final project check (about 1 week)
- [ ] Walk through every page on the demo account, at 375 / 768 / 1280 px, in light and dark.
- [ ] Re-run: unit tests, functional tests (with Gemini and `--no-llm`), performance, Lighthouse (with accessibility).
- [ ] Optional strengthening runs (pick any): McNemar, bootstrap CIs, loan temporal split, 3 advisor runs.
- [ ] Freeze the code: tag the version you evaluate (`git tag v1.0-report`), so the report numbers match a commit.

### C. Report (about 4–5 weeks, the biggest item)
- [ ] Ch1: problem statement facts and citations; objectives; add research questions; update scope (modules, PDF/XLSX, banks, age 18+).
- [ ] Ch2: rebuild with peer-reviewed sources (check every DOI); cited comparison tables; Malaysian and international related work; research gap.
- [ ] Ch3:
  - [ ] honest process description
  - [ ] requirements list
  - [ ] ML method and datasets table
  - [ ] redrawn architecture, ERD, use case and flowcharts
  - [ ] updated tool tables
  - [ ] evaluation plan matching what was done
- [ ] Ch4: functional (traceability table, defects found), performance, per-model evaluation with charts and baselines, advisor evaluation, PDF import, usability (whichever option).
- [ ] Ch5: objectives achieved (each with its evidence), limitations as threats to validity, future work.
- [ ] Appendices: test case list, reference/rate sources, defect log, user guide screenshots.
- [ ] Final check: every number traced to a results file; every citation opened; consistent title and module numbering.

### D. Publish (after the report is mostly written; about 1 week)
- [ ] Private GitHub repo, push (check that `.gitignore` keeps out `.env`, `data_store.json` and real statements).
- [ ] Oracle Cloud + DuckDNS (you create the accounts), then follow `DEPLOY.md` and its checklist.
- [ ] No demo account with the known seed password on the public server.
- [ ] Gemini budget cap in Google's console.
- [ ] Contact email and data location filled in the build env (`VITE_CONTACT_EMAIL`, `VITE_DATA_LOCATION`).
- [ ] Test sign-up, upload, delete-account on the live site.

### E. Google sign-up (optional, after launch works)
- [ ] Decide with your supervisor if it's worth it before submission. It adds an OAuth consent screen (needs a privacy policy URL), account linking with existing email users, and new tests.
- [ ] If yes: Google Identity Services on the client, verify the ID token on Express, link by verified email, keep password sign-in; update the privacy notice, Terms, functional tests and Ch3/Ch4.

### F. Presentation (about 2 weeks before the viva)
- [ ] Slides: problem → objectives/RQs → architecture → one slide per module with its evidence → testing → limitations → future work.
- [ ] Poster: same story on one page; use the evaluation charts, not screenshots only.
- [ ] Video demo (3–5 min): demo account only. Never show real statements or the third party's data. Script it: upload PDF with preview checks → dashboard → "Can I afford this?" → loan → Haji goal → insurance SHAP → advisor with figures checked.
- [ ] Rehearse the viva with the Q&A table in CLAUDE.md. Practise the hard ones: US data, AUC 0.697, RF→LogReg, why no UAT, why no bank API.
- [ ] Backup plan: a local copy running offline and a recorded video, in case the live site or Wi-Fi fails.
