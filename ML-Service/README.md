# ML Service

Python microservice for the car rental platform: **dynamic pricing** and **car recommendations**.
The Node API calls it over HTTP; if it is down, Node falls back to base prices and popular cars.

## Setup

```bash
cd ml-service
python -m venv .venv
# Windows: .venv\Scripts\activate      Mac/Linux: source .venv/bin/activate
pip install -r requirements.txt

python -m training.generate_data     # synthetic demand data -> data/demand.csv
python -m training.train_pricing     # train + evaluate -> models/demand_model.joblib, models/metrics.json
python -m pytest -q                  # run tests

uvicorn app.main:app --reload --port 8000 --env-file .env
```

Interactive API docs: http://localhost:8000/docs

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Status and loaded model version |
| POST | `/price/quote` | Per-day dynamic price with reasons |
| POST | `/recommendations` | Ranked cars with a reason for each |

## How pricing works

1. A gradient-boosted regression model predicts **demand** (share of the fleet rented) for each day,
   from city, car type, weekday, month, season and distance to Indian holidays.
2. Demand is blended with **live utilisation** (how many similar cars are already booked).
3. Rules turn demand into a multiplier, with lead-time and long-trip adjustments,
   always clipped to **0.80x – 1.40x** of the base price.

The model is evaluated with a **time-based split** (train on older days, test on the last 6 months)
against a baseline of average demand per city, car type and weekday/weekend. See `models/metrics.json`.

> **Data note:** the model is trained on **synthetic** demand data (`training/generate_data.py`),
> because the platform has no real booking history yet. The pipeline is built to be retrained on real
> bookings later. Lunar festival dates in `app/holidays.py` are approximate and should be verified yearly.

## How recommendations work

Hybrid score per car: **content-based** similarity to the cars the user booked (cosine similarity),
**collaborative** "people who booked X also booked Y" (item co-occurrence, normalised by popularity),
and **popularity**. New users get popular cars, boosted for the city they are browsing.
