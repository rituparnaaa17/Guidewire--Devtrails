"""
ml/train_fraud_model.py
────────────────────────────────────────────────────────────────────────────────
ShieldPay — Advanced ML Fraud Detection Training Pipeline
XGBoost Classifier trained on 15,000 synthetic insure-tech claim samples.

Feature set (14 features):
  Income:     predicted_income, actual_income, payout, income_ratio
  Behavior:   account_age_days, claims_last_7d, claims_last_28d
  Velocity:   velocity_ratio
  Policy:     policy_age_hours
  Validation: zone_match, duplicate_flag, trigger_valid
  Fraud Ring: upi_cluster_size
  Presence:   ppcs_score

Run:  python train_fraud_model.py
Out:  fraud_model.pkl + fraud_feature_meta.pkl
────────────────────────────────────────────────────────────────────────────────
"""

import numpy as np
import pandas as pd
import pickle, os, time

from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    classification_report, roc_auc_score, average_precision_score,
)

try:
    from xgboost import XGBClassifier
    USE_XGB = True
except ImportError:
    USE_XGB = False

SEED = 42
N_SAMPLES = 15_000
FEATURE_NAMES = [
    "predicted_income", "actual_income", "payout", "income_ratio",
    "account_age_days", "claims_last_7d", "claims_last_28d",
    "velocity_ratio", "policy_age_hours",
    "zone_match", "duplicate_flag", "trigger_valid",
    "upi_cluster_size", "ppcs_score",
]

rng = np.random.default_rng(SEED)


# ─── Synthetic dataset generators ────────────────────────────────────────────

def _normal(n):
    pred = rng.uniform(200, 2000, n)
    act  = pred * rng.uniform(0.0, 0.5, n)
    pay  = (pred - act) * rng.uniform(0.5, 0.85, n)
    return pd.DataFrame({
        "predicted_income": pred, "actual_income": act,  "payout": pay,
        "income_ratio":     act / np.maximum(pred, 1),
        "account_age_days": rng.integers(90, 730, n),
        "claims_last_7d":   rng.integers(0, 2, n),
        "claims_last_28d":  rng.integers(0, 4, n),
        "velocity_ratio":   rng.uniform(0.0, 0.8, n),
        "policy_age_hours": rng.uniform(48, 8760, n),
        "zone_match":       np.ones(n, dtype=int),
        "duplicate_flag":   np.zeros(n, dtype=int),
        "trigger_valid":    np.ones(n, dtype=int),
        "upi_cluster_size": rng.integers(1, 4, n),
        "ppcs_score":       rng.uniform(0.55, 1.0, n),
        "is_fraud": 0,
    })

def _new_account(n):
    pred = rng.uniform(500, 3000, n)
    act  = pred * rng.uniform(0.7, 1.0, n)
    pay  = (pred - act) * rng.uniform(0.6, 1.0, n)
    return pd.DataFrame({
        "predicted_income": pred, "actual_income": act,  "payout": pay,
        "income_ratio":     act / np.maximum(pred, 1),
        "account_age_days": rng.integers(0, 3, n),
        "claims_last_7d":   rng.integers(1, 5, n),
        "claims_last_28d":  rng.integers(2, 8, n),
        "velocity_ratio":   rng.uniform(1.5, 4.0, n),
        "policy_age_hours": rng.uniform(0, 24, n),
        "zone_match":       rng.choice([0, 1], n, p=[0.4, 0.6]),
        "duplicate_flag":   rng.choice([0, 1], n, p=[0.3, 0.7]),
        "trigger_valid":    rng.choice([0, 1], n, p=[0.5, 0.5]),
        "upi_cluster_size": rng.integers(5, 15, n),
        "ppcs_score":       rng.uniform(0.0, 0.3, n),
        "is_fraud": 1,
    })

def _high_freq(n):
    pred = rng.uniform(300, 1500, n)
    act  = pred * rng.uniform(0.0, 0.2, n)
    pay  = (pred - act) * rng.uniform(0.7, 1.0, n)
    return pd.DataFrame({
        "predicted_income": pred, "actual_income": act,  "payout": pay,
        "income_ratio":     act / np.maximum(pred, 1),
        "account_age_days": rng.integers(10, 120, n),
        "claims_last_7d":   rng.integers(4, 10, n),
        "claims_last_28d":  rng.integers(10, 25, n),
        "velocity_ratio":   rng.uniform(3.0, 8.0, n),
        "policy_age_hours": rng.uniform(24, 720, n),
        "zone_match":       rng.choice([0, 1], n, p=[0.3, 0.7]),
        "duplicate_flag":   rng.choice([0, 1], n, p=[0.2, 0.8]),
        "trigger_valid":    rng.choice([0, 1], n, p=[0.6, 0.4]),
        "upi_cluster_size": rng.integers(3, 10, n),
        "ppcs_score":       rng.uniform(0.1, 0.45, n),
        "is_fraud": 1,
    })

def _zone_mismatch(n):
    pred = rng.uniform(400, 2500, n)
    act  = pred * rng.uniform(0.3, 0.7, n)
    pay  = (pred - act) * rng.uniform(0.5, 0.9, n)
    return pd.DataFrame({
        "predicted_income": pred, "actual_income": act,  "payout": pay,
        "income_ratio":     act / np.maximum(pred, 1),
        "account_age_days": rng.integers(7, 200, n),
        "claims_last_7d":   rng.integers(1, 4, n),
        "claims_last_28d":  rng.integers(2, 8, n),
        "velocity_ratio":   rng.uniform(1.2, 3.5, n),
        "policy_age_hours": rng.uniform(1, 500, n),
        "zone_match":       np.zeros(n, dtype=int),
        "duplicate_flag":   rng.choice([0, 1], n, p=[0.5, 0.5]),
        "trigger_valid":    rng.choice([0, 1], n, p=[0.7, 0.3]),
        "upi_cluster_size": rng.integers(1, 6, n),
        "ppcs_score":       rng.uniform(0.15, 0.5, n),
        "is_fraud": 1,
    })

def _fraud_ring(n):
    pred = rng.uniform(1000, 5000, n)
    act  = pred * rng.uniform(0.0, 0.1, n)
    pay  = (pred - act) * rng.uniform(0.8, 1.0, n)
    return pd.DataFrame({
        "predicted_income": pred, "actual_income": act,  "payout": pay,
        "income_ratio":     act / np.maximum(pred, 1),
        "account_age_days": rng.integers(1, 30, n),
        "claims_last_7d":   rng.integers(3, 8, n),
        "claims_last_28d":  rng.integers(8, 20, n),
        "velocity_ratio":   rng.uniform(4.0, 10.0, n),
        "policy_age_hours": rng.uniform(0, 72, n),
        "zone_match":       rng.choice([0, 1], n, p=[0.5, 0.5]),
        "duplicate_flag":   np.ones(n, dtype=int),
        "trigger_valid":    rng.choice([0, 1], n, p=[0.8, 0.2]),
        "upi_cluster_size": rng.integers(15, 50, n),
        "ppcs_score":       rng.uniform(0.0, 0.2, n),
        "is_fraud": 1,
    })

def _low_ppcs(n):
    pred = rng.uniform(300, 2000, n)
    act  = pred * rng.uniform(0.0, 0.3, n)
    pay  = (pred - act) * rng.uniform(0.6, 1.0, n)
    return pd.DataFrame({
        "predicted_income": pred, "actual_income": act,  "payout": pay,
        "income_ratio":     act / np.maximum(pred, 1),
        "account_age_days": rng.integers(5, 180, n),
        "claims_last_7d":   rng.integers(1, 5, n),
        "claims_last_28d":  rng.integers(2, 10, n),
        "velocity_ratio":   rng.uniform(1.5, 5.0, n),
        "policy_age_hours": rng.uniform(2, 200, n),
        "zone_match":       rng.choice([0, 1], n, p=[0.35, 0.65]),
        "duplicate_flag":   rng.choice([0, 1], n, p=[0.4, 0.6]),
        "trigger_valid":    rng.choice([0, 1], n, p=[0.6, 0.4]),
        "upi_cluster_size": rng.integers(2, 12, n),
        "ppcs_score":       rng.uniform(0.0, 0.25, n),
        "is_fraud": 1,
    })


def build_dataset():
    n_norm   = int(N_SAMPLES * 0.70)
    n_new    = int(N_SAMPLES * 0.06)
    n_freq   = int(N_SAMPLES * 0.08)
    n_zone   = int(N_SAMPLES * 0.06)
    n_ring   = int(N_SAMPLES * 0.05)
    n_ppcs   = int(N_SAMPLES * 0.05)

    df = pd.concat([
        _normal(n_norm), _new_account(n_new), _high_freq(n_freq),
        _zone_mismatch(n_zone), _fraud_ring(n_ring), _low_ppcs(n_ppcs),
    ], ignore_index=True).sample(frac=1, random_state=SEED).reset_index(drop=True)

    # Add mild noise
    for col in ["predicted_income","actual_income","payout","income_ratio","velocity_ratio","ppcs_score"]:
        noise = rng.normal(0, df[col].std() * 0.03, len(df))
        df[col] = np.clip(df[col] + noise, 0, None)

    return df


# ─── Training & evaluation ────────────────────────────────────────────────────

def train():
    t0 = time.time()
    print("[ShieldPay FraudML] Generating 15k synthetic claim dataset...")
    df = build_dataset()
    print(f"  Rows: {len(df):,}  |  Fraud rate: {df['is_fraud'].mean():.1%}")

    X = df[FEATURE_NAMES].values
    y = df["is_fraud"].values
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, stratify=y, random_state=SEED
    )

    if USE_XGB:
        print("[ShieldPay FraudML] Training XGBoostClassifier (400 trees)...")
        model = XGBClassifier(
            n_estimators=400, max_depth=6, learning_rate=0.08,
            subsample=0.85, colsample_bytree=0.80,
            scale_pos_weight=float((y==0).sum()/(y==1).sum()),
            random_state=SEED, eval_metric="logloss", verbosity=0,
        )
    else:
        print("[ShieldPay FraudML] XGBoost not found — using RandomForestClassifier (500 trees)...")
        model = RandomForestClassifier(
            n_estimators=500, max_depth=12, min_samples_leaf=5,
            class_weight="balanced", random_state=SEED, n_jobs=-1,
        )

    model.fit(X_train, y_train)

    probs = model.predict_proba(X_test)[:, 1]
    preds = (probs >= 0.50).astype(int)
    auc   = roc_auc_score(y_test, probs)
    apr   = average_precision_score(y_test, probs)

    print(f"\n  ROC-AUC  : {auc:.4f}")
    print(f"  PR-AUC   : {apr:.4f}")
    print("\n" + classification_report(y_test, preds, target_names=["Legit", "Fraud"]))

    importances = model.feature_importances_
    ranked = sorted(zip(FEATURE_NAMES, importances), key=lambda x: x[1], reverse=True)
    print("  Feature importances:")
    for name, imp in ranked:
        bar = "#" * int(imp * 60)
        print(f"    {name:<25s}  {imp:.4f}  {bar}")

    # ── Save model ──────────────────────────────────────────────────────────
    base       = os.path.dirname(os.path.abspath(__file__))
    model_path = os.path.join(base, "fraud_model.pkl")
    meta_path  = os.path.join(base, "fraud_feature_meta.pkl")

    meta = {
        "feature_names":  FEATURE_NAMES,
        "feature_means":  {k: float(df[k].mean()) for k in FEATURE_NAMES},
        "feature_stds":   {k: float(df[k].std())  for k in FEATURE_NAMES},
        "importances":    {k: float(v) for k, v in zip(FEATURE_NAMES, importances)},
        "model_type":     "xgboost" if USE_XGB else "random_forest",
        "roc_auc":        round(auc, 4),
        "pr_auc":         round(apr, 4),
        "train_size":     len(X_train),
        "fraud_rate":     round(float(df["is_fraud"].mean()), 4),
    }

    with open(model_path, "wb") as f:
        pickle.dump(model, f)
    with open(meta_path, "wb") as f:
        pickle.dump(meta, f)

    print(f"\n[ShieldPay FraudML] Trained in {time.time()-t0:.1f}s")
    print(f"[ShieldPay FraudML] Saved -> {model_path}")
    print(f"[ShieldPay FraudML] Model : {meta['model_type']}  |  AUC: {auc:.4f}")


if __name__ == "__main__":
    train()
