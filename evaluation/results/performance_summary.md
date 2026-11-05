# FinSight AI performance evaluation: summary

Measured 1 Nov 2026 on one laptop (AMD Ryzen 7 7435HS, 16 threads, 44 GB RAM, Windows 11, Node 24). Client, Express, ML service and MySQL all ran on this machine over localhost. Full backend tables are in `performance_results.md`.

Chapter 3 sets no numeric performance targets, so these were fixed before measuring, from published limits:
- **Nielsen (1993) response-time limits:** 1 s keeps the user's flow of thought, 10 s keeps their attention.
- **Google Core Web Vitals, "good" level:** LCP ≤ 2.5 s, CLS ≤ 0.1. TBT ≤ 200 ms is Lighthouse's lab stand-in for responsiveness.

## Results against targets

| Requirement | Target | Measured | Result |
|---|---|---|---|
| Reads and calculations, one at a time | p95 ≤ 1,000 ms | Slowest p95 13.7 ms, excluding login | Met |
| Login (deliberately slow password hashing) | p95 ≤ 1,000 ms | p95 157.9 ms | Met |
| ML predictions through the API | p95 ≤ 1,000 ms | Loan 27.9 ms, insurance 16.9 ms | Met |
| AI chat, Gemini (live, n = 10) | p95 ≤ 10,000 ms | p50 2,036 ms, slowest 5,483 ms | Met |
| AI chat, offline fallback | p95 ≤ 10,000 ms | p95 21.5 ms | Met |
| Upload a 500-row statement | ≤ 10,000 ms | p50 642 ms, slowest 662 ms | Met |
| Upload a 5,000-row statement | ≤ 10,000 ms | p50 6,033 ms, slowest 6,364 ms | Met |
| 25 simultaneous users, reads | No failures, p95 ≤ 1,000 ms | 0 failures, p95 74.6 ms | Met |
| 25 simultaneous users, ML predictions | No failures, p95 ≤ 1,000 ms | 0 failures, p95 401 ms | Met |
| Page load on simulated mobile (LCP) | ≤ 2,500 ms | 2,298 ms after the fix (2,759 ms before) | Met after fix |
| Layout shift (CLS) | ≤ 0.1 | 0 | Met |
| Main-thread blocking (TBT) | ≤ 200 ms | 0 ms | Met |

No request failed across the 52,333 sent during the load test.

## Frontend: before and after code splitting

The first measurement missed the mobile LCP target because the login page downloaded the whole app, including the charts library. Module pages now load on demand (`React.lazy` in `App.jsx`).

| Login page, Lighthouse 12, median of 3 runs | Before | After |
|---|---|---|
| JavaScript needed, gzip | 229 KB | **78 KB** |
| Mobile score | 89 | **95** |
| Mobile LCP | 2.76 s | **2.30 s** |
| Mobile FCP | 2.76 s | 2.30 s |
| Mobile Speed Index | 4.59 s | **2.88 s** |
| Mobile TBT | 44 ms | 0 ms |
| Desktop score | 100 | 100 |
| Desktop LCP | 0.65 s | 0.65 s |

Lighthouse "mobile" simulates a slow 4G connection and a CPU four times slower.

**Still short of Lighthouse's "good" FCP (1.8 s) on mobile.** FCP is not one of the targets above, but it is worth reporting. The largest remaining delay was the Google Fonts stylesheet, which blocked rendering (Lighthouse estimated up to 787 ms). The redesign below self-hosts the fonts.

## Frontend: after the UI redesign (1 Nov 2026)

The redesign added a motion library, a canvas animation on the login page and self-hosted fonts, so Lighthouse was run again on the production build (median of 3 runs, `lighthouse_redesign.json`). The backend did not change, so the backend results above still stand.

| Login page | Code splitting | After redesign |
|---|---|---|
| JavaScript needed at load, gzip | 78 KB | 99 KB, plus 31 KB of animation code loaded after first paint |
| Mobile score | 95 | **97** |
| Mobile LCP | 2.30 s | 2.32 s (target ≤ 2.5 s, met) |
| Mobile FCP | 2.30 s | **2.01 s** (still above 1.8 s) |
| Mobile Speed Index | 2.88 s | **2.01 s** |
| Mobile TBT | 0 ms | 37 ms (target ≤ 200 ms, met) |
| CLS | 0 | 0 |
| Desktop score | 100 | 100 |
| Desktop LCP | 0.65 s | 0.47 s |

Self-hosting the fonts more than paid for the added JavaScript on first paint. The login animation adds a small amount of main-thread work, which is the 37 ms of TBT. Logged-in page timings were not measured again.

The figures above belong to UI2, which was later replaced. The next section has the current look.

**Logged-in pages** can't be audited by Lighthouse by default, so they were timed once in a real browser on the production build, with no throttling: login to dashboard 488 ms (including about 150 ms of password hashing), and about 270–340 ms to open each page for the first time. These are single measurements, so treat them as indicative.

## Frontend: after the UI3 yellow redesign (2 Nov 2026)

UI3 replaced UI2 for usability reasons. Lighthouse 12 was run on the production build (median of 3 runs, `lighthouse_ui3.json`). The backend did not change, so the backend results still stand. Logged-in page timings were not measured again.

| Login page | UI2 | UI3 |
|---|---|---|
| JavaScript needed at load, gzip | 99 KB | 94 KB, plus 31 KB of animation code loaded after first paint |
| Mobile score | 97 | **96** |
| Mobile LCP | 2.32 s | 2.42 s (target ≤ 2.5 s, met, with less room to spare) |
| Mobile FCP | 2.01 s | 2.12 s (still above 1.8 s) |
| Mobile Speed Index | 2.01 s | 2.12 s |
| Mobile TBT | 37 ms | 17 ms (target ≤ 200 ms, met) |
| CLS | 0 | 0 |
| Desktop score | 100 | 100 |
| Desktop LCP | 0.47 s | 0.51 s |

After sign-in, the other module pages now download in the background, so switching between them is quicker. That does not affect the login page figures.

## After the integration phases (4 Nov 2026)

Phases 1 to 5 added:
- a shared financial profile and the Health Check page with its health index and decision simulator;
- recurring payments and a spending forecast;
- a debt planner, zakat and protection checks;
- a grounded advisor.

`node evaluation/performance/run.js` was re-run with these endpoints added. The load test's read mix now also includes the insights and health-index calls, because the dashboard and Health Check load them. Full numbers: `performance_results.md`. Lighthouse: `lighthouse_phase7.json`.

**New endpoints, one at a time** (500-transaction user, 100 requests each):

| Endpoint | p50 | p95 |
|---|---|---|
| GET insights (recurring + forecast) | 6.3 ms | 9.3 ms |
| GET health index | 5.8 ms | 7.5 ms |
| POST simulate a car loan | 6.4 ms | 7.8 ms |
| POST debt payoff plan | 1.6 ms | 2.7 ms |
| POST protection check | 5.8 ms | 7.3 ms |

**Against the targets:**

| Requirement | Target | 1 Nov | 4 Nov | Result |
|---|---|---|---|---|
| Reads and calculations, slowest p95 excluding login | ≤ 1,000 ms | 13.7 ms | 11.8 ms | Met |
| Loan prediction (now also runs the affordability simulator) | p95 ≤ 1,000 ms | 27.9 ms | 33.2 ms | Met |
| AI chat, Gemini live (n = 10) | p95 ≤ 10,000 ms | p50 2,036 ms | p50 1,497 ms, p95 1,635 ms | Met |
| 25 simultaneous users, reads | 0 failures, p95 ≤ 1,000 ms | p95 74.6 ms | 0 failures, p95 150.8 ms | Met |
| 25 simultaneous users, ML | 0 failures, p95 ≤ 1,000 ms | p95 401 ms | 0 failures, p95 400.8 ms | Met |
| Upload 5,000 rows | ≤ 10,000 ms | 6,033 ms | 5,520 ms | Met |
| Mobile LCP (login page) | ≤ 2,500 ms | 2,420 ms | 2,417 ms | Met |
| Mobile TBT | ≤ 200 ms | 17 ms | 22 ms | Met |
| CLS | ≤ 0.1 | 0 | 0 | Met |

**Reading:**
- **Reads under load:** p95 doubled at 25 users, and throughput now levels off at about 400 req/s instead of 600 to 800. Each simulated user now also fetches the forecast and the health index, which recompute the profile from every transaction on each request. It is still far inside the target.
- **Caching:** if it were ever needed, the obvious next step is to cache the profile per user until a transaction, commitment or goal changes.
- **Gemini:** faster on this run than during the functional tests earlier the same day (2 to 30 s), which shows how much it varies.
- **Login page:** unchanged in Lighthouse (mobile score 95, desktop 100), because the new pages load on demand.

## UI3.5 re-run (5 Nov 2026): Oyen mascot, dark theme, Home page

The run uses the same Lighthouse method: production build, sign-in page, median of 3, simulated mobile and desktop. The raw results are in `lighthouse_ui35.json`.

| Metric | Target | UI3 (4 Nov) | UI3.5 | Status |
|---|---|---|---|---|
| Mobile score | ≥ 90 | 95 | 95 | Met |
| Mobile LCP | ≤ 2.5 s | 2.42 s | 2.50 s | Met, at the limit |
| Mobile FCP | (≤ 1.8 s is "good") | 2.12 s | 2.11 s | Above the "good" level, as before |
| Mobile TBT | ≤ 200 ms | 22 ms | 24 ms | Met |
| CLS | ≤ 0.1 | 0 | 0.009 | Met |
| Desktop score | ≥ 90 | 100 | 100 | Met |

**What it took to stay under 2.5 s:**
- The first UI3.5 build measured an LCP of 2.56 to 2.60 s, which missed the target.
- Three changes brought it back to 2.50 s:
  - **Lazy-loaded app:** the signed-in app (sidebar, menus, theme switch, scroll effects) and the register page load on demand. Sign-in JavaScript dropped from 87 KB to 73 KB gzipped; UI3's was 78 KB.
  - **Visible first screen:** the sign-in screen no longer starts invisible while the animation library loads.
  - **Font preload:** the headline font is preloaded. Preloading the body font as well made the speed index worse (3.9 s), so only one font is preloaded.
- The waving Oyen on the sign-in screen is lazy-loaded and shown only from 1024 px wide, so phones never download it.

**Mascot cost:**
- These figures exclude Oyen, who appears only after sign-in.
- **Model:** compressed with meshopt from 3.2 MB to 0.74 MB.
- **Code:** three.js and the 3D component are a separate 167 KB gzipped chunk.
- **Loading:** both load when the browser is idle after Home has painted. Until then, a 33 KB still image takes his place.
- **Rendering:** stops while Oyen is off screen or the tab is hidden.
- **Not measured:** Lighthouse cannot sign in, so Home's own load time is not covered here.

## Findings

- **Where the time goes.** Login's p95 of 158 ms is bcrypt, which is slow on purpose. XGBoost adds about 17 ms and Logistic Regression + SHAP about 10 ms. The ML service is not a bottleneck for one user.
- **Read capacity.** Throughput levels off at about 600–800 requests per second from 10 users upwards. Extra client processes did not raise it in step (625, 560 and 811 req/s with 1, 2 and 3), so the limit is mainly the server side, which is expected for a single Node process with a 10-connection MySQL pool. Response times rise steadily with no failures.
- **ML capacity.** Predictions level off at about 95 per second, and p95 reaches 737 ms at 50 users. Prediction endpoints are the first place capacity would run out.
- **Uploads scale in a straight line,** about 1.2 ms per row from 500 to 5,000 rows. Most of it is inserting rows one at a time, so a single batched insert would speed this up.
- **Gemini is the slowest part and is outside the app's control.** Its time depends on Google's service; n = 10, so the "p95" is simply the slowest request.

## Limits of this evaluation

- Everything ran on one laptop over localhost, so real network delay is not included, and the test client competed with the servers for CPU.
- Express ran in development mode under nodemon, not a production setup.
- Load-test users send their next request immediately, with no thinking time, so 25 here is much heavier than 25 real people. It says nothing about many thousands of users or a deployed server.
- Test data was one user with 500 transactions. Behaviour with many large accounts in the database was not tested.
- The ML batch limit is 5,000 descriptions. A statement with more debit rows than that would fall back to keyword rules. The 10 MB upload limit allows such a file, though real personal statements are far smaller.
- Lighthouse figures vary between runs, which is why medians of 3 are used. They cover the login page only.
