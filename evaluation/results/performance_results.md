# FinSight AI performance results (backend)

Run 2026-11-04T00:26:51.652Z. AMD Ryzen 7 7435HS, 16 threads, 44 GB RAM, Windows_NT 10.0.26200, Node v24.14.1.
Client, Express, ML service and MySQL all ran on this one laptop, over localhost, so network delay is not included and the test client shares the CPU with the servers.
Express ran under nodemon in development mode. Seed data: one user with 500 transactions over 6 months, 3 goals, 3 budgets.

Times are milliseconds. Targets were fixed before measuring: p95 ≤ 1,000 ms for reads, calculations and ML; ≤ 10,000 ms for AI chat and uploads (Nielsen 1993).

## A. Response time, one request at a time

| Area | Endpoint | n | Mean | p50 | p95 | p99 | Target | Result |
|---|---|---|---|---|---|---|---|---|
| General | GET /api/health | 100 | 3.1 | 3 | 3.9 | 4.8 | 1000 | Met |
| General | POST /api/auth/login (bcrypt) | 30 | 115.8 | 115.2 | 121.2 | 122.2 | 1000 | Met |
| Spend Analyser | GET summary (one month) | 100 | 5.3 | 5.1 | 7.1 | 7.6 | 1000 | Met |
| Spend Analyser | GET list (one month) | 100 | 3.7 | 3.5 | 4.9 | 6 | 1000 | Met |
| Spend Analyser | GET list (all 500 rows) | 100 | 8 | 7.8 | 9.9 | 10.7 | 1000 | Met |
| Spend Analyser | GET budgets | 100 | 3.3 | 3 | 5 | 6.5 | 1000 | Met |
| AI Advisor | GET advisor context | 100 | 10 | 9.7 | 11.8 | 12.3 | 1000 | Met |
| Loan | POST loan calculate (maths only) | 100 | 1.3 | 1.1 | 1.7 | 3.4 | 1000 | Met |
| Loan | POST loan predict (XGBoost + save) | 100 | 30.3 | 29.8 | 33.2 | 38.8 | 1000 | Met |
| Goals | GET goals list | 100 | 7.1 | 6.8 | 9.5 | 12.7 | 1000 | Met |
| Goals | POST goals simulate (gold cached) | 100 | 6.9 | 6.7 | 8.1 | 10 | 1000 | Met |
| Insurance | POST insurance predict (+ SHAP + save) | 100 | 12.5 | 12.3 | 14.7 | 15.1 | 1000 | Met |
| Spend Analyser | GET insights (recurring + forecast, 500 rows) | 100 | 6.7 | 6.3 | 9.3 | 12.3 | 1000 | Met |
| Health Check | GET health index | 100 | 6 | 5.8 | 7.5 | 10.1 | 1000 | Met |
| Health Check | POST simulate a car loan | 100 | 6.6 | 6.4 | 7.8 | 8.2 | 1000 | Met |
| Loan | POST debt payoff plan | 100 | 1.8 | 1.6 | 2.7 | 3.4 | 1000 | Met |
| Insurance | POST protection check | 100 | 6.2 | 5.8 | 7.3 | 7.6 | 1000 | Met |
| AI Advisor | POST chat (offline fallback) | 50 | 32.6 | 29.7 | 37.1 | 160.2 | 10000 | Met |
| AI Advisor | POST chat (Gemini, live) | 10 | 1462.4 | 1497 | 1635.2 | 1635.2 | 10000 | Met |

## B. ML service, called directly

| Model | n | Mean | p50 | p95 | p99 | Result |
|---|---|---|---|---|---|---|
| Categoriser, 1 description | 100 | 6 | 5.9 | 7.3 | 8.5 | Met |
| Categoriser, 100 descriptions | 50 | 16 | 15.8 | 17.8 | 22.8 | Met |
| Categoriser, 1,000 descriptions | 20 | 131 | 101.7 | 304.4 | 426.2 | Met |
| Categoriser, 5,000 descriptions | 10 | 494.3 | 493.7 | 536.6 | 536.6 | Met |
| XGBoost loan default | 100 | 16.4 | 15.7 | 18.4 | 21.5 | Met |
| Logistic Regression insurance + SHAP | 100 | 8 | 7.8 | 9.6 | 10.1 | Met |
| ARIMA gold forecast, 60 months | 50 | 21.9 | 21.6 | 25.1 | 27.8 | Met |

## C. Statement upload time

| Rows | Repeats | Engine | p50 (ms) | Max (ms) | ms per row | Target | Result |
|---|---|---|---|---|---|---|---|
| 50 | 5 | ml_model | 76.7 | 96 | 1.53 | 10000 | Met |
| 500 | 5 | ml_model | 558.5 | 602.7 | 1.12 | 10000 | Met |
| 2000 | 3 | ml_model | 2228.5 | 2251.2 | 1.11 | 10000 | Met |
| 5000 | 3 | ml_model | 5519.7 | 5713.6 | 1.1 | 10000 | Met |

## D. Load test, 15 seconds per level

"Reads" loops the requests behind the dashboard, goals and advisor pages. "ML" loops loan and insurance predictions, each writing a row to MySQL. Each simulated user sends its next request as soon as the last one returns, with no thinking time, so 25 here means far more traffic than 25 real people.

| Mix | Users | Requests | Req/s | Failed | p50 | p95 | p99 | Max |
|---|---|---|---|---|---|---|---|---|
| Reads | 1 | 2277 | 151.8 | 0 | 6.2 | 12.2 | 14.7 | 34.4 |
| Reads | 10 | 6032 | 402.1 | 0 | 20.9 | 54.3 | 62.9 | 100.6 |
| Reads | 25 | 5867 | 391.1 | 0 | 55.5 | 150.8 | 183.6 | 263.2 |
| Reads | 50 | 6131 | 408.7 | 0 | 108.2 | 299.3 | 350.6 | 424.9 |
| Reads | 100 | 6337 | 422.5 | 0 | 212.6 | 612.3 | 679.9 | 741.5 |
| ML | 1 | 660 | 44 | 0 | 26.7 | 32.7 | 38.1 | 74.4 |
| ML | 10 | 1453 | 96.9 | 0 | 97.7 | 165.8 | 189.7 | 334.3 |
| ML | 25 | 1447 | 96.5 | 0 | 293.7 | 400.8 | 505.3 | 598.7 |
| ML | 50 | 1404 | 93.6 | 0 | 612.6 | 781.9 | 877.1 | 1289.2 |
