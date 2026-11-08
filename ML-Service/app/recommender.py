"""Car recommendations: a hybrid of three signals.

  content-based  "you booked automatic SUVs, here are more like them"
  collaborative  "people who booked your cars also booked this one"
  popularity     "frequently booked" (also the answer for brand-new users)

No training step: the scores are computed from the bookings the Node API
sends on each request. That keeps MongoDB the single source of truth and
means this service needs no database access or credentials of its own.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass

import numpy as np

CAR_TYPES = ["hatchback", "sedan", "suv", "muv", "luxury"]
FUELS = ["petrol", "diesel", "cng", "electric"]
TRANSMISSIONS = ["manual", "automatic"]

WEIGHTS_KNOWN_USER = {"content": 0.5, "collab": 0.3, "popular": 0.2}
WEIGHTS_NEW_USER = {"content": 0.0, "collab": 0.0, "popular": 1.0}


@dataclass
class Car:
    id: str
    name: str
    car_type: str
    fuel: str
    transmission: str
    seats: int
    city: str
    price_per_day: int


def _one_hot(value: str, options: list[str]) -> list[float]:
    return [1.0 if value == o else 0.0 for o in options]


def _vectorise(car: Car, cities: list[str], max_price: float) -> np.ndarray:
    """Turn a car into numbers so cars can be compared mathematically."""
    return np.array(
        _one_hot(car.car_type, CAR_TYPES) * 2  # type matters most: counted twice
        + _one_hot(car.fuel, FUELS)
        + _one_hot(car.transmission, TRANSMISSIONS)
        + _one_hot(car.city.lower(), cities)
        + [car.seats / 9, car.price_per_day / max_price]
    )


def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    """1 = pointing the same way (very similar), 0 = nothing in common."""
    norm = np.linalg.norm(a) * np.linalg.norm(b)
    return float(a @ b / norm) if norm else 0.0


def _normalise(scores: dict[str, float]) -> dict[str, float]:
    top = max(scores.values(), default=0.0)
    return {k: (v / top if top else 0.0) for k, v in scores.items()}


def recommend(
    candidates: list[Car],
    user_car_ids: list[str],
    co_bookings: list[list[str]],
    *,
    city: str | None = None,
    limit: int = 6,
) -> list[dict]:
    """
    candidates:   cars that may be recommended (active cars)
    user_car_ids: cars this user booked before
    co_bookings:  one list per user of the cars they booked (all users)
    """
    if not candidates:
        return []
    by_id = {c.id: c for c in candidates}
    history = [by_id[i] for i in user_car_ids if i in by_id]
    seen = set(user_car_ids)
    pool = [c for c in candidates if c.id not in seen] or candidates

    # Popularity: in how many users' histories does each car appear?
    popularity = Counter(car_id for cars in co_bookings for car_id in set(cars))
    pop = _normalise({c.id: float(popularity.get(c.id, 0)) for c in pool})

    content: dict[str, float] = {c.id: 0.0 for c in pool}
    collab: dict[str, float] = {c.id: 0.0 for c in pool}
    because: dict[str, str] = {}

    if history:
        cities = sorted({c.city.lower() for c in candidates})
        max_price = max(c.price_per_day for c in candidates) or 1
        # The user's "taste" = average vector of the cars they booked.
        profile = np.mean([_vectorise(c, cities, max_price) for c in history], axis=0)
        content = {c.id: _cosine(profile, _vectorise(c, cities, max_price)) for c in pool}

        # Item-item co-occurrence: count users who booked one of MY cars AND
        # the candidate. Divided by the candidate's popularity, otherwise the
        # most popular car would win every time.
        mine = set(user_car_ids)
        co = Counter()
        anchor: dict[str, str] = {}
        for cars in co_bookings:
            cars = set(cars)
            shared = cars & mine
            if not shared:
                continue
            for car_id in cars - mine:
                co[car_id] += 1
                anchor.setdefault(car_id, next(iter(shared)))
        collab = _normalise(
            {c.id: co.get(c.id, 0) / np.sqrt(popularity.get(c.id, 0) or 1) for c in pool}
        )
        for car_id, other in anchor.items():
            if other in by_id:
                because[car_id] = by_id[other].name

    w = WEIGHTS_KNOWN_USER if history else WEIGHTS_NEW_USER
    results = []
    for c in pool:
        score = w["content"] * content[c.id] + w["collab"] * collab[c.id] + w["popular"] * pop[c.id]
        if city and c.city.lower() == city.lower():
            score += 0.15  # gentle boost for the city the user is browsing
        results.append((score, c))
    results.sort(key=lambda r: (-r[0], r[1].price_per_day))

    out = []
    for score, c in results[:limit]:
        if history and collab.get(c.id, 0) >= 0.5 and c.id in because:
            reason = f"People who booked the {because[c.id]} also booked this"
        elif history and content.get(c.id, 0) >= 0.8:
            reason = "Similar to cars you booked before"
        elif pop.get(c.id, 0) >= 0.5:
            reason = f"Popular in {c.city}"
        else:
            reason = f"Available in {c.city}"
        out.append({"carId": c.id, "score": round(score, 3), "reason": reason})
    return out
