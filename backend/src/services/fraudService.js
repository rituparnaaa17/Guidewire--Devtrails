/**
 * fraudService.js — ML-First Fraud Detection Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Architecture:
 *   PRIMARY  → POST http://localhost:8002/predict-fraud  (XGBoost ML model)
 *   FALLBACK → Weighted rule-engine (4 rules) if ML service is unreachable
 *
 * Feature vector fed to ML (14 features):
 *   Income:     predicted_income, actual_income, payout, income_ratio
 *   Behavior:   account_age_days, claims_last_7d, claims_last_28d
 *   Velocity:   velocity_ratio
 *   Policy:     policy_age_hours
 *   Validation: zone_match, duplicate_flag, trigger_valid
 *   Fraud ring: upi_cluster_size
 *   Presence:   ppcs_score
 *
 * Risk decision:
 *   < 0.30  → LOW    → claimStatus = 'paid'
 *   0.30–0.60 → MEDIUM → claimStatus = 'under_review'
 *   > 0.60  → HIGH   → claimStatus = 'under_review'  + manual flag
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from '../config/db.js';
import { computeGpsPpcs, getLocationContext } from './locationService.js';

const ML_FRAUD_URL  = (process.env.ML_FRAUD_URL  || 'http://localhost:8002').replace(/\/$/, '');
const ML_TIMEOUT_MS = parseInt(process.env.ML_FRAUD_TIMEOUT_MS || '3000', 10);

// ─── Feature computation helpers ──────────────────────────────────────────────

/**
 * Build a PPCS (Presence & Phone Continuity Score) proxy from behavioral signals.
 * Real implementation would consume GPS/motion/cell data from a mobile SDK.
 * Here we derive it from DB signals as a plausible demo approximation.
 */
const computePpcsScore = ({ accountAgeDays, velocityRatio, zoneMatch, claimsLast7d }) => {
  const ageFactor      = Math.min(accountAgeDays / 365, 1.0) * 0.40;
  const velocityPenalty = Math.min(velocityRatio / 10,   1.0) * 0.30;
  const zoneFactor     = (zoneMatch ? 0.15 : 0.0);
  const freqPenalty    = Math.min(claimsLast7d / 10, 1.0) * 0.15;
  const raw = ageFactor - velocityPenalty + zoneFactor - freqPenalty;
  return Math.max(0.05, Math.min(1.0, raw + 0.5));
};

/** Gather all 14 ML features for a given claim context. */
export const buildFeatureVector = async ({
  userId, zoneId, triggerType,
  predictedIncome, actualEarned, payout,
  policy,
}) => {
  // ── Account age ─────────────────────────────────────────────────────────
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { createdAt: true, upiId: true },
  });
  const accountAgeDays = user
    ? (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    : 0;

  // ── Claim frequency ─────────────────────────────────────────────────────
  const now   = new Date();
  const ago7d  = new Date(now - 7  * 24 * 60 * 60 * 1000);
  const ago28d = new Date(now - 28 * 24 * 60 * 60 * 1000);

  const [cnt7d, cnt28d] = await Promise.all([
    prisma.claim.count({ where: { userId, createdAt: { gte: ago7d  } } }),
    prisma.claim.count({ where: { userId, createdAt: { gte: ago28d } } }),
  ]);

  // ── Velocity ────────────────────────────────────────────────────────────
  // claims in 7d vs baseline (1 claim/week = 1.0)
  const velocityRatio = cnt7d > 0 ? cnt7d / 1.0 : 0.0;

  // ── Policy age ──────────────────────────────────────────────────────────
  const policyAgeHours = policy?.createdAt
    ? (Date.now() - new Date(policy.createdAt).getTime()) / (1000 * 60 * 60)
    : 0;

  // ── Zone match ──────────────────────────────────────────────────────────
  const policyZoneId = policy?.quote?.zoneId ?? policy?.zoneId ?? null;
  const zoneMatch    = policyZoneId === zoneId ? 1 : 0;

  // ── Duplicate detection ─────────────────────────────────────────────────
  const dupeCount = await prisma.claim.count({
    where: { userId, triggerEvent: { zoneId, triggerType } },
  });
  const duplicateFlag = dupeCount > 0 ? 1 : 0;

  // ── Trigger valid ───────────────────────────────────────────────────────
  const activeTrigger = await prisma.triggerEvent.findFirst({
    where: { zoneId, triggerType, status: { in: ['active', 'resolved'] } },
  });
  const triggerValid = activeTrigger ? 1 : 0;

  // ── UPI cluster ─────────────────────────────────────────────────────────
  // Count users sharing the same UPI prefix (proxy for linked accounts)
  let upiClusterSize = 1;
  if (user?.upiId) {
    const prefix = user.upiId.split('@')[0]?.slice(0, -3) ?? '';
    if (prefix.length >= 3) {
      upiClusterSize = await prisma.user.count({
        where: { upiId: { startsWith: prefix } },
      });
    }
  }

  // ── Income features ─────────────────────────────────────────────────────
  const pred        = Number(predictedIncome) || 1;
  const act         = Number(actualEarned)    || 0;
  const incomeRatio = act / pred;

  // ── PPCS score (real GPS if available, behavioral fallback) ────────────
  let ppcsScore;
  try {
    ppcsScore = await computeGpsPpcs(userId);
  } catch {
    // Fallback to behavioral proxy
    ppcsScore = computePpcsScore({ accountAgeDays, velocityRatio, zoneMatch, claimsLast7d: cnt7d });
  }

  // ── Real location match (GPS-based if available) ────────────────────────
  let realZoneMatch = zoneMatch;
  try {
    const locCtx = await getLocationContext(userId, zoneId);
    if (locCtx.hasLiveGps) realZoneMatch = locCtx.locationMatch;
  } catch { /* keep policy-based zone_match */ }

  return {
    // income
    predicted_income:  pred,
    actual_income:     act,
    payout:            Number(payout) || 0,
    income_ratio:      Math.min(incomeRatio, 5),
    // behavior
    account_age_days:  Math.floor(accountAgeDays),
    claims_last_7d:    cnt7d,
    claims_last_28d:   cnt28d,
    // velocity
    velocity_ratio:    velocityRatio,
    // policy
    policy_age_hours:  Math.round(policyAgeHours),
    // validation
    zone_match:        realZoneMatch,
    duplicate_flag:    duplicateFlag,
    trigger_valid:     triggerValid,
    // fraud ring
    upi_cluster_size:  upiClusterSize,
    // presence
    ppcs_score:        Math.round(ppcsScore * 1000) / 1000,
  };
};

// ─── ML call ─────────────────────────────────────────────────────────────────

const callMlService = async (features) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ML_TIMEOUT_MS);
  try {
    const res = await fetch(`${ML_FRAUD_URL}/predict-fraud`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(features),
      signal:  controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`ML service returned ${res.status}`);
    return await res.json();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
};

// ─── Fallback rule engine ─────────────────────────────────────────────────────

const ruleBasedFallback = (features) => {
  let score = 0;
  const factors = [];

  if (features.account_age_days < 3)    { score += 0.30; factors.push('very new account'); }
  if (features.claims_last_7d  >= 4)    { score += 0.20; factors.push('high claims in 7 days'); }
  if (features.zone_match      === 0)   { score += 0.25; factors.push('zone mismatch'); }
  if (features.duplicate_flag  === 1)   { score += 0.40; factors.push('duplicate claim detected'); }
  if (features.ppcs_score      < 0.30)  { score += 0.25; factors.push('low presence/PPCS score'); }
  if (features.velocity_ratio  > 3.0)   { score += 0.20; factors.push('high claim velocity'); }
  if (features.upi_cluster_size > 10)   { score += 0.15; factors.push('large UPI fraud cluster'); }

  const prob = Math.min(1.0, score);
  const risk = prob < 0.30 ? 'LOW' : prob < 0.60 ? 'MEDIUM' : 'HIGH';
  return { fraud_probability: prob, risk_level: risk, top_factors: factors, is_ml: false };
};

// ─── Main evaluator (ML-first with fallback) ──────────────────────────────────

export const evaluateFraudML = async (features) => {
  let mlResult  = null;
  let usedFallback = false;

  try {
    mlResult = await callMlService(features);
    console.log(`[fraudService] ML score: ${mlResult.fraud_probability} (${mlResult.risk_level}) — ${mlResult.latency_ms}ms`);
  } catch (err) {
    console.warn(`[fraudService] ML service unreachable (${err.message}) — using rule fallback`);
    mlResult = ruleBasedFallback(features);
    usedFallback = true;
  }

  const { fraud_probability: prob, risk_level: risk, top_factors: factors } = mlResult;

  // Map risk level → legacy SUSPICIOUS/APPROVED + claimStatus
  const fraudStatus = risk === 'HIGH' ? 'SUSPICIOUS' : risk === 'MEDIUM' ? 'HOLD' : 'APPROVED';
  const claimStatus = risk === 'LOW'  ? 'paid'       : 'under_review';

  return {
    fraudProbability: prob,
    riskLevel:        risk,
    fraudStatus,
    claimStatus,
    riskFactors:      factors,
    usedFallback,
    // Legacy compat fields
    fraudScore:       Math.round(prob * 100),
    fraudReasons:     factors.map((f) => ({
      rule: f.toUpperCase().replace(/ /g,'_'),
      triggered: true,
      description: f,
      evidence: `ML signal: ${f}`,
    })),
  };
};

// ─── Legacy evaluateFraud wrapper (keeps claimService.js compatible) ──────────
// BuildFeatureVector is called outside, but for legacy callers we do a lightweight version

export const evaluateFraud = async ({ userId, zoneId, triggerType }) => {
  // Minimal feature set for quick legacy callers (claimService auto-processor)
  const user = await prisma.user.findUnique({
    where: { id: userId }, select: { createdAt: true, upiId: true },
  });
  const accountAgeDays = user
    ? (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    : 0;

  const now  = new Date();
  const ago7 = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const cnt7 = await prisma.claim.count({ where: { userId, createdAt: { gte: ago7 } } });

  const activeTrigger = await prisma.triggerEvent.findFirst({
    where: { zoneId, triggerType, status: { in: ['active','resolved'] } },
  });
  const triggerValid = activeTrigger ? 1 : 0;

  const policy = await prisma.policy.findFirst({
    where:   { userId, status: 'active' },
    include: { quote: { select: { zoneId: true } } },
  });
  const zoneMatch = (policy?.quote?.zoneId === zoneId) ? 1 : 0;

  const features = {
    predicted_income: 500, actual_income: 0, payout: 200,
    income_ratio: 0, account_age_days: Math.floor(accountAgeDays),
    claims_last_7d: cnt7, claims_last_28d: cnt7 * 3,
    velocity_ratio: cnt7 > 1 ? cnt7 : 0,
    policy_age_hours: 720,
    zone_match: zoneMatch, duplicate_flag: 0, trigger_valid: triggerValid,
    upi_cluster_size: 1, ppcs_score: 0.70,
  };

  const result = await evaluateFraudML(features);

  return {
    fraudScore:  result.fraudScore,
    fraudStatus: result.fraudStatus,
    reasons: result.fraudReasons,
  };
};

// ─── Explainability ───────────────────────────────────────────────────────────

export const getClaimExplanation = (claim) => {
  const {
    fraudStatus, claimStatus, triggerReason, fraudScore,
    fraudProbability, riskLevel, riskFactors = [],
    fraudReasons = [], triggerLevel, netLoss, payoutAmount,
  } = claim;

  const safeFactors = Array.isArray(riskFactors) ? riskFactors : [];
  const safeReasons = Array.isArray(fraudReasons) ? fraudReasons : [];

  const triggeredRules = safeReasons.filter((r) => r.triggered).map((r) => r.description);

  const statusPhrase =
    claimStatus === 'paid'
      ? 'was approved and paid out'
      : claimStatus === 'under_review'
      ? 'has been flagged for manual review'
      : 'is pending review';

  const mlPhrase = fraudProbability != null
    ? `ML fraud probability: ${(fraudProbability * 100).toFixed(1)}% (${riskLevel ?? 'UNKNOWN'} risk).`
    : '';

  const factorPhrase = safeFactors.length > 0
    ? `Top risk signals: ${safeFactors.slice(0, 3).join('; ')}.`
    : triggeredRules.length > 0
    ? `Rule signals: ${triggeredRules.join('; ')}.`
    : 'No significant fraud signals detected.';

  return [
    `This claim ${statusPhrase}.`,
    triggerReason ? `Trigger: ${triggerReason}.` : '',
    `Level ${triggerLevel ?? 1} event.`,
    `Net loss: ₹${Number(netLoss ?? 0).toFixed(2)}.`,
    `Payout: ₹${Number(payoutAmount ?? 0).toFixed(2)}.`,
    mlPhrase,
    factorPhrase,
  ].filter(Boolean).join(' ');
};
