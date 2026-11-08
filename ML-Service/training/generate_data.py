"""Generate SYNTHETIC daily demand data for training the pricing model.

The project has no real booking history yet, so we simulate one. Each row is
one (city, car type, day) with the share of that fleet that was rented out
(0 = no car rented, 1 = every car rented).

The rules below are assumptions about the Indian rental market, written down
explicitly so they can be questioned and replaced by real data later:
  - SUVs/MUVs are leisure cars: they spike on weekends and festivals
  - Mumbai and Bengaluru are busier than Gandhinagar
  - May-June (summer holidays) and December are peak season; monsoon is slow
  - random noise, because real demand is never perfectly regular

Run:  python -m training.generate_data
"""
from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

from app.holidays import days_to_nearest_holiday

CITIES = {"Ahmedabad": 0.0, "Gandhinagar": -0.07, "Mumbai": 0.08, "Bengaluru": 0.05}
CAR_TYPES = {"hatchback": 0.55, "sedan": 0.50, "suv": 0.58, "muv": 0.50, "luxury": 0.30}
LEISURE = {"suv", "muv"}

START, END = date(2024, 1, 1), date(2026, 10, 31)
OUT = Path(__file__).resolve().parent.parent / "data" / "demand.csv"


def season_effect(month: int) -> float:
    if month in (5, 6):
        return 0.08  # summer holidays
    if month == 12:
        return 0.10  # year-end travel
    if month in (7, 8):
        return -0.07  # monsoon
    return 0.0


def simulate(seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)  # fixed seed: same data every run
    rows = []
    day = START
    while day <= END:
        is_weekend = day.weekday() >= 5
        gap = days_to_nearest_holiday(day)
        for city, city_adj in CITIES.items():
            for car_type, base in CAR_TYPES.items():
                leisure = car_type in LEISURE
                demand = base + city_adj + season_effect(day.month)
                if is_weekend:
                    demand += 0.20 if leisure else (0.10 if car_type == "luxury" else 0.12)
                if gap <= 2:  # festival window: two days either side
                    demand += (0.25 if leisure else 0.18) * (1 - gap / 3)
                demand += rng.normal(0, 0.06)
                rows.append(
                    {
                        "date": day.isoformat(),
                        "city": city,
                        "car_type": car_type,
                        "demand": float(np.clip(demand, 0.02, 0.98)),
                    }
                )
        day += timedelta(days=1)
    return pd.DataFrame(rows)


if __name__ == "__main__":
    df = simulate()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUT, index=False)
    print(f"Wrote {len(df):,} rows to {OUT}")
    print(df.groupby("car_type")["demand"].mean().round(3).to_string())
