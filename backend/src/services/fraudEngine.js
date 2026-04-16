/**
 * services/fraudEngine.js
 * ─────────────────────────────────────────────────────────────────────────────
 * ShieldPay KAVACH — Strict Fraud Enforcement Engine
 *
 * Architecture:
 *   HARD BLOCKS (evaluated first, any one = immediate HALT)
 *     A. GPS zone validation    → ZONE_NOT_VERIFIED
 *     B. Duplicate claim        → DUPLICATE_CLAIM
 *     C. No real trigger        → NO_REAL_TRIGGER
 *     D. Policy age < 24h       → POLICY_TOO_NEW
 *     E. Retroactive claim      → RETROACTIVE_CLAIM
 *     F. Timezone mismatch      → TIMEZONE_MISMATCH
 *     G. Shift overlap fail     → NO_SHIFT_OVERLAP
 *
 *   SOFT SCORING (only if not blocked)
 *     Layer 2: Platform income  → +25
 *     Layer 3: Account age      → +30 / +15
 *     Layer 4: Claim frequency  → +20 / +10
 *     Layer 4.5: Velocity       → +20 / +15 / +5
 *     Layer 7: UPI ring         → +30
 *
 *   PPCS (device trust)
 *     100 base − signal penalties
 *
 *   FINAL DECISION
 *     BLOCK (hard) | APPROVE | SOFT_FLAG | VERIFY | BLOCK (soft)
 *
 * Main export:
 *   evaluateFraudAndDecide(claim, user, policy, triggers, deviceSignals)
 *   → { fraud_score, ppcs_score, decision, flags, stop_processing, block_reason }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma                                       from '../config/db.js';
import { validateGpsZone, detectTimezoneMismatch }  from '../utils/locationValidator.js';
import { calculatePpcs }                            from '../utils/ppcsCalculator.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const DUPLICATE_WINDOW_MS   = 6 * 60 * 60 * 1000; // 6 hours
const POLICY_MIN_AGE_MS     = 24 * 60 * 60 * 1000; // 24 hours
const RETROACTIVE_LIMIT_MS  = 60 * 60 * 1000;       // 1 hour
const VELOCITY_BASELINE     = 1.0;                   // 1 claim/week = 1.0×

// ─── Helper: human-readable reason for a flag ────────────────────────────────

const FLAG_REASONS = {
  ZONE_NOT_VERIFIED:  'User GPS location does not match the claim zone',
  DUPLICATE_CLAIM:    'Identical trigger claim already submitted within 6 hours',
  NO_REAL_TRIGGER:    'No active or verified trigger event found for this zone',
  POLICY_TOO_NEW:     'Policy was issued less than 24 hours ago',
  RETROACTIVE_CLAIM:  'Claim submitted more than 1 hour after disruption ended',
  TIMEZONE_MISMATCH:  'User timezone does not match the GPS location',
  NO_SHIFT_OVERLAP:   'Disruption window does not overlap with user\'s work shift',
  LOW_PPCS:           'Device trust score is too low (possible spoofing)',
};

// ─── Layer helpers ────────────────────────────────────────────────────────────

const toMinutes = (t) => {
  if (!t) return null;
  const [h, m = '0'] = String(t).split(':');
  return Number(h) * 60 + Number(m);
};

const shiftOverlaps = (profile, disruptStart, disruptEnd) => {
  if (!profile?.preferredWorkStart || !profile?.preferredWorkEnd) return true; // unknown = pass
  const s  = toMinutes(profile.preferredWorkStart);
  const e  = toMinutes(profile.preferredWorkEnd);
  const ds = disruptStart.getHours() * 60 + disruptStart.getMinutes();
  const de = disruptEnd.getHours()   * 60 + disruptEnd.getMinutes();
  return e >= s ? ds < e && de > s : ds >= s || de <= e;
};

// ─── Hard Block evaluators ────────────────────────────────────────────────────

/** Layer 1: GPS Zone Validation */
const checkGpsZone = async (userId, zoneId) => {
  const result = await validateGpsZone(userId, zoneId);
  if (!result.valid) {
    const dist = result.distanceKm != null ? ` (${result.distanceKm} km away)` : '';
    return {
      blocked: true,
      flag:    'ZONE_NOT_VERIFIED',
      reason:  result.reason || `Location mismatch${dist}`,
    };
  }
  return { blocked: false };
};

/** Layer 5: Duplicate claim within 6-hour window */
const checkDuplicate = async (userId, triggerType, zoneId) => {
  const windowStart = new Date(Date.now() - DUPLICATE_WINDOW_MS);
  const dupe = await prisma.claim.findFirst({
    where: {
      userId,
      triggerEvent: { triggerType, zoneId },
      createdAt:    { gte: windowStart },
    },
  });
  if (dupe) {
    return {
      blocked: true,
      flag:    'DUPLICATE_CLAIM',
      reason:  `Duplicate claim for ${triggerType} in this zone submitted within 6 hours (claim: ${dupe.id.slice(0,8)})`,
    };
  }
  return { blocked: false };
};

/** Layer C: No real trigger */
const checkTriggerValidity = async (zoneId, triggerType) => {
  const trigger = await prisma.triggerEvent.findFirst({
    where:   { zoneId, triggerType, status: { in: ['active', 'resolved'] } },
    orderBy: { createdAt: 'desc' },
  });
  if (!trigger) {
    return {
      blocked: true,
      flag:    'NO_REAL_TRIGGER',
      reason:  `No active or recently resolved ${triggerType} event in this zone`,
    };
  }
  return { blocked: false, trigger };
};

/** Layer 6: Policy age < 24 hours */
const checkPolicyAge = (policy) => {
  if (!policy?.createdAt) return { blocked: false };
  const ageMs = Date.now() - new Date(policy.createdAt).getTime();
  if (ageMs < POLICY_MIN_AGE_MS) {
    const ageHours = (ageMs / (1000 * 60 * 60)).toFixed(1);
    return {
      blocked: true,
      flag:    'POLICY_TOO_NEW',
      reason:  `Policy is only ${ageHours}h old (minimum 24h required before claims)`,
    };
  }
  return { blocked: false };
};

/** Retroactive claim check */
const checkRetroactive = (disruptionEndStr) => {
  if (!disruptionEndStr) return { blocked: false };
  const endTime = new Date(disruptionEndStr);
  if (isNaN(endTime.getTime())) return { blocked: false };
  const msSinceEnd = Date.now() - endTime.getTime();
  if (msSinceEnd > RETROACTIVE_LIMIT_MS) {
    const hoursAgo = (msSinceEnd / (1000 * 60 * 60)).toFixed(1);
    return {
      blocked: true,
      flag:    'RETROACTIVE_CLAIM',
      reason:  `Disruption ended ${hoursAgo}h ago — retroactive claims beyond 1 hour are not allowed`,
    };
  }
  return { blocked: false };
};

/** Timezone mismatch check */
const checkTimezone = (user, claimTimestamp) => {
  if (!user?.currentLon) return { blocked: false };
  const result = detectTimezoneMismatch(user.currentLon, claimTimestamp);
  if (result.mismatch) {
    return { blocked: true, flag: 'TIMEZONE_MISMATCH', reason: result.reason };
  }
  return { blocked: false };
};

/** Shift overlap check */
const checkShiftOverlap = (workerProfile, disruptionStart, disruptionEnd) => {
  if (!disruptionStart || !disruptionEnd) return { blocked: false };
  const ds = new Date(disruptionStart);
  const de = new Date(disruptionEnd);
  if (!shiftOverlaps(workerProfile, ds, de)) {
    return {
      blocked: true,
      flag:    'NO_SHIFT_OVERLAP',
      reason:  `Disruption window (${ds.toTimeString().slice(0,5)}–${de.toTimeString().slice(0,5)}) does not overlap with work shift (${workerProfile?.preferredWorkStart}–${workerProfile?.preferredWorkEnd})`,
    };
  }
  return { blocked: false };
};

// ─── Soft Scoring layers ──────────────────────────────────────────────────────

const computeSoftScore = async ({ userId, policy, actualEarned, predictedLoss, user }) => {
  let score  = 0;
  const flags = [];

  // ── Layer 2: Platform activity ──────────────────────────────────────────────
  const earned = Number(actualEarned ?? 0);
  const pred   = Number(predictedLoss ?? 1);
  if (pred > 0 && earned > pred * 0.50) {
    score += 25;
    flags.push('HIGH_ACTUAL_INCOME');
  }

  // ── Layer 3: Account age ─────────────────────────────────────────────────────
  const createdAt     = user?.createdAt ? new Date(user.createdAt) : null;
  const accountAgeDays = createdAt
    ? (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
    : 999;

  if (accountAgeDays < 7) {
    score += 30;
    flags.push('VERY_NEW_ACCOUNT');
  } else if (accountAgeDays < 14) {
    score += 15;
    flags.push('NEW_ACCOUNT');
  }

  // ── Layer 4: Claim frequency ─────────────────────────────────────────────────
  const ago7d  = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000);
  const cnt7d  = await prisma.claim.count({ where: { userId, createdAt: { gte: ago7d } } });

  if (cnt7d >= 4) {
    score += 20;
    flags.push('HIGH_CLAIM_FREQUENCY');
  } else if (cnt7d === 3) {
    score += 10;
    flags.push('ELEVATED_CLAIM_FREQUENCY');
  }

  // ── Layer 4.5: Velocity ──────────────────────────────────────────────────────
  const velocityRatio = cnt7d / VELOCITY_BASELINE;
  if (velocityRatio > 2.5) {
    score += 20;
    flags.push('VERY_HIGH_VELOCITY');
  } else if (velocityRatio >= 2.0) {
    score += 15;
    flags.push('HIGH_VELOCITY');
  } else if (velocityRatio >= 1.7) {
    score += 5;
    flags.push('ELEVATED_VELOCITY');
  }

  // ── Layer 7: UPI ring ────────────────────────────────────────────────────────
  let upiClusterSize = 1;
  if (user?.upiId) {
    const prefix = user.upiId.split('@')[0]?.slice(0, -3) ?? '';
    if (prefix.length >= 3) {
      upiClusterSize = await prisma.user.count({
        where: { upiId: { startsWith: prefix } },
      });
    }
  }
  if (upiClusterSize > 20) {
    score += 30;
    flags.push('UPI_FRAUD_RING');
  }

  return { score: Math.min(100, score), flags, upiClusterSize };
};

// ─── Final decision matrix ────────────────────────────────────────────────────

const makeDecision = (fraudScore, ppcsScore) => {
  if (fraudScore <= 30 && ppcsScore >= 80) return 'APPROVE';
  if (fraudScore <= 60 && ppcsScore >= 50) return 'SOFT_FLAG';
  if (fraudScore <= 80)                    return 'VERIFY';
  return 'BLOCK';
};

// ─── Log to fraud_logs table ──────────────────────────────────────────────────

export const logFraudDecision = async ({
  claimId, flags, decision, fraudScore, ppcsScore, blockReason,
}) => {
  try {
    await prisma.fraudLog.create({
      data: {
        claimId:     claimId ?? null,
        flags:       flags   ?? [],
        decision,
        fraudScore:  fraudScore ?? 0,
        ppcsScore:   ppcsScore  ?? 100,
        blockReason: blockReason ?? null,
      },
    });
  } catch (err) {
    // Non-fatal: log but don't crash claim pipeline
    console.warn('[fraudEngine] Failed to write fraud_log:', err.message);
  }
};

// ─── Main evaluator ───────────────────────────────────────────────────────────

/**
 * Primary enforcement function called from claimService before any DB write.
 *
 * @param {object} params
 *   claim         — { userId, zoneId, triggerType, disruptionStart, disruptionEnd, actualEarned, predictedLoss }
 *   user          — Prisma User row (with workerProfile)
 *   policy        — Prisma Policy row
 *   deviceSignals — { gps_jitter, motion_continuity, cell_tower_match, app_active }
 *
 * @returns {object}
 *   {
 *     fraud_score,       // 0-100 soft score (0 if hard blocked)
 *     ppcs_score,        // 0-100 device trust
 *     decision,          // "APPROVE" | "SOFT_FLAG" | "VERIFY" | "BLOCK"
 *     flags,             // string[]
 *     stop_processing,   // true if pipeline should halt
 *     block_reason,      // human-readable block reason (null if not blocked)
 *   }
 */
export const evaluateFraudAndDecide = async ({
  claim,
  user,
  policy,
  deviceSignals = {},
}) => {
  const {
    userId,
    zoneId,
    triggerType,
    disruptionStart,
    disruptionEnd,
    actualEarned  = 0,
    predictedLoss = 0,
  } = claim;

  const flags        = [];
  const hardBlocks   = [];

  // ══ PHASE 1: HARD BLOCK CHECKS ═══════════════════════════════════════════════

  // A. GPS Zone Validation
  const gpsCheck = await checkGpsZone(userId, zoneId);
  if (gpsCheck.blocked) hardBlocks.push(gpsCheck);

  // B. Duplicate Claim
  const dupeCheck = await checkDuplicate(userId, triggerType, zoneId);
  if (dupeCheck.blocked) hardBlocks.push(dupeCheck);

  // C. Real Trigger Exists
  const triggerCheck = await checkTriggerValidity(zoneId, triggerType);
  if (triggerCheck.blocked) hardBlocks.push(triggerCheck);

  // D. Policy Age
  const policyCheck = checkPolicyAge(policy);
  if (policyCheck.blocked) hardBlocks.push(policyCheck);

  // E. Retroactive Claim
  const retroCheck = checkRetroactive(disruptionEnd);
  if (retroCheck.blocked) hardBlocks.push(retroCheck);

  // F. Timezone Mismatch
  const tzCheck = checkTimezone(user, disruptionStart ?? new Date().toISOString());
  if (tzCheck.blocked) hardBlocks.push(tzCheck);

  // G. Shift Overlap
  const workerProfile = user?.workerProfile ?? null;
  const shiftCheck = checkShiftOverlap(workerProfile, disruptionStart, disruptionEnd);
  if (shiftCheck.blocked) hardBlocks.push(shiftCheck);

  // ── If any hard block triggered → STOP ──────────────────────────────────────
  if (hardBlocks.length > 0) {
    const primaryBlock = hardBlocks[0];
    hardBlocks.forEach((b) => flags.push(b.flag));

    // ── PPCS still computed (for logging) ───────────────────────────────────
    const { score: ppcsScore, flags: ppcsFlags } = calculatePpcs(deviceSignals);
    if (ppcsScore < 50) flags.push('LOW_PPCS');
    ppcsFlags.forEach((f) => { if (!flags.includes(f)) flags.push(f); });

    const result = {
      fraud_score:      0,
      ppcs_score:       ppcsScore,
      decision:         'BLOCK',
      flags:            [...new Set(flags)],
      stop_processing:  true,
      block_reason:     primaryBlock.reason,
      block_reasons:    hardBlocks.map((b) => b.reason),
      hard_block:       true,
    };

    console.log(`[fraudEngine] HARD BLOCK — flags: ${flags.join(', ')}`);
    return result;
  }

  // ══ PHASE 2: SOFT SCORING (only reached if no hard blocks) ═══════════════════

  const { score: softScore, flags: softFlags } = await computeSoftScore({
    userId,
    policy,
    actualEarned,
    predictedLoss,
    user,
  });
  softFlags.forEach((f) => flags.push(f));

  // ── PPCS ──────────────────────────────────────────────────────────────────
  const { score: ppcsScore, flags: ppcsFlags } = calculatePpcs(deviceSignals);
  ppcsFlags.forEach((f) => { if (!flags.includes(f)) flags.push(f); });
  if (ppcsScore < 50) flags.push('LOW_PPCS');

  // ── Final decision ────────────────────────────────────────────────────────
  const decision       = makeDecision(softScore, ppcsScore);
  const stop_processing = decision === 'BLOCK';

  const result = {
    fraud_score:     softScore,
    ppcs_score:      ppcsScore,
    decision,
    flags:           [...new Set(flags)],
    stop_processing,
    block_reason:    stop_processing
      ? `Fraud score ${softScore} > 80 and/or PPCS ${ppcsScore} too low`
      : null,
    hard_block:      false,
  };

  console.log(
    `[fraudEngine] decision=${decision} fraud_score=${softScore} ppcs=${ppcsScore} flags=[${flags.join(',')}]`
  );
  return result;
};

// ─── Explainability helper ────────────────────────────────────────────────────

/**
 * Build a human-readable explanation string from an engine result.
 * Used for the `explanation` field stored on Claim rows.
 */
export const buildExplanation = ({ decision, fraud_score, ppcs_score, flags, block_reason, block_reasons }) => {
  const parts = [];

  if (decision === 'BLOCK') {
    parts.push(`🚫 Claim BLOCKED.`);
    if (block_reasons?.length > 0) {
      block_reasons.forEach((r) => parts.push(`• ${r}`));
    } else if (block_reason) {
      parts.push(`• ${block_reason}`);
    }
  } else {
    const verb = decision === 'APPROVE' ? '✅ Approved' : decision === 'SOFT_FLAG' ? '⚠️ Soft-flagged (2h delay)' : '🔍 Queued for manual verification';
    parts.push(`${verb}.`);
  }

  parts.push(`Fraud score: ${fraud_score}/100. PPCS: ${ppcs_score}/100.`);
  if (flags.length > 0) parts.push(`Signals: ${flags.map((f) => FLAG_REASONS[f] || f).join('; ')}.`);

  return parts.join(' ');
};
