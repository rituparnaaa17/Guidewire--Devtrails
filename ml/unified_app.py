"""
ShieldPay KAVACH — Unified ML Service
Combines Loss Prediction (port 8001) + Fraud Detection (port 8002) into one app.
Deploy on a single free Render instance.

Endpoints:
  GET  /health              → service status
  POST /predict             → income loss prediction (GradientBoosting)
  POST /predict-fraud       → fraud scoring (XGBoost)
  POST /batch-predict       → batch loss prediction
  POST /batch-predict-fraud → batch fraud scoring
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
import pickle
import os
import random
import time

# ─────────────────────────────────────────────────────────────────────────────
# App setup
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="ShieldPay Unified ML Service",
    description="Loss prediction + fraud detection in one service",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────────────────────────────
# SECTION A — Loss Prediction (GradientBoostingRegressor)
# ─────────────────────────────────────────────────────────────────────────────

CITY_RISK = {
    "Mumbai": 1.50, "Delhi": 1.80, "Bangalore": 1.15,
    "Chennai": 1.25, "Pune": 1.10, "Hyderabad": 1.20,
    "Kolkata": 1.40, "Default": 1.00,
}
TRIGGER_SEVERITY = {
    "HEAVY_RAIN": 0.80, "FLOOD": 1.00, "SEVERE_AQI": 0.60,
    "HEATWAVE": 0.50, "ZONE_SHUTDOWN": 0.90,
}
CITIES   = list(CITY_RISK.keys())
TRIGGERS = list(TRIGGER_SEVERITY.keys())

city_encoder    = LabelEncoder().fit(CITIES)
trigger_encoder = LabelEncoder().fit(TRIGGERS)

MODEL_VERSION = "gbr-v1.0"
_loss_model: GradientBoostingRegressor | None = None
_mae: float = 0.0
_train_time: float = 0.0


def generate_synthetic_data(n_samples: int = 2000) -> pd.DataFrame:
    random.seed(42); np.random.seed(42)
    records = []
    for _ in range(n_samples):
        city    = random.choice(CITIES[:-1])
        trigger = random.choice(TRIGGERS)
        weekly_income     = random.uniform(1500, 15000)
        hours_per_day     = random.uniform(4, 12)
        account_age_days  = random.randint(1, 730)
        city_risk         = CITY_RISK[city]
        trigger_factor    = TRIGGER_SEVERITY[trigger]
        hourly_income     = weekly_income / (hours_per_day * 7)
        base_loss         = hourly_income * hours_per_day * trigger_factor * city_risk
        age_factor        = 1.0 if account_age_days < 30 else 0.9 if account_age_days < 180 else 0.8
        noise             = np.random.normal(0, base_loss * 0.12)
        actual_loss       = max(0, base_loss * age_factor + noise)
        records.append({
            "weekly_income":   weekly_income,
            "hours_per_day":   hours_per_day,
            "city_encoded":    city_encoder.transform([city])[0],
            "trigger_encoded": trigger_encoder.transform([trigger])[0],
            "account_age_days": account_age_days,
            "city_risk":       city_risk,
            "trigger_factor":  trigger_factor,
            "loss":            actual_loss,
        })
    return pd.DataFrame(records)


def train_loss_model() -> GradientBoostingRegressor:
    global _mae, _train_time
    start = time.time()
    print("[ML-Loss] Training GradientBoostingRegressor...")
    df = generate_synthetic_data(2000)
    features = ["weekly_income", "hours_per_day", "city_encoded",
                "trigger_encoded", "account_age_days", "city_risk", "trigger_factor"]
    X, y = df[features].values, df["loss"].values
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=42)
    model = GradientBoostingRegressor(
        n_estimators=200, learning_rate=0.08, max_depth=4, subsample=0.85, random_state=42
    )
    model.fit(X_tr, y_tr)
    _mae       = mean_absolute_error(y_te, model.predict(X_te))
    _train_time = time.time() - start
    print(f"[ML-Loss] Trained in {_train_time:.2f}s | MAE: Rs.{_mae:.2f}")
    return model


# ─────────────────────────────────────────────────────────────────────────────
# SECTION B — Fraud Detection (XGBoost, loaded from pkl)
# ─────────────────────────────────────────────────────────────────────────────

BASE       = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE, "fraud_model.pkl")
META_PATH  = os.path.join(BASE, "fraud_feature_meta.pkl")

FRAUD_FEATURES = [
    "predicted_income", "actual_income", "payout", "income_ratio",
    "account_age_days", "claims_last_7d", "claims_last_28d",
    "velocity_ratio", "policy_age_hours",
    "zone_match", "duplicate_flag", "trigger_valid",
    "upi_cluster_size", "ppcs_score",
]
FEATURE_LABELS = {
    "predicted_income":  ("high predicted_income",   "low predicted_income"),
    "actual_income":     ("high actual_income",       "low actual_income"),
    "payout":            ("high payout requested",    "low payout"),
    "income_ratio":      ("high income_ratio",        "low income_ratio"),
    "account_age_days":  ("very new account",         "established account"),
    "claims_last_7d":    ("high claims in 7 days",    "low recent claims"),
    "claims_last_28d":   ("high claims in 28 days",   "normal claim history"),
    "velocity_ratio":    ("high claim velocity",      "normal claim velocity"),
    "policy_age_hours":  ("very new policy",          "established policy"),
    "zone_match":        ("zone mismatch",            "zones match"),
    "duplicate_flag":    ("duplicate claim detected", "no duplicate"),
    "trigger_valid":     ("trigger not validated",    "trigger validated"),
    "upi_cluster_size":  ("large UPI fraud cluster",  "small UPI cluster"),
    "ppcs_score":        ("low presence/PPCS score",  "high PPCS score"),
}
LOW_IS_SUSPICIOUS = {"ppcs_score", "zone_match", "trigger_valid", "account_age_days", "policy_age_hours"}

_fraud_model = None
_fraud_meta  = None
_fraud_error = None


def load_fraud_model():
    global _fraud_model, _fraud_meta, _fraud_error
    try:
        with open(MODEL_PATH, "rb") as f: _fraud_model = pickle.load(f)
        with open(META_PATH,  "rb") as f: _fraud_meta  = pickle.load(f)
        print(f"[ML-Fraud] Model loaded: {_fraud_meta.get('model_type')} | AUC: {_fraud_meta.get('roc_auc')}")
    except FileNotFoundError:
        _fraud_error = "fraud_model.pkl not found — using heuristic fallback"
        print(f"[ML-Fraud] WARNING: {_fraud_error}")
    except Exception as e:
        _fraud_error = str(e)
        print(f"[ML-Fraud] ERROR: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# Startup: train + load both models
# ─────────────────────────────────────────────────────────────────────────────

@app.on_event("startup")
def on_startup():
    global _loss_model
    _loss_model = train_loss_model()
    load_fraud_model()


# ─────────────────────────────────────────────────────────────────────────────
# Schemas — Loss Prediction
# ─────────────────────────────────────────────────────────────────────────────

class PredictRequest(BaseModel):
    weekly_income:    float = Field(..., gt=0)
    hours_per_day:    float = Field(..., gt=0, le=16)
    city:             str   = Field(default="Default")
    trigger_type:     str   = Field(...)
    account_age_days: int   = Field(default=30, ge=0)

class PredictResponse(BaseModel):
    predicted_loss: float
    confidence:     float
    model_version:  str
    mae:            float
    is_ml:          bool = True


# ─────────────────────────────────────────────────────────────────────────────
# Schemas — Fraud Detection
# ─────────────────────────────────────────────────────────────────────────────

class FraudRequest(BaseModel):
    predicted_income: float = Field(default=0.0, ge=0)
    actual_income:    float = Field(default=0.0, ge=0)
    payout:           float = Field(default=0.0, ge=0)
    income_ratio:     float = Field(default=0.5, ge=0, le=5)
    account_age_days: int   = Field(default=30,  ge=0)
    claims_last_7d:   int   = Field(default=0,   ge=0)
    claims_last_28d:  int   = Field(default=0,   ge=0)
    velocity_ratio:   float = Field(default=1.0, ge=0)
    policy_age_hours: float = Field(default=720, ge=0)
    zone_match:       int   = Field(default=1,   ge=0, le=1)
    duplicate_flag:   int   = Field(default=0,   ge=0, le=1)
    trigger_valid:    int   = Field(default=1,   ge=0, le=1)
    upi_cluster_size: int   = Field(default=1,   ge=1)
    ppcs_score:       float = Field(default=0.75,ge=0, le=1)

class FraudResponse(BaseModel):
    fraud_probability: float
    risk_level:        str
    top_factors:       list[str]
    model_version:     str
    latency_ms:        float
    is_ml:             bool


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _risk_level(prob: float) -> str:
    if prob < 0.30: return "LOW"
    if prob < 0.60: return "MEDIUM"
    return "HIGH"

def _heuristic_score(req: FraudRequest) -> float:
    s = 0.0
    if req.account_age_days < 3:    s += 0.30
    if req.claims_last_7d >= 4:     s += 0.20
    if req.zone_match == 0:         s += 0.25
    if req.duplicate_flag == 1:     s += 0.40
    if req.ppcs_score < 0.30:       s += 0.25
    if req.velocity_ratio > 3.0:    s += 0.20
    if req.upi_cluster_size > 10:   s += 0.15
    return min(1.0, s)

def _explain(features: dict, importances: dict, means: dict, stds: dict) -> list[str]:
    scores = []
    for feat in FRAUD_FEATURES:
        val  = features.get(feat, 0.0)
        mean = means.get(feat, 0.0)
        std  = max(stds.get(feat, 1.0), 1e-9)
        z    = (val - mean) / std
        if feat in LOW_IS_SUSPICIOUS: z = -z
        contribution = importances.get(feat, 0.0) * max(z, 0.0)
        if contribution > 0:
            scores.append((contribution, FEATURE_LABELS[feat][0]))
    scores.sort(reverse=True)
    return [label for _, label in scores[:4]] or ["no strong fraud signals detected"]


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints — Health
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status":             "online",
        "loss_model_ready":   _loss_model is not None,
        "fraud_model_ready":  _fraud_model is not None,
        "loss_model_version": MODEL_VERSION,
        "fraud_model_type":   _fraud_meta.get("model_type") if _fraud_meta else None,
        "mae_inr":            round(_mae, 2),
        "train_time_s":       round(_train_time, 2),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints — Loss Prediction
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    if _loss_model is None:
        raise HTTPException(status_code=503, detail="Loss model not ready.")
    city    = req.city if req.city in CITY_RISK else "Default"
    trigger = req.trigger_type if req.trigger_type in TRIGGER_SEVERITY else "HEAVY_RAIN"
    features = np.array([[
        req.weekly_income,
        req.hours_per_day,
        city_encoder.transform([city])[0],
        trigger_encoder.transform([trigger])[0],
        req.account_age_days,
        CITY_RISK[city],
        TRIGGER_SEVERITY[trigger],
    ]])
    raw_loss       = float(_loss_model.predict(features)[0])
    predicted_loss = max(0.0, round(raw_loss, 2))
    confidence     = round(max(0.60, min(0.97, 1 - (_mae / max(predicted_loss, 1)))), 4)
    return PredictResponse(
        predicted_loss=predicted_loss, confidence=confidence,
        model_version=MODEL_VERSION, mae=round(_mae, 2),
    )

@app.post("/batch-predict")
def batch_predict(requests: list[PredictRequest]):
    return [predict(r) for r in requests]


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints — Fraud Detection
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/predict-fraud", response_model=FraudResponse)
def predict_fraud(req: FraudRequest):
    t0 = time.perf_counter()
    if _fraud_model is None:
        prob    = _heuristic_score(req)
        factors = ["heuristic fallback — model unavailable"]
        return FraudResponse(
            fraud_probability=round(prob, 4), risk_level=_risk_level(prob),
            top_factors=factors, model_version="heuristic-fallback",
            latency_ms=round((time.perf_counter()-t0)*1000, 2), is_ml=False,
        )
    fv = req.model_dump()
    X  = np.array([[fv[f] for f in FRAUD_FEATURES]], dtype=float)
    prob    = float(_fraud_model.predict_proba(X)[0, 1])
    factors = _explain(fv, _fraud_meta["importances"], _fraud_meta["feature_means"], _fraud_meta["feature_stds"])
    return FraudResponse(
        fraud_probability=round(prob, 4), risk_level=_risk_level(prob),
        top_factors=factors,
        model_version=f"{_fraud_meta.get('model_type','ml')}-v2",
        latency_ms=round((time.perf_counter()-t0)*1000, 2), is_ml=True,
    )

@app.post("/batch-predict-fraud")
def batch_predict_fraud(requests: list[FraudRequest]):
    return [predict_fraud(r) for r in requests]
