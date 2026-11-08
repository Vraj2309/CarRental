"""Indian public holidays and festivals that drive car-rental demand.

Fixed-date holidays are exact. Lunar festivals (Holi, Eid, Diwali, ...) move
every year and the dates below are APPROXIMATE: verify and extend this list
each year (or switch to the `holidays` Python package) before relying on it.
"""
from __future__ import annotations

from datetime import date

_FIXED = [(1, 14), (1, 26), (8, 15), (10, 2), (12, 25)]  # Uttarayan, Republic, Independence, Gandhi Jayanti, Christmas

_LUNAR = [
    # 2024
    "2024-03-25", "2024-04-11", "2024-09-07", "2024-10-12", "2024-11-01", "2024-11-15",
    # 2025
    "2025-03-14", "2025-03-31", "2025-08-27", "2025-10-02", "2025-10-20", "2025-11-05",
    # 2026
    "2026-03-04", "2026-03-20", "2026-09-14", "2026-10-20", "2026-11-08", "2026-11-24",
    # 2027
    "2027-03-10", "2027-03-22", "2027-09-04", "2027-10-09", "2027-10-29", "2027-11-14",
]


def _build(years: range) -> set[date]:
    days = {date.fromisoformat(d) for d in _LUNAR}
    for year in years:
        days.update(date(year, m, d) for m, d in _FIXED)
    return days


HOLIDAYS: set[date] = _build(range(2024, 2029))
_SORTED = sorted(HOLIDAYS)


def days_to_nearest_holiday(day: date, cap: int = 10) -> int:
    """Distance in days to the closest holiday, capped (10 means 'far away')."""
    best = cap
    for h in _SORTED:
        gap = abs((h - day).days)
        if gap < best:
            best = gap
    return best
