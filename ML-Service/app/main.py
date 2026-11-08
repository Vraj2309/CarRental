"""FastAPI app: the HTTP layer around pricing.py and recommender.py.

Kept deliberately thin. All logic lives in plain Python modules, which are
unit-tested without starting a server.

Run:  uvicorn app.main:app --reload --port 8000
Docs: http://localhost:8000/docs  (FastAPI generates them automatically)
"""
from __future__ import annotations

import logging
import os
from datetime import date

from fastapi import Depends, FastAPI, Header, HTTPException

from . import pricing
from .recommender import Car, recommend
from .schemas import QuoteRequest, QuoteResponse, RecommendRequest, RecommendResponse

log = logging.getLogger("ml-service")

app = FastAPI(title="Car Rental ML Service", version="1.0.0")

# Load the model ONCE at startup, not per request (loading takes time).
# If it's missing, the service still runs and prices with neutral demand,
# and /health reports it, so the problem is visible instead of fatal.
try:
    demand_model: pricing.DemandModel | None = pricing.DemandModel()
except FileNotFoundError:
    demand_model = None
    log.warning("No trained model found. Run: python -m training.train_pricing")

INTERNAL_KEY = os.getenv("ML_SERVICE_KEY")


def require_internal_key(x_internal_key: str | None = Header(default=None)) -> None:
    """Only our Node API should call this service. When ML_SERVICE_KEY is set,
    every request must carry it in the X-Internal-Key header."""
    if INTERNAL_KEY and x_internal_key != INTERNAL_KEY:
        raise HTTPException(status_code=401, detail="Invalid internal key")


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "modelLoaded": demand_model is not None,
        "modelVersion": demand_model.version if demand_model else None,
    }


@app.post("/price/quote", response_model=QuoteResponse, dependencies=[Depends(require_internal_key)])
def price_quote(req: QuoteRequest) -> QuoteResponse:
    q = pricing.quote(
        demand_model,
        city=req.city,
        car_type=req.carType,
        base_price=req.basePrice,
        start=req.startDate,
        end=req.endDate,
        booking_day=req.bookingDate or date.today(),
        live_utilisation=req.liveUtilisation,
    )
    return QuoteResponse(
        totalPrice=q.total_price,
        avgMultiplier=q.avg_multiplier,
        days=q.days,
        reasons=q.reasons,
        modelVersion=q.model_version,
    )


@app.post(
    "/recommendations", response_model=RecommendResponse, dependencies=[Depends(require_internal_key)]
)
def recommendations(req: RecommendRequest) -> RecommendResponse:
    cars = [
        Car(
            id=c.id,
            name=c.name,
            car_type=c.type,
            fuel=c.fuel,
            transmission=c.transmission,
            seats=c.seats,
            city=c.city,
            price_per_day=c.pricePerDay,
        )
        for c in req.candidates
    ]
    items = recommend(cars, req.userCarIds, req.coBookings, city=req.city, limit=req.limit)
    return RecommendResponse(items=items)
