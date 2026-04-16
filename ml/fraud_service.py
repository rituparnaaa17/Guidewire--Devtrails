"""
ml/fraud_service.py
────────────────────────────────────────────────────────────────────────────────
ShieldPay — ML Fraud Detection FastAPI Service
Port: 8002

Endpoints:
  GET  /health         → model status + metrics
  POST /predict-fraud  → fraud_probability, risk_level, top_factors

Decision thresholds:
  < 0.30  → LOW    (auto-approve)
  0.30–0.60 → MEDIUM (hold)
  > 0.60  → HIGH   (manual review)
────────────────────────────────────────────────────────────────────────────────
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import numpy as np
import pickle
import os
import time

# ─── App setup ────────────────────────────────────────────────────────────────

app = FastAPI(
    title="ShieldPay Fraud ML Service",
    description="XGBoost-based parametric insurance fraud detection",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE     = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE, "fraud_model.pkl")
META_PATH  = os.path.join(BASE, "fraud_feature_meta.pkl")

FEATURE_NAMES = [
    "predicted_income", "actual_income", "payout", "income_ratio",
    "account_age_days", "claims_last_7d", "claims_last_28d",
    "velocity_ratio", "policy_age_hours",
    "zone_match", "duplicate_flag", "trigger_valid",
    "upi_cluster_size", "ppcs_score",
]

_model = None
_meta  = None
_load_error = None


def _load_model():
    global _model, _meta, _load_error
    try:
        with open(MODEL_PATH, "rb") as f:
            _model = pickle.load(f)
        with open(META_PATH, "rb") as f:
            _meta = pickle.load(f)
        print(f"[FraudML] Model loaded: {_meta.get('model_type')} | AUC: {_meta.get('roc_auc')}")
    except FileNotFoundError:
        _load_error = (
            "fraud_model.pkl not found. "
            "Run: python train_fraud_model.py"
        )
        print(f"[FraudML] WARNING: {_load_error}")
    except Exception as e:
        _load_error = str(e)
        print(f"[FraudML] ERROR loading model: {e}")


@app.on_event("startup")
def startup():
    _load_model()


# ─── Explainability helper ────────────────────────────────────────────────────

FEATURE_LABELS = {
    "predicted_income":  ("high predicted_income",   "low predicted_income"),
    "actual_income":     ("high actual_income",        "low actual_income"),
    "payout":            ("high payout requested",     "low payout"),
    "income_ratio":      ("high income_ratio",         "low income_ratio"),
    "account_age_days":  ("very new account",          "established account"),
    "claims_last_7d":    ("high claims in 7 days",     "low recent claims"),
    "claims_last_28d":   ("high claims in 28 days",    "normal claim history"),
    "velocity_ratio":    ("high claim velocity",       "normal claim velocity"),
    "policy_age_hours":  ("very new policy",           "established policy"),
    "zone_match":        ("zone mismatch (0=mismatch)","zones match"),
    "duplicate_flag":    ("duplicate claim detected",  "no duplicate"),
    "trigger_valid":     ("trigger not validated",     "trigger validated"),
    "upi_cluster_size":  ("large UPI fraud cluster",   "small UPI cluster"),
    "ppcs_score":        ("low presence/PPCS score",   "high PPCS score"),
}

# For these features, a LOW value is the suspicious direction
LOW_IS_SUSPICIOUS = {"ppcs_score", "zone_match", "trigger_valid", "account_age_days", "policy_age_hours"}


def _explain(features: dict, importances: dict, means: dict, stds: dict) -> list[str]:
    """Return top-3 human-readable fraud factors ordered by contribution."""
    scores = []
    for feat in FEATURE_NAMES:
        val  = features.get(feat, 0.0)
        mean = means.get(feat, 0.0)
        std  = max(stds.get(feat, 1.0), 1e-9)
        z    = (val - mean) / std        # z-score vs training distribution

        # For features where LOW is the suspicious direction, flip z
        if feat in LOW_IS_SUSPICIOUS:
            z = -z

        contribution = importances.get(feat, 0.0) * max(z, 0.0)   # only positive = suspicious direction
        if contribution > 0:
            label_idx = 0   # "high" label
            if feat in LOW_IS_SUSPICIOUS:
                label_idx = 0  # keep high-suspicion label
            scores.append((contribution, FEATURE_LABELS[feat][label_idx]))

    scores.sort(reverse=True)
    return [label for _, label in scores[:4]] or ["no strong fraud signals detected"]


# ─── Request / Response models ────────────────────────────────────────────────

class FraudRequest(BaseModel):
    predicted_income:  float = Field(default=0.0,  ge=0)
    actual_income:     float = Field(default=0.0,  ge=0)
    payout:            float = Field(default=0.0,  ge=0)
    income_ratio:      float = Field(default=0.5,  ge=0, le=5)
    account_age_days:  int   = Field(default=30,   ge=0)
    claims_last_7d:    int   = Field(default=0,    ge=0)
    claims_last_28d:   int   = Field(default=0,    ge=0)
    velocity_ratio:    float = Field(default=1.0,  ge=0)
    policy_age_hours:  float = Field(default=720,  ge=0)
    zone_match:        int   = Field(default=1,    ge=0, le=1)
    duplicate_flag:    int   = Field(default=0,    ge=0, le=1)
    trigger_valid:     int   = Field(default=1,    ge=0, le=1)
    upi_cluster_size:  int   = Field(default=1,    ge=1)
    ppcs_score:        float = Field(default=0.75, ge=0, le=1)


class FraudResponse(BaseModel):
    fraud_probability: float
    risk_level:        str
    top_factors:       list[str]
    model_version:     str
    latency_ms:        float
    is_ml:             bool


def _risk_level(prob: float) -> str:
    if prob < 0.30:  return "LOW"
    if prob < 0.60:  return "MEDIUM"
    return "HIGH"


def _heuristic_score(req: FraudRequest) -> float:
    """Simple weighted score fallback when model is unavailable."""
    score = 0.0
    if req.account_age_days  < 3:   score += 0.30
    if req.claims_last_7d    >= 4:  score += 0.20
    if req.zone_match        == 0:  score += 0.25
    if req.duplicate_flag    == 1:  score += 0.40
    if req.ppcs_score        < 0.30:score += 0.25
    if req.velocity_ratio    > 3.0: score += 0.20
    if req.upi_cluster_size  > 10:  score += 0.15
    return min(1.0, score)


# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status":       "online" if _model else "degraded",
        "model_loaded": _model is not None,
        "model_type":   _meta.get("model_type")  if _meta else None,
        "roc_auc":      _meta.get("roc_auc")     if _meta else None,
        "pr_auc":       _meta.get("pr_auc")      if _meta else None,
        "load_error":   _load_error,
        "features":     len(FEATURE_NAMES),
    }


@app.post("/predict-fraud", response_model=FraudResponse)
def predict_fraud(req: FraudRequest):
    t0 = time.perf_counter()

    if _model is None:
        # Graceful degradation — heuristic fallback
        prob    = _heuristic_score(req)
        factors = _explain(
            req.model_dump(),
            {f: 1/len(FEATURE_NAMES) for f in FEATURE_NAMES},
            {f: 0.5 for f in FEATURE_NAMES},
            {f: 0.3 for f in FEATURE_NAMES},
        )
        return FraudResponse(
            fraud_probability = round(prob, 4),
            risk_level        = _risk_level(prob),
            top_factors       = factors,
            model_version     = "heuristic-fallback",
            latency_ms        = round((time.perf_counter() - t0) * 1000, 2),
            is_ml             = False,
        )

    fv = req.model_dump()
    X  = np.array([[fv[f] for f in FEATURE_NAMES]], dtype=float)

    prob    = float(_model.predict_proba(X)[0, 1])
    factors = _explain(fv, _meta["importances"], _meta["feature_means"], _meta["feature_stds"])

    return FraudResponse(
        fraud_probability = round(prob, 4),
        risk_level        = _risk_level(prob),
        top_factors       = factors,
        model_version     = f"{_meta.get('model_type', 'ml')}-v2",
        latency_ms        = round((time.perf_counter() - t0) * 1000, 2),
        is_ml             = True,
    )


@app.post("/batch-predict-fraud")
def batch_predict(requests: list[FraudRequest]):
    """Batch fraud scoring for the scheduler."""
    return [predict_fraud(r) for r in requests]
