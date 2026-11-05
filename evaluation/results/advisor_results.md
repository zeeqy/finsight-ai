# Phase 4 evaluation: grounding the AI advisor

Run: `node evaluation/advisor/run.js` (about 10 minutes). It uses Gemini through `server/.env`. Raw replies and per-question figures: `advisor_results.json`.

## Set-up

**Test user.** A throwaway account with:
- the demo account's 5 months of statements (June to October 2026), income RM 4,500;
- RM 8,000 emergency savings and a PTPTN payment of RM 150 a month not paid from the statements;
- two goals (Kahwin, Haji).

**Ground truth.** The figures FinSight computes for that user:

| Figure | Value |
|---|---|
| Surplus (6-month average) | RM 2,990.69 |
| October spending | RM 1,526.86 |
| Goals need | RM 2,281.99 a month |
| Kahwin needs | RM 1,919.84 a month |
| DSR | 3.33% |
| Next-month forecast | RM 1,381.17 |
| Recurring bills | RM 294.14 a month |

**Questions.** 16 typical questions:
- 10 have one figure a correct answer must contain (surplus, income, October spending, a RM 1,500 laptop, a RM 300/month gym, goals, Kahwin, DSR, forecast, recurring bills).
- 6 have no single right figure: emergency months, health score, cutting shopping, car-loan interest, TH vs ASB, a 50/30/20 budget.

**Three prompt set-ups.** Each question was asked fresh under all three; selecting a set-up is only possible when the server runs with `ADVISOR_EVAL=true`.

| Set-up | What it is |
|---|---|
| Baseline | The original prompt: raw context from the latest month; the LLM is told to "calculate the exact impact" itself |
| Computed | Profile, health index, recurring payments and forecast worked out in code; "Can I afford RM X?" answered by the decision simulator; rules against doing its own arithmetic; last 6 chat turns |
| Validated | Computed + every RM amount and percentage in the reply checked; one regeneration; a visible note if anything is still unmatched (the deployed set-up) |

**Measures** (computed by the validator, `services/advisorGrounding.js`). Each figure in a reply is:
- **grounded:** equal to a known figure (allowing rounding), or ×12 / ÷12 of one;
- **derived:** one sum or difference of two known figures;
- **unsupported:** matches nothing.

Model: Gemini (`gemini-3.5-flash` first in the fallback list), 4 Nov 2026. All 48 replies came from Gemini; none were blocked.

## Results

| | Baseline | Computed | **Validated (deployed)** |
|---|---|---|---|
| Expected figure present (10 questions) | 5/10 | **10/10** | **10/10** |
| Replies with an unsupported figure | 6/16 | **0/16** | **0/16** |
| Figures in replies | 188 | 113 | 125 |
| Grounded | 84.6% | 95.6% | 96.8% |
| Derived (one step) | 10.6% | 4.4% | 3.2% |
| Unsupported | 4.8% | 0% | 0% |
| Regenerations needed | n/a | n/a | 0 |
| Median response time | 15.8 s | 13.8 s | 12.6 s |

**What went wrong in the baseline:**
- **Wrong figures:** "Can I afford a RM 1,500 laptop?" was worked out from October alone (RM 2,973.14 left that month) instead of the average surplus, and showed an invented RM 808.85. Next month's spending was guessed at RM 1,600.00 instead of the forecast's RM 1,381.17.
- **A wrong loan figure:** the car-loan question gave a total repayment of RM 101,600. The correct flat-rate total is RM 91,440 (TC05b).
- **Missed questions:** "What is my DSR?" and the recurring-bills question were answered without the right figure, because the old context did not include them.
- **Computed set-ups:** with figures worked out in code, both answered every expected-figure question correctly and wrote no unsupported figures.

## Reading and limitations

- **Main effect.** Most of the improvement comes from giving the model the right, already-computed figures. Once it had them, it stopped inventing numbers. This matches Kang & Liu (2023): tools and retrieval, not prompting alone, remove financial hallucinations.
- **The validator was never triggered** in this run, because the computed set-up produced no unsupported figures. Its value is as a safety net for questions outside these 16, and that is not measured here. A follow-up could inject wrong figures on purpose to test it.
- **The checker is the instrument and it is lenient by design:**
  - one-step sums and differences count as supported;
  - it cannot recognise other correct arithmetic, such as percentage-of. In the baseline's 50/30/20 budget, "RM 900" (20% of RM 4,500) was marked unsupported although it is right;
  - so "unsupported" means "not traceable to the user's data", not "wrong". The "expected figure present" row is the stricter, hand-defined check.
- **Small sample:** 16 questions, one user, one run, one model. LLM output varies between runs; repeating the run would give a spread.
- **Response time** is dominated by Gemini (2 to 30 s on the day). Differences between set-ups are within that noise.

## Reference
- Kang, H., & Liu, X.-Y. (2023). *Deficiency of large language models in finance: An empirical examination of hallucination*. arXiv:2311.15548.
- Schlosky, M. T. T., Karadas, S., & Raskie, S. (2024). ChatGPT, help! I am in financial trouble. *JRFM, 17*(6), 241. https://doi.org/10.3390/jrfm17060241
