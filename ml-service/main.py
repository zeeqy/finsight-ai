"""
FinSight AI - ML Service (FastAPI, internal, port 8000)

Stateless prediction service called only by the Express API.
No auth, no database access: it takes features and returns predictions.

Run:  uvicorn main:app --reload --port 8000
"""

import os
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from typing import Literal, Optional

import joblib
import numpy as np
import xgboost as xgb
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field

from features.insurance_features import FEATURE_LABELS as INSURANCE_LABELS
from features.insurance_features import form_to_features as insurance_form_to_features
from features.insurance_features import linear_shap as insurance_linear_shap
from features.loan_features import FEATURE_LABELS, form_to_features, out_of_range

MODELS_DIR = Path(os.environ.get("FINSIGHT_MODELS_DIR", Path(__file__).parent / "models"))

# Model files expected once the training notebooks are done (joblib .pkl)
EXPECTED_MODELS = {
    "category": "category_model.pkl",   # Module 1 - TF-IDF + Logistic Regression categoriser
    "loan": "loan_xgb.pkl",             # Module 3 - XGBoost loan default
    "gold": "gold_arima.pkl",           # Module 4 - gold price forecast
    "insurance": "insurance_lr.pkl",    # Module 5 - Logistic Regression + SHAP
}

MODELS = {}


def load_models():
    """Load every model file that exists. Missing models are reported, not fatal."""
    for name, filename in EXPECTED_MODELS.items():
        path = MODELS_DIR / filename
        if path.exists():
            MODELS[name] = joblib.load(path)
            print(f"[ML] loaded {name} from {path}")


@asynccontextmanager
async def lifespan(_app):
    load_models()
    yield


app = FastAPI(title="FinSight AI ML Service", version="0.3.0", lifespan=lifespan)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "finsight-ml",
        "version": app.version,
        "models_loaded": {name: name in MODELS for name in EXPECTED_MODELS},
    }


# ── Module 3: loan default ────────────────────────────────────────────


class LoanFeatures(BaseModel):
    loan_type: Optional[Literal["personal", "car", "house"]] = None
    item_price: float = Field(0, ge=0)
    loan_amount: float = Field(..., ge=0)
    monthly_instalment: float = Field(..., ge=0)
    monthly_income: float = Field(..., gt=0)
    existing_commitments: float = Field(0, ge=0)
    tenure_years: Optional[float] = Field(None, gt=0)
    employment_type: Optional[str] = None
    years_employed: Optional[float] = Field(None, ge=0)
    dependants: int = Field(0, ge=0)
    age: Optional[float] = Field(None, ge=16, le=100)


def risk_level(probability, thresholds):
    if probability < thresholds["low_max"]:
        return "Low"
    if probability < thresholds["high_min"]:
        return "Medium"
    return "High"


@app.post("/predict/loan")
def predict_loan(payload: LoanFeatures):
    bundle = MODELS.get("loan")
    if bundle is None:
        raise HTTPException(status_code=503, detail="Loan model not trained yet (models/loan_xgb.pkl missing).")

    X = form_to_features(payload.model_dump())
    model = bundle["model"]
    probability = float(model.predict_proba(X)[0, 1])

    # Per-feature contributions (TreeSHAP, log-odds). Employment dummies are merged into one factor.
    contribs = model.get_booster().predict(xgb.DMatrix(X), pred_contribs=True)[0, :-1]
    merged = {}
    for feature, value in zip(bundle["features"], contribs):
        label = FEATURE_LABELS[feature]
        merged[label] = merged.get(label, 0.0) + float(value)
    top_factors = sorted(
        ({"feature": k, "impact": round(v, 3)} for k, v in merged.items() if abs(v) >= 0.005),
        key=lambda f: abs(f["impact"]),
        reverse=True,
    )

    # Inputs outside what the model saw in training (e.g. a 30-year house loan, since the
    # dataset has 3- and 5-year personal loans only): the score is an extrapolation.
    outside = out_of_range(X, bundle.get("feature_ranges", {}))

    test = bundle["metrics"]["test"]
    return {
        "default_probability": round(probability, 4),
        "risk_level": risk_level(probability, bundle["thresholds"]),
        "thresholds": bundle["thresholds"],
        "top_factors": top_factors,
        "out_of_range": [FEATURE_LABELS[f] for f in outside],
        "model": {
            "name": "XGBoost",
            "dataset": "Lending Club 2007-2016",
            "trained_at": bundle["trained_at"],
            "test_roc_auc": test["roc_auc"],
        },
    }


# ── Module 4: gold price forecast ─────────────────────────────────────


def _annual_rate(price, base, months):
    return round(((price / base) ** (12 / months) - 1) * 100, 2)


@app.get("/forecast/gold")
def forecast_gold(months: int = Query(60, ge=1, le=600)):
    """Gold price forecast in MYR per gram, `months` ahead of the current month.

    Also returns the implied annual growth rate to that horizon (median, plus the 80%
    interval bounds) so the savings maths in Express can treat gold like any other vehicle.
    """
    bundle = MODELS.get("gold")
    if bundle is None:
        raise HTTPException(status_code=503, detail="Gold model not trained yet (models/gold_arima.pkl missing).")

    # The data ends at last_month, so forecast the gap to today plus the requested horizon
    ly, lm = map(int, bundle["last_month"].split("-"))
    today = date.today()
    steps = max(1, (today.year - ly) * 12 + (today.month - lm) + months)

    fc = bundle["results"].get_forecast(steps)
    median = np.exp(fc.predicted_mean.values)
    ci80 = np.exp(fc.conf_int(alpha=0.2).values)
    ci95 = np.exp(fc.conf_int(alpha=0.05).values)
    base = bundle["last_price"]

    path = [
        {
            "month": f"{d:%Y-%m}",
            "median": round(float(median[i]), 2),
            "lower80": round(float(ci80[i, 0]), 2),
            "upper80": round(float(ci80[i, 1]), 2),
            "lower95": round(float(ci95[i, 0]), 2),
            "upper95": round(float(ci95[i, 1]), 2),
        }
        for i, d in enumerate(fc.predicted_mean.index)
    ]
    end = path[-1]
    backtest = bundle["metrics"]["backtest"]["horizons"]["h12"]
    return {
        "unit": "MYR per gram",
        "last_actual": {"month": bundle["last_month"], "price": round(base, 2)},
        "horizon_months": months,
        "forecast_month": end["month"],
        "price": {k: end[k] for k in ("median", "lower80", "upper80", "lower95", "upper95")},
        # Annualised growth from the last actual price to the horizon
        "annual_rate_pct": {
            "expected": _annual_rate(end["median"], base, steps),
            "cautious": _annual_rate(end["lower80"], base, steps),
            "optimistic": _annual_rate(end["upper80"], base, steps),
        },
        "path": path,
        "history": bundle["history"],
        "model": {
            "name": bundle["metrics"]["model"],
            "trained_at": bundle["trained_at"],
            "backtest_mape_12m": backtest["arima"]["mape"],
            "naive_mape_12m": backtest["naive"]["mape"],
            "interval80_coverage_12m": backtest["arima_80pct_interval_coverage"],
        },
    }


# ── Module 5: insurance risk ──────────────────────────────────────────


class InsuranceFeatures(BaseModel):
    age: float = Field(..., ge=16, le=100)
    bmi: float = Field(..., ge=10, le=70)
    smoker: bool
    children: int = Field(0, ge=0, le=20)


def _insurance_tier(probability, thresholds):
    if probability < thresholds["low_max"]:
        return "Low"
    if probability < thresholds["high_min"]:
        return "Medium"
    return "High"


# BMI the what-if scenario aims for: top of the healthy range for Asians
# (Malaysian CPG Management of Obesity: 18.5-22.9 normal, 23-27.4 overweight, >= 27.5 obese)
HEALTHY_BMI_TARGET = 22.9


@app.post("/predict/insurance")
def predict_insurance(payload: InsuranceFeatures):
    bundle = MODELS.get("insurance")
    if bundle is None:
        raise HTTPException(status_code=503, detail="Insurance model not trained yet (models/insurance_lr.pkl missing).")

    model, thresholds = bundle["model"], bundle["thresholds"]
    p = payload.model_dump()
    X = insurance_form_to_features(p)
    probability = float(model.predict_proba(X)[0, 1])

    # Exact linear SHAP: base_value + sum(contributions) = this person's log-odds
    shap = insurance_linear_shap(model, X, bundle["background_mean"])[0]
    contributions = sorted(
        (
            {"feature": INSURANCE_LABELS[f], "key": f, "value": float(X.iloc[0][f]), "impact": round(float(v), 3)}
            for f, v in zip(bundle["features"], shap)
        ),
        key=lambda c: abs(c["impact"]),
        reverse=True,
    )

    # What-if: same person with one lifestyle factor changed (only the changeable ones)
    what_if = []
    scenarios = []
    if p["smoker"]:
        scenarios.append(("Quit smoking", {**p, "smoker": False}))
    if p["bmi"] > HEALTHY_BMI_TARGET:
        scenarios.append((f"BMI down to {HEALTHY_BMI_TARGET}", {**p, "bmi": HEALTHY_BMI_TARGET}))
    if len(scenarios) == 2:
        scenarios.append(("Both", {**p, "smoker": False, "bmi": HEALTHY_BMI_TARGET}))
    for label, q in scenarios:
        prob = float(model.predict_proba(insurance_form_to_features(q))[0, 1])
        what_if.append({"scenario": label, "risk_score": round(prob, 4), "risk_tier": _insurance_tier(prob, thresholds)})

    ranges = bundle["feature_ranges"]
    outside = [INSURANCE_LABELS[f] for f in ("age", "bmi") if not ranges[f][0] <= p[f] <= ranges[f][1]]

    m = bundle["metrics"]
    return {
        "risk_score": round(probability, 4),
        "risk_tier": _insurance_tier(probability, thresholds),
        "thresholds": thresholds,
        "base_value": round(float(bundle["base_value"]), 4),
        "contributions": contributions,
        "what_if": what_if,
        "out_of_range": outside,
        "model": {
            "name": "Logistic Regression",
            "dataset": "Medical Cost Personal Datasets (1,338 people)",
            "target": "annual medical cost above the dataset median",
            "trained_at": bundle["trained_at"],
            "test_roc_auc": m["test"]["roc_auc"],
            "test_accuracy": m["test"]["accuracy"],
            "feature_ranges": ranges,
        },
    }


# ── Module 1: transaction categoriser ─────────────────────────────────


class CategoryRequest(BaseModel):
    descriptions: list[str] = Field(..., min_length=1, max_length=5000)


@app.post("/predict/category")
def predict_category(payload: CategoryRequest):
    """Batch categorisation (one call per uploaded statement).

    Returns the model's best category and confidence per description, plus the
    decision rule chosen in training for combining the model with the keyword rules.
    Express applies that rule, because the rules live in JavaScript.
    """
    bundle = MODELS.get("category")
    if bundle is None:
        raise HTTPException(status_code=503, detail="Category model not trained yet (models/category_model.pkl missing).")

    proba = bundle["model"].predict_proba(payload.descriptions)
    classes = np.array(bundle["classes"])
    top = np.argsort(-proba, axis=1)[:, :3]
    predictions = [
        {
            "category": str(classes[row[0]]),
            "confidence": round(float(proba[i, row[0]]), 4),
            "alternatives": [{"category": str(classes[j]), "p": round(float(proba[i, j]), 4)} for j in row[1:]],
        }
        for i, row in enumerate(top)
    ]
    m = bundle["metrics"]
    return {
        "predictions": predictions,
        "decision": bundle["decision"],
        "model": {
            "name": f"TF-IDF + {bundle.get('model_name', 'Random Forest')}",
            "trained_at": bundle["trained_at"],
            "cv_accuracy_unseen_merchants": m["cv_merchant_grouped_5fold"][m["rf_variant"]]["accuracy"],
        },
    }
