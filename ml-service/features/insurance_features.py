"""
Insurance risk features — the single definition shared by training and serving.

Dataset: Medical Cost Personal Datasets (insurance.csv, 1,338 people, US).
Target: annual medical charges above the dataset median ("higher-cost" profile).

Column -> feature:
  age        age (years)
  bmi        bmi (kg/m^2)                      form: weight / height^2
  smoker     smoker == "yes" -> 1
  children   children (dependants covered)     form: number of children

Excluded on purpose:
  region  US regions (northeast, southwest, ...) have no Malaysian equivalent.
  sex     adds nothing to accuracy (CV ROC-AUC 0.947 with vs 0.947 without) and pricing
          on gender is a fairness concern, so the model does not use it.
"""

import numpy as np
import pandas as pd

FEATURES = ["age", "bmi", "smoker", "children"]

FEATURE_LABELS = {
    "age": "Age",
    "bmi": "BMI",
    "smoker": "Smoking",
    "children": "Children",
}


def dataset_to_features(df: pd.DataFrame) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "age": df["age"].astype(float),
            "bmi": df["bmi"].astype(float),
            "smoker": (df["smoker"].str.lower() == "yes").astype(float),
            "children": df["children"].astype(float),
        }
    )[FEATURES]


def form_to_features(p: dict) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "age": float(p["age"]),
                "bmi": float(p["bmi"]),
                "smoker": 1.0 if p["smoker"] else 0.0,
                "children": float(p.get("children") or 0),
            }
        ]
    )[FEATURES]


def linear_shap(pipeline, X: pd.DataFrame, background_mean: np.ndarray) -> np.ndarray:
    """Exact SHAP values for a standardised logistic regression, in log-odds.

    For a linear model with independent features, SHAP (LinearExplainer, interventional)
    reduces to coef_i * (x_i - E[x_i]) on the model's input scale, so the shap package
    is not needed. Contributions + base value add up to the model's log-odds exactly.
    """
    scaler = pipeline.named_steps["standardscaler"]
    coef = pipeline.named_steps["logisticregression"].coef_[0]
    return (X.to_numpy(dtype=float) - background_mean) / scaler.scale_ * coef
