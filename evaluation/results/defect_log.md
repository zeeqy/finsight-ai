# FinSight AI functional testing: defect log

| Run | Date | Cases | Pass | Fail | Notes |
|---|---|---|---|---|---|
| 1 | 1 Nov 2026 | 105 | 97 | 8 | All original TC01–TC11 passed. 7 real defects, 1 test-script error. See `functional_results_run1.md` |
| 2 | 1 Nov 2026 | 108 | 108 | 0 | After the fixes, plus 3 new regression cases. See `functional_results.md` |

## Defects found in run 1

| Test | Severity | Defect | Cause | Fix |
|---|---|---|---|---|
| M1-07 | High: wrong totals | On Debit/Credit statements, `0.00` in the unused column made a RM 50 debit count as Income, and a `0.00` Debit dropped the RM 200 credit row | The code tested whether a column had any text, and `"0.00"` is text | Columns are compared by value (`parseAmount` in `routes/transactions.js`) |
| M1-08 | High: wrong totals | A -RM 500 "CREDIT CARD PAYMENT" was stored as Income | Any description containing "credit" counted as money in, ignoring the sign | The sign on the amount decides; keywords apply only to unsigned amounts |
| M1-09 | High: wrong totals | Uploading a statement twice doubled all spending | No duplicate check | Rows matching a stored date, description and amount are skipped and the user is told. Counted per key, so two identical purchases in one statement both stay |
| AUTH-04 | Medium: validation | `not-an-email` was accepted at registration | Only the browser form checked the format | Server checks the email format (400) |
| AUTH-05 | Medium: security | A 1-character password was accepted through the API | The 6-character rule existed only in the browser form | Server enforces the same minimum (400) |
| M1-20 | Low: validation | A negative budget limit was accepted | Only presence was checked | Limit must be above RM 0 (400) |
| M3-13 | Low: validation | A RM 0 personal loan was calculated | Item price was validated, personal loan amount was not | Loan amount must be positive (422) |

**M4-04 was not an app defect.** The test called the template endpoint without `?income_group=`. The UI does send it, so the test was corrected.

## Regression cases added

| Test | Checks |
|---|---|
| M1-22 | Two identical purchases in one statement are both kept (the duplicate check must not remove them) |
| M1-23 | An overlapping statement adds only its new rows |
| M1-24 | Money in whose description mentions "credit" still counts as money in |

## Test case wording corrected

TC03 expected "200" in the original plan. The API returns **201 Created**, which is the correct status for a new upload, so the test plan was updated and the code left as it is.

## What these tests do not cover

- **Advisor replies (ADV-L1 to L6)** come from a live LLM and can vary between runs. The script checks them with patterns, and the replies from run 1 were also read by hand. They show the behaviour held in these runs, not that it always will.
- **UI coverage is a smoke test:** login, upload, duplicate upload, the low-confidence marker and opening all five module pages, in one browser (the Claude desktop browser pane). Form-by-form UI behaviour was not tested. Calculations and rules are tested through the API.
- **Bank formats** were tested with constructed CSVs in the Bank Islam (CASATIA) and generic layouts, plus the project's sample statements. Only one real statement has been tested.
- **Statements uploaded before the fix** keep their stored categories. A statement with a debit containing "credit" must be cleared and uploaded again to correct it.
