"""
ShieldPay KAVACH — ML Loss Prediction Service
FastAPI + scikit-learn GradientBoostingRegressor
Trains on startup using synthetic domain data.
Run: uvicorn main:app --reload --port 8000
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error
import random
import time

# ─────────────────────────────────────────────────────────────────────────────
# App Setup
# ─────────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="ShieldPay ML Service",
    description="Parametric insurance loss prediction using Gradient Boosting",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────────────────────────────
# Feature Engineering
# ─────────────────────────────────────────────────────────────────────────────

CITY_RISK = {
    "Mumbai": 1.50, "Delhi": 1.80, "Bangalore": 1.15,
    "Chennai": 1.25, "Pune": 1.10, "Hyderabad": 1.20,
    "Kolkata": 1.40, "Default": 1.00,
}

TRIGGER_SEVERITY = {
    "HEAVY_RAIN": 0.80,
    "FLOOD": 1.00,
    "SEVERE_AQI": 0.60,
    "HEATWAVE": 0.50,
    "ZONE_SHUTDOWN": 0.90,
}

CITIES = list(CITY_RISK.keys())
TRIGGERS = list(TRIGGER_SEVERITY.keys())

city_encoder = LabelEncoder().fit(CITIES)
trigger_encoder = LabelEncoder().fit(TRIGGERS)

MODEL_VERSION = "gbr-v1.0"
_model: GradientBoostingRegressor | None = None
_mae: float = 0.0
_train_time: float = 0.0


def generate_synthetic_data(n_samples: int = 2000) -> pd.DataFrame:
    """
    Generate realistic synthetic training data for gig worker income loss.
    Target = actual daily income loss when a disruption event occurs.
    """
    random.seed(42)
    np.random.seed(42)

    records = []
    for _ in range(n_samples):
        city = random.choice(CITIES[:-1])  # exclude Default
        trigger = random.choice(TRIGGERS)
        weekly_income = random.uniform(1500, 15000)
        hours_per_day = random.uniform(4, 12)
        account_age_days = random.randint(1, 730)

        city_risk = CITY_RISK[city]
        trigger_factor = TRIGGER_SEVERITY[trigger]

        # Core loss formula (ground truth with noise)
        hourly_income = weekly_income / (hours_per_day * 7)
        base_loss = hourly_income * hours_per_day * trigger_factor * city_risk

        # Account age moderates loss (experienced users recover faster)
        age_factor = 1.0 if account_age_days < 30 else 0.9 if account_age_days < 180 else 0.8

        # Realistic noise
        noise = np.random.normal(0, base_loss * 0.12)
        actual_loss = max(0, base_loss * age_factor + noise)

        records.append({
            "weekly_income": weekly_income,
            "hours_per_day": hours_per_day,
            "city_encoded": city_encoder.transform([city])[0],
            "trigger_encoded": trigger_encoder.transform([trigger])[0],
            "account_age_days": account_age_days,
            "city_risk": city_risk,
            "trigger_factor": trigger_factor,
            "loss": actual_loss,
        })

    return pd.DataFrame(records)


def train_model() -> GradientBoostingRegressor:
    global _mae, _train_time
    start = time.time()
    print("[ML] Training GradientBoostingRegressor on synthetic data...")

    df = generate_synthetic_data(2000)
    feature_cols = [
        "weekly_income", "hours_per_day", "city_encoded",
        "trigger_encoded", "account_age_days", "city_risk", "trigger_factor",
    ]

    X = df[feature_cols].values
    y = df["loss"].values

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    model = GradientBoostingRegressor(
        n_estimators=200,
        learning_rate=0.08,
        max_depth=4,
        subsample=0.85,
        random_state=42,
    )
    model.fit(X_train, y_train)

    preds = model.predict(X_test)
    _mae = mean_absolute_error(y_test, preds)
    _train_time = time.time() - start

    print(f"[ML] Model trained in {_train_time:.2f}s | MAE: Rs.{_mae:.2f}")
    return model


# ─────────────────────────────────────────────────────────────────────────────
# Startup: train model
# ─────────────────────────────────────────────────────────────────────────────
@app.on_event("startup")
def on_startup():
    global _model
    _model = train_model()


# ─────────────────────────────────────────────────────────────────────────────
# Request / Response Schemas
# ─────────────────────────────────────────────────────────────────────────────

class PredictRequest(BaseModel):
    weekly_income: float = Field(..., gt=0, description="Average weekly income in INR")
    hours_per_day: float = Field(..., gt=0, le=16, description="Daily working hours")
    city: str = Field(default="Default", description="City name")
    trigger_type: str = Field(..., description="Disruption trigger type")
    account_age_days: int = Field(default=30, ge=0)


class PredictResponse(BaseModel):
    predicted_loss: float
    confidence: float
    model_version: str
    mae: float
    is_ml: bool = True


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "online",
        "model_version": MODEL_VERSION,
        "mae_inr": round(_mae, 2),
        "train_time_seconds": round(_train_time, 2),
    }


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    if _model is None:
        raise HTTPException(status_code=503, detail="Model not ready. Please retry shortly.")

    # Encode categorical features (fallback to Default if unknown)
    city = req.city if req.city in CITY_RISK else "Default"
    trigger = req.trigger_type if req.trigger_type in TRIGGER_SEVERITY else "HEAVY_RAIN"

    city_enc = city_encoder.transform([city])[0]
    trigger_enc = trigger_encoder.transform([trigger])[0]
    city_risk = CITY_RISK[city]
    trigger_factor = TRIGGER_SEVERITY[trigger]

    features = np.array([[
        req.weekly_income,
        req.hours_per_day,
        city_enc,
        trigger_enc,
        req.account_age_days,
        city_risk,
        trigger_factor,
    ]])

    raw_loss = float(_model.predict(features)[0])
    predicted_loss = max(0.0, round(raw_loss, 2))

    # Confidence: inverse of relative MAE, capped at 0.97
    confidence = round(min(0.97, 1 - (_mae / max(predicted_loss, 1))), 4)
    confidence = max(0.60, confidence)  # floor at 60%

    return PredictResponse(
        predicted_loss=predicted_loss,
        confidence=confidence,
        model_version=MODEL_VERSION,
        mae=round(_mae, 2),
    )


@app.post("/batch-predict")
def batch_predict(requests: list[PredictRequest]):
    """Batch predictions for the scheduler."""
    return [predict(r) for r in requests]
