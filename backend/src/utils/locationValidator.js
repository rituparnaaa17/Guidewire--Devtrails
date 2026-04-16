/**
 * utils/locationValidator.js
 * ─────────────────────────────────────────────────────────────────────────────
 * GPS Zone Validation for the Fraud Enforcement Engine.
 *
 * Exports:
 *   validateGpsZone(userId, zoneId) → { valid, distanceKm, flag, userLat, userLon }
 *
 * Hard block threshold: > 5 km distance from zone center → ZONE_NOT_VERIFIED
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from '../config/db.js';
import { haversineKm } from './geoUtils.js';

const GPS_BLOCK_THRESHOLD_KM = 5.0;
const STALE_GPS_MINUTES      = 60;  // GPS older than 60 min = untrusted

/**
 * Validate a user's live GPS location against the target zone center.
 *
 * Returns:
 *   { valid: true }                        — user is within the zone
 *   { valid: false, flag, distanceKm, reason } — block with details
 */
export const validateGpsZone = async (userId, zoneId) => {
  const [user, zone] = await Promise.all([
    prisma.user.findUnique({
      where:  { id: userId },
      select: {
        currentLat:    true,
        currentLon:    true,
        registeredLat: true,
        registeredLon: true,
        lastLocationAt: true,
        consentGPS:    true,
      },
    }),
    prisma.zone.findUnique({
      where:  { id: zoneId },
      select: { centerLat: true, centerLon: true, radiusKm: true, zoneName: true },
    }),
  ]);

  // ── Zone not found ──────────────────────────────────────────────────────────
  if (!zone) {
    return {
      valid:       false,
      flag:        'ZONE_NOT_VERIFIED',
      distanceKm:  null,
      reason:      'Zone not found in database',
    };
  }

  // ── No GPS on zone either ───────────────────────────────────────────────────
  if (!zone.centerLat || !zone.centerLon) {
    // Zone has no coordinates seeded — cannot validate. Pass through.
    return { valid: true, distanceKm: 0, flag: null, reason: 'Zone has no GPS anchor — skipping validation' };
  }

  // ── User has no GPS at all ──────────────────────────────────────────────────
  if (!user?.currentLat || !user?.currentLon) {
    // Try registered location as fallback
    if (user?.registeredLat && user?.registeredLon) {
      const dist = haversineKm(user.registeredLat, user.registeredLon, zone.centerLat, zone.centerLon);
      if (dist <= GPS_BLOCK_THRESHOLD_KM) {
        return { valid: true, distanceKm: round1(dist), flag: null, reason: 'Registered location within zone (no live GPS)' };
      }
      return {
        valid:      false,
        flag:       'ZONE_NOT_VERIFIED',
        distanceKm: round1(dist),
        reason:     `Registered location ${round1(dist)} km from zone center (threshold: ${GPS_BLOCK_THRESHOLD_KM} km)`,
      };
    }
    return {
      valid:      false,
      flag:       'ZONE_NOT_VERIFIED',
      distanceKm: null,
      reason:     'No GPS data available for user',
    };
  }

  // ── Check GPS staleness ─────────────────────────────────────────────────────
  let gpsStale = false;
  if (user.lastLocationAt) {
    const minsAgo = (Date.now() - user.lastLocationAt.getTime()) / (1000 * 60);
    if (minsAgo > STALE_GPS_MINUTES) gpsStale = true;
  }

  // ── Compute distance ────────────────────────────────────────────────────────
  const distanceKm = haversineKm(user.currentLat, user.currentLon, zone.centerLat, zone.centerLon);
  const threshold  = zone.radiusKm ?? GPS_BLOCK_THRESHOLD_KM;

  if (distanceKm <= threshold) {
    return {
      valid:      true,
      distanceKm: round1(distanceKm),
      flag:       gpsStale ? 'STALE_GPS' : null,
      reason:     gpsStale
        ? `Within zone but GPS is stale (> ${STALE_GPS_MINUTES} min old)`
        : 'User is within zone boundaries',
    };
  }

  // ── Outside zone — HARD BLOCK ───────────────────────────────────────────────
  return {
    valid:      false,
    flag:       'ZONE_NOT_VERIFIED',
    distanceKm: round1(distanceKm),
    reason:     `User GPS is ${round1(distanceKm)} km from zone "${zone.zoneName}" (threshold: ${threshold} km)`,
  };
};

/**
 * Check for timezone mismatch between user's GPS location and the claim's
 * timezone. Uses UTC offset derived from longitude as a proxy (fast, no API).
 *
 * Each 15° of longitude = 1 hour of timezone offset.
 * Mismatch > 3h is flagged.
 */
export const detectTimezoneMismatch = (userLon, claimTimestampUtc) => {
  if (userLon == null) return { mismatch: false, reason: 'No GPS longitude available' };

  const expectedOffsetHours = Math.round(userLon / 15);  // crude but fast
  const claimDate           = new Date(claimTimestampUtc);
  const nowOffsetHours      = -(claimDate.getTimezoneOffset() / 60);  // system TZ

  const diff = Math.abs(expectedOffsetHours - nowOffsetHours);
  if (diff > 3) {
    return {
      mismatch: true,
      flag:     'TIMEZONE_MISMATCH',
      reason:   `GPS longitude implies UTC+${expectedOffsetHours} but claim is in UTC+${nowOffsetHours} (diff: ${diff}h)`,
    };
  }
  return { mismatch: false };
};

const round1 = (v) => Math.round(Number(v) * 10) / 10;
