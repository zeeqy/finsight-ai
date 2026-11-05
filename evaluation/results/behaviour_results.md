# Phase 2 evaluation: recurring payments, spending forecast, anomaly rules

Run: `node evaluation/behaviour/run.js` (about 20 s). Raw numbers: `behaviour_results.json`.

**Data.** The Berka dataset from the PKDD'99 Discovery Challenge (Berka, 2000): real, anonymised transactions of 4,500 accounts at a Czech bank, 1993 to 1998. It is the only public bank-transaction dataset found that has labelled regular payments: its standing orders table (`order.asc`) lists every payment each account set up to repeat. It was used here as follows:
- **Data used:** debits with a payee account, plus cash and card withdrawals. Bank-generated lines (statement fees, penalty interest) are left out.
- **Description text:** each debit is written like a statement line ("TRANSFER YZ87144583", "CASH WITHDRAWAL").
- **Window:** the last 6 or 12 months of each account, because FinSight users usually upload 3 to 6 months.
- **Same code as the app:** the evaluation calls the deployed functions (`server/src/services/recurring.js`, `spendForecast.js`, `utils/categorizer.js`), not a copy.

The files are a mirror of the original release (https://github.com/jlacko/berka-dataset), saved in `ml-service/data/raw/berka/` (gitignored).

## 1. Recurring payment detection

**Rule** (no training):
- the same payee is paid at least 3 times;
- at least 75% of the gaps fit a weekly (5 to 9 days) or monthly (20 to 40 days) pattern;
- either every amount is within ±10% of the median, or the payee is a bill (utilities, phone, insurance, PTPTN, JomPAY) and the amounts vary by no more than a coefficient of variation of 0.5;
- no two payments on the same day.

**Scoring:**
- **Ground truth:** the standing-order payees actually paid in the window.
- **Unit:** each payee per account.
- **False positives:** anything else the rule marks, including regular cash withdrawals.
- **Baseline:** "paid 3 or more times in the window".

| Window | Accounts | Detector precision | Detector recall | F1 | Baseline precision | Baseline recall | Baseline F1 |
|---|---|---|---|---|---|---|---|
| 6 months | 4,478 | **99.5%** | **98.5%** | **0.990** | 55.1% | 99.1% | 0.708 |
| 12 months | 4,490 | **99.97%** | **98.0%** | **0.990** | 54.1% | 99.4% | 0.700 |

**Recall by standing-order type (6 months):**

| Type | Found |
|---|---|
| Household payments (SIPO) | 3,487 / 3,496 |
| Insurance (POJISTNE) | 529 / 531 |
| Other | 1,369 / 1,378 |
| Loan repayments (UVER) | 430 / 498 (86%) |

**Reading.** The regularity and amount checks keep almost all real standing orders and drop the baseline's false positives, which are mostly regular cash withdrawals.

**Limitations:**
- **Easier than real statements.** Berka standing orders are fixed amounts sent to one account number, which is easier than Malaysian statement text where the same merchant is written several ways.
- **No variable bills.** Berka has no electricity-style bills that change every month, so the bill rule is only covered by unit and functional tests (M1-27).
- **The author's own statements.** The detector was also run on the author's real Bank Islam statements (243 transactions, August to October 2026). It found nothing. The only payees present in all three months were irregular personal transfers and one small shop, so finding nothing is correct. There were no regular bills in that account, so recall could not be measured there.

## 2. Next-month spending forecast

**Setup:**
- Each account's monthly debit total is forecast one month ahead, for each of the last 12 months of 1998.
- Each forecast uses only the 6 (or 12) months before it.
- **Score:** MASE, the error divided by the in-sample one-month naive error (Hyndman & Koehler, 2006). Below 1 means better than "same as last month" on that history.
- Median APE is the typical percentage miss.

**Methods compared:**

| Method | How it works |
|---|---|
| naive | Last month again |
| mean3 | Average of the last 3 months |
| ses | Exponential smoothing, alpha picked on the account's own history |
| split | Recurring payments at their usual amount, plus exponential smoothing on the rest |
| **split_usual (deployed)** | As split, but purchases the anomaly rule flags as unusual are left out of the history |

**6 months of history (49,947 forecasts):**

| Method | Mean MASE | Median MASE | Median APE |
|---|---|---|---|
| naive | 1.376 | 0.749 | 40.9% |
| mean3 | 1.241 | 0.737 | 41.5% |
| ses | 1.260 | 0.657 | 39.3% |
| split | 1.261 | 0.659 | 39.4% |
| **split_usual** | **1.209** | **0.582** | **36.2%** |

**12 months of history (45,140 forecasts):**

| Method | Mean MASE | Median MASE | Median APE |
|---|---|---|---|
| naive | 1.155 | 0.700 | 40.6% |
| mean3 | 1.009 | 0.709 | 41.2% |
| ses | 0.955 | 0.614 | 38.3% |
| split | 0.956 | 0.617 | 38.4% |
| **split_usual** | **0.916** | **0.545** | **35.4%** |

**Reading:**
- **Deployed method wins.** split_usual is the most accurate on every measure at both history lengths.
- **Linking the anomaly rule helps.** Leaving flagged one-off purchases out of the history improves the forecast, because one-offs do not repeat. This connection between anomaly detection and forecasting is the main methodological result of this phase.
- **Split vs ses is a tie.** Counting recurring payments separately gives the same accuracy as plain smoothing (split ≈ ses). It is kept because it lets the app say how much of next month is already committed.
- **Mean MASE above 1.** With 6 months of history the mean MASE is above 1 for every method, because a few accounts with very stable histories have tiny naive errors. The median MASE is the better summary.

**Likely range:**
- The app shows an 80% range.
- The low end comes from past errors on usual spending. The high end comes from past errors against everything spent, one-offs included, because surprises only push spending up.
- Measured coverage: **69.4%** with 6 months of history and **79.3%** with 12. With short histories the range is a little too narrow, so state this as a limitation.

**Limitations:**
- Monthly spending is noisy: the typical miss is still about a third of a month's spending, so the app labels the figure an estimate.
- The data is Czech and from the 1990s, with a lot of cash use.
- Calendar effects such as Hari Raya or school fees are not modelled; with 3 to 6 months of history they cannot be learned.

## 3. Anomaly rules: Z-score (deployed) vs median/MAD

**Setup:**
- For each account's last 6 months, one purchase is added: a copy of a random real debit at 2×, 3× or 5× its category's median.
- Each rule runs on all of the account's transactions.
- **Detection rate:** the share of these injected purchases flagged.
- **Flag rate on real transactions:** how often an ordinary transaction is flagged. Some real transactions really are unusual, so this is an upper bound on false alarms.

**Rules compared:**
- **Z-score (deployed):** leave-one-out Z-score above 2.5, plus the 25% materiality floor.
- **MAD:** the same peer group, centre at the median, spread by MAD (Leys et al., 2013), threshold 3.5 (Iglewicz & Hoaglin) or 2.5.

| Injected size | Z-score detects | Z-score flags real | MAD 3.5 detects | MAD 3.5 flags real | MAD 2.5 detects | MAD 2.5 flags real |
|---|---|---|---|---|---|---|
| 2× median | 28.3% | 2.8% | 32.3% | 12.4% | 36.5% | 15.0% |
| 3× median | 36.3% | 2.6% | 43.5% | 12.4% | 53.5% | 15.0% |
| 5× median | 56.0% | 2.2% | 63.6% | 12.4% | 98.5% | 15.0% |

**Decision: keep the Z-score rule.**
- MAD catches more of the injected purchases, but it flags about one ordinary transaction in eight, against one in forty for the Z-score.
- In an app, constant alerts teach people to ignore them.
- MAD flags so much because many Berka categories, such as standing orders, have near-identical amounts. That gives a MAD close to zero, so any change looks extreme.
- The robust rule stays in the code (`computeAnomalyFlagsMad`) for this comparison.

**Limitation:** injected anomalies are synthetic. Cash and transfer categories vary a lot, so even 5× purchases are hard to flag in them. The detection rates are a lower bound for categories with steady spending.

## References
- Berka, P. (2000). Guide to the financial data set. *PKDD 2000 Discovery Challenge*, 87–92.
- Hyndman, R. J., & Koehler, A. B. (2006). Another look at measures of forecast accuracy. *IJF, 22*(4), 679–688. https://doi.org/10.1016/j.ijforecast.2006.03.001
- Iglewicz, B., & Hoaglin, D. C. (1993). *How to detect and handle outliers*. ASQC Quality Press.
- Leys, C., Ley, C., Klein, O., Bernard, P., & Licata, L. (2013). Detecting outliers: Do not use standard deviation around the mean, use absolute deviation around the median. *JESP, 49*(4), 764–766. https://doi.org/10.1016/j.jesp.2013.03.013
