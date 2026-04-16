/**
 * controllers/claimController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * REST controllers for all claim-related endpoints.
 *
 * POST /api/claims/auto-process
 *   → runs fraudEngine enforcement before any claim creation
 *   → IF blocked → HTTP 403 + strict BLOCKED JSON (no claim row)
 *   → IF APPROVE  → HTTP 201 + claim data
 *   → IF SOFT_FLAG→ HTTP 201 + claim data (soft_verification status)
 *   → IF VERIFY   → HTTP 201 + claim data (under_review status)
 *
 * GET /api/claims/fraud-log
 *   → returns fraud_logs table for audit
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getClaimsForUser,
  getAllClaims,
  getClaimById,
  softConfirmClaim,
  processClaimsForActiveTriggers,
  autoProcessClaim,
  getFraudLogs,
} from '../services/claimService.js';
import { getClaimExplanation } from '../services/fraudService.js';
import { extractDeviceSignals } from '../utils/ppcsCalculator.js';
import { asyncHandler, createError } from '../utils/errorHandler.js';

// ── GET /api/claims  — admin: all claims ──────────────────────────────────────
export const listAllClaims = asyncHandler(async (_req, res) => {
  const claims = await getAllClaims();
  res.status(200).json({ success: true, count: claims.length, data: claims });
});

// ── GET /api/claims/user  — JWT-protected: current user's claims ───────────────
export const listUserClaims = asyncHandler(async (req, res) => {
  const claims = await getClaimsForUser(req.user.userId);
  res.status(200).json({ success: true, count: claims.length, data: claims });
});

// ── GET /api/claims/:claimId  — single claim ─────────────────────────────────
export const getClaim = asyncHandler(async (req, res) => {
  const claim = await getClaimById(req.params.claimId);
  if (!claim) throw createError('Claim not found.', 404);
  res.status(200).json({ success: true, data: claim });
});

// ── GET /api/claims/:claimId/explain  — human-readable explanation ────────────
export const explainClaim = asyncHandler(async (req, res) => {
  const claim = await getClaimById(req.params.claimId);
  if (!claim) throw createError('Claim not found.', 404);

  const explanation = claim.explanation || getClaimExplanation(claim);

  res.status(200).json({
    success: true,
    claimId: claim.id,
    status:  claim.claimStatus,
    explanation,
    audit: {
      triggerReason:   claim.triggerReason,
      triggerLevel:    claim.triggerLevel,
      levelMultiplier: claim.levelMultiplier,
      predictedIncome: claim.estimatedIncomeLoss,
      actualEarned:    claim.actualEarned,
      netLoss:         claim.netLoss,
      payoutAmount:    claim.payoutAmount,
      fraudScore:      claim.fraudScore,
      fraudReasons:    claim.fraudReasons,
      coveragePct:     claim.coveragePercentage,
    },
  });
});

// ── POST /api/claims/:claimId/confirm  — soft-verification user confirmation ──
export const confirmClaim = asyncHandler(async (req, res) => {
  const { confirmation } = req.body;
  const claim = await softConfirmClaim({ claimId: req.params.claimId, confirmation });
  res.status(200).json({ success: true, data: claim });
});

// ── POST /api/claims/process  — manually trigger the auto-processing cron ─────
export const processClaims = asyncHandler(async (_req, res) => {
  const results = await processClaimsForActiveTriggers();
  res.status(200).json({ success: true, results });
});

// ── GET /api/claims/fraud-log  — fraud log audit table ────────────────────────
export const listFraudLogs = asyncHandler(async (req, res) => {
  const limit   = Math.min(parseInt(req.query.limit  ?? '50', 10), 200);
  const claimId = req.query.claim_id ?? undefined;
  const logs    = await getFraudLogs({ claimId, limit });
  res.status(200).json({ success: true, count: logs.length, data: logs });
});

// ── POST /api/claims/auto-process  ────────────────────────────────────────────
//
// Body:
// {
//   policy_id,        string  (UUID)
//   trigger_type,     string  (e.g. "HEAVY_RAIN")
//   trigger_level,    number  1 | 2 | 3
//   zone_id,          string  (UUID)
//   disruption_start, string  (ISO datetime)
//   disruption_end,   string  (ISO datetime)
//   actual_earned     number  (₹, default 0)
//   device_signals    object  optional PPCS signals
// }
export const autoProcess = asyncHandler(async (req, res) => {
  const {
    policy_id,
    trigger_type,
    trigger_level,
    zone_id,
    disruption_start,
    disruption_end,
    actual_earned = 0,
  } = req.body;

  // ── Input validation ──────────────────────────────────────────────────────
  if (!policy_id)    throw createError('policy_id is required', 400);
  if (!trigger_type) throw createError('trigger_type is required', 400);
  if (!zone_id)      throw createError('zone_id is required', 400);

  const validTypes = ['HEAVY_RAIN', 'FLOOD', 'SEVERE_AQI', 'HEATWAVE', 'ZONE_SHUTDOWN'];
  if (!validTypes.includes(trigger_type)) {
    throw createError(`trigger_type must be one of: ${validTypes.join(', ')}`, 400);
  }

  const level = parseInt(trigger_level, 10);
  if (![1, 2, 3].includes(level)) throw createError('trigger_level must be 1, 2, or 3', 400);

  // Extract device signals from body (optional — falls back to safe defaults)
  const deviceSignals = extractDeviceSignals(req.body);

  const result = await autoProcessClaim({
    policy_id,
    trigger_type,
    trigger_level: level,
    zone_id,
    disruption_start,
    disruption_end,
    actual_earned:  Number(actual_earned),
    deviceSignals,
  });

  // ══ ENFORCEMENT: Hard BLOCK → HTTP 403, pipeline stopped ══════════════════
  if (result.stop_processing) {
    return res.status(403).json({
      success:    false,
      status:     'BLOCKED',
      reason:     result.block_reason,
      reasons:    result.block_reasons ?? [result.block_reason],
      fraud_score: result.fraud_score,
      ppcs:        result.ppcs_score,
      flags:       result.flags,
      decision:    result.decision,
      explanation: result.explanation,
      // Audit context
      audit: {
        trigger_type,
        zone_id,
        policy_id,
        predictedIncome:  result.predictedIncome,
        actualEarned:     result.actualEarned,
        netLoss:          result.netLoss,
        payoutWouldHave:  result.payoutAmount,
      },
    });
  }

  // ══ Dry-run (no active trigger event in DB) ════════════════════════════════
  if (result.dry_run) {
    return res.status(200).json({
      success:  true,
      message:  'Dry-run: no active trigger event found for zone; claim not committed',
      decision: result.decision,
      data:     result,
    });
  }

  // ══ Claim created — map decision to user message ══════════════════════════
  const messageMap = {
    APPROVE:   'Claim approved and queued for payout',
    SOFT_FLAG: 'Claim soft-flagged — 2-hour verification hold applied',
    VERIFY:    'Claim queued for manual verification',
    BLOCK:     'Claim blocked by fraud enforcement engine',
  };

  const httpStatus = result.decision === 'APPROVE' ? 201
    : result.decision === 'VERIFY'   ? 201
    : result.decision === 'SOFT_FLAG' ? 201
    : 201;

  return res.status(httpStatus).json({
    success:     true,
    message:     messageMap[result.decision] ?? 'Claim processed',
    decision:    result.decision,
    fraud_score: result.fraud_score,
    ppcs:        result.ppcs_score,
    flags:       result.flags,
    status:      result.claimStatus ?? result.claim_status,
    data:        result,
  });
});