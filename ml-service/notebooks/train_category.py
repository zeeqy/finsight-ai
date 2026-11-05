# %% [markdown]
# # Module 1 — Transaction categoriser: TF-IDF + Logistic Regression (Random Forest compared)
#
# Deployed model (Oct 2026): Logistic Regression + keyword rules. It beat the Random Forest
# hybrid on every test set (unseen merchants 72% vs 68% in grouped CV), and is 35x smaller.
# Run with --model rf to reproduce the Random Forest comparison.
#
# Training data:
#   1. Malaysian labelled descriptions (features/category_data.py): real Malaysian merchants
#      labelled by category, rendered in Bank Islam/CIMB statement formats.
#   2. Optional public data: DoDataThings/us-bank-transaction-categories-v2 (MIT, 68k US
#      descriptions) mapped to FinSight categories. Used only if it improves the Malaysian scores.
#
# Evaluation (nothing here is used for training):
#   A. GroupKFold by merchant on the Malaysian data: every fold is scored on shops the model
#      never saw. This is the honest test of a categoriser.
#   B. Hand-labelled test sets in data/labelled/category_test_sets.csv:
#        sample_statements  - the project's sample bank CSVs (mostly known merchants)
#        unseen_merchants   - Malaysian merchants that are in neither the training data nor the rules
#   C. data/private/real_statement_labelled.tsv (if present): a real Bank Islam statement, spending
#      rows only. Kept out of version control. The rule-based categoriser was written while
#      looking at this statement, so its score there is optimistic.
#
# The rule-based categoriser (server/src/utils/categorizer.js) is run through Node so the
# baseline is exactly the code in production.
#
# Run:  .venv\Scripts\python notebooks\train_category.py            (deployed Logistic Regression)
#       .venv\Scripts\python notebooks\train_category.py --model rf  (Random Forest comparison)

# %%
import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import Pipeline

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
sys.path.insert(0, str(ROOT))
from features.category_data import CATEGORIES, US_CATEGORY_MAP, build_malaysian_dataset, clean_us_description  # noqa: E402
from features.category_features import build_vectoriser  # noqa: E402

parser = argparse.ArgumentParser()
parser.add_argument("--us-data", default=str(ROOT / "data" / "raw" / "categories" / "us_bank_transactions_v2.csv"))
# 300 per category: CV is flat from 300 to 1,500 (0.565 -> 0.571) while the sample statements get
# worse (0.87 -> 0.78) as US merchants crowd out Malaysian ones, and training is 5x slower
parser.add_argument("--us-per-class", type=int, default=300)
parser.add_argument("--model", choices=["rf", "logreg"], default="logreg", help="classifier to merge with the rules")
parser.add_argument("--models-dir", default=str(ROOT / "models"))
parser.add_argument("--outputs-dir", default=str(ROOT / "notebooks" / "outputs"))
args, _ = parser.parse_known_args()

SEED = 42
THRESHOLDS = [0.0, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6, 0.7, 0.8, 0.9]

# %% Data
my = build_malaysian_dataset(seed=SEED)
print(f"Malaysian labelled rows: {len(my)} from {my['merchant'].nunique()} merchants/payees")
print(my["category"].value_counts().to_string())

us = None
if Path(args.us_data).exists():
    raw_us = pd.read_csv(args.us_data)
    raw_us = raw_us[raw_us["category"].isin(US_CATEGORY_MAP) & raw_us["description"].str.startswith("[debit]")]
    raw_us = raw_us.assign(description=raw_us["description"].map(clean_us_description), category=raw_us["category"].map(US_CATEGORY_MAP))
    us = pd.concat(
        [g.sample(min(len(g), args.us_per_class), random_state=SEED) for _, g in raw_us.groupby("category")],
        ignore_index=True,
    )
    print(f"\nUS public rows used: {len(us)} (debits only, {args.us_per_class} max per FinSight category)")

tests = pd.read_csv(ROOT / "data" / "labelled" / "category_test_sets.csv")
private_path = ROOT / "data" / "private" / "real_statement_labelled.tsv"
if private_path.exists():
    real = pd.read_csv(private_path, sep="\t")
    tests = pd.concat([tests, real.assign(set="real_statement")[["set", "description", "category"]]], ignore_index=True)
print("\nTest sets:", tests["set"].value_counts().to_dict())

# Make sure the unseen-merchant set really is unseen
train_text = " | ".join(my["description"].str.lower())
leaks = [d for d in tests.loc[tests["set"] == "unseen_merchants", "description"] if d.lower().split(" ")[0:2] and d.lower() in train_text]
assert not leaks, f"unseen test rows found in training data: {leaks}"


# %% Rule-based baseline (the production JavaScript)
def rules_predict(descriptions):
    script = (
        "const {categorizeTransaction}=require(process.argv[1]);"
        "const rows=JSON.parse(require('fs').readFileSync(0,'utf8'));"
        "process.stdout.write(JSON.stringify(rows.map(d=>categorizeTransaction(d,{isCredit:false}))));"
    )
    out = subprocess.run(
        ["node", "-e", script, str(REPO / "server" / "src" / "utils" / "categorizer.js")],
        input=json.dumps(list(descriptions)),
        capture_output=True,
        text=True,
        check=True,
    )
    return np.array(json.loads(out.stdout))


# %% Models
def make_rf():
    return Pipeline(
        [
            ("tfidf", build_vectoriser()),
            ("rf", RandomForestClassifier(
                n_estimators=300, class_weight="balanced_subsample", min_samples_leaf=1, n_jobs=-1, random_state=SEED
            )),
        ]
    )


def make_logreg():
    return Pipeline([("tfidf", build_vectoriser()), ("lr", LogisticRegression(max_iter=3000, C=5, class_weight="balanced"))])


def scores(y_true, y_pred):
    return {
        "accuracy": round(accuracy_score(y_true, y_pred), 4),
        "macro_f1": round(f1_score(y_true, y_pred, average="macro", labels=CATEGORIES, zero_division=0), 4),
    }


STRATEGIES = ["ml_first", "ml_first_guess", "rules_first"]


def combine(strategy, ml_pred, ml_conf, rule_pred, t):
    """How the app merges the model with the rules (mirrored in server/src/services/categoryModel.js).

    ml_first        model if confidence >= t, else the rules (which may say Others)
    ml_first_guess  model if confidence >= t, else a specific rule match, else the model's best guess
    rules_first     a specific rule match wins, else the model if confidence >= t, else Others
    """
    rule_hit = rule_pred != "Others"
    if strategy == "ml_first":
        return np.where(ml_conf >= t, ml_pred, rule_pred)
    if strategy == "ml_first_guess":
        return np.where(ml_conf >= t, ml_pred, np.where(rule_hit, rule_pred, ml_pred))
    return np.where(rule_hit, rule_pred, np.where(ml_conf >= t, ml_pred, "Others"))


# %% A. Merchant-grouped cross-validation
gkf = GroupKFold(n_splits=5)
X, y, groups = my["description"].to_numpy(), my["category"].to_numpy(), my["merchant"].to_numpy()
rule_my = rules_predict(X)

cv_variants = {"rf_my_only": (make_rf, False), "rf_my_plus_us": (make_rf, True), "logreg_my_plus_us": (make_logreg, True)}
oof = {}
cv_results = {"rules": scores(y, rule_my)}
for name, (factory, use_us) in cv_variants.items():
    if use_us and us is None:
        continue
    pred = np.empty(len(y), dtype=object)
    conf = np.zeros(len(y))
    for tr, te in gkf.split(X, y, groups):
        Xtr, ytr = X[tr], y[tr]
        if use_us:
            Xtr = np.concatenate([Xtr, us["description"].to_numpy()])
            ytr = np.concatenate([ytr, us["category"].to_numpy()])
        model = factory().fit(Xtr, ytr)
        proba = model.predict_proba(X[te])
        pred[te] = model.classes_[proba.argmax(1)]
        conf[te] = proba.max(1)
    oof[name] = (pred, conf)
    cv_results[name] = scores(y, pred)
    print(f"CV {name}: {cv_results[name]}")
print(f"CV rules: {cv_results['rules']}")

# Pick the model variant, then the way to combine it with the rules, on out-of-fold predictions only
MODEL_LABEL = {"rf": "Random Forest", "logreg": "Logistic Regression"}[args.model]
prefix = "rf_" if args.model == "rf" else "logreg_"
rf_name = max((k for k in oof if k.startswith(prefix)), key=lambda k: cv_results[k]["macro_f1"])
use_us_final = rf_name.endswith("_plus_us")
pred_rf, conf_rf = oof[rf_name]
combo_grid = []
for strategy in STRATEGIES:
    for t in THRESHOLDS:
        s = scores(y, combine(strategy, pred_rf, conf_rf, rule_my, t))
        combo_grid.append({"strategy": strategy, "threshold": t, **s})
best = max(combo_grid, key=lambda r: (r["macro_f1"], r["accuracy"]))
DECISION = {"strategy": best["strategy"], "threshold": best["threshold"]}
print(f"\nChosen {MODEL_LABEL} variant: {rf_name}; decision rule from CV: {DECISION} -> {best}")

# %% Final model on all Malaysian data (+ US if it helped)
Xfin, yfin = X, y
if use_us_final:
    Xfin = np.concatenate([X, us["description"].to_numpy()])
    yfin = np.concatenate([y, us["category"].to_numpy()])
model = (make_rf if args.model == "rf" else make_logreg)().fit(Xfin, yfin)

# %% B/C. Hand-labelled test sets
test_results = {}
tests = tests.assign(rules=rules_predict(tests["description"]))
proba = model.predict_proba(tests["description"])
tests = tests.assign(model=model.classes_[proba.argmax(1)], model_conf=proba.max(1).round(3))
tests = tests.assign(hybrid=combine(DECISION["strategy"], tests["model"].to_numpy(), tests["model_conf"].to_numpy(), tests["rules"].to_numpy(), DECISION["threshold"]))
for name, g in list(tests.groupby("set")) + [("all", tests)]:
    test_results[name] = {"n": len(g), **{m: scores(g["category"], g[m]) for m in ["rules", "model", "hybrid"]}}
    print(f"\n{name} (n={len(g)}): " + ", ".join(f"{m} acc {test_results[name][m]['accuracy']}" for m in ["rules", "model", "hybrid"]))

# Rows the deployed hybrid gets wrong (descriptions only for the public sets)
wrong = tests[tests["hybrid"] != tests["category"]]
print("\nHybrid mistakes on public test sets:")
print(wrong[wrong["set"] != "real_statement"][["set", "description", "category", "rules", "model", "model_conf", "hybrid"]].to_string(index=False))

# %% Plots for Chapter 4
out_dir = Path(args.outputs_dir)
out_dir.mkdir(parents=True, exist_ok=True)
fig = plt.figure(figsize=(17, 6.5))
gs = fig.add_gridspec(1, 2, width_ratios=[1.15, 1])

ax = fig.add_subplot(gs[0])
hyb_oof = combine(DECISION["strategy"], pred_rf, conf_rf, rule_my, DECISION["threshold"])
cm = confusion_matrix(y, hyb_oof, labels=CATEGORIES, normalize="true")
ax.imshow(cm, cmap="YlOrBr", vmin=0, vmax=1)
for (i, j), v in np.ndenumerate(cm):
    if v >= 0.01:
        ax.text(j, i, f"{v:.2f}", ha="center", va="center", fontsize=7.5, color="white" if v > 0.5 else "black")
ax.set(xticks=range(len(CATEGORIES)), yticks=range(len(CATEGORIES)), xticklabels=CATEGORIES, yticklabels=CATEGORIES,
       title=f"Hybrid ({MODEL_LABEL} + rules) on unseen merchants\nmerchant-grouped 5-fold CV, row-normalised", xlabel="Predicted", ylabel="Actual")
plt.setp(ax.get_xticklabels(), fontsize=8, rotation=40, ha="right", rotation_mode="anchor")

ax = fig.add_subplot(gs[1])
sets = [s for s in ["merchant_cv", "unseen_merchants", "sample_statements", "real_statement"] if s == "merchant_cv" or s in test_results]
vals = {
    "Rules": [cv_results["rules"]["accuracy"]] + [test_results[s]["rules"]["accuracy"] for s in sets[1:]],
    MODEL_LABEL: [cv_results[rf_name]["accuracy"]] + [test_results[s]["model"]["accuracy"] for s in sets[1:]],
    "Hybrid (deployed)": [best["accuracy"]] + [test_results[s]["hybrid"]["accuracy"] for s in sets[1:]],
}
xs = np.arange(len(sets))
for k, (label, v) in enumerate(vals.items()):
    bars = ax.bar(xs + (k - 1) * 0.27, v, 0.27, label=label, color=["#94A3B8", "#FFC80A", "#10B981"][k])
    ax.bar_label(bars, labels=[f"{x:.0%}" for x in v], fontsize=8, padding=2)
ax.set(xticks=xs, xticklabels=["Unseen merchants\n(grouped CV)", "Unseen merchants\n(hand-labelled)", "Sample\nstatements", "Real statement*"][: len(sets)],
       ylim=(0, 1.2), ylabel="Accuracy", title="Accuracy by test set")
ax.legend(loc="upper left", ncol=3, fontsize=9, frameon=False)
if "real_statement" in sets:
    ax.text(0.99, -0.2, "*the rules were written from this statement", transform=ax.transAxes, ha="right", fontsize=8, color="#64748B")
fig.tight_layout()
plot_path = out_dir / f"category_{args.model}_evaluation.png"
fig.savefig(plot_path, dpi=150)
print(f"\nsaved {plot_path}")

# %% Save
trained_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
report = classification_report(y, hyb_oof, labels=CATEGORIES, output_dict=True, zero_division=0)
metrics = {
    "model": "TF-IDF (char 2-5 + word 1-2) + "
    + ("Random Forest (300 trees, balanced)" if args.model == "rf" else "Logistic Regression (C=5, balanced)"),
    "rf_variant": rf_name,
    "training_rows": {"malaysian": len(my), "us_public": len(us) if use_us_final and us is not None else 0},
    "malaysian_merchants": int(my["merchant"].nunique()),
    "cv_merchant_grouped_5fold": cv_results,
    "decision": DECISION,
    "decision_grid_cv": combo_grid,
    "hybrid_cv_per_class": {c: {k: round(v, 3) for k, v in report[c].items()} for c in CATEGORIES},
    "test_sets": test_results,
    "trained_at": trained_at,
}
models_dir = Path(args.models_dir)
models_dir.mkdir(parents=True, exist_ok=True)
joblib.dump(
    {"model": model, "model_name": MODEL_LABEL, "classes": list(model.classes_), "decision": DECISION, "metrics": metrics, "trained_at": trained_at},
    models_dir / "category_model.pkl",
    compress=3,
)
(models_dir / "category_model_metrics.json").write_text(json.dumps(metrics, indent=2))
print(f"saved {models_dir / 'category_model.pkl'} ({MODEL_LABEL})")
