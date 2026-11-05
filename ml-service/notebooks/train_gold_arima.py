# %% [markdown]
# # Module 4 — Life Goals Planner: gold price forecast (ARIMA)
#
# Data (monthly, public, no login):
#   - Gold, USD per troy ounce: World Bank Commodity Markets "Pink Sheet" (1960-), via
#     datahub.io/core/gold-prices  -> data/raw/gold/gold_usd_oz_monthly.csv
#   - USD/MYR exchange rate: US Federal Reserve, FRED series EXMAUS -> data/raw/gold/usd_myr_monthly.csv
# Gold in MYR per gram = USD/oz x MYR per USD / 31.1034768
#
# Model: ARIMA(p,1,q) with drift on log(price). The order is chosen by AIC on data BEFORE the
# evaluation window, then evaluated by a rolling-origin backtest (refit every month, forecast
# 1-12 months ahead) against two baselines: naive (last price) and random walk with drift.
# Metrics: MAE, RMSE (RM/gram), MAPE (%), plus 80% interval coverage.
#
# Run as a script:   .venv\Scripts\python notebooks\train_gold_arima.py
# or cell-by-cell in VS Code (the `# %%` markers make it a notebook).

# %%
import argparse
import itertools
import json
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path

import joblib
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from statsmodels.tsa.arima.model import ARIMA

warnings.filterwarnings("ignore")  # statsmodels convergence chatter during the backtest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

parser = argparse.ArgumentParser()
parser.add_argument("--data-dir", default=str(ROOT / "data" / "raw" / "gold"))
parser.add_argument("--models-dir", default=str(ROOT / "models"))
parser.add_argument("--outputs-dir", default=str(ROOT / "notebooks" / "outputs"))
parser.add_argument("--start", default="2000-01", help="first month used for modelling")
parser.add_argument("--eval-months", type=int, default=60, help="length of the backtest window")
args, _ = parser.parse_known_args()

GRAMS_PER_TROY_OZ = 31.1034768
HORIZONS = [1, 3, 6, 12]
MAX_H = max(HORIZONS)
MODELS_DIR = Path(args.models_dir)
OUT_DIR = Path(args.outputs_dir)
MODELS_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

# %% Load and convert to MYR per gram
data_dir = Path(args.data_dir)
gold = pd.read_csv(data_dir / "gold_usd_oz_monthly.csv")
gold["month"] = pd.PeriodIndex(gold["Date"], freq="M")
fx = pd.read_csv(data_dir / "usd_myr_monthly.csv")
fx["month"] = pd.PeriodIndex(pd.to_datetime(fx["observation_date"]), freq="M")
fx = fx.rename(columns={"EXMAUS": "myr_per_usd"})
fx["myr_per_usd"] = pd.to_numeric(fx["myr_per_usd"], errors="coerce")

df = gold.merge(fx[["month", "myr_per_usd"]], on="month").dropna()
df["myr_per_gram"] = df["Price"] * df["myr_per_usd"] / GRAMS_PER_TROY_OZ
df = df[df["month"] >= pd.Period(args.start, "M")].set_index("month").sort_index()
series = df["myr_per_gram"]
series.index = series.index.to_timestamp()
series = series.asfreq("MS")
assert series.notna().all(), "gap in the monthly series"
print(f"{len(series)} months, {series.index[0]:%Y-%m} to {series.index[-1]:%Y-%m}")
print(f"Latest: RM {series.iloc[-1]:.2f}/g  |  CAGR since {args.start}: "
      f"{(series.iloc[-1] / series.iloc[0]) ** (12 / (len(series) - 1)) - 1:.2%}")

log_y = np.log(series)

# %% Choose the ARIMA order by AIC on data before the backtest window (no peeking)
eval_start = len(log_y) - args.eval_months
train_for_selection = log_y.iloc[:eval_start]
candidates = []
for p, q in itertools.product(range(3), range(3)):
    try:
        res = ARIMA(train_for_selection, order=(p, 1, q), trend="t").fit()
        candidates.append({"order": (p, 1, q), "aic": float(res.aic)})
    except Exception as exc:  # noqa: BLE001
        print(f"  ARIMA({p},1,{q}) failed: {exc}")
candidates.sort(key=lambda c: c["aic"])
ORDER = candidates[0]["order"]
print("AIC ranking:", [(c["order"], round(c["aic"], 1)) for c in candidates[:5]])
print(f"Selected ARIMA{ORDER} with drift")

# %% Rolling-origin backtest: at each month in the window, fit on data so far and forecast 1-12 months
records = []
for origin in range(eval_start, len(log_y) - 1):
    hist = log_y.iloc[: origin + 1]
    steps = min(MAX_H, len(log_y) - 1 - origin)
    actual = series.iloc[origin + 1 : origin + 1 + steps].values

    fc = ARIMA(hist, order=ORDER, trend="t").fit().get_forecast(steps)
    arima_mean = np.exp(fc.predicted_mean.values)
    ci80 = np.exp(fc.conf_int(alpha=0.2).values)

    last = series.iloc[origin]
    drift = np.diff(hist.values).mean()  # mean monthly log growth so far
    for h in range(1, steps + 1):
        rec = {"origin": series.index[origin], "h": h, "actual": actual[h - 1]}
        rec["arima"] = arima_mean[h - 1]
        rec["naive"] = last
        rec["drift"] = last * np.exp(drift * h)
        rec["in_80"] = ci80[h - 1, 0] <= actual[h - 1] <= ci80[h - 1, 1]
        records.append(rec)
bt = pd.DataFrame(records)


def scores(frame, model):
    err = frame[model] - frame["actual"]
    return {
        "mae": round(float(err.abs().mean()), 2),
        "rmse": round(float(np.sqrt((err**2).mean())), 2),
        "mape": round(float((err.abs() / frame["actual"]).mean() * 100), 2),
    }


evaluation = {}
for h in HORIZONS:
    frame = bt[bt["h"] == h]
    evaluation[f"h{h}"] = {
        "forecasts": int(len(frame)),
        **{m: scores(frame, m) for m in ["arima", "drift", "naive"]},
        "arima_80pct_interval_coverage": round(float(frame["in_80"].mean()), 3),
    }
print(json.dumps(evaluation, indent=2))

# %% Final model on the full series
final = ARIMA(log_y, order=ORDER, trend="t").fit()
print(final.summary().tables[1])
implied_drift = float(np.exp(final.params.get("x1", 0.0) * 12) - 1)
print(f"Implied long-run growth (drift): {implied_drift:.2%} per year")

# %% Plots for the report
fig, axes = plt.subplots(1, 2, figsize=(16, 5.5), gridspec_kw={"width_ratios": [1.6, 1]})
fc = final.get_forecast(60)
idx = fc.predicted_mean.index
ci80 = np.exp(fc.conf_int(alpha=0.2))
ci95 = np.exp(fc.conf_int(alpha=0.05))
recent = series[series.index >= "2010-01-01"]
axes[0].plot(recent.index, recent.values, color="#0B0D13", label="Actual (RM/gram)")
axes[0].plot(idx, np.exp(fc.predicted_mean), color="#C79A00", label=f"ARIMA{ORDER} forecast (median)")
axes[0].fill_between(idx, ci95.iloc[:, 0], ci95.iloc[:, 1], color="#FFC80A", alpha=0.18, label="95% interval")
axes[0].fill_between(idx, ci80.iloc[:, 0], ci80.iloc[:, 1], color="#FFC80A", alpha=0.35, label="80% interval")
axes[0].set(title="Gold price in MYR per gram: history and 5-year forecast", ylabel="RM per gram")
axes[0].legend(loc="upper left")

x = np.arange(len(HORIZONS))
w = 0.27
for i, (m, color) in enumerate([("arima", "#C79A00"), ("drift", "#38BDF8"), ("naive", "#94A3B8")]):
    axes[1].bar(x + (i - 1) * w, [evaluation[f"h{h}"][m]["mape"] for h in HORIZONS], w, label=m, color=color)
axes[1].set(
    title=f"Rolling backtest, last {args.eval_months} months: MAPE by horizon",
    xticks=x, xticklabels=[f"{h} mo" for h in HORIZONS], ylabel="MAPE (%)", xlabel="Forecast horizon",
)
axes[1].legend()
plt.tight_layout(w_pad=3)
fig.savefig(OUT_DIR / "gold_arima_evaluation.png", dpi=150)
print(f"Saved plots -> {OUT_DIR / 'gold_arima_evaluation.png'}")

# %% Save model + metadata (loaded once by main.py at startup)
metrics = {
    "data": {
        "gold": "World Bank Commodity Markets (Pink Sheet) monthly gold USD/oz, via datahub.io/core/gold-prices",
        "fx": "FRED EXMAUS, Malaysian ringgit to one US dollar, monthly average",
        "unit": "MYR per gram",
        "months": int(len(series)),
        "start": f"{series.index[0]:%Y-%m}",
        "end": f"{series.index[-1]:%Y-%m}",
        "latest_price_per_gram": round(float(series.iloc[-1]), 2),
    },
    "model": f"ARIMA{ORDER} with drift on log price",
    "order_selection_aic": [{"order": list(c["order"]), "aic": round(c["aic"], 2)} for c in candidates],
    "implied_annual_drift": round(implied_drift, 4),
    "backtest": {"window_months": args.eval_months, "horizons": evaluation},
}
bundle = {
    "results": final,
    "order": ORDER,
    "last_month": f"{series.index[-1]:%Y-%m}",
    "last_price": float(series.iloc[-1]),
    "history": {f"{d:%Y-%m}": round(float(v), 2) for d, v in series[series.index >= "2016-01-01"].items()},
    "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    "metrics": metrics,
}
joblib.dump(bundle, MODELS_DIR / "gold_arima.pkl")
(MODELS_DIR / "gold_arima_metrics.json").write_text(json.dumps(metrics, indent=2))
print(f"Saved model -> {MODELS_DIR / 'gold_arima.pkl'}")
