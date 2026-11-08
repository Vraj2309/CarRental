"""HTTP-level tests. Skipped automatically if FastAPI/httpx aren't installed."""
import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

client = TestClient(app)


def test_health():
    body = client.get("/health").json()
    assert body["status"] == "ok"


def test_quote_endpoint():
    res = client.post("/price/quote", json={
        "city": "Ahmedabad", "carType": "suv", "basePrice": 3000,
        "startDate": "2026-12-20", "endDate": "2026-12-22", "bookingDate": "2026-11-10",
    })
    assert res.status_code == 200
    body = res.json()
    assert len(body["days"]) == 2 and body["totalPrice"] > 0


def test_quote_rejects_bad_dates():
    res = client.post("/price/quote", json={
        "city": "Ahmedabad", "carType": "suv", "basePrice": 3000,
        "startDate": "2026-12-22", "endDate": "2026-12-20",
    })
    assert res.status_code == 422  # FastAPI's validation error code
