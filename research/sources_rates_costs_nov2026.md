# Sources for rates, costs and insurer links (checked 5 Nov 2026)

These sources replace the placeholder figures in the app. Each item gives where it is used in the code. Where no credible figure was found, the app asks the user to enter one rather than guessing.

## Savings rates (`server/src/services/savingsCalc.js`)

| Vehicle | Rate used | Source |
|---|---|---|
| Savings account | 0.65% p.a. | Average savings deposit rate at commercial banks, end-June 2026. Bank Negara Malaysia figures, in Ministry of Finance, *Malaysian Economy Second Quarter 2026*, table "Interest Rates of Commercial Banks". https://www.mof.gov.my/portal/pdf/ekonomi/suku-tahunan/202602/monetary.pdf |
| Tabung Haji | 3.50% | Profit distribution for FY2025, after zakat. Malay Mail, 18 Mar 2026. https://www.malaymail.com/news/malaysia/2026/03/18/tabung-haji-posts-highest-profit-in-eight-years-35pc-payout-to-benefit-97-million-depositors/213055 |
| ASB | 5.75 sen per unit | FY2025: 5.20 sen dividend + 0.55 sen bonus. The Star, 19 Dec 2025. https://www.thestar.com.my/business/business-news/2025/12/19/amanah-saham-nasional-declares-575-senunit-dividend-for-asb-fund |

**Tabung Haji history:**

| Year | Rate |
|---|---|
| 2020 | 3.10% |
| 2021 | 3.10% |
| 2022 | 3.10% |
| 2023 | 3.10% |
| 2024 | 3.25% |
| 2025 | 3.50% |

Sources: RinggitPlus (Mar 2026); NST (Apr 2024).

**ASB history (sen per unit):**

| Year | Distribution |
|---|---|
| 2020 | 4.25 |
| 2021 | 5.00 |
| 2022 | 4.60 |
| 2023 | 5.25 |
| 2024 | 5.75 |
| 2025 | 5.75 |

Sources: The Star, NST, RinggitPlus. These are news reports; the PNB and Tabung Haji press releases themselves were not found.

## Loan rates (`server/src/services/loanCalc.js`, `rateSource`)

The rates prefilled in the loan form are **example rates**. The user is asked to enter the rate their bank quotes.

| Loan | Example | Published range |
|---|---|---|
| Personal | 11.68% effective (= 6.5% flat over 5 years) | RinggitPlus listings from 3.31% p.a. (Bank Rakyat, pensioners) up to 18% (licensed moneylenders), updated 20 Oct 2026. https://ringgitplus.com/en/personal-loan/ |
| Car | 5.50% effective (= 3% flat over 9 years) | RinggitPlus listings from 2.2% (BSN MyAuto-i) to 3.75% (CIMB). https://ringgitplus.com/en/car-loan/low-interest-rate |
| House | 4.5% | BNM, end-June 2026: weighted base rate 3.39%, average lending rate on all loans 4.69% (same MOF table as above). OPR 2.75% (BNM Monetary Policy Statement, 3 Sep 2026). |

**Law changes the loan maths now follow (applied 5 Nov 2026):**
- **Car loans:** the Hire-Purchase (Amendment) Act 2026 requires new hire-purchase agreements to use an effective rate on a reducing balance from 1 June 2026. Sources: NST, 16 Mar 2026; paultan.org, 16 Mar 2026.
- **Personal loans:** BNM's Policy Document on Personal Financing (30 Sep 2025) bans flat-rate personal financing from 1 Jan 2027 and caps tenure at 10 years. Source: Skrine alert, Oct 2025.
- **In the app:** car and personal loans default to an effective rate on a reducing balance. Flat stays as an option for older or still-flat quotes, and the app shows its effective equal.
- **Example rates:** these are worked out from the flat examples, not guessed.
  - Car: 3% flat over 9 years = 5.50% effective.
  - Personal: 6.5% flat over 5 years = 11.68% effective.
  - The RinggitPlus listings do not say whether their rates are flat or effective.

## Fallback default-risk bands (`server/src/services/loanRisk.js`)

The fallback uses the same band edges as the XGBoost model: 0.147 and 0.294. These are 0.75× and 1.5× the Lending Club charge-off rate of 19.6% (`ml-service/models/loan_xgb_metrics.json`).

## House purchase costs (`server/src/services/purchaseCosts.js`)

- **Stamp duty on the transfer (MOT):** charged on each slice of the price.

  | Slice of the price | Rate |
  |---|---|
  | First RM100,000 | 1% |
  | RM100,001 to RM500,000 | 2% |
  | RM500,001 to RM1,000,000 | 3% |
  | Above RM1,000,000 | 4% |

  Source: Stamp Act 1949, First Schedule item 32(a), LHDN reprint as at 1 Jan 2024. https://www.hasil.gov.my/wp-content/uploads/20240101-akta-setem-1949-akta-378.pdf
- **Stamp duty on the loan agreement:** 0.5% of the loan (item 27(a)(iii)).
- **First-home exemption:** first homes up to RM500,000 pay no stamp duty until 31 Dec 2027 (Budget 2026). Source: The Star, 10 Oct 2025.
  - Budget 2027 proposes extending this to 2030, with partial relief up to RM750,000 (The Star, 9 Oct 2026). It is not law yet, so the app does not apply it.
- **Legal fees:** Solicitors' Remuneration Order 2023 [P.U.(A) 207/2023], in force 15 Jul 2023. The same scale applies to the SPA (Table A) and the loan agreement (Third Schedule):
  - 1.25% of the first RM500,000, minimum RM500;
  - 1% of the next RM7 million.

  The app shows the fee before any discount (up to 25% is allowed on Table A), SST and disbursements. Source: Malaysian Bar Circular 185/2023. https://www.malaysianbar.org.my/cms/upload_files/document/Circular%20No%20185-2023.pdf
- **Worked example:** a RM400,000 subsale with a RM360,000 loan.
  - Stamp duty: RM7,000 on the transfer + RM1,800 on the loan = RM8,800.
  - Legal fees: RM5,000 for the SPA + RM4,500 for the loan agreement = RM9,500.
- **Not found:** the valuation fee scale (the valuers' board site was down). The user enters it.

## Car purchase costs

- **Road tax**, private petrol car, Peninsular Malaysia:

  | Engine size | Yearly road tax |
  |---|---|
  | Up to 1,000cc | RM20 |
  | 1,001–1,200cc | RM55 |
  | 1,201–1,400cc | RM70 |
  | 1,401–1,600cc | RM90 |
  | 1,601–1,800cc | RM200 + RM0.40 per cc above 1,600 |
  | 1,801–2,000cc | RM280 + RM0.50 per cc above 1,800 |
  | 2,001–2,500cc | RM380 + RM1.00 per cc above 2,000 |
  | 2,501–3,000cc | RM880 + RM2.50 per cc above 2,500 |

  Sources: iMoney (Apr 2024), citing JPJ; Bernama (29 Jan 2026) confirms the 1,000cc rate.
- **Not found:** first-year insurance as a % of the car's value (each insurer has set motor premiums since BNM's July 2017 liberalisation), registration fee and number-plate cost. The user enters these.

## Insurance quote comparison (`server/src/services/quoteCompare.js`)

- **Insurer and takaful websites:** each company's own Malaysian site, listed alphabetically and checked 5 Nov 2026. The companies are AIA, Allianz, Etiqa, FWD Takaful, Great Eastern, Hong Leong Assurance, Manulife, Prudential, Prudential BSN Takaful, Sun Life Malaysia, Takaful Malaysia, Tokio Marine Life and Zurich.
- **BNM list of licensed institutions:** https://www.bnm.gov.my/list-of-licensed-financial-institutions
- **Product Disclosure Sheet:** BNM Policy Document on Product Transparency and Disclosure (2 Dec 2024), paragraph 9.6.1. The PDS shows an example premium for a sample customer, not a personal quote. https://www.bnm.gov.my/-/pd-ptd1224
- **Neutral guide:** Financial Education Network (BNM and Securities Commission), *Medical and Health Insurance/Takaful Made Simple*. https://www.fenetwork.my/medical-and-health-insurance-takaful/
