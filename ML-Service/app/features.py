"""Feature engineering shared by training and serving.

Using ONE function for both is deliberate: if training computed a feature
slightly differently from the live API ("training/serving skew"), the model
would silently give wrong answers in production.
"""
from __future__ import annotations

import math
from datetime import date

import pandas as pd

from .holidays import days_to_nearest_holiday

CATEGORICAL = ["city", "car_type"]
NUMERIC = [
    "day_of_week",
    "month",
    "is_weekend",
    "days_to_holiday",
    "is_holiday_window",
    "doy_sin",
    "doy_cos",
]
FEATURES = CATEGORICAL + NUMERIC


def day_features(day: date) -> dict:
    gap = days_to_nearest_holiday(day)
    doy = day.timetuple().tm_yday
    return {
        "day_of_week": day.weekday(),  # 0 = Monday
        "month": day.month,
        "is_weekend": int(day.weekday() >= 5),
        "days_to_holiday": gap,
        "is_holiday_window": int(gap <= 2),
        # Day of year as a point on a circle, so 31 Dec and 1 Jan are
        # neighbours instead of being 364 apart.
        "doy_sin": math.sin(2 * math.pi * doy / 365.25),
        "doy_cos": math.cos(2 * math.pi * doy / 365.25),
    }


def normalise_city(city: str) -> str:
    return city.strip().title()


def build_frame(rows: list[tuple[str, str, date]]) -> pd.DataFrame:
    """rows: (city, car_type, day) -> model-ready DataFrame."""
    records = [
        {"city": normalise_city(c), "car_type": t.lower(), **day_features(d)} for c, t, d in rows
    ]
    return pd.DataFrame.from_records(records, columns=FEATURES)
