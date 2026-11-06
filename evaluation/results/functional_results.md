# FinSight AI functional test results

Run 2026-11-06T02:33:23.102Z. **140 of 140 passed**, 0 failed, 0 blocked.

| Area | Cases | Pass | Fail | Blocked |
|---|---|---|---|---|
| Authentication & security | 25 | 25 | 0 | 0 |
| M1 Spend Analyser | 31 | 31 | 0 | 0 |
| M1 Budgets | 4 | 4 | 0 | 0 |
| M2 AI Advisor | 6 | 6 | 0 | 0 |
| M3 Loan Predictor | 20 | 20 | 0 | 0 |
| M4 Life Goals | 23 | 23 | 0 | 0 |
| M5 Insurance | 16 | 16 | 0 | 0 |
| Health Check & decisions | 10 | 10 | 0 | 0 |
| Health Check | 1 | 1 | 0 | 0 |
| ML service | 4 | 4 | 0 | 0 |

## Authentication & security

| ID | Test | Input | Expected | Actual | Result |
|---|---|---|---|---|---|
| TC01 | Register a new user | Valid name, email, password, income, age | 201 + JWT + user in DB | 201, JWT returned, user row exists | PASS |
| AUTH-01 | Password is stored hashed | Inspect users row from TC01 | bcrypt hash, not the password | bcrypt hash stored | PASS |
| AUTH-02 | Duplicate email rejected | Register the same email again | 409 | 409 | PASS |
| AUTH-03 | Missing fields rejected | Register with no password | 400 | 400 | PASS |
| AUTH-04 | Invalid email format rejected | Email "not-an-email" | 400 | 400 | PASS |
| AUTH-05 | Very short password rejected | Password "a" | 400 | 400 | PASS |
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
| SEC-01 | Login limit | 5 wrong passwords for one account, then the right one | 6th attempt 429 with a wait message; another account still signs in | 429: Too many sign-in attempts. Wait 15 minutes and try again. | PASS |
| SEC-02 | Download my data | User with a transaction, a commitment and a quote | 200 JSON attachment with every table, no password hash | 15 tables exported, no password hash | PASS |
| SEC-03 | Delete my account | Wrong password, then the right one | 422 and nothing removed; then 200, all rows gone, sign-in fails | Wrong password 422; deleted with every row; sign-in 401 | PASS |
| SEC-04 | Edit my profile | Name, income RM 5,250.50, age 30, M40, single with a car; then bad values | 200 with the new values, the financial profile uses the new income; empty name, age 12 and unknown household 422 | Saved; surplus uses RM 5,250.50; 4 bad inputs 422 | PASS |
| SEC-05 | Change my password | Wrong current password, a 3-character new one, then a valid change | 422, 422, then 200; the old password no longer signs in, the new one does | Old password 401, new password 200 | PASS |
| SEC-06 | Sign-up rules | No terms box; age 17; then terms ticked and age 25 | 400 TERMS_REQUIRED, 422, then 201 with the acceptance time saved | Refused without the box and under 18; accepted with the time recorded | PASS |
| SEC-07 | Production settings | NODE_ENV=production: headers, CORS from another site and from the real site, the web app, an unknown API path | CSP, HSTS, nosniff, no X-Powered-By; no CORS header for another site; web app at /; 404 JSON | Headers set, other sites refused, app served, 404 JSON | PASS |
| SEC-08 | Sign-up limit per visitor | Limit 3 an hour: 4 sign-ups from one IP behind the proxy, then 1 from another IP | 3 created, the 4th 429 TOO_MANY_SIGNUPS, another visitor still 201 (real IPs are used, not the proxy's) | 3 then 429; another IP unaffected | PASS |
| SEC-09 | Advisor daily limit | Limit 2 questions per 24 hours, no LLM key: three questions | Two answered, the third 429 ADVISOR_DAILY_LIMIT saying when to ask again | Third refused with a wait time | PASS |

## M1 Spend Analyser

| ID | Test | Input | Expected | Actual | Result |
|---|---|---|---|---|---|
| TC03 | Upload a valid Bank Islam CSV | CASATIA CSV, 5 rows | 201, 5 rows categorised, summary updates | 201, 5 inserted, ML engine; summary spend RM 300.00, inflow RM 2,500.00 | PASS |
| M1-01 | Categories on known merchants | TC03 rows | Income, Food & Dining, Transport, Groceries, Utilities | All 5 correct | PASS |
| M1-02 | KPIs from hand calculation | Income RM 3,000, spend RM 300 | Left RM 2,700, savings rate 90%, top Groceries | RM 2,700, 90%, Groceries | PASS |
| TC04 | Upload a .jpg | photo.jpg | 422, nothing saved | 422, row count unchanged | PASS |
| M1-03 | Empty and non-bank CSVs | Empty file; CSV with no amount column | 422, no statement record | 422 both, no statement rows | PASS |
| M1-04 | File over 10 MB | 10.5 MB CSV | 413 | 413 | PASS |
| M1-05 | Date and amount formats | DD/MM/YYYY date; "RM1,234.56"; plain "2026-10-20" | Parsed exactly, no day shift | RM 1,234.56 on 5 Oct, RM 10.50 on 20 Oct | PASS |
| M1-06 | Separate Debit and Credit columns | Row: Debit 50.00, Credit blank; row: Debit blank, Credit 200.00 | Spending RM 50, Income RM 200 | Spend RM 50, inflow RM 200 | PASS |
| M1-07 | Debit/Credit columns filled with 0.00 | Row: Debit 50.00, Credit 0.00; row: Debit 0.00, Credit 200.00 | Spending RM 50, Income RM 200 | Spend RM 50, inflow RM 200 | PASS |
| M1-08 | Debit whose description says "credit" | Bank Islam row "CREDIT CARD PAYMENT", -RM500.00 | Counts as spending, not Income | Stored as Others | PASS |
| M1-09 | Same statement uploaded twice | Upload the same CSV again | Totals do not double (rows skipped, user told) | 0 added, 5 skipped; spend stays RM 300.00 | PASS |
| M1-22 | Identical purchases in one statement | Two RM 2.00 parking rows, same day | Both kept | Both kept | PASS |
| M1-23 | Overlapping statements | Second CSV repeats 1 row and adds 1 new row | Only the new row is added | 1 added, 1 skipped, 3 rows in total | PASS |
| M1-24 | Signed money-in that mentions credit | Bank Islam row "CREDIT TRANSFER", +RM100.00; unsigned Amount column row "SALARY CREDIT" | Both count as money in | RM 100 money in | PASS |
| M1-10 | Anomaly flagged | Six purchases around RM 50, one RM 500, same merchant | Only the RM 500 flagged | Only RM 500 flagged | PASS |
| M1-11 | Materiality floor | Six around RM 100, one RM 105 (huge Z, only 5% higher) | Nothing flagged | Nothing flagged | PASS |
| M1-12 | Fewer than 5 peers | Four purchases then RM 500 | Nothing flagged | Nothing flagged | PASS |
| M1-13 | Recategorise a transaction | Change one row to Shopping | Category updated, source "user", summary moves | Shopping, source user, summary moved | PASS |
| M1-14 | Delete one, delete selected | Single delete then bulk delete of 2 | Row count falls by 3 | 5 → 2 rows | PASS |
| M1-15 | Clear a month, clear all | Two months of data | Only the chosen month goes; clear all empties | Month cleared alone, then all cleared | PASS |
| M1-16 | Script and SQL text in a description | "<script>alert(1)</script>'; DROP TABLE transactions;--" | Stored as plain text, table intact | Stored verbatim, table intact | PASS |
| M1-17 | ML service down during upload | Upload with the ML service unreachable | 201 using keyword rules | 201, engine rules | PASS |
| M1-25 | XLSX statement with a preamble | Excel file: 3 lines of account details, then Date/Description/Amount, 2 rows | 201, 2 rows, dates and signs right | 201, 2 rows; 5 Oct kept; salary as Income; broken file 422 | PASS |
| M1-26 | Add a transaction by hand | Cash RM 12.50 "nasi lemak", no category; RM 50 money in; future date; RM 0 | Saved and categorised; future date and RM 0 rejected | 201 as Food & Dining; money in as Income; future date and RM 0 give 422 | PASS |
| M1-27 | Recurring payments and forecast | 4 months: Netflix RM 54.90 on the 5th, TNB bill varying, groceries varying | Netflix fixed, TNB bill, groceries not recurring; forecast for next month; hide works | Netflix fixed, TNB bill, Lotus's not recurring; Oct forecast RM 437.5; hidden after dismiss | PASS |
| M1-28 | Locked PDF e-statement | Made-up PDF, password-locked: 5 rows, opening RM 200; no password, wrong password, preview, import, preview again | 422 asks for password; wrong one rejected; preview saves nothing and every row matches the balance; import adds 5; second preview finds 0 new | Password asked, wrong one 422; preview: 5 rows, 5/5 match balance, closing matches, nothing saved; import 201 +5; again 0 new | PASS |
| M1-29 | Broken or scanned PDF | A .pdf that is not a PDF; a PDF with no transaction table | 422 with a clear message, nothing saved | Both 422 with a message; nothing saved | PASS |
| M1-30 | Same month as CSV and PDF | Oct 2026 as a CSV (4 rows), then the same Oct as a PDF worded differently plus 1 new row; then a Jul 2026 CSV | PDF preview finds 4 already imported from another file and 1 new; import adds 1; the Jul upload reports Jul as its month, not the latest month | Preview: 4 already imported (from another file), 1 new; import +1, 5 rows stored; Jul upload focuses Jul 2026 | PASS |
| M1-31 | Month in review | Sep: groceries RM 200; Oct: groceries RM 450, transport RM 80 | Spend up RM 330; groceries the biggest mover; first month has no comparison | You spent RM 330 more than in September: RM 530 against RM 200. Groceries up RM 250 (RM 200 to RM 450). Transport: RM 80, new this month. | PASS |
| M1-32 | Dates without a time-zone shift | Transaction on 1 Oct 2026 | Ledger returns "2026-10-01" (not 30 Sep 16:00 UTC) | txn_date 2026-10-01 | PASS |
| M1-33 | Remove one uploaded file | Same month from three files (Bank Islam PDF, two CSVs), one hand-added transaction, one budget; remove the first CSV; another user tries to remove a file | Three uploads listed with bank, dates and totals; removing one deletes only its rows; the others, the hand-added row and the budget stay; another user gets 404 | 3 uploads listed; removed 2 rows of cimb-oct.csv; 4 rows, 2 uploads and the budget remain | PASS |

## M1 Budgets

| ID | Test | Input | Expected | Actual | Result |
|---|---|---|---|---|---|
| M1-18 | Create and update a budget | Set Transport to 300, then 450 | One row, limit 450 | One row, RM 450 | PASS |
| M1-19 | Custom category budget | Budget for "Takaful" | Saved | Saved | PASS |
| M1-20 | Invalid budget | No limit; negative limit | Both rejected | Both rejected | PASS |
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

## M3 Loan Predictor

| ID | Test | Input | Expected | Actual | Result |
|---|---|---|---|---|---|
| TC05 | DSR with no new loan | Income RM 5,000, commitments RM 2,500 | DSR 50%, Moderate | 50%, Moderate (service-level: the form always has a new loan) | PASS |
| TC05b | Car loan, effective rate | RM 80,000, 10% down, 5.5% effective, 9 yrs | Loan 72,000, 846.72/mo, interest 19,445.74, total 91,445.74, reducing balance | All four figures exact, reducing balance | PASS |
| TC05b-F | Car loan quoted flat (before 1 Jun 2026) | Same car, 3% flat, 9 yrs | 846.67/mo, interest 19,440, effective rate 5.5%, tip explains the law | RM 846.67, same as 5.5% effective; tip names the 1 Jun 2026 change | PASS |
| TC05c | House reducing-balance loan | RM 400,000, 10% down, 4.5%, 30 yrs, income 6,000, commitments 1,000 | 1,824.07/mo, DSR ≈ 47%, Moderate | RM 1,824.07, DSR 47.07%, Moderate | PASS |
| M3-01 | Personal loan quoted flat | RM 20,000, 6.5% flat, 5 yrs | Interest 6,500, total 26,500, 441.67/mo | All exact | PASS |
| M3-02 | Repayment schedule adds up | House and car loans | Principal sums to the loan; last balance 0 | Both add up | PASS |
| M3-03 | Full assessment saved | Predict a personal loan | Saved with XGBoost source, verdict, tips | XGBoost p=0.069, Low, verdict Affordable | PASS |
| M3-04 | Out-of-range loan is reference only | 30-year house loan | Score not used in verdict; stored as not counted | Reference only; verdict Affordable from DSR 15.2% | PASS |
| TC11 | Car loan pushes DSR above 70% | Income RM 2,000, commitments RM 600, RM 846.72/mo | Warning + Not Recommended | DSR 72.34%, Not Recommended, warning shown | PASS |
| M3-05 | Delete from history | Delete a saved assessment | Removed | Removed | PASS |
| M3-06 | ML service down | Predict with ML service unreachable | Works with a labelled rule-based score | rule_based, labelled | PASS |
| M3-07 | Tenure above the maximum | Car, 10 years (max 9) | 422 with a message | 422: Maximum tenure for a car loan is 9 years. | PASS |
| M3-08 | Unknown loan type | loan_type "boat" | 422 with a message | 422: Loan type must be personal, car or house. | PASS |
| M3-09 | Down payment above the price | Price 80,000, down 90,000 | 422 with a message | 422: Down payment cannot exceed the item price. | PASS |
| M3-10 | Zero income | monthly_income 0 | 422 with a message | 422: Monthly net income must be greater than 0. | PASS |
| M3-11 | Negative interest rate | interest_rate -3 | 422 with a message | 422: Interest rate must be a non-negative number. | PASS |
| M3-12 | Zero tenure | tenure_years 0 | 422 with a message | 422: Tenure (years) must be greater than 0. | PASS |
| M3-13 | Zero personal loan amount | loan_amount 0 | 422 with a message | 422: Loan amount must be greater than 0. | PASS |
| M3-14 | Negative commitments | existing_commitments -500 | 422 with a message | 422: Existing commitments must be a non-negative number. | PASS |
| M3-15 | House loan entered as flat rate | interest_method "flat" | 422 with a message | 422: Housing loans are charged on a reducing balance, not a flat rate. | PASS |

## M4 Life Goals

| ID | Test | Input | Expected | Actual | Result |
|---|---|---|---|---|---|
| TC08 | Haji goal, piggybank | Target RM 23,500, 60 months, RM 0 saved | RM 391.67/month | RM 391.67, On Track | PASS |
| TC09 | Kahwin beyond the surplus | Needs RM 1,500/mo for 24 months, surplus RM 800 | Not Feasible + date 45 months away | RM 1,500, Not Feasible, adjusted to 2030-08-06 | PASS |
| M4-01 | Feasibility boundaries | Surplus RM 800: ratio 0.5, 1.0, just above 1.0 | On Track, At Risk, Not Feasible | On Track, At Risk, Not Feasible | PASS |
| M4-17 | Goals share the surplus | Surplus RM 800: goal due in 12 months needs RM 400, goal due in 24 months needs RM 600 | Second goal gets RM 400 now, At Risk, catches up after the first ends | Second: RM 400 free now, At Risk, catches up | PASS |
| M4-18 | Commitments lower the surplus | Income RM 3,000, no statements, RM 500 car loan saved | Surplus RM 2,500, DSR 16.67%, loan form prefilled | Surplus RM 2500, DSR 16.67%, prefill RM 500 | PASS |
| M4-02 | Growth formula | Target RM 100,000, 120 months, 6% p.a. | RM 610.21/month (sinking fund table) | RM 610.21 | PASS |
| M4-03 | Surplus uses real spending | Income RM 5,000, RM 3,000 spent in the latest month | Goal judged against RM 2,000 | Ratio 0.50 (RM 1,000 / RM 2,000) | PASS |
| M4-04 | Haji cost by income group | Template for B40, M40, T20 | RM 15,000, 23,500, 33,300 | 15000, 23500, 33300 | PASS |
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
| M4-15 | Car loan check uses an effective rate | RM 80,000, 10% down, 5.5%, 9 yrs | RM 846.72/mo, reducing balance | RM 846.72, reducing balance | PASS |
| M4-16 | Loan check on a non-loan goal | goal_type kahwin | 422 | 422 | PASS |
| M4-19 | Savings found in statements | Tabung Haji goal; RM 200 transfer to LEMBAGA TABUNG HAJI today | Offered once; adding raises saved by RM 200; a second answer 409 | Offered once, added RM 200, second answer 409 | PASS |
| M4-20 | House and car purchase costs | House RM 400,000, 10% down; first home due 2027 vs 2029; car 1,500cc | Stamp duty RM 8,800, legal fees RM 9,500; RM 0 by 2027, full after; road tax RM 90 | RM 8,800 + RM 9,500; first home RM 0 by 2027; road tax RM 90 | PASS |

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
| M5-12 | Add quotes | Two medical cards, one life plan; a medical quote with no annual limit | 201 x3; 422 with a message | 3 saved; invalid: Enter the annual limit. | PASS |
| M5-13 | Compare quotes | Example bill RM 20,000, 2 dependants | B: RM 150/mo, pays RM 2,900 on the bill; premiums compared within a plan type only; life gap closed | Lowest premium for medical card: Operator B, RM 150.00 a month. Least to pay yourself on the example bill: Insurer A, RM 0.00. | PASS |
| M5-14 | Quote limit and removal | Fill to 6 quotes, add a 7th; remove one | 7th 422; delete 200 then 404 | 7th refused; removed once, then 404 | PASS |

## Health Check & decisions

| ID | Test | Input | Expected | Actual | Result |
|---|---|---|---|---|---|
| HC-01 | Health index from statements | Income RM 5,000, spend RM 2,000/month, no debts, no goals, savings not given | Scored on 3 parts, savings listed as missing | Score 83 (Healthy), 3 parts, savings missing | PASS |
| HC-02 | Emergency savings and household saved | RM 12,000 savings, single; then -5 and an unknown household | Saved, savings part scored (6 months = 25); bad values 422 | 6 months of cover, 25/25; bad values 422 | PASS |
| HC-03 | Simulate a car loan | TC05b car loan against the profile | Instalment RM 846.72, surplus falls by it, down payment leaves savings | Tight; surplus RM 3000 to RM 2153.28; 4 reasons | PASS |
| HC-04 | A decision that leaves the user short | Monthly commitment of RM 4,000 on RM 3,000 surplus | Risky, the shortfall is the first reason | Risky: "You would be RM 1,000 short every month (left over falls from RM 3,000)." | PASS |
| HC-05 | Invalid decisions | Unknown type; boat loan; RM 0 purchase | All 422 | 422, 422, 422 | PASS |
| HC-10 | Income drop (resilience) | No income for 3 months, then for 12 months; RM 12,000 savings, RM 2,000 a month out; then 0% and 30 months | Savings cover 6 months: 3 months Tight with RM 6,000 left, 12 months Risky; bad input 422 | 3 months: Tight, RM 6,000 left; 12 months: Risky; bad input 422 | PASS |
| HC-06 | Zakat | Savings RM 60,000, income RM 30,000, official nisab RM 42,047 | Savings RM 1,500, income RM 0 (below nisab) | RM 1,500 on savings, RM 0 on income; gold nisab RM 48029.25 | PASS |
| HC-07 | Debt payoff plan | Card RM 6,000 at 18% (RM 300/mo), PTPTN RM 1,500 at 1% (RM 100/mo), RM 200 extra | Avalanche no dearer than snowball; both beat minimum payments | Avalanche RM 675.33 in 14 mo; snowball RM 791.86; minimum RM 1197.05 in 24 mo | PASS |
| HC-08 | Loan check includes affordability | TC05b through /api/loan/predict | Response has the simulator result with the same instalment | Affordability: Tight | PASS |
| HC-09 | Protection check | 2 dependants, 10 years, RM 50,000 cover; RM 12,000 savings, RM 7,500 debts saved; then 0 years | Emergency 6 months; need = income x 120 + debts; gap = need - savings - cover; bad years 422 | 6 months cover; need RM 607500, gap RM 545500 | PASS |

## Health Check

| ID | Test | Input | Expected | Actual | Result |
|---|---|---|---|---|---|
| HC-11 | Emergency savings over time | Set RM 1,000; add RM 500; take out RM 2,000; take out RM 200; undo; undo an older entry; profile save of RM 3,000 | 1,000 then 1,500; 422; 1,300 and the index uses it; undo back to 1,500; older undo 422; the profile save is logged as "set"; history in the data export | Balance 1,000, 1,500, 1,300, undo 1,500, set 3,000; 3 entries exported | PASS |

## ML service

| ID | Test | Input | Expected | Actual | Result |
|---|---|---|---|---|---|
| ML-01 | All models loaded | GET /health | category, loan, gold, insurance true | All 4 loaded | PASS |
| ML-02 | Rejects invalid input | Empty description list; insurance with age 5 | 422 | 422 both | PASS |
| ML-03 | Gold forecast shape | GET /forecast/gold?months=12 | Cautious < expected < optimistic; 80% band contains the median | -4.44% / 10.34% / 27.4% | PASS |
| ML-04 | Batch categorisation | 3 descriptions | 3 predictions with confidence 0-1 | Food & Dining, Utilities, Personal Transfer | PASS |
