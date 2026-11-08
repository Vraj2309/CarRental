"""Train and evaluate the demand model used for dynamic pricing.

Steps:
  1. load synthetic demand data (generate it first if missing)
  2. TIME-BASED split: train on older days, test on the most recent months
  3. compare the model against a simple baseline
  4. save the model and its metrics

Why a time-based split and not a random one? In production the model always
predicts the FUTURE from the past. A random split would let it "peek" at days
surrounding each test day (leakage) and report a score it can never reach
in real use.

Run:  python -m training.train_pricing
"""
from __future__ import annotations

import json
from datetime import date, datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

from app.features import CATEGORICAL, FEATURES, NUMERIC, build_frame
from training.generate_data import OUT as DATA_PATH
from training.generate_data import simulate

ROOT = Path(__file__).resolve().parent.parent
MODEL_PATH = ROOT / "models" / "demand_model.joblib"
METRICS_PATH = ROOT / "models" / "metrics.json"
TEST_FROM = "2026-05-01"  # last 6 months are the test set


def load_data() -> pd.DataFrame:
    if not DATA_PATH.exists():
        df = simulate()
        DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
        df.to_csv(DATA_PATH, index=False)
    return pd.read_csv(DATA_PATH)


def to_features(df: pd.DataFrame) -> pd.DataFrame:
    rows = [(c, t, date.fromisoformat(d)) for c, t, d in zip(df["city"], df["car_type"], df["date"])]
    return build_frame(rows)


def make_model() -> Pipeline:
    pre = ColumnTransformer(
        [
            # handle_unknown="ignore": a new city at prediction time becomes
            # "all zeros" instead of crashing the API.
            ("cat", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL),
            ("num", "passthrough", NUMERIC),
        ]
    )
    # Gradient-boosted trees: strong on tabular data, capture interactions
    # such as "SUV AND weekend AND festival" without hand-written rules.
    reg = HistGradientBoostingRegressor(max_iter=300, learning_rate=0.05, max_depth=6, random_state=42)
    return Pipeline([("pre", pre), ("reg", reg)])


def main() -> None:
    df = load_data()
    train, test = df[df["date"] < TEST_FROM], df[df["date"] >= TEST_FROM]
    X_train, X_test = to_features(train), to_features(test)
    y_train, y_test = train["demand"].to_numpy(), test["demand"].to_numpy()

    model = make_model().fit(X_train, y_train)
    pred = np.clip(model.predict(X_test), 0, 1)

    # Baseline: the average demand for that city + car type + weekday/weekend.
    # If the model can't beat this, it isn't worth its complexity.
    keys = ["city", "car_type", "is_weekend"]
    means = X_train.assign(y=y_train).groupby(keys)["y"].mean()
    baseline = X_test[keys].apply(tuple, axis=1).map(means).fillna(y_train.mean()).to_numpy()

    metrics = {
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "train_rows": int(len(train)),
        "test_rows": int(len(test)),
        "test_period": f"{TEST_FROM} .. {test['date'].max()}",
        "model": {"mae": round(float(mean_absolute_error(y_test, pred)), 4), "r2": round(float(r2_score(y_test, pred)), 4)},
        "baseline": {
            "mae": round(float(mean_absolute_error(y_test, baseline)), 4),
            "r2": round(float(r2_score(y_test, baseline)), 4),
        },
        "features": FEATURES,
        "data": "synthetic (see training/generate_data.py)",
    }

    # Retrain on ALL data for the final model: the test set was only for
    # measuring; the newest days are the most useful for real predictions.
    final = make_model().fit(to_features(df), df["demand"].to_numpy())
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    version = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    joblib.dump({"model": final, "version": version, "features": FEATURES}, MODEL_PATH)
    metrics["version"] = version
    METRICS_PATH.write_text(json.dumps(metrics, indent=2))

    print(json.dumps(metrics, indent=2))
    print(f"\nSaved model to {MODEL_PATH}")


if __name__ == "__main__":
    main()
