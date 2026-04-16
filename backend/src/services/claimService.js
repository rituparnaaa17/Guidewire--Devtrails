/**
 * claimService.js — Prisma edition (Enforcement Engine integrated)
 * ─────────────────────────────────────────────────────────────────────────────
 * Parametric Insurance — Full Claim Processing Pipeline
 *
 * NEW Pipeline (vs old score-only):
 *   trigger → fraudEngine.evaluateFraudAndDecide()
 *             ↓ stop_processing=true? → LOG + RETURN blocked result (NO DB claim write)
 *             ↓ APPROVE  → claimStatus = 'paid'
 *             ↓ SOFT_FLAG→ claimStatus = 'soft_verification'
 *             ↓ VERIFY   → claimStatus = 'under_review'
 *             ↓ BLOCK    → claimStatus = 'blocked'
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma                             from '../config/db.js';
import { createError }                   from '../utils/errorHandler.js';
import { listActiveTriggers, LEVEL_MULTIPLIERS } from './triggerService.js';
import { evaluateFraudAndDecide, logFraudDecision, buildExplanation } from './fraudEngine.js';
import { extractDeviceSignals }          from '../utils/ppcsCalculator.js';
// Keep old fraudService for getClaimExplanation (display helper)
import { getClaimExplanation }           from './fraudService.js';

const round2 = (v) => Math.round(Number(v) * 100) / 100;

// ─── Payout math ──────────────────────────────────────────────────────────────

const calculatePredictedIncome = (weeklyIncome, disruptionHours) => {
  const hourlyRate = Number(weeklyIncome) / 7 / 10;
  return round2(hourlyRate * Math.max(0, Number(disruptionHours)));
};

const calculatePayout = ({ predicted, actualEarned, coveragePct, levelMultiplier, coverageAmount }) => {
  const netLoss = Math.max(0, predicted - Number(actualEarned));
  const payout  = round2(
    Math.min(netLoss * (Number(coveragePct) / 100) * levelMultiplier, Number(coverageAmount))
  );
  return { netLoss: round2(netLoss), payout };
};

// ─── Eligibility helpers ──────────────────────────────────────────────────────

const toMinutes = (t) => {
  if (!t) return null;
  const [h, m = '0'] = String(t).split(':');
  return Number(h) * 60 + Number(m);
};

const doesShiftOverlap = (profile, triggerStart, triggerEnd) => {
  const s = toMinutes(profile.preferredWorkStart);
  const e = toMinutes(profile.preferredWorkEnd);
  if (s === null || e === null) return true;
  const ts = triggerStart.getHours() * 60 + triggerStart.getMinutes();
  const te = triggerEnd.getHours()   * 60 + triggerEnd.getMinutes();
  return e >= s ? ts < e && te > s : ts >= s || te <= e;
};

const isPolicyActive = (policy) => {
  if (policy.status !== 'active') return false;
  const now = new Date();
  return policy.validFrom <= now && policy.validUntil >= now;
};

const isTriggerCovered = (policy, triggerType) => {
  return Array.isArray(policy.coverageTriggers) && policy.coverageTriggers.includes(triggerType);
};

const hasExistingClaim = async (policyId, triggerEventId) => {
  const claim = await prisma.claim.findFirst({ where: { policyId, triggerEventId } });
  return !!claim;
};

// ─── Map engine decision → DB claimStatus ────────────────────────────────────

const decisionToStatus = (decision) => {
  switch (decision) {
    case 'APPROVE':    return 'paid';
    case 'SOFT_FLAG':  return 'soft_verification';
    case 'VERIFY':     return 'under_review';
    case 'BLOCK':      return 'blocked';
    default:           return 'under_review';
  }
};

// ─── Core: auto-pipeline per trigger (scheduler) ──────────────────────────────

export const createClaimCandidateForTrigger = async (triggerEvent) => {
  const rawPayload    = triggerEvent.rawPayload ?? {};
  const triggerLevel  = rawPayload.trigger_level ?? 1;
  const multiplier    = rawPayload.multiplier    ?? LEVEL_MULTIPLIERS[triggerLevel] ?? 0.60;
  const triggerReason = triggerEvent.trigger_reason ?? `${triggerEvent.triggerType} Level ${triggerLevel}`;

  const policies = await prisma.policy.findMany({
    where: {
      status:     'active',
      validUntil: { gt: new Date() },
      quote:      { zoneId: triggerEvent.zoneId },
    },
    include: {
      quote: { select: { zoneId: true, avgWeeklyIncome: true, dailyHours: true } },
      user:  { include: { workerProfile: true } },
    },
  });

  const createdClaims = [];

  for (const policy of policies) {
    if (!isPolicyActive(policy))                             continue;
    if (!isTriggerCovered(policy, triggerEvent.triggerType)) continue;

    const profile    = policy.user.workerProfile;
    const trigStart  = new Date(triggerEvent.startTime);
    const trigEnd    = new Date(triggerEvent.endTime ?? triggerEvent.updatedAt ?? triggerEvent.createdAt);
    if (!doesShiftOverlap(profile ?? {}, trigStart, trigEnd)) continue;
    if (await hasExistingClaim(policy.id, triggerEvent.id))   continue;

    const disruptionHours = Math.max(0.25, (trigEnd.getTime() - trigStart.getTime()) / (1000 * 60 * 60));
    const weeklyIncome    = Number(profile?.avgWeeklyIncome ?? policy.quote.avgWeeklyIncome ?? 4500);
    const coveragePct     = 80;
    const predictedIncome = calculatePredictedIncome(weeklyIncome, disruptionHours);
    const { netLoss, payout } = calculatePayout({
      predicted:       predictedIncome,
      actualEarned:    0,
      coveragePct,
      levelMultiplier: multiplier,
      coverageAmount:  policy.coverageAmount,
    });

    // ── Fraud enforcement (scheduler uses no device signals) ─────────────────
    const engineResult = await evaluateFraudAndDecide({
      claim: {
        userId:          policy.userId,
        zoneId:          triggerEvent.zoneId,
        triggerType:     triggerEvent.triggerType,
        disruptionStart: triggerEvent.startTime?.toISOString(),
        disruptionEnd:   triggerEvent.endTime?.toISOString(),
        actualEarned:    0,
        predictedLoss:   predictedIncome,
      },
      user:          policy.user,
      policy,
      deviceSignals: {},
    });

    // Hard block: log but DO NOT create claim row
    if (engineResult.stop_processing) {
      console.warn(
        `[claimService] Scheduler BLOCKED claim for policy ${policy.id}: ${engineResult.block_reason}`
      );
      await logFraudDecision({
        claimId:     null,
        flags:       engineResult.flags,
        decision:    engineResult.decision,
        fraudScore:  engineResult.fraud_score,
        ppcsScore:   engineResult.ppcs_score,
        blockReason: engineResult.block_reason,
      });
      continue;
    }

    // Create claim row
    const claimStatus  = decisionToStatus(engineResult.decision);
    const reviewReason = buildExplanation(engineResult);

    const claim = await prisma.claim.create({
      data: {
        userId:              policy.userId,
        policyId:            policy.id,
        triggerEventId:      triggerEvent.id,
        claimStatus,
        estimatedIncomeLoss: predictedIncome,
        actualEarned:        0,
        netLoss,
        payoutAmount:        payout,
        triggerLevel,
        levelMultiplier:     multiplier,
        coveragePercentage:  coveragePct,
        triggerReason,
        fraudScore:          engineResult.fraud_score,
        fraudReasons:        engineResult.flags,
        riskLevel:           engineResult.ppcs_score >= 80 ? 'LOW' : engineResult.ppcs_score >= 50 ? 'MEDIUM' : 'HIGH',
        reviewReason,
        explanation:         reviewReason,
      },
    });

    await logFraudDecision({
      claimId:     claim.id,
      flags:       engineResult.flags,
      decision:    engineResult.decision,
      fraudScore:  engineResult.fraud_score,
      ppcsScore:   engineResult.ppcs_score,
      blockReason: engineResult.block_reason,
    });

    createdClaims.push(claim);
  }

  return createdClaims;
};

export const processClaimsForActiveTriggers = async () => {
  const triggers = await listActiveTriggers();
  const results  = [];

  for (const triggerEvent of triggers) {
    const claims = await createClaimCandidateForTrigger(triggerEvent);
    results.push({ triggerEventId: triggerEvent.id, claims });
  }

  // Re-evaluate lingering pending claims
  const pendingClaims = await prisma.claim.findMany({
    where:   { claimStatus: 'pending' },
    include: {
      policy: { include: { user: { include: { workerProfile: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  });

  for (const claim of pendingClaims) {
    const triggerEvent = await prisma.triggerEvent.findUnique({ where: { id: claim.triggerEventId } });
    if (!triggerEvent) continue;

    const policy = claim.policy;
    const user   = policy?.user;

    const engineResult = await evaluateFraudAndDecide({
      claim: {
        userId:          claim.userId,
        zoneId:          triggerEvent.zoneId,
        triggerType:     triggerEvent.triggerType,
        disruptionStart: triggerEvent.startTime?.toISOString(),
        disruptionEnd:   triggerEvent.endTime?.toISOString(),
        actualEarned:    Number(claim.actualEarned ?? 0),
        predictedLoss:   Number(claim.estimatedIncomeLoss ?? 0),
      },
      user,
      policy,
      deviceSignals: {},
    });

    const claimStatus  = engineResult.stop_processing ? 'blocked' : decisionToStatus(engineResult.decision);
    const reviewReason = buildExplanation(engineResult);

    const updated = await prisma.claim.update({
      where: { id: claim.id },
      data:  {
        claimStatus,
        fraudScore:   engineResult.fraud_score,
        fraudReasons: engineResult.flags,
        reviewReason,
        explanation:  reviewReason,
      },
    });

    await logFraudDecision({
      claimId:     claim.id,
      flags:       engineResult.flags,
      decision:    engineResult.decision,
      fraudScore:  engineResult.fraud_score,
      ppcsScore:   engineResult.ppcs_score,
      blockReason: engineResult.block_reason,
    });

    results.push({ claimId: updated.id, status: updated.claimStatus });
  }

  return results;
};

// ─── Manual API endpoint (POST /api/claims/auto-process) ─────────────────────

export const autoProcessClaim = async ({
  policy_id, trigger_type, trigger_level, zone_id,
  disruption_start, disruption_end, actual_earned = 0,
  deviceSignals = {},
}) => {
  const level      = Math.min(3, Math.max(1, Number(trigger_level) || 1));
  const multiplier = LEVEL_MULTIPLIERS[level];

  const policy = await prisma.policy.findUnique({
    where:   { id: policy_id },
    include: {
      quote: { select: { zoneId: true, avgWeeklyIncome: true, dailyHours: true } },
      user:  { include: { workerProfile: true } },
    },
  });
  if (!policy)               throw createError('Policy not found', 404);
  if (!isPolicyActive(policy)) throw createError('Policy is not active', 409);
  if (!isTriggerCovered(policy, trigger_type)) {
    throw createError(`Policy does not cover trigger type: ${trigger_type}`, 409);
  }

  const triggerEvent = await prisma.triggerEvent.findFirst({
    where:   { zoneId: zone_id, triggerType: trigger_type, status: 'active' },
    orderBy: { createdAt: 'desc' },
  });

  const disruptStart = new Date(disruption_start ?? triggerEvent?.startTime ?? Date.now());
  const disruptEnd   = new Date(disruption_end   ?? triggerEvent?.endTime   ?? Date.now());
  const hours        = Math.max(0.25, (disruptEnd - disruptStart) / (1000 * 60 * 60));

  const weeklyIncome    = Number(policy.user.workerProfile?.avgWeeklyIncome ?? policy.quote.avgWeeklyIncome ?? 4500);
  const coveragePct     = 80;
  const predictedIncome = calculatePredictedIncome(weeklyIncome, hours);
  const { netLoss, payout } = calculatePayout({
    predicted: predictedIncome, actualEarned: actual_earned,
    coveragePct, levelMultiplier: multiplier, coverageAmount: policy.coverageAmount,
  });

  const triggerReason = `${trigger_type} Level ${level} event`;

  // ── Run enforcement engine ────────────────────────────────────────────────
  const engineResult = await evaluateFraudAndDecide({
    claim: {
      userId:          policy.userId,
      zoneId:          zone_id,
      triggerType:     trigger_type,
      disruptionStart: disruptStart.toISOString(),
      disruptionEnd:   disruptEnd.toISOString(),
      actualEarned:    actual_earned,
      predictedLoss:   predictedIncome,
    },
    user:   policy.user,
    policy,
    deviceSignals,
  });

  const explanation = buildExplanation(engineResult);

  // ── Hard / soft block: no claim row, but log it ───────────────────────────
  if (engineResult.stop_processing) {
    await logFraudDecision({
      claimId:     null,
      flags:       engineResult.flags,
      decision:    engineResult.decision,
      fraudScore:  engineResult.fraud_score,
      ppcsScore:   engineResult.ppcs_score,
      blockReason: engineResult.block_reason,
    });

    return {
      blocked:        true,
      stop_processing: true,
      decision:        engineResult.decision,
      fraud_score:     engineResult.fraud_score,
      ppcs_score:      engineResult.ppcs_score,
      flags:           engineResult.flags,
      block_reason:    engineResult.block_reason,
      block_reasons:   engineResult.block_reasons ?? [engineResult.block_reason],
      explanation,
      // Computation context (useful for debugging/audit)
      triggerLevel:    level,
      levelMultiplier: multiplier,
      predictedIncome,
      actualEarned:    round2(actual_earned),
      netLoss,
      payoutAmount:    payout,
      triggerReason,
    };
  }

  // ── Dry-run: no active trigger event → compute only ────────────────────────
  if (!triggerEvent) {
    return {
      dry_run:         true,
      blocked:         false,
      decision:        engineResult.decision,
      fraud_score:     engineResult.fraud_score,
      ppcs_score:      engineResult.ppcs_score,
      flags:           engineResult.flags,
      triggerLevel:    level,
      levelMultiplier: multiplier,
      predictedIncome,
      actualEarned:    round2(actual_earned),
      netLoss,
      payoutAmount:    payout,
      triggerReason,
      explanation,
    };
  }

  // ── Create claim row ──────────────────────────────────────────────────────
  const claimStatus  = decisionToStatus(engineResult.decision);
  const reviewReason = explanation;

  const claim = await prisma.claim.create({
    data: {
      userId:              policy.userId,
      policyId:            policy_id,
      triggerEventId:      triggerEvent.id,
      claimStatus,
      estimatedIncomeLoss: predictedIncome,
      actualEarned:        round2(actual_earned),
      netLoss,
      payoutAmount:        payout,
      triggerLevel:        level,
      levelMultiplier:     multiplier,
      coveragePercentage:  coveragePct,
      triggerReason,
      fraudScore:          engineResult.fraud_score,
      fraudReasons:        engineResult.flags,
      riskLevel:           engineResult.ppcs_score >= 80 ? 'LOW' : engineResult.ppcs_score >= 50 ? 'MEDIUM' : 'HIGH',
      reviewReason,
      explanation:         reviewReason,
    },
  });

  await logFraudDecision({
    claimId:     claim.id,
    flags:       engineResult.flags,
    decision:    engineResult.decision,
    fraudScore:  engineResult.fraud_score,
    ppcsScore:   engineResult.ppcs_score,
    blockReason: engineResult.block_reason,
  });

  return {
    ...claim,
    blocked:        false,
    decision:       engineResult.decision,
    fraud_score:    engineResult.fraud_score,
    ppcs_score:     engineResult.ppcs_score,
    flags:          engineResult.flags,
    claim_status:   claimStatus,
    explanation,
  };
};

// ─── General queries ──────────────────────────────────────────────────────────

export const getClaimsForUser = async (userId) => {
  return prisma.claim.findMany({
    where:   { userId },
    include: { triggerEvent: { include: { zone: { select: { zoneName: true, zoneCode: true } } } } },
    orderBy: { createdAt: 'desc' },
  });
};

export const getAllClaims = async () => {
  return prisma.claim.findMany({
    include: { triggerEvent: { include: { zone: { select: { zoneName: true, zoneCode: true } } } } },
    orderBy: { createdAt: 'desc' },
  });
};

export const getClaimById = async (claimId) => {
  return prisma.claim.findUnique({ where: { id: claimId } });
};

export const getFraudLogs = async ({ claimId, limit = 50 } = {}) => {
  return prisma.fraudLog.findMany({
    where:   claimId ? { claimId } : undefined,
    include: { claim: { select: { id: true, claimStatus: true, userId: true } } },
    orderBy: { createdAt: 'desc' },
    take:    limit,
  });
};

export const softConfirmClaim = async ({ claimId, confirmation }) => {
  const claim = await prisma.claim.findUnique({ where: { id: claimId } });
  if (!claim) throw createError('Claim not found.', 404);
  if (claim.claimStatus !== 'soft_verification') {
    throw createError('Claim is not awaiting soft verification.', 409);
  }

  if (!confirmation) {
    return prisma.claim.update({
      where: { id: claimId },
      data:  { claimStatus: 'under_review', reviewReason: 'User did not confirm soft verification' },
    });
  }

  const fraudScore = Number(claim.fraudScore ?? 0);
  if (fraudScore <= 60) {
    return prisma.claim.update({
      where: { id: claimId },
      data:  { claimStatus: 'paid', reviewReason: 'User confirmed — soft verification passed' },
    });
  }

  return prisma.claim.update({
    where: { id: claimId },
    data:  { claimStatus: 'under_review', reviewReason: 'User confirmed but fraud score too high — manual review required' },
  });
};