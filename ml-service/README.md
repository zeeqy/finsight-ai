# FinSight AI — ML Service

Internal FastAPI service (port 8000). Only the Express API calls it.

## Setup (Python 3.14 works)

```bash
cd ml-service
py -3.14 -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
```

## Run

```bash
.venv\Scripts\python -m uvicorn main:app --reload --port 8000
```

- `GET /health` returns `{ status, service, version, models_loaded }`.
- `GET /forecast/gold?months=60` returns the gold price forecast (503 if `models/gold_arima.pkl` is missing; Express then uses a placeholder rate).
- `POST /predict/category` takes `{ descriptions: [...] }` (one call per uploaded statement) and returns each best category + confidence + alternatives, plus the `decision` rule Express uses to merge it with the keyword rules. 503 if `models/category_model.pkl` is missing (Express then uses the rules alone).
- `POST /predict/insurance` takes `{ age, bmi, smoker, children }` and returns `{ risk_score, risk_tier, thresholds, base_value, contributions (SHAP), what_if, out_of_range, model }`, or 503 if `models/insurance_lr.pkl` is missing (Express then tells the user the model is offline).
- `POST /predict/loan` returns `{ default_probability, risk_level, thresholds, top_factors, out_of_range, model }`, or 503 if `models/loan_xgb.pkl` is missing. Express then falls back to its rule-based estimate.

## Train the loan default model (Module 3)

Dataset: Lending Club accepted loans 2007-2016 (396k loans, about 20% charged off). Public, no login needed.

1. Download `lending_club_loan_two.csv` (about 100 MB) into `ml-service/data/raw/` (that folder is gitignored):
   ```bash
   curl -L -o data/raw/lending_club_loan_two.csv https://huggingface.co/datasets/ghty123/lending_club_loan_dataset/resolve/main/lending_club_loan_two.csv
   ```
2. Run (about 2 minutes on the full data):
   ```bash
   .venv\Scripts\python notebooks\train_loan_xgb.py
   ```
   Add `--sample 50000` for a quick run.

The model only knows 3- and 5-year personal loans. `/predict/loan` returns `out_of_range` for inputs above the training data's 99th percentile (e.g. a 30-year house loan), and Express then shows the score for reference only and bases the verdict on DSR.

Outputs:
- `models/loan_xgb.pkl`: the model, feature list, risk cut-offs and metrics (loaded at startup)
- `models/loan_xgb_metrics.json`: ROC-AUC, PR-AUC, Brier, precision/recall/F1, confusion matrix, actual default rate per risk band, LogReg baseline, mean |SHAP|
- `notebooks/outputs/loan_xgb_evaluation.png`: ROC curve, confusion matrix and feature contributions (for Chapter 4)

Features are defined once in `features/loan_features.py`, which both training and serving use.

## Train the gold price forecast (Module 4)

Data: World Bank "Pink Sheet" gold USD/oz (via datahub.io) and FRED `EXMAUS` USD/MYR, both monthly and public.

1. Download into `ml-service/data/raw/gold/`:
   ```bash
   curl -L -o data/raw/gold/gold_usd_oz_monthly.csv https://raw.githubusercontent.com/datasets/gold-prices/main/data/monthly.csv
   curl -L -o data/raw/gold/usd_myr_monthly.csv "https://fred.stlouisfed.org/graph/fredgraph.csv?id=EXMAUS"
   ```
2. Run (about a minute; includes the 60-month rolling backtest):
   ```bash
   .venv\Scripts\python notebooks\train_gold_arima.py
   ```

Outputs: `models/gold_arima.pkl`, `models/gold_arima_metrics.json` (AIC ranking, backtest MAE/RMSE/MAPE vs naive and drift, interval coverage) and `notebooks/outputs/gold_arima_evaluation.png`.

`GET /forecast/gold?months=N` returns the median price path in RM/gram, 80% and 95% intervals, and annualised growth to the horizon (`expected`, `cautious`, `optimistic`). Express plans gold goals at the cautious rate. Re-run both downloads and the script monthly to refresh the data.

## Train the insurance risk model (Module 5)

Dataset: Medical Cost Personal Datasets (`insurance.csv`, 1,338 people; the Kaggle copy is mirichoi0218/insurance). Public, no login.

1. Download into `ml-service/data/raw/insurance/`:
   ```bash
   curl -L -o data/raw/insurance/insurance.csv https://raw.githubusercontent.com/stedy/Machine-Learning-with-R-datasets/master/insurance.csv
   ```
2. Run (a few seconds):
   ```bash
   .venvScriptspython notebooks	rain_insurance_lr.py
   ```

Outputs: `models/insurance_lr.pkl`, `models/insurance_lr_metrics.json` (CV and test metrics, baselines, tier calibration, odds ratios, mean |SHAP|) and `notebooks/outputs/insurance_lr_evaluation.png` (ROC vs smoker-only rule, confusion matrix, SHAP summary).

SHAP values are computed exactly from the model coefficients (`features/insurance_features.py` → `linear_shap`), so the `shap` package is not needed. The training script asserts that the base value plus the contributions equals the model's log-odds.

## Train the transaction categoriser (Module 1)

Training data:
- **Malaysian labelled descriptions** in `features/category_data.py`: about 330 real Malaysian merchants plus generated payee names, labelled by category, written in Maybank/CIMB statement formats (4,344 rows). Built in code, nothing to download.
- **Public US data**, optional: DoDataThings/us-bank-transaction-categories-v2 (MIT, 68k synthetic US descriptions), 300 per category:
  ```bash
  curl -L -o data/raw/categories/us_bank_transactions_v2.csv https://huggingface.co/datasets/DoDataThings/us-bank-transaction-categories-v2/resolve/main/transactions-synthetic.csv
  ```

Test data (never trained on): `data/labelled/category_test_sets.csv` (sample statements + 43 hand-labelled unseen Malaysian merchants) and, if present, `data/private/real_statement_labelled.tsv` (a real statement, gitignored).

Run (about 2 minutes; needs Node on PATH because the rule-based baseline is the real `server/src/utils/categorizer.js`):
```bash
.venv\Scripts\python notebooks\train_category.py              # deployed: Logistic Regression + rules
.venv\Scripts\python notebooks\train_category.py --model rf \
    --models-dir <scratch folder>                                 # Random Forest comparison (don't overwrite the deployed model)
```

Outputs: `models/category_model.pkl` (pipeline + decision rule + model name), `models/category_model_metrics.json` (merchant-grouped CV for rules / RF / LogReg, the decision grid, per-class scores, test-set scores) and `notebooks/outputs/category_<model>_evaluation.png` (`category_logreg_evaluation.png` deployed, `category_rf_evaluation.png` comparison).
