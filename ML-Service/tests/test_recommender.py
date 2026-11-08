from app.recommender import Car, recommend


def car(i, t, fuel="petrol", tr="manual", city="Ahmedabad", price=2000, seats=5):
    return Car(id=i, name=f"Car {i}", car_type=t, fuel=fuel, transmission=tr,
               seats=seats, city=city, price_per_day=price)


CARS = [
    car("creta", "suv", "diesel", "automatic", price=3200),
    car("xuv", "suv", "diesel", "automatic", price=4500, seats=7),
    car("thar", "suv", "diesel", "manual", city="Gandhinagar", price=3500, seats=4),
    car("swift", "hatchback", price=1400),
    car("i20", "hatchback", tr="automatic", price=1800),
    car("city", "sedan", tr="automatic", price=2600),
    car("bmw", "luxury", "diesel", "automatic", city="Mumbai", price=11000),
]


def ids(items):
    return [r["carId"] for r in items]


def test_suv_fan_gets_suvs_first():
    out = recommend(CARS, ["creta"], co_bookings=[["creta"]], limit=3)
    assert out[0]["carId"] == "xuv"  # most similar remaining car
    assert "creta" not in ids(out)  # never recommend what you already booked


def test_people_also_booked():
    # Three other users booked the Creta together with the Swift.
    co = [["creta", "swift"], ["creta", "swift"], ["creta", "swift"], ["xuv"]]
    out = recommend(CARS, ["creta"], co, limit=7)
    swift = next(r for r in out if r["carId"] == "swift")
    hatch = next(r for r in out if r["carId"] == "i20")
    assert swift["score"] > hatch["score"]  # same type, but co-booked
    assert "also booked" in swift["reason"]


def test_new_user_gets_popular_cars():
    co = [["city"], ["city"], ["city"], ["swift"]]
    out = recommend(CARS, [], co, limit=2)
    assert out[0]["carId"] == "city"
    assert "Popular" in out[0]["reason"]


def test_city_boost():
    out = recommend(CARS, [], co_bookings=[], city="Mumbai", limit=1)
    assert out[0]["carId"] == "bmw"


def test_limit_and_empty_inputs():
    assert recommend([], [], []) == []
    assert len(recommend(CARS, [], [], limit=4)) == 4
