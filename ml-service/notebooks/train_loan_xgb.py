# %% [markdown]
# # Module 3 — Loan Default Predictor: XGBoost training
#
# Dataset: Lending Club accepted loans 2007-2016, `lending_club_loan_two.csv`
# (Hugging Face mirror ghty123/lending_club_loan_dataset). Target: loan_status == "Charged Off".
# Only features a FinSight user can enter on the loan form are used (see `features/loan_features.py`).
# int_rate and grade are excluded because Lending Club derives them from its own risk
# assessment, so they would leak the lender's verdict into the model.
#
# Run as a script:   .venv\Scripts\python notebooks\train_loan_xgb.py
# or cell-by-cell in VS Code (the `# %%` markers make it a notebook).
#
# Imbalance (~20% positive): the deployed model is trained WITHOUT re-weighting so its
# probabilities stay calibrated (a "9%" shown in the app means roughly 9%). Imbalance is
# handled at the decision threshold instead (F1-optimal on validation). A scale_pos_weight
# variant is trained for comparison only.

# %%
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    precision_recall_curve,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from features.loan_features import FEATURE_LABELS, FEATURES, lendingclub_to_features  # noqa: E402

parser = argparse.ArgumentParser()
parser.add_argument("--data", default=str(ROOT / "data" / "raw" / "lending_club_loan_two.csv"))
parser.add_argument("--models-dir", default=str(ROOT / "models"))
parser.add_argument("--outputs-dir", default=str(ROOT / "notebooks" / "outputs"))
parser.add_argument("--sample", type=int, default=None, help="use N rows for a quick run")
args, _ = parser.parse_known_args()

SEED = 42
MODELS_DIR = Path(args.models_dir)
OUT_DIR = Path(args.outputs_dir)
MODELS_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

# %% Load and filter
USECOLS = ["loan_amnt", "term", "installment", "emp_length", "annual_inc", "dti", "purpose", "loan_status"]
raw = pd.read_csv(args.data, usecols=USECOLS)
print(f"Loaded {len(raw):,} rows")

# Drop rows with no usable income or an impossible DTI (Lending Club uses 9999 as a placeholder)
raw = raw[(raw["annual_inc"] > 0) & raw["dti"].between(0, 100)]
if args.sample:
    raw = raw.sample(n=min(args.sample, len(raw)), random_state=SEED)
TARGET = (raw["loan_status"] == "Charged Off").astype(int)
print(f"Loans used: {len(raw):,}  |  charged-off rate: {TARGET.mean():.2%}")

X = lendingclub_to_features(raw)
y = TARGET
print(X.describe().T[["mean", "50%", "min", "max"]].round(3))

# %% Stratified split 70 / 15 / 15
X_train, X_tmp, y_train, y_tmp = train_test_split(X, y, test_size=0.30, stratify=y, random_state=SEED)
X_val, X_test, y_val, y_test = train_test_split(X_tmp, y_tmp, test_size=0.50, stratify=y_tmp, random_state=SEED)
print(f"train {len(X_train):,} | val {len(X_val):,} | test {len(X_test):,}")

# %% Baseline: logistic regression (for the report comparison)
baseline = make_pipeline(SimpleImputer(strategy="median"), StandardScaler(), LogisticRegression(max_iter=1000))
baseline.fit(X_train, y_train)
baseline_auc = roc_auc_score(y_test, baseline.predict_proba(X_test)[:, 1])
print(f"Baseline LogReg test ROC-AUC: {baseline_auc:.4f}")

# %% XGBoost
PARAMS = dict(
    n_estimators=4000,
    learning_rate=0.05,
    max_depth=4,
    min_child_weight=50,
    subsample=0.8,
    colsample_bytree=0.8,
    reg_lambda=1.0,
    eval_metric="auc",
    early_stopping_rounds=100,
    tree_method="hist",
    random_state=SEED,
)


def fit_xgb(**extra):
    m = xgb.XGBClassifier(**PARAMS, **extra)
    m.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)
    return m


model = fit_xgb()
print(f"Deployed model: best iteration {model.best_iteration}, val AUC {model.best_score:.4f}")

spw = float((y_train == 0).sum() / (y_train == 1).sum())
weighted = fit_xgb(scale_pos_weight=spw)
print(f"Comparison model (scale_pos_weight={spw:.1f}): val AUC {weighted.best_score:.4f}")

# %% Risk cut-offs chosen on VALIDATION data (never the test set)
p_val = model.predict_proba(X_val)[:, 1]
prec, rec, thr = precision_recall_curve(y_val, p_val)
f1s = 2 * prec[:-1] * rec[:-1] / np.clip(prec[:-1] + rec[:-1], 1e-9, None)
f1_threshold = float(thr[np.argmax(f1s)])
base_rate = float(y_train.mean())

# Risk bands are relative to the average charged-off rate (the base rate):
#   Low    < 0.75 x base rate   (clearly below-average risk)
#   High  >= 1.5  x base rate   (1.5 times the average risk or more)
# The F1-optimal threshold is reported separately: it is the binary decision point used
# for the confusion matrix / precision / recall. With a ~20% base rate it sits close to the
# base rate itself, so it cannot also serve as a band edge.
low_max = 0.75 * base_rate
high_min = 1.5 * base_rate
high_rule = "1.5x_base_rate"
val_bands = pd.Series(np.where(p_val < low_max, "Low", np.where(p_val < high_min, "Medium", "High")))
print("Validation band sizes:", val_bands.value_counts(normalize=True).round(3).to_dict())
print(f"Cut-offs: Low < {low_max:.3f} <= Medium < {high_min:.3f} <= High")

# %% Test-set evaluation
p_test = model.predict_proba(X_test)[:, 1]
pred = (p_test >= f1_threshold).astype(int)
cm = confusion_matrix(y_test, pred)


def band(p):
    return np.where(p < low_max, "Low", np.where(p < high_min, "Medium", "High"))


bands = pd.DataFrame({"band": band(p_test), "y": y_test.values})
band_table = bands.groupby("band")["y"].agg(["count", "mean"]).reindex(["Low", "Medium", "High"])
band_table.columns = ["applicants", "actual_default_rate"]

p_weighted = weighted.predict_proba(X_test)[:, 1]
metrics = {
    "dataset": "Lending Club accepted loans 2007-2016 (lending_club_loan_two.csv), target = Charged Off",
    "rows_used": int(len(raw)),
    "split": {"train": len(X_train), "val": len(X_val), "test": len(X_test)},
    "default_rate": round(float(y.mean()), 4),
    "features": FEATURES,
    "test": {
        "roc_auc": round(roc_auc_score(y_test, p_test), 4),
        "pr_auc": round(average_precision_score(y_test, p_test), 4),
        "brier": round(brier_score_loss(y_test, p_test), 4),
        "threshold": round(f1_threshold, 4),
        "precision": round(precision_score(y_test, pred, zero_division=0), 4),
        "recall": round(recall_score(y_test, pred), 4),
        "f1": round(f1_score(y_test, pred), 4),
        "confusion_matrix": {"tn": int(cm[0, 0]), "fp": int(cm[0, 1]), "fn": int(cm[1, 0]), "tp": int(cm[1, 1])},
    },
    "risk_bands": {
        "low_max": round(low_max, 4),
        "high_min": round(high_min, 4),
        "high_rule": high_rule,
        "f1_optimal_threshold": round(f1_threshold, 4),
        "test_band_default_rates": {
            k: {"applicants": int(v.applicants), "actual_default_rate": round(float(v.actual_default_rate), 4)}
            for k, v in band_table.dropna().iterrows()
        },
    },
    "comparison": {
        "logistic_regression_roc_auc": round(baseline_auc, 4),
        "xgb_scale_pos_weight_roc_auc": round(roc_auc_score(y_test, p_weighted), 4),
        "xgb_scale_pos_weight_brier": round(brier_score_loss(y_test, p_weighted), 4),
    },
    "best_iteration": int(model.best_iteration),
}
print(json.dumps(metrics["test"], indent=2))
print(band_table)

# %% Explainability: mean |contribution| per feature (XGBoost built-in TreeSHAP)
sample = X_test.sample(n=min(5000, len(X_test)), random_state=SEED)
contribs = model.get_booster().predict(xgb.DMatrix(sample), pred_contribs=True)[:, :-1]
importance = pd.Series(np.abs(contribs).mean(axis=0), index=FEATURES).sort_values()
metrics["mean_abs_shap"] = {k: round(float(v), 4) for k, v in importance.sort_values(ascending=False).items()}

# %% Plots for the report
fig, axes = plt.subplots(1, 3, figsize=(18, 5.5), gridspec_kw={"width_ratios": [1, 0.9, 1.2]})
fpr, tpr, _ = roc_curve(y_test, p_test)
axes[0].plot(fpr, tpr, label=f"XGBoost (AUC {metrics['test']['roc_auc']:.3f})")
bfpr, btpr, _ = roc_curve(y_test, baseline.predict_proba(X_test)[:, 1])
axes[0].plot(bfpr, btpr, label=f"LogReg baseline (AUC {baseline_auc:.3f})", alpha=0.7)
axes[0].plot([0, 1], [0, 1], "k--", lw=0.8)
axes[0].set(title="ROC curve (test)", xlabel="False positive rate", ylabel="True positive rate")
axes[0].legend()

axes[1].imshow(cm, cmap="Blues")
for (i, j), v in np.ndenumerate(cm):
    axes[1].text(j, i, f"{v:,}", ha="center", va="center", color="black")
axes[1].set(
    title=f"Confusion matrix\n(F1-optimal threshold {f1_threshold:.2f})",
    xticks=[0, 1], yticks=[0, 1],
    xticklabels=["Repaid", "Default"], yticklabels=["Repaid", "Default"],
    xlabel="Predicted", ylabel="Actual",
)

axes[2].barh([f"{FEATURE_LABELS[f]}\n({f})" for f in importance.index], importance.values, color="#FFC80A")
axes[2].set(title="Mean |SHAP| contribution (test sample)")
plt.tight_layout(w_pad=3)
fig.savefig(OUT_DIR / "loan_xgb_evaluation.png", dpi=150)
print(f"Saved plots -> {OUT_DIR / 'loan_xgb_evaluation.png'}")

# %% Save model + metadata (loaded once by main.py at startup)
bundle = {
    "model": model,
    "features": FEATURES,
    "thresholds": {"low_max": low_max, "high_min": high_min},
    # 1st-99th percentile of each training feature: the API flags form inputs outside this range
    "feature_ranges": {
        f: [float(X_train[f].quantile(0.01)), float(X_train[f].quantile(0.99))]
        for f in FEATURES if not f.startswith("purpose_")
    },
    "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    "xgboost_version": xgb.__version__,
    "metrics": metrics,
}
joblib.dump(bundle, MODELS_DIR / "loan_xgb.pkl")
(MODELS_DIR / "loan_xgb_metrics.json").write_text(json.dumps(metrics, indent=2))
print(f"Saved model -> {MODELS_DIR / 'loan_xgb.pkl'}")
