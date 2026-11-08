from datetime import date

import pytest

from app import pricing

BOOKED_ON = date(2026, 11, 10)


@pytest.fixture(scope="module")
def model():
    if not pricing.MODEL_PATH.exists():
        pytest.skip("Train the model first: python -m training.train_pricing")
    return pricing.DemandModel()


def q(model, **kw):
    args = dict(city="Ahmedabad", car_type="suv", base_price=3000, booking_day=BOOKED_ON)
    args.update(kw)
    return pricing.quote(model, **args)


def test_multiplier_always_within_guardrails(model):
    # Worst case for "too expensive": last-minute SUV over Diwali, fully booked.
    hot = q(model, start=date(2026, 11, 11), end=date(2026, 11, 13), live_utilisation=1.0)
    # Worst case for "too cheap": long, early, quiet monsoon rental.
    cold = q(model, car_type="luxury", city="Gandhinagar", start=date(2027, 7, 6), end=date(2027, 7, 26),
             booking_day=date(2027, 5, 1), live_utilisation=0.0)
    for quote in (hot, cold):
        for day in quote.days:
            assert pricing.MIN_MULT <= day["multiplier"] <= pricing.MAX_MULT


def test_total_is_sum_of_days(model):
    quote = q(model, start=date(2026, 12, 18), end=date(2026, 12, 21))
    assert len(quote.days) == 3  # return day is not charged
    assert quote.total_price == sum(d["price"] for d in quote.days)


def test_weekend_costs_more_than_weekday(model):
    # Same lead time and length; Saturday vs Tuesday, no holiday nearby.
    weekend = q(model, start=date(2027, 2, 6), end=date(2027, 2, 7), booking_day=date(2027, 1, 20))
    weekday = q(model, start=date(2027, 2, 9), end=date(2027, 2, 10), booking_day=date(2027, 1, 23))
    assert weekend.total_price > weekday.total_price


def test_festival_raises_price(model):
    diwali = q(model, start=date(2027, 10, 28), end=date(2027, 10, 30), booking_day=date(2027, 10, 1))
    normal = q(model, start=date(2027, 10, 12), end=date(2027, 10, 14), booking_day=date(2027, 9, 15))
    assert diwali.total_price > normal.total_price
    assert any("festival" in r for r in diwali.reasons)


def test_live_bookings_raise_price(model):
    args = dict(start=date(2027, 2, 9), end=date(2027, 2, 11))
    assert q(model, live_utilisation=0.95, **args).total_price > q(model, live_utilisation=0.05, **args).total_price


def test_long_trip_discount_per_day(model):
    week = q(model, start=date(2027, 2, 1), end=date(2027, 2, 8))
    assert any("Weekly discount" in r for r in week.reasons)


def test_works_without_model():
    """If the model file is missing, pricing falls back to neutral demand."""
    quote = q(None, start=date(2026, 12, 15), end=date(2026, 12, 17))
    assert quote.total_price > 0 and quote.model_version is None


def test_unknown_city_does_not_crash(model):
    quote = q(model, city="Surat", start=date(2026, 12, 15), end=date(2026, 12, 16))
    assert quote.total_price > 0


def test_rejects_empty_range(model):
    with pytest.raises(ValueError):
        q(model, start=date(2026, 12, 15), end=date(2026, 12, 15))
