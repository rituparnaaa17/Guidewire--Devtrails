-- =============================================================
-- Migration 002: Claim Explainability + Parametric Level Fields
-- Run once against the shieldpay PostgreSQL database
-- =============================================================

-- actual earnings reported by the worker during disruption window
ALTER TABLE claims
  ADD COLUMN IF NOT EXISTS actual_earned        NUMERIC(12,2) NOT NULL DEFAULT 0;

-- calculated net income loss = predicted - actual
ALTER TABLE claims
  ADD COLUMN IF NOT EXISTS net_loss             NUMERIC(12,2) NOT NULL DEFAULT 0;

-- L1 / L2 / L3
ALTER TABLE claims
  ADD COLUMN IF NOT EXISTS trigger_level        SMALLINT      NOT NULL DEFAULT 1
    CHECK (trigger_level BETWEEN 1 AND 3);

-- e.g. "Rain Level 3 exceeded threshold (82.1 mm/h ≥ 75)"
ALTER TABLE claims
  ADD COLUMN IF NOT EXISTS trigger_reason       TEXT;

-- L1→0.6, L2→0.85, L3→1.0
ALTER TABLE claims
  ADD COLUMN IF NOT EXISTS level_multiplier     NUMERIC(4,2)  NOT NULL DEFAULT 0.60;

-- coverage_percentage used during payout calculation (0..100)
ALTER TABLE claims
  ADD COLUMN IF NOT EXISTS coverage_percentage  NUMERIC(5,2)  NOT NULL DEFAULT 80.00;

-- JSONB array of fraud rule hits: [{rule, score, reason}]
ALTER TABLE claims
  ADD COLUMN IF NOT EXISTS fraud_reasons        JSONB         NOT NULL DEFAULT '[]'::jsonb;

-- Human-readable AI explanation string
ALTER TABLE claims
  ADD COLUMN IF NOT EXISTS explanation          TEXT;

-- Index for fast admin queries on trigger_level
CREATE INDEX IF NOT EXISTS idx_claims_trigger_level ON claims(trigger_level);
