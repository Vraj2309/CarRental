"""Request/response shapes. FastAPI validates every request against these,
the Python equivalent of zod in our Node API."""
from __future__ import annotations

import datetime as dt
from typing import Literal

from pydantic import BaseModel, Field, model_validator

CarType = Literal["hatchback", "sedan", "suv", "muv", "luxury"]


class QuoteRequest(BaseModel):
    city: str = Field(min_length=1, max_length=40)
    carType: CarType
    basePrice: int = Field(gt=0, le=100_000)
    startDate: dt.date
    endDate: dt.date
    bookingDate: dt.date | None = None  # defaults to today (India) in Node
    liveUtilisation: float | None = Field(default=None, ge=0, le=1)

    @model_validator(mode="after")
    def check_dates(self):
        if self.endDate <= self.startDate:
            raise ValueError("endDate must be after startDate")
        if (self.endDate - self.startDate).days > 60:
            raise ValueError("rental too long to price")
        return self


class DayPrice(BaseModel):
    date: dt.date
    demand: float
    multiplier: float
    price: int


class QuoteResponse(BaseModel):
    totalPrice: int
    avgMultiplier: float
    days: list[DayPrice]
    reasons: list[str]
    modelVersion: str | None


class CandidateCar(BaseModel):
    id: str
    name: str
    type: CarType
    fuel: Literal["petrol", "diesel", "cng", "electric"]
    transmission: Literal["manual", "automatic"]
    seats: int = Field(ge=2, le=9)
    city: str
    pricePerDay: int = Field(gt=0)


class RecommendRequest(BaseModel):
    candidates: list[CandidateCar] = Field(max_length=500)
    userCarIds: list[str] = Field(default_factory=list, max_length=200)
    coBookings: list[list[str]] = Field(default_factory=list, max_length=10_000)
    city: str | None = None
    limit: int = Field(default=6, ge=1, le=20)


class Recommendation(BaseModel):
    carId: str
    score: float
    reason: str


class RecommendResponse(BaseModel):
    items: list[Recommendation]
