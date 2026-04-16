/**
 * utils/ppcsCalculator.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PPCS — Phone Presence & Continuity Score
 *
 * Computes a 0–100 integer trust score from device signals sent by the mobile
 * client at claim time.  A higher score = more trusted device presence.
 *
 * Scoring:
 *   Base score          = 100
 *   gps_jitter < 0.05   → −30  (suspiciously steady GPS = spoofed fix)
 *   no motion_continuity→ −25  (no accelerometer continuity)
 *   cell_tower mismatch → −25  (cell tower disagrees with GPS zone)
 *   app_inactive        → −20  (app was in background / not open)
 *
 * Signals object shape (all optional — missing = safe default):
 * {
 *   gps_jitter:         number   (std-dev of recent GPS fixes, km)
 *   motion_continuity:  boolean  (true = gyro/accel shows real motion)
 *   cell_tower_match:   boolean  (true = cell tower aligns with GPS zone)
 *   app_active:         boolean  (true = app was foreground at claim time)
 * }
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Compute a PPCS integer score (0–100) from inbound device signals.
 *
 * @param {object} signals — device trust signals (all optional)
 * @returns {{ score: number, deductions: string[], flags: string[] }}
 */
export const calculatePpcs = (signals = {}) => {
  const {
    gps_jitter        = 0.5,   // default: normal jitter (no penalty)
    motion_continuity = true,  // default: motion present (no penalty)
    cell_tower_match  = true,  // default: tower matches (no penalty)
    app_active        = true,  // default: app was open (no penalty)
  } = signals;

  let score      = 100;
  const deductions = [];
  const flags      = [];

  // ── GPS jitter check ────────────────────────────────────────────────────────
  // A jitter < 0.05 km is suspiciously tight — real phones always have some drift.
  // This is a classic GPS spoofing signal.
  if (Number(gps_jitter) < 0.05) {
    score -= 30;
    deductions.push('GPS jitter < 0.05 km (possible GPS spoofing)');
    flags.push('LOW_GPS_JITTER');
  }

  // ── Motion continuity ───────────────────────────────────────────────────────
  if (!motion_continuity) {
    score -= 25;
    deductions.push('No motion continuity (device stationary or data absent)');
    flags.push('NO_MOTION_CONTINUITY');
  }

  // ── Cell tower match ────────────────────────────────────────────────────────
  if (!cell_tower_match) {
    score -= 25;
    deductions.push('Cell tower location disagrees with GPS zone');
    flags.push('CELL_TOWER_MISMATCH');
  }

  // ── App active ──────────────────────────────────────────────────────────────
  if (!app_active) {
    score -= 20;
    deductions.push('App was inactive / in background at claim time');
    flags.push('APP_INACTIVE');
  }

  const finalScore = Math.max(0, Math.min(100, score));

  return {
    score:      finalScore,
    deductions,
    flags,
    trust_level: finalScore >= 80 ? 'HIGH' : finalScore >= 50 ? 'MEDIUM' : 'LOW',
  };
};

/**
 * Extract device signals from an HTTP request body.
 * Falls back to safe defaults when the client doesn't send signals
 * (e.g. web-based claim submission).
 *
 * @param {object} body — request body
 * @returns {object} signals safe for calculatePpcs()
 */
export const extractDeviceSignals = (body = {}) => {
  const ds = body.device_signals ?? body.deviceSignals ?? {};
  return {
    gps_jitter:        ds.gps_jitter        ?? 0.5,
    motion_continuity: ds.motion_continuity ?? true,
    cell_tower_match:  ds.cell_tower_match  ?? true,
    app_active:        ds.app_active        ?? true,
  };
};
