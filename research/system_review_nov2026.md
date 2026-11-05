# FinSight AI: critical review, related work and build plan

Written 3 Nov 2026. Sources were checked on the web on that date. **[unverified]** marks claims that came only from a search snippet or secondary source; confirm them before they go into the report.

---

## 1. The short version

- **The modules are individually sound but mostly sit side by side.** Each one reads the user's data once and answers its own question. The only real links today are: the goals feasibility uses the surplus from Module 1, the goals loan-check reuses the loan maths, and the advisor prompt lists the latest result from each module.
- **No product found does what FinSight could do.** None of the 30+ apps reviewed (Malaysian, international and bank apps) publicly documents one simulation that combines (a) real spending behaviour, (b) a loan affordability or default-risk check and (c) the effect on savings goals. The closest are Monarch Forecasting (a + c, no DSR or risk test), DBS NAV Planner (a + c; its home affordability is a separate tool) and Credit Karma (a + partial b). FinSight already has the three ingredients but doesn't join them on one screen. Joining them is the project's strongest available contribution.
- **Four weaknesses an examiner could find today:**
  1. Each goal is judged as if it had the whole surplus to itself, so three "On Track" goals can need 150% of the surplus between them.
  2. The advisor asks the LLM to do the arithmetic, and nothing checks the numbers in its reply. Published studies show LLMs make maths errors in exactly this task (Schlosky et al., 2024).
  3. The loan model only applies to 3–5 year personal loans, so for car and house loans, the most common case for this age group, the ML is "reference only".
  4. The insurance model predicts US medical charges above the US median, which says little to a Malaysian choosing takaful.
- **Recommendation:** add a central **Financial Profile** layer that every module reads, and build one **"Can I afford this?" decision simulator** on top of it. Most of your 10 requested features slot into that layer rather than being bolted onto single pages.

---

## 2. Module-by-module evaluation

### Module 1: Spend Analyser: **IMPROVE**

| Area | Assessment |
|---|---|
| Functionality | Works and is well tested (108/108 functional; upload validation, duplicates and recategorising all covered). Gaps: only CSV, while most Malaysian banks give personal customers **PDF** e-statements (Public Bank is the only one with a documented personal CSV export). The ledger can search and filter by category but **cannot sort** by amount or date. |
| Technical depth | Good. TF-IDF char n-grams + LogReg merged with rules, a threshold chosen on out-of-fold CV, and a leave-one-out per-category Z-score. |
| AI/ML relevance | Justified. Rules score 45% on unseen merchants and the hybrid scores 72%. |
| Accuracy method | The merchant-grouped CV is a real strength: published work (Lesner et al., 2019; Dong et al., 2025) uses proprietary data, and none reports unseen-merchant accuracy for Malaysian descriptions. **Weaknesses:** the training text is generated from a hand-built merchant list, and the real test set is one statement of 43 rows. A bigger hand-labelled real set (ideally 2–3 statements from different people and banks) would make the claim much stronger. |
| Anomaly detection | Mean ± SD is distorted by the outliers it tries to find (Leys et al., 2013). Leave-one-out softens this. A **median ± MAD** variant is cheap to add, and comparing the two on your data is a small, defensible Chapter 4 result. |
| Practical usefulness | High, but it only looks backwards. It doesn't say what next month will look like or which payments repeat. |
| Originality | Low for tracking alone: **Belanje** (Aizztech, released Jul 2026, about 25k downloads [unverified]) already does CSV/XLSX import, shop-name categorisation, budgets, goals, a monthly "AI Coach" report, subscriptions and a zakat estimate. FinSight's edge is the measured ML categoriser and what it feeds downstream. |
| Limitations | Surplus = profile income − average spend, so: (1) declared income is used instead of income actually seen in the statements; (2) transfers to your own savings or Tabung count as "spending"; (3) a partly uploaded latest month drags the average down. |
| **Improve with** | PDF + XLSX import, manual entry, ledger sorting, **recurring payment detection**, **spending forecast**, income measured from the statements, own-account transfers excluded, MAD anomaly comparison. |

### Module 2: AI Financial Advisor: **IMPROVE (most important)**

| Area | Assessment |
|---|---|
| Functionality | Works with Gemini, OpenAI and the offline fallback; history is saved. **But each request sends only the system prompt and the newest message**, so the model has no memory of the conversation ("and what about the car?" fails). |
| Technical depth | Context injection only. The prompt hands over raw figures and instructs the LLM to "calculate the exact impact" of a purchase. |
| AI/ML relevance | The LLM is useful for explanation and conversation, but it is being used for the wrong job (arithmetic). Hean et al. (2025) measured about 70% accuracy for LLM personal-finance answers; Schlosky et al. (2024) found maths errors; Kang & Liu (2023) showed tool use removes the errors. |
| Accuracy method | Currently functional tests only. There is no measure of how often replies contain wrong or unsupported figures. |
| Practical usefulness | High once trustworthy; low if one reply quotes a wrong RM figure. |
| Originality | Credit Karma, Monarch, Cleo and Origin all have assistants that read user data, so "LLM + my data" is no longer novel. The **validation** is: no peer-reviewed study was found that checks LLM financial replies against the user's database. |
| **Improve with** | (1) The figures come from the Financial Profile and the decision simulator: deterministic code computes, and the LLM explains. (2) A **post-reply validator** finds every RM amount and percentage in the reply. Any figure not traceable to the context (allowing for rounding) is flagged, and the reply is regenerated or annotated. (3) The last few turns of history are sent. (4) **Evaluation:** a fixed set of about 30 scenario questions × 3 configurations (raw context / computed context / computed + validator), measuring the share of figures correct, unsupported claims, disclaimer present and latency. This turns Module 2 from "prompting" into a measurable experiment. |

### Module 3: Loan Default Predictor: **IMPROVE (restructure)**

| Area | Assessment |
|---|---|
| Functionality | Loan maths is correct and domain-aware (flat vs reducing balance), tested by TC05b/c, TC10 and TC11. Existing commitments are typed again on every check and never stored. |
| Dataset suitability | This is the weak point. Lending Club is US, 2007–2016, approved applicants only, and 3–5 year unsecured loans. For car (up to 9 years) and house (up to 35 years) loans the score is reference only. **So the ML part is silent for most of the decisions a 25-year-old Malaysian actually makes.** No public Malaysian default dataset exists: CCRIS and CTOS data are confidential, so say so plainly rather than looking for one. |
| Technical depth / accuracy | Good practice: leakage removed, LogReg baseline (0.671 vs 0.697), calibration via Brier score, band default rates, SHAP. Gunnarsson et al. (2021) support XGBoost as the strongest method for this kind of data. Still to add: a **temporal split** (train ≤ 2014, test 2015–16) and a calibration plot. Both are cheap. |
| Affordability vs risk | The UK FCA (CP17/27, 2017) separates **credit risk** (the lender's loss) from **affordability** (the borrower's hardship). BNM's responsible financing guidance asks lenders to assess affordability using DSR on net income [unverified detail]. FinSight's verdict already takes the worse of the two, which matches the regulators, but the page presents them as one score. |
| Practical usefulness | Affordability is what the user needs. Default probability is secondary. |
| **Improve with** | Restructure the page as **Affordability first** and **default risk (reference)** second. Affordability covers the money left after the loan against the EPF Belanjawanku reference budget for that household type, DSR with saved commitments, months of emergency buffer left, a **rate stress test** (+2% for reducing-balance loans) and the effect on each goal (via the simulator). Add the **debt payoff planner** here (avalanche vs snowball). Amar et al. (2011) show avalanche minimises interest; Gal & McShane (2012) and Kettle et al. (2016) show small-first or concentrated repayment improves follow-through, so show both with the interest cost of each. A rename to "Loan & Debt Check" keeps the module number and identity. |

### Module 4: Life Goals Planner: **IMPROVE**

| Area | Assessment |
|---|---|
| Functionality | Templates, CRUD, contributions, vehicles, gold forecast and loan-check all work. The target-date field shows a date but not "4 years 3 months" (your request). |
| Feasibility logic | **Flawed.** `computePlan` compares each goal's required monthly saving with the *whole* surplus, so every goal can be "On Track" while together they need more than the user has. The overall figure exists (`getActiveGoalPlans`) but each goal's status ignores it. Surplus also ignores loan instalments the user is about to take. |
| AI/ML | The gold ARIMA is well evaluated (a rolling-origin backtest against naive and drift, with interval coverage). The published gold forecasting studies found did not do this, which is a defensible methodological point. |
| Assumptions | Savings, TH and ASB rates are still placeholders. Use **published historical rates** (ASB dividend and TH hibah per year, from PNB and TH announcements) and plan at the low end of the last 5–10 years, as with gold. House and car cost templates are still RM0. |
| Originality | High: the Kahwin, Haji-by-income-group and children templates, Shariah-framed vehicles and gold forecast appear in no app reviewed. Goal pockets in GXBank, Boost and AEON hold real money but do no planning. |
| **Improve with** | **Surplus allocation across goals** (by priority, then target date): each goal gets its share and the status follows from that. Years and months to the target. Cited rates. A **zakat calculator** placed here, because zakat on savings uses the **nisab of 85 g of gold** (Lembaga Zakat Selangor), so it reuses the gold price data you already have. |

### Module 5: Insurance Risk Predictor: **IMPROVE, close to REPLACE**

| Area | Assessment |
|---|---|
| Model quality | Technically clean: exact linear SHAP, sensible baselines, a well-reasoned median target. |
| Target meaning | The weak point. "Annual US medical charges above USD 9,386" is a proxy for "costly lifestyle risk". The 0.953 AUC mainly reflects smoking (near-separation) and age. A Malaysian user learns roughly "smoking and age raise risk", which they already know. |
| Dataset | 1,337 rows, US, believed to be simulated from census data, with no peer-reviewed classification study. It is fine as a teaching dataset but weak as evidence. |
| Integration | None. It is the only module whose output affects nothing else. |
| Practical usefulness | Low as it stands. What young Malaysians lack is **financial resilience**: 47% had difficulty raising RM1,000 in an emergency (BNM FCI survey 2021 [unverified, secondary]). |
| **Recommendation** | Keep the trained model (it is built and evaluated), but change the module's question to **"How protected am I?"**: (1) emergency fund cover in months, computed from real essential spending; (2) a simple protection-gap estimate (income replacement for dependants minus savings); (3) the existing lifestyle risk score with SHAP as one input, labelled honestly. This links it to Modules 1 and 4 and to the Financial Health Index. Full replacement would throw away finished, evaluated work, so reframe it rather than replace it, and discuss this with your supervisor because it changes the module's framing. |

---

## 3. Related work

### 3.1 Malaysian products

| Product | Import | Auto-categorise | Budgets | AI | Loan / DSR | Goals | Forecast | Recurring | Debt plan | Zakat | BM |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Belanje** (Aizztech) | CSV, XLSX; screenshot/PDF via Share Extension (receipts or statements unclear); bank/e-wallet alerts | Yes (shop name + optional AI) | Yes | Monthly "AI Coach" report, no chat | Loan calculator; DSR unknown | Yes | Unknown | Subscription tracker (not shown to auto-detect) | IOU/debt tracking | Estimate | Website says yes |
| Maybank MAE | Own accounts only | Yes | Partial | Unknown | On M2U site | Tabung (10 goals) | Unknown | Unknown | Unknown | Unknown | Unknown |
| CIMB OCTO | Own accounts | Unknown | Unknown | Unknown | Unknown | Unknown | "Balance forecast" in old Clicks | Unknown | Unknown | Unknown | Yes |
| GXBank / Boost / AEON | Own account | Unknown | Daily limits (GX) | Unknown | Unknown | Pockets / Jars / Pot | Unknown | Unknown | Unknown | Unknown | Unknown |
| AKPK tools | n/a | n/a | Calculator | No | Calculators; "≤ 40% of income" advice | Unknown | n/a | n/a | Card payoff + DMP | Unknown | Yes |
| EPF Belanjawanku | Manual | Unknown | Reference budgets (9 households) | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown | Yes |
| RinggitPlus / iMoney | n/a | n/a | n/a | Unknown | DSR calc (RP); loan calcs (iM) | Unknown | n/a | n/a | Consolidation calc (iM) | iMoney yes | RP yes |
| CTOS / Experian | n/a | n/a | n/a | Unknown | Credit score from bureau data | n/a | n/a | n/a | Unknown | n/a | Unknown |
| RinggitWise (indie) | Unknown | Suggests from merchant | Yes | "AI coach", EN/BM | Unknown | Yes | Overspend alerts | Manual | Unknown | Unknown | Yes |

"Unknown" means nothing public was found, not that the feature is absent.

**Belanje vs FinSight.** Belanje is the closest local competitor and is ahead on input breadth (XLSX, alerts, receipts), business features, tax/PCB/SST and zakat estimators, and polish. FinSight is ahead on: a measured categoriser (Belanje publishes no accuracy), a conversational advisor over the user's own data, DSR plus default-risk checks, culturally specific goal templates with a forecast, and explainable risk. **So don't compete on tracking. Compete on decisions.** That is exactly the integration layer below.

### 3.2 International products (summary)

- **Monarch Money:** forecasting from 12 months of actual data, life events (home purchase) and linked goals. It states that it gives no probabilities.
- **Copilot Money:** a per-user ML categoriser that only applies a category when confident. This is the direct comparator for your 0.6 threshold.
- **Credit Karma (Jul 2026):** a Debt Assistant (optimiser + LLM plan), Approval Odds (*lender approval*, not default risk) and "See Why" explanations.
- **DBS NAV Planner:** cash-flow projection from 6 months of data, goals, and entering a big spend to see the impact; home affordability is a separate tool [2020–21 sources].
- **OCBC Life Goals:** goal-gap simulation with savings pre-filled from SGFinDex.
- **PocketGuard:** snowball and avalanche planner. **Rocket Money / Emma:** subscription detection. **YNAB:** manual zero-based budgeting; no first-party AI.
- **Bank of America Erica:** ML/NLP with pre-defined answers; BofA states it is *not* generative AI. A useful contrast for your validator argument.

### 3.3 Open banking in Malaysia

- **No account-data API exists today.** BNM's Open Finance exposure draft (18 Nov 2025) proposes mandatory sharing of 12 months of transactions from **1 Jan 2027** for large banks, with PayNet as the hub. No public sandbox was found.
- So CSV/PDF import remains the right choice for the FYP. Name Open Finance as future work, with a date, which is better than the vague "fragmented" wording in the viva notes.

### 3.4 Gaps FinSight can claim (with evidence)

1. A single "can I afford this?" simulation joining real spending, DSR plus default risk, and goal readiness. No product documents this publicly.
2. Checking LLM financial replies against the user's own data. No peer-reviewed evaluation was found.
3. Unseen-merchant categorisation for Malaysian statement text, evaluated with grouped CV.
4. Affordability and default risk shown separately but combined in one verdict, as the FCA and BNM frame them. Academic ML work only predicts default.
5. Recurring-payment detection and personal cash-flow forecasting are barely studied against simple baselines.
6. No transaction-based financial-health index exists for Malaysian youth. CFPB and the FinHealth Score are US survey instruments.

---

## 4. The Financial Intelligence Layer

### 4.1 Financial Profile (one service every module reads)

`server/src/services/financialProfile.js` builds, per user:

| Item | How it's computed |
|---|---|
| Income | Median of monthly Income-category inflows from statements; profile income as fallback; both shown |
| Essential vs discretionary spend | Needs/wants split already used by the 50/30/20 check |
| Recurring payments | Detected: same normalised merchant, similar amount (±15%), regular interval (weekly/monthly) for ≥ 3 occurrences; user can confirm or dismiss |
| Commitments | **New user-entered table**: loans, PTPTN, credit card, insurance/takaful, other, each with monthly amount, balance, rate and end date. Prefills the loan form, feeds DSR everywhere and the debt planner |
| Surplus | Income − average spend (own-account transfers excluded) − commitments not already in the statements |
| Emergency buffer | Savings ÷ essential monthly spend |
| Goal allocation | Surplus split across active goals by priority, then target date |
| Spending forecast | Next 1–3 months per category |

**Forecast method and evaluation:** seasonal naive, a 3-month moving average and simple exponential smoothing, compared by MASE (Hyndman & Koehler, 2006) in a rolling-origin backtest. Makridakis et al. (2018) give the reason to start simple. With only a few months of data per user, say so and evaluate on the demo account plus your own statement history.

### 4.2 Financial Health Index (explainable, transaction-based)

- **Four pillars** adapted from the FinHealth Score framework (Spend, Save, Borrow, Plan), each computed from data rather than a survey:
  - Spend: spend vs income, and the needs share.
  - Save: emergency months, and the savings rate.
  - Borrow: DSR band against BNM median DSR figures (33% outstanding, 41% new loans, FSR 1H2025).
  - Plan: goals on track after allocation.
- **Output:** a 0–100 score with three bands, and each pillar shows the figure that drove it.
- **Framing:** an indicator inspired by FinHealth, **not** a validated psychometric scale. The FinHealth Score itself needs a licence, so build your own.

### 4.3 Decision simulator: "Can I afford this?"

The user enters a decision: a car loan, a house, a big purchase, a new monthly commitment or pausing a goal. The system recomputes the profile and shows **before vs after**:

- Money left each month and against the Belanjawanku reference budget
- DSR and its band; the rate stress test for reducing-balance loans
- Emergency buffer in months
- Each goal's new status and realistic date
- Change in the Health Index, by pillar
- Default risk where the model applies, marked "reference" where it doesn't
- **Reasons:** each change is stated as a sentence built from the numbers, for example: "Your Haji goal moves from 2029 to 2031 because RM 846/month of your RM 1,200 surplus goes to the car." The advisor can explain these sentences but never computes them itself.

This is where the Loan, Goals and Advisor modules meet, and it is the contribution the related work doesn't show.

---

## 5. Your requested features: where each goes

| Request | Placement | Effort | Notes |
|---|---|---|---|
| Sorting/filtering | M1 ledger: sort by amount/date/merchant, amount range, flagged-only | Small | |
| Hover info | Shared `InfoTip` component | Small | DESIGN.md forbids hover-only, so it opens on tap and keyboard focus too |
| Years on target date | M4 form and goal cards: "in 4 years 3 months" | Small | |
| User commitments | New `commitments` table + Profile | Medium | Foundation for DSR, debt planner and simulator |
| Recurring payments | Profile, shown in M1 | Medium | Evaluate precision/recall on your labelled statements |
| Spending forecast | Profile, shown in M1 | Medium | Baselines + MASE |
| Debt payoff planner | M3 "Loan & Debt Check" | Medium | Avalanche vs snowball, interest cost of each |
| Zakat calculator | M4 | Small–medium | Savings: nisab 85 g gold × gold price, 2.5%, one haul. Income zakat rules still to be sourced (state boards differ) |
| More input types | XLSX, manual entry, **PDF e-statements** | Medium–large | PDF parsing is per bank and per layout. I need real PDF e-statements (Maybank and CIMB at least) to build and test against; they stay private like the CSV |
| English / Malay | Whole client, plus advisor reply language | Large | **Do it last**: translating before the new screens settle means translating twice |

---

## 6. Build plan

| Phase | Contents | Chapter 4 evidence it produces |
|---|---|---|
| 1. Foundation ✅ 3 Nov | Commitments table + UI; Financial Profile service (measured income, own-transfer exclusion); goal surplus allocation fix; ledger sorting; years-to-target; InfoTip | 9 new unit tests (31/31); functional M4-17, M4-18 (109/110, 1 blocked by Gemini) |
| 2. Behaviour ✅ 3 Nov | Recurring detection; spending forecast with baselines; XLSX + manual entry; MAD vs Z-score anomaly comparison | Evaluated on the Berka bank dataset (`evaluation/results/behaviour_results.md`): recurring P 99.5% / R 98.5%; forecast median MASE 0.582 vs 0.749 naive; Z-score kept over MAD |
| 3. Decisions ✅ 4 Nov | Decision simulator; Financial Health Index; loan page reframed (affordability first, stress test, Belanjawanku reference); debt payoff planner; zakat | Simulator test cases (new TCs); worked examples |
| 4. Advisor grounding ✅ 4 Nov | History turns; computed context; reply validator; scenario evaluation | `evaluation/results/advisor_results.md`: expected figure 10/10 vs 5/10 baseline; untraceable figures 0/16 replies vs 6/16 |
| 5. Resilience ✅ 4 Nov (additive) | Protection card on M5: emergency cover + needs-based life-cover gap; model unchanged | Unit + functional HC-09 |
| 6. Inputs and language (PDF ✅ Nov 4, language ⏸) | PDF e-statements ✅: a general position-based reader that checks every row against the running balance, with a preview before saving and a password prompt; tested on 3 CIMB and 3 Bank Islam statements, where all 312 rows matched the balance and every bank total matched (`evaluation/results/pdf_import_results.md`). English/Malay is on hold until asked | Parser accuracy on real statements: 312/312 rows reconciled |
| 7. Re-verify ✅ 4 Nov | Functional + performance suites re-run, docs, viva notes | Functional 122/122; all performance targets met; Lighthouse mobile 95 |

**Not recommended:**
- Deep learning categorisers or LSTM forecasts: too little data, and the literature favours simple baselines at this scale.
- A hunt for a Malaysian default dataset: none is public.
- Bank API integration before Open Finance exists.

---

## 7. Facts in CLAUDE.md to fix before the report

- "Only 36% of Malaysians understand basic financial concepts (below 42% global average)": **not confirmed.** The S&P Global FinLit Survey (2015) global figure is about 33%, not 42%. Use Loke et al. (2022) instead: fewer than 40% of Malaysians reach the minimum financial-knowledge score (OECD/INFE 2015 and 2018).
- "53% cannot survive 3 months (RinggitPlus 2023)": traces to a **RinggitPlus 2020** survey [secondary]. Fix the year or replace it with the BNM FCI 2021 figure once checked.

---

## 8. Key references

- Amar, M., Ariely, D., Ayal, S., Cryder, C. E., & Rick, S. I. (2011). Winning the battle but losing the war: The psychology of debt management. *JMR, 48*(SPL), S38–S50. https://doi.org/10.1509/jmkr.48.SPL.S38
- Bank Negara Malaysia. (2025). *Financial Stability Review – First Half 2025*. https://www.bnm.gov.my/-/fsr25h1-pr
- Bank Negara Malaysia. (2025). *Exposure draft on Open Finance*. https://www.bnm.gov.my/-/ed-ofin-25
- Belanje (Aizztech). App Store listing: https://apps.apple.com/my/app/belanje/id6784363676 · website: https://belanje.aizztech.com/
- Dong, K., et al. (2025). Transaction categorization with relational deep learning in QuickBooks. *ECML PKDD 2025*. arXiv:2506.09234
- Financial Conduct Authority. (2017). *CP17/27: Assessing creditworthiness in consumer credit*. https://www.fca.org.uk/publication/consultation/cp17-27.pdf
- Financial Health Network. (2021). *FinHealth Score Toolkit*. https://finhealthnetwork.org/score/
- Gal, D., & McShane, B. B. (2012). Can small victories help win the war? *JMR, 49*(4), 487–501. https://doi.org/10.1509/jmr.11.0272
- Gunnarsson, B. R., et al. (2021). Deep learning for credit scoring: Do or don't? *EJOR, 295*(1), 292–305. https://doi.org/10.1016/j.ejor.2021.03.006
- Hean, O., Saha, U., & Saha, B. (2025). Can AI help with your personal finances? *Applied Economics, 57*(60). https://doi.org/10.1080/00036846.2025.2450384
- Hyndman, R. J., & Koehler, A. B. (2006). Another look at measures of forecast accuracy. *IJF, 22*(4), 679–688. https://doi.org/10.1016/j.ijforecast.2006.03.001
- Kang, H., & Liu, X.-Y. (2023). Deficiency of large language models in finance: An empirical examination of hallucination. arXiv:2311.15548
- Kettle, K. L., Trudel, R., Blanchard, S. J., & Häubl, G. (2016). Repayment concentration and consumer motivation to get out of debt. *JCR, 43*(3), 460–477. https://doi.org/10.1093/jcr/ucw037
- Lembaga Zakat Selangor. *Zakat on savings*. https://www.zakatselangor.com.my/en/zakat-wang-simpanan-english/
- Lesner, C., Ran, A., Rukonic, M., & Wang, W. (2019). Large scale personalized categorization of financial transactions. *AAAI, 33*(01), 9365–9372. https://doi.org/10.1609/aaai.v33i01.33019365
- Lessmann, S., Baesens, B., Seow, H.-V., & Thomas, L. C. (2015). Benchmarking state-of-the-art classification algorithms for credit scoring. *EJOR, 247*(1), 124–136. https://doi.org/10.1016/j.ejor.2015.05.030
- Leys, C., et al. (2013). Detecting outliers: Use absolute deviation around the median. *JESP, 49*(4), 764–766. https://doi.org/10.1016/j.jesp.2013.03.013
- Loke, Y. J., Chin, P. N., & Sahul Hamid, F. (2022). Financial literacy in Malaysia, 2015–2018. *MJES, 59*(2), 171–197. https://doi.org/10.22452/MJES.vol59no2.1
- Lundberg, S. M., & Lee, S.-I. (2017). A unified approach to interpreting model predictions. *NIPS 30*.
- Makridakis, S., Spiliotis, E., & Assimakopoulos, V. (2018). Statistical and machine learning forecasting methods. *PLOS ONE, 13*(3), e0194889. https://doi.org/10.1371/journal.pone.0194889
- Monarch Money. (2026). *Forecasting*. https://www.monarch.com/blog/forecasting
- Sabri, M. F., et al. (2022). Mediating effect of financial behaviour… low-income young adults in Malaysia. *Frontiers in Psychology, 13*. https://doi.org/10.3389/fpsyg.2022.858630
- Schlosky, M. T. T., Karadas, S., & Raskie, S. (2024). ChatGPT, help! I am in financial trouble. *JRFM, 17*(6), 241. https://doi.org/10.3390/jrfm17060241

The full verified reference list (about 50 items, with DOIs), the complete feature grids for 17 international and 17 Malaysian products, and source URLs for every cell are in the research notes. Ask and I'll add them as an appendix.
