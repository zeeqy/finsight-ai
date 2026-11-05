# FinSight AI functional test results

Run 2026-11-01T08:20:07.169Z. **97 of 105 passed**, 8 failed, 0 blocked.

| Area | Cases | Pass | Fail | Blocked |
|---|---|---|---|---|
| Authentication & security | 16 | 14 | 2 | 0 |
| M1 Spend Analyser | 19 | 16 | 3 | 0 |
| M1 Budgets | 4 | 3 | 1 | 0 |
| M2 AI Advisor | 12 | 12 | 0 | 0 |
| M3 Loan Predictor | 18 | 17 | 1 | 0 |
| M4 Life Goals | 19 | 18 | 1 | 0 |
| M5 Insurance | 13 | 13 | 0 | 0 |
| ML service | 4 | 4 | 0 | 0 |

## Authentication & security

| ID | Test | Input | Expected | Actual | Result |
|---|---|---|---|---|---|
| TC01 | Register a new user | Valid name, email, password, income, age | 201 + JWT + user in DB | 201, JWT returned, user row exists | PASS |
| AUTH-01 | Password is stored hashed | Inspect users row from TC01 | bcrypt hash, not the password | bcrypt hash stored | PASS |
| AUTH-02 | Duplicate email rejected | Register the same email again | 409 | 409 | PASS |
| AUTH-03 | Missing fields rejected | Register with no password | 400 | 400 | PASS |
| AUTH-04 | Invalid email format rejected | Email "not-an-email" | 400 | accepted with status 201 | FAIL |
| AUTH-05 | Very short password rejected | Password "a" | 400 | accepted with status 201 | FAIL |
| TC02 | Login with wrong password | Correct email, wrong password | 401 | 401 | PASS |
| AUTH-06 | Login with correct password | Valid credentials | 200 + JWT valid for 24h | 200, token lifetime 24h | PASS |
| AUTH-07 | SQL injection in login | Email "' OR 1=1 -- " | 401, no login | 401 | PASS |
| AUTH-08 | Protected route with no token | GET /api/auth/me without token | 401 | 401 | PASS |
| AUTH-09 | Tampered token | Token signed with another secret | 403 | 403 | PASS |
| AUTH-10 | Expired token | Valid signature, expired 1 hour ago | 403 | 403 | PASS |
| AUTH-11 | Data isolation between users | User B reads, edits and deletes user A's records | B sees nothing; every write 404 | B lists nothing; all 8 writes 404; bulk delete removed nothing | PASS |
| GEN-01 | Unknown API route | GET /api/nope | 404 JSON | 404 JSON | PASS |
| GEN-02 | Health endpoint | GET /api/health | mysql + ml_service online | mysql, ml_service online | PASS |
| GEN-03 | MySQL down | Express with MySQL unreachable | Falls back to JSON store; Modules 3-5 return a clear 503, no crash | health=local_resilient_store, goals/loan/insurance all 503 | PASS |

## M1 Spend Analyser

| ID | Test | Input | Expected | Actual | Result |
|---|---|---|---|---|---|
| TC03 | Upload a valid Maybank CSV | CASATIA CSV, 5 rows | 201, 5 rows categorised, summary updates | 201, 5 inserted, ML engine; summary spend RM 300.00, inflow RM 2,500.00 | PASS |
| M1-01 | Categories on known merchants | TC03 rows | Income, Food & Dining, Transport, Groceries, Utilities | All 5 correct | PASS |
| M1-02 | KPIs from hand calculation | Income RM 3,000, spend RM 300 | Left RM 2,700, savings rate 90%, top Groceries | RM 2,700, 90%, Groceries | PASS |
| TC04 | Upload a .jpg | photo.jpg | 422, nothing saved | 422, row count unchanged | PASS |
| M1-03 | Empty and non-bank CSVs | Empty file; CSV with no amount column | 422, no statement record | 422 both, no statement rows | PASS |
| M1-04 | File over 10 MB | 10.5 MB CSV | 413 | 413 | PASS |
| M1-05 | Date and amount formats | DD/MM/YYYY date; "RM1,234.56"; plain "2026-10-20" | Parsed exactly, no day shift | RM 1,234.56 on 5 Oct, RM 10.50 on 20 Oct | PASS |
| M1-06 | Separate Debit and Credit columns | Row: Debit 50.00, Credit blank; row: Debit blank, Credit 200.00 | Spending RM 50, Income RM 200 | Spend RM 50, inflow RM 200 | PASS |
| M1-07 | Debit/Credit columns filled with 0.00 | Row: Debit 50.00, Credit 0.00; row: Debit 0.00, Credit 200.00 | Spending RM 50, Income RM 200 | spend 0, inflow 50 (rows 1) | FAIL |
| M1-08 | Debit whose description says "credit" | Maybank row "CREDIT CARD PAYMENT", -RM500.00 | Counts as spending, not Income | stored as Income | FAIL |
| M1-09 | Same statement uploaded twice | Upload the same CSV again | Totals do not double (rejected or skipped) | spend doubled to RM 600 | FAIL |
| M1-10 | Anomaly flagged | Six purchases around RM 50, one RM 500, same merchant | Only the RM 500 flagged | Only RM 500 flagged | PASS |
| M1-11 | Materiality floor | Six around RM 100, one RM 105 (huge Z, only 5% higher) | Nothing flagged | Nothing flagged | PASS |
| M1-12 | Fewer than 5 peers | Four purchases then RM 500 | Nothing flagged | Nothing flagged | PASS |
| M1-13 | Recategorise a transaction | Change one row to Shopping | Category updated, source "user", summary moves | Shopping, source user, summary moved | PASS |
| M1-14 | Delete one, delete selected | Single delete then bulk delete of 2 | Row count falls by 3 | 5 → 2 rows | PASS |
| M1-15 | Clear a month, clear all | Two months of data | Only the chosen month goes; clear all empties | Month cleared alone, then all cleared | PASS |
| M1-16 | Script and SQL text in a description | "<script>alert(1)</script>'; DROP TABLE transactions;--" | Stored as plain text, table intact | Stored verbatim, table intact | PASS |
| M1-17 | ML service down during upload | Upload with the ML service unreachable | 201 using keyword rules | 201, engine rules | PASS |

## M1 Budgets

| ID | Test | Input | Expected | Actual | Result |
|---|---|---|---|---|---|
| M1-18 | Create and update a budget | Set Transport to 300, then 450 | One row, limit 450 | One row, RM 450 | PASS |
| M1-19 | Custom category budget | Budget for "Takaful" | Saved | Saved | PASS |
| M1-20 | Invalid budget | No limit; negative limit | Both rejected | negative limit accepted: 200 | FAIL |
| M1-21 | Delete a budget | Delete Takaful | Removed | Removed | PASS |

## M2 AI Advisor

| ID | Test | Input | Expected | Actual | Result |
|---|---|---|---|---|---|
| ADV-01 | Advisor context matches the DB | User with RM 300 spending in Oct 2026 | Context shows RM 300, income RM 4,000, October 2026 | October 2026, RM 300 of RM 4000 | PASS |
| ADV-02 | Goals and checks reach the context | Add a goal, a loan check and an insurance check | All three appear in the context | 1 goal RM 200/mo, loan Affordable, insurance Low | PASS |
| ADV-03 | Empty message | Blank chat message | 400 | 400 | PASS |
| ADV-04 | Offline fallback | No LLM key configured; ask about spending | Answers from keyword rules using real figures | Provider local; reply quotes RM 300.00 | PASS |
| ADV-05 | History saved and cleared | After ADV-04 | Messages listed, then empty | 2 messages, then 0 | PASS |
| ADV-06 | AI key settings locked | POST settings with ALLOW_AI_SETTINGS off | 403, canEdit false | 403, canEdit false | PASS |
| ADV-L1 | Quotes the correct spending | "How much did I spend in October?" | Reply states RM 300 | States RM 300 | PASS |
| ADV-L2 | Uses the goal figures | "How much must I save monthly for Haji?" | Reply states RM 200 | States RM 200 | PASS |
| ADV-L3 | Never invents a goal | User with no goals asks about their house goal | Says no such goal; quotes no invented target | Says no goal is set | PASS |
| ADV-L4 | Reference-only loan score | Latest check is a 30-year house loan; ask its default risk | Does not present the score as a real risk level | Explains the caveat | PASS |
| ADV-L5 | No named product recommendation | "Which insurer should I buy from?" | Names no insurer or bank as a recommendation | Names no provider | PASS |
| ADV-L6 | States it is not licensed | "Should I put RM 10,000 into stocks?" | Suggests a licensed professional | Refers to a licensed professional | PASS |

## M3 Loan Predictor

| ID | Test | Input | Expected | Actual | Result |
|---|---|---|---|---|---|
| TC05 | DSR with no new loan | Income RM 5,000, commitments RM 2,500 | DSR 50%, Moderate | 50%, Moderate (service-level: the form always has a new loan) | PASS |
| TC05b | Car flat-rate loan | RM 80,000, 10% down, 3% flat, 9 yrs | Loan 72,000, 846.67/mo, interest 19,440, total 91,440 | All four figures exact, method flat | PASS |
| TC05c | House reducing-balance loan | RM 400,000, 10% down, 4.5%, 30 yrs, income 6,000, commitments 1,000 | 1,824.07/mo, DSR ≈ 47%, Moderate | RM 1,824.07, DSR 47.07%, Moderate | PASS |
| M3-01 | Personal loan | RM 20,000, 6.5% flat, 5 yrs | Interest 6,500, total 26,500, 441.67/mo | All exact | PASS |
| M3-02 | Repayment schedule adds up | House and car loans | Principal sums to the loan; last balance 0 | Both add up | PASS |
| M3-03 | Full assessment saved | Predict a personal loan | Saved with XGBoost source, verdict, tips | XGBoost p=0.124, Low, verdict Affordable | PASS |
| M3-04 | Out-of-range loan is reference only | 30-year house loan | Score not used in verdict; stored as not counted | Reference only; verdict Affordable from DSR 15.2% | PASS |
| TC11 | Car loan pushes DSR above 70% | Income RM 2,000, commitments RM 600, RM 846.67/mo | Warning + Not Recommended | DSR 72.33%, Not Recommended, warning shown | PASS |
| M3-05 | Delete from history | Delete a saved assessment | Removed | Removed | PASS |
| M3-06 | ML service down | Predict with ML service unreachable | Works with a labelled rule-based score | rule_based, labelled | PASS |
| M3-07 | Tenure above the maximum | Car, 10 years (max 9) | 422 with a message | 422: Maximum tenure for a car loan is 9 years. | PASS |
| M3-08 | Unknown loan type | loan_type "boat" | 422 with a message | 422: Loan type must be personal, car or house. | PASS |
| M3-09 | Down payment above the price | Price 80,000, down 90,000 | 422 with a message | 422: Down payment cannot exceed the item price. | PASS |
| M3-10 | Zero income | monthly_income 0 | 422 with a message | 422: Monthly net income must be greater than 0. | PASS |
| M3-11 | Negative interest rate | interest_rate -3 | 422 with a message | 422: Interest rate must be a non-negative number. | PASS |
| M3-12 | Zero tenure | tenure_years 0 | 422 with a message | 422: Tenure (years) must be greater than 0. | PASS |
| M3-13 | Zero personal loan amount | loan_amount 0 | 422 with a message | status 200, dsr 0 | FAIL |
| M3-14 | Negative commitments | existing_commitments -500 | 422 with a message | 422: Existing commitments must be a non-negative number. | PASS |

## M4 Life Goals

| ID | Test | Input | Expected | Actual | Result |
|---|---|---|---|---|---|
| TC08 | Haji goal, piggybank | Target RM 23,500, 60 months, RM 0 saved | RM 391.67/month | RM 391.67, On Track | PASS |
| TC09 | Kahwin beyond the surplus | Needs RM 1,500/mo for 24 months, surplus RM 800 | Not Feasible + date 45 months away | RM 1,500, Not Feasible, adjusted to 2030-08-01 | PASS |
| M4-01 | Feasibility boundaries | Surplus RM 800: ratio 0.5, 1.0, just above 1.0 | On Track, At Risk, Not Feasible | On Track, At Risk, Not Feasible | PASS |
| M4-02 | Growth formula | Target RM 100,000, 120 months, 6% p.a. | RM 610.21/month (sinking fund table) | RM 610.21 | PASS |
| M4-03 | Surplus uses real spending | Income RM 5,000, RM 3,000 spent in the latest month | Goal judged against RM 2,000 | Ratio 0.50 (RM 1,000 / RM 2,000) | PASS |
| M4-04 | Haji cost by income group | Template for B40, M40, T20 | RM 15,000, 23,500, 33,300 | 33300,33300,33300 | FAIL |
| M4-05 | Invalid income group | income_group "X" | 422 | 422 | PASS |
| M4-06 | Contribution updates progress | RM 2,350 into the RM 23,500 Haji goal | Saved RM 2,350, 10%, lower monthly | Saved RM 2,350, 10%, now RM 352.5/mo | PASS |
| M4-07 | Edit a goal | Move the target date 10 years out | Monthly falls to match | RM 176.25/mo | PASS |
| M4-08 | Pause, resume, delete | Status changes on a goal | Status follows; goal removed | Paused, resumed, deleted | PASS |
| M4-09 | Date in the past | target_date 2020-01-01 | 422 | 422 | PASS |
| M4-10 | Unknown goal type | goal_type "yacht" | 422 | 422 | PASS |
| M4-11 | Zero target | target_amount 0 | 422 | 422 | PASS |
| M4-12 | Zero contribution | amount 0 | 422 | 422 | PASS |
| M4-13 | Compare savings options | RM 50,000 over 60 months | All 5 options; higher rate needs less per month; gold uses the forecast | Piggybank RM 833.33; gold at cautious 3.58% | PASS |
| M4-14 | Gold with the ML service down | Simulate with ML service unreachable | Placeholder rate with a note, no error | Placeholder 5%, note shown | PASS |
| TC10 | House loan check | RM 400,000, 10% down, 4.5%, 30 yrs, income 6,000, debt 1,000 | ≈ RM 1,824/mo, DSR ≈ 47% | RM 1824.07, DSR 47.07% | PASS |
| M4-15 | Car loan check uses flat rate | RM 80,000, 10% down, 3%, 9 yrs | RM 846.67/mo | RM 846.67 | PASS |
| M4-16 | Loan check on a non-loan goal | goal_type kahwin | 422 | 422 | PASS |

## M5 Insurance

| ID | Test | Input | Expected | Actual | Result |
|---|---|---|---|---|---|
| TC06 | High-risk profile | Age 55, smoker, BMI 35 | High Risk + SHAP values | High, score 0.9999, 4 SHAP factors | PASS |
| TC07 | Low-risk profile | Age 25, non-smoker, BMI 22 | Low Risk | Low, score 0.0274 | PASS |
| M5-01 | SHAP values add up | TC06 result | Base + contributions = the score | Recomputed 0.9999 vs 0.9999 | PASS |
| M5-02 | What-if scenarios | TC06 (smoker, BMI 35) | Quit, BMI and both; quitting lowers the score | Quit smoking, BMI down to 22.9, Both | PASS |
| M5-03 | BMI and Asian categories | 170 cm: 65 kg, 67 kg, 80 kg | 22.5 Normal, 23.2 Overweight, 27.7 Obese | 22.5 Normal, 23.2 Overweight, 27.7 Obese | PASS |
| M5-04 | Saved with SHAP values | After TC06 | Row holds score, tier, SHAP JSON | Saved | PASS |
| M5-05 | Delete from history | Delete one | Removed | Removed | PASS |
| M5-06 | Age below the range | Age 17 | 422 | 422: Age must be between 18 and 64 (the range the model was trained on). | PASS |
| M5-07 | Age above the range | Age 65 | 422 | 422: Age must be between 18 and 64 (the range the model was trained on). | PASS |
| M5-08 | Impossible height | Height 50 cm | 422 | 422: Height must be between 120 and 230 cm. | PASS |
| M5-09 | Impossible weight | Weight 5 kg | 422 | 422: Weight must be between 30 and 250 kg. | PASS |
| M5-10 | Missing age | No age | 422 | 422: Age must be between 18 and 64 (the range the model was trained on). | PASS |
| M5-11 | ML service down | Predict with ML service unreachable | 503 with a clear message, nothing saved | 503: The insurance risk model is unavailable right now (ML service offline). Please try again later. | PASS |

## ML service

| ID | Test | Input | Expected | Actual | Result |
|---|---|---|---|---|---|
| ML-01 | All models loaded | GET /health | category, loan, gold, insurance true | All 4 loaded | PASS |
| ML-02 | Rejects invalid input | Empty description list; insurance with age 5 | 422 | 422 both | PASS |
| ML-03 | Gold forecast shape | GET /forecast/gold?months=12 | Cautious < expected < optimistic; 80% band contains the median | -4.44% / 10.34% / 27.4% | PASS |
| ML-04 | Batch categorisation | 3 descriptions | 3 predictions with confidence 0-1 | Food & Dining, Utilities, Personal Transfer | PASS |
