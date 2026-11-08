"""Dynamic pricing: base price x demand multiplier, with guardrails.

  daily multiplier = demand factor (model + live bookings)
                   x lead-time factor (how early you book)
                   x length factor (long trips are cheaper per day)
  then clipped to [MIN_MULT, MAX_MULT]

The ML model only estimates DEMAND. Turning demand into money is done by
simple, readable rules, so the business can explain and cap every price.
A model alone should never be allowed to set a price without limits.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path

import joblib
import numpy as np

from .features import build_frame
from .holidays import days_to_nearest_holiday

MIN_MULT, MAX_MULT = 0.80, 1.40
DEMAND_SENSITIVITY = 0.6  # demand 0.5 -> x1.00, demand 1.0 -> x1.30, demand 0.0 -> x0.70
LIVE_WEIGHT = 0.3  # how much today's real bookings count vs the model's forecast

MODEL_PATH = Path(__file__).resolve().parent.parent / "models" / "demand_model.joblib"


@dataclass
class Quote:
    total_price: int
    days: list[dict]
    avg_multiplier: float
    reasons: list[str] = field(default_factory=list)
    model_version: str | None = None


class DemandModel:
    """Loads the trained model once and predicts demand per day."""

    def __init__(self, path: Path = MODEL_PATH):
        bundle = joblib.load(path)
        self.model = bundle["model"]
        self.version = bundle["version"]

    def predict(self, city: str, car_type: str, days: list[date]) -> np.ndarray:
        frame = build_frame([(city, car_type, d) for d in days])
        return np.clip(self.model.predict(frame), 0.0, 1.0)


def lead_time_factor(booking_day: date, start: date) -> tuple[float, str | None]:
    lead = (start - booking_day).days
    if lead <= 2:
        return 1.10, "Last-minute booking (+10%)"
    if lead <= 7:
        return 1.05, "Booking within a week (+5%)"
    if lead >= 30:
        return 0.95, "Early-bird discount (-5%)"
    return 1.00, None


def length_factor(n_days: int) -> tuple[float, str | None]:
    if n_days >= 14:
        return 0.85, "Long-trip discount, 14+ days (-15%)"
    if n_days >= 7:
        return 0.90, "Weekly discount, 7+ days (-10%)"
    return 1.00, None


def quote(
    model: DemandModel | None,
    *,
    city: str,
    car_type: str,
    base_price: int,
    start: date,
    end: date,
    booking_day: date,
    live_utilisation: float | None = None,
) -> Quote:
    """Price a rental from `start` (pickup) to `end` (return, not charged)."""
    days = [start + timedelta(days=i) for i in range((end - start).days)]
    if not days:
        raise ValueError("end must be after start")

    # 1) Expected demand per day from the model (0.5 = "normal" if no model).
    forecast = model.predict(city, car_type, days) if model else np.full(len(days), 0.5)

    # 2) Blend in what is actually booked right now for these dates.
    demand = forecast
    if live_utilisation is not None:
        demand = (1 - LIVE_WEIGHT) * forecast + LIVE_WEIGHT * float(np.clip(live_utilisation, 0, 1))

    lead_f, lead_reason = lead_time_factor(booking_day, start)
    len_f, len_reason = length_factor(len(days))

    breakdown, total = [], 0
    for day, d in zip(days, demand):
        demand_f = 1 + DEMAND_SENSITIVITY * (float(d) - 0.5)
        mult = round(float(np.clip(demand_f * lead_f * len_f, MIN_MULT, MAX_MULT)), 2)
        price = int(round(base_price * mult))  # whole rupees
        total += price
        breakdown.append(
            {"date": day.isoformat(), "demand": round(float(d), 2), "multiplier": mult, "price": price}
        )

    # 3) Human-readable reasons, so the user sees WHY the price is what it is.
    reasons = []
    if any(d.weekday() >= 5 for d in days):
        reasons.append("Includes weekend days (higher demand)")
    if any(days_to_nearest_holiday(d) <= 2 for d in days):
        reasons.append("Near a festival or public holiday (higher demand)")
    if live_utilisation is not None and live_utilisation >= 0.7:
        reasons.append(f"{round(live_utilisation * 100)}% of similar cars already booked")
    reasons += [r for r in (lead_reason, len_reason) if r]
    avg = round(total / (base_price * len(days)), 2)
    if not reasons:
        reasons.append("Standard demand for these dates")

    return Quote(
        total_price=total,
        days=breakdown,
        avg_multiplier=avg,
        reasons=reasons,
        model_version=model.version if model else None,
    )
