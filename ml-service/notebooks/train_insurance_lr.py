# %% [markdown]
# # Module 5 — Insurance Risk Predictor: Logistic Regression + SHAP
#
# Dataset: Medical Cost Personal Datasets (`insurance.csv`, 1,338 people; Lantz, *Machine
# Learning with R*, mirrored on Kaggle as mirichoi0218/insurance).
# Target: annual medical charges above the dataset median = "higher-cost" lifestyle profile.
#
# Why the median and not the top quartile: above the 75th percentile is 93% smokers, so the
# model collapses to "do you smoke?" (age and BMI barely matter). The median split keeps
# age, BMI and smoking all meaningful, which is what the explanation chart needs.
#
# Why Logistic Regression: interpretability is the priority for insurance. Each factor's
# contribution is exact and additive (linear SHAP), so the user sees why they got a score.
#
# Run as a script:   .venv\Scripts\python notebooks\train_insurance_lr.py
# or cell-by-cell in VS Code (the `# %%` markers make it a notebook).

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
from sklearn.dummy import DummyClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from features.insurance_features import FEATURE_LABELS, FEATURES, dataset_to_features, linear_shap  # noqa: E402

parser = argparse.ArgumentParser()
parser.add_argument("--data", default=str(ROOT / "data" / "raw" / "insurance" / "insurance.csv"))
parser.add_argument("--models-dir", default=str(ROOT / "models"))
parser.add_argument("--outputs-dir", default=str(ROOT / "notebooks" / "outputs"))
args, _ = parser.parse_known_args()

SEED = 42
# Risk tiers on P(higher-cost profile). Fixed, symmetric cut-offs: the model is confident
# below 0.3 or above 0.7; in between it is a genuine toss-up. Actual rates per tier on the
# test set are reported below so the report can show the tiers mean what they say.
THRESHOLDS = {"low_max": 0.30, "high_min": 0.70}

# %% Load and prepare
raw = pd.read_csv(args.data)
n_raw = len(raw)
raw = raw.drop_duplicates().reset_index(drop=True)
print(f"rows: {n_raw}, after dropping duplicates: {len(raw)}")

median_charge = float(raw["charges"].median())
X = dataset_to_features(raw)
y = (raw["charges"] > median_charge).astype(int)
print(f"median annual charges: USD {median_charge:,.2f}; positive rate {y.mean():.3f}")

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, stratify=y, random_state=SEED)
print(f"train {len(X_train)}, test {len(X_test)}")

# %% Train: Logistic Regression (deployed) + baselines
def make_lr():
    return make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000))

cv = StratifiedKFold(5, shuffle=True, random_state=SEED)
cv_auc = cross_val_score(make_lr(), X_train, y_train, cv=cv, scoring="roc_auc")
cv_acc = cross_val_score(make_lr(), X_train, y_train, cv=cv, scoring="accuracy")
print(f"5-fold CV on train: ROC-AUC {cv_auc.mean():.4f} ± {cv_auc.std():.4f}, accuracy {cv_acc.mean():.4f}")

model = make_lr().fit(X_train, y_train)

baselines = {
    "majority_class": DummyClassifier(strategy="most_frequent").fit(X_train, y_train),
    # "Do you smoke?" alone: the obvious rule the model has to beat
    "smoker_only_rule": make_pipeline(StandardScaler(), LogisticRegression()).fit(X_train[["smoker"]], y_train),
    "decision_tree_depth3": DecisionTreeClassifier(max_depth=3, random_state=SEED).fit(X_train, y_train),
}


def evaluate(proba, pred):
    tn, fp, fn, tp = confusion_matrix(y_test, pred).ravel()
    return {
        "accuracy": round(accuracy_score(y_test, pred), 4),
        "roc_auc": round(roc_auc_score(y_test, proba), 4) if len(set(proba)) > 1 else 0.5,
        "precision": round(precision_score(y_test, pred, zero_division=0), 4),
        "recall": round(recall_score(y_test, pred), 4),
        "f1": round(f1_score(y_test, pred), 4),
        "brier": round(brier_score_loss(y_test, proba), 4),
        "confusion_matrix": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
    }


proba = model.predict_proba(X_test)[:, 1]
test = evaluate(proba, (proba >= 0.5).astype(int))
print("\nLogistic Regression (test):", json.dumps(test, indent=2))

baseline_metrics = {}
for name, m in baselines.items():
    Xb = X_test[["smoker"]] if name == "smoker_only_rule" else X_test
    p = m.predict_proba(Xb)[:, 1]
    baseline_metrics[name] = {k: v for k, v in evaluate(p, m.predict(Xb)).items() if k != "confusion_matrix"}
    print(f"{name}: accuracy {baseline_metrics[name]['accuracy']}, ROC-AUC {baseline_metrics[name]['roc_auc']}")

# %% Risk tiers: what share of each tier is actually higher-cost?
tier = np.where(proba < THRESHOLDS["low_max"], "Low", np.where(proba < THRESHOLDS["high_min"], "Medium", "High"))
tiers = {}
for t in ["Low", "Medium", "High"]:
    mask = tier == t
    tiers[t] = {"share_of_people": round(mask.mean(), 3), "actual_higher_cost_rate": round(y_test[mask].mean(), 3) if mask.any() else None}
print("\nTiers on test:", json.dumps(tiers, indent=2))

# %% Explainability: coefficients (odds ratios) and SHAP
scaler = model.named_steps["standardscaler"]
lr = model.named_steps["logisticregression"]
background_mean = X_train.to_numpy(dtype=float).mean(axis=0)
base_value = float(lr.intercept_[0] + ((background_mean - scaler.mean_) / scaler.scale_ * lr.coef_[0]).sum())

# Odds ratio per natural unit (per year of age, per BMI point, smoker vs not, per child)
coefficients = {
    f: {
        "coef_standardised": round(float(c), 4),
        "odds_ratio_per_unit": round(float(np.exp(c / s)), 4),
    }
    for f, c, s in zip(FEATURES, lr.coef_[0], scaler.scale_)
}
print("\nOdds ratios per unit:", {f: v["odds_ratio_per_unit"] for f, v in coefficients.items()})

shap_test = linear_shap(model, X_test, background_mean)
# Sanity check: base + contributions == model log-odds
logit = model.decision_function(X_test)
assert np.allclose(base_value + shap_test.sum(axis=1), logit), "linear SHAP does not add up"
mean_abs_shap = {f: round(float(v), 4) for f, v in zip(FEATURES, np.abs(shap_test).mean(axis=0))}
print("mean |SHAP| (log-odds):", mean_abs_shap)

# %% Plots for Chapter 4
out_dir = Path(args.outputs_dir)
out_dir.mkdir(parents=True, exist_ok=True)
fig, axes = plt.subplots(1, 3, figsize=(17, 5))

fpr, tpr, _ = roc_curve(y_test, proba)
axes[0].plot(fpr, tpr, color="#FFC80A", lw=2, label=f"Logistic Regression (AUC {test['roc_auc']:.3f})")
p_s = baselines["smoker_only_rule"].predict_proba(X_test[["smoker"]])[:, 1]
fs, ts, _ = roc_curve(y_test, p_s)
axes[0].plot(fs, ts, color="#64748B", lw=1.5, ls="--", label=f"Smoker-only rule (AUC {baseline_metrics['smoker_only_rule']['roc_auc']:.3f})")
axes[0].plot([0, 1], [0, 1], color="#CBD5E1", lw=1, ls=":")
axes[0].set(title="ROC curve (test set)", xlabel="False positive rate", ylabel="True positive rate")
axes[0].legend(loc="lower right", fontsize=9)

cm = confusion_matrix(y_test, (proba >= 0.5).astype(int))
axes[1].imshow(cm, cmap="YlOrBr")
for (i, j), v in np.ndenumerate(cm):
    axes[1].text(j, i, str(v), ha="center", va="center", fontsize=14, color="white" if v > cm.max() / 2 else "black")
axes[1].set(
    title="Confusion matrix (threshold 0.5)",
    xticks=[0, 1], yticks=[0, 1],
    xticklabels=["Predicted\nlower-cost", "Predicted\nhigher-cost"],
    yticklabels=["Actual\nlower-cost", "Actual\nhigher-cost"],
)

# SHAP summary: one dot per test person, coloured by feature value
for row, f in enumerate(FEATURES):
    vals = X_test[f].to_numpy(dtype=float)
    norm = (vals - vals.min()) / (np.ptp(vals) or 1)
    jitter = np.random.default_rng(SEED).uniform(-0.25, 0.25, len(vals))
    axes[2].scatter(shap_test[:, row], row + jitter, c=norm, cmap="coolwarm", s=8, alpha=0.7)
axes[2].axvline(0, color="#64748B", lw=1)
axes[2].set(
    title="SHAP values (test set)\nred = high feature value, blue = low",
    yticks=range(len(FEATURES)),
    yticklabels=[FEATURE_LABELS[f] for f in FEATURES],
    xlabel="Contribution to log-odds of higher-cost profile",
)
fig.tight_layout()
plot_path = out_dir / "insurance_lr_evaluation.png"
fig.savefig(plot_path, dpi=150)
print(f"\nsaved {plot_path}")

# %% Save the bundle (refit on train only; the test set stays a true hold-out)
trained_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
metrics = {
    "model": "Logistic Regression (standardised)",
    "dataset": "Medical Cost Personal Datasets (insurance.csv)",
    "rows": len(raw),
    "duplicates_dropped": n_raw - len(raw),
    "target": f"annual charges > dataset median (USD {median_charge:,.2f})",
    "positive_rate": round(float(y.mean()), 4),
    "split": "stratified 80/20, seed 42",
    "cv_train": {"roc_auc_mean": round(cv_auc.mean(), 4), "roc_auc_std": round(cv_auc.std(), 4), "accuracy_mean": round(cv_acc.mean(), 4)},
    "test": test,
    "baselines_test": baseline_metrics,
    "thresholds": THRESHOLDS,
    "tiers_test": tiers,
    "coefficients": coefficients,
    "mean_abs_shap": mean_abs_shap,
    "shap_base_value": round(base_value, 4),
    "trained_at": trained_at,
}

models_dir = Path(args.models_dir)
models_dir.mkdir(parents=True, exist_ok=True)
joblib.dump(
    {
        "model": model,
        "features": FEATURES,
        "background_mean": background_mean,
        "base_value": base_value,
        "thresholds": THRESHOLDS,
        "feature_ranges": {f: [float(X_train[f].min()), float(X_train[f].max())] for f in FEATURES},
        "metrics": metrics,
        "trained_at": trained_at,
    },
    models_dir / "insurance_lr.pkl",
)
(models_dir / "insurance_lr_metrics.json").write_text(json.dumps(metrics, indent=2))
print(f"saved {models_dir / 'insurance_lr.pkl'}")
