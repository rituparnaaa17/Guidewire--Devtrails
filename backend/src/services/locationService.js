/**
 * services/locationService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Live GPS location management for ShieldPay users.
 *
 * Features:
 *   - Store & update current GPS coordinates
 *   - Compute location_match vs registered zone
 *   - Compute GPS-based PPCS score
 *   - getLocationContext for ML feature vector
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma                                from '../config/db.js';
import { haversineKm, getZoneFromCoordinates, reverseGeocode } from '../utils/geoUtils.js';

const MATCH_RADIUS_KM  = 2.0;   // within 2km = location match
const JUMP_THRESHOLD_KM = 50.0; // >50km jump in <1h = suspicious

// ─── Update user's live location ─────────────────────────────────────────────

export const updateUserLocation = async (userId, lat, lon) => {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { currentLat: true, currentLon: true, lastLocationAt: true, registeredLat: true, registeredLon: true },
  });
  if (!user) throw new Error('User not found');

  // Detect GPS jump (suspicious if very large jump in short time)
  let gpsJump = 0;
  if (user.currentLat && user.currentLon) {
    gpsJump = haversineKm(user.currentLat, user.currentLon, lat, lon);
  }

  // Reverse geocode for human label
  const locationLabel = await reverseGeocode(lat, lon);

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      currentLat:    lat,
      currentLon:    lon,
      lastLocationAt: new Date(),
      // Set registered location on first update
      ...(!user.registeredLat ? { registeredLat: lat, registeredLon: lon } : {}),
    },
  });

  return { locationLabel, gpsJump, updated };
};

// ─── Compute location match for a given zone ─────────────────────────────────

export const getLocationContext = async (userId, zoneId) => {
  const [user, zone] = await Promise.all([
    prisma.user.findUnique({
      where:  { id: userId },
      select: { currentLat: true, currentLon: true, registeredLat: true, registeredLon: true, lastLocationAt: true },
    }),
    prisma.zone.findUnique({
      where:  { id: zoneId },
      select: { centerLat: true, centerLon: true, radiusKm: true, zoneName: true },
    }),
  ]);

  if (!user || !zone) {
    return { locationMatch: 0, gpsJitter: 0, timeSinceUpdate: 999, locationLabel: 'Unknown' };
  }

  // ── Location match ──────────────────────────────────────────────────────────
  let locationMatch = 0;
  let distFromZone  = 999;

  if (user.currentLat && zone.centerLat) {
    distFromZone  = haversineKm(user.currentLat, user.currentLon, zone.centerLat, zone.centerLon);
    const radius  = zone.radiusKm ?? MATCH_RADIUS_KM;
    locationMatch = distFromZone <= radius ? 1 : 0;
  } else if (user.currentLat && user.registeredLat) {
    // Fall back: compare current vs registered location
    const distFromReg = haversineKm(user.currentLat, user.currentLon, user.registeredLat, user.registeredLon);
    locationMatch = distFromReg <= MATCH_RADIUS_KM ? 1 : 0;
  }

  // ── GPS jitter (jump between registered & current) ──────────────────────────
  let gpsJitter = 0;
  if (user.currentLat && user.registeredLat) {
    gpsJitter = haversineKm(user.currentLat, user.currentLon, user.registeredLat, user.registeredLon);
    gpsJitter = Math.min(gpsJitter, 100); // cap at 100km for ML feature
  }

  // ── Time since last update ──────────────────────────────────────────────────
  let timeSinceUpdate = 60; // default 60 min if unknown
  if (user.lastLocationAt) {
    timeSinceUpdate = (Date.now() - user.lastLocationAt.getTime()) / (1000 * 60);
    timeSinceUpdate = Math.min(timeSinceUpdate, 999);
  }

  // ── Location label ──────────────────────────────────────────────────────────
  const locationLabel = user.currentLat
    ? await reverseGeocode(user.currentLat, user.currentLon)
    : zone.zoneName;

  return {
    locationMatch,
    gpsJitter:       Math.round(gpsJitter * 10) / 10,
    timeSinceUpdate: Math.round(timeSinceUpdate),
    distFromZoneKm:  Math.round(distFromZone * 10) / 10,
    locationLabel,
    hasLiveGps:      !!user.currentLat,
  };
};

// ─── Compute GPS-based PPCS score ─────────────────────────────────────────────

export const computeGpsPpcs = async (userId) => {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { currentLat: true, currentLon: true, registeredLat: true, registeredLon: true, lastLocationAt: true, createdAt: true },
  });
  if (!user) return 0.5;

  let ppcs = 1.0;

  // No location update at all → big penalty
  if (!user.currentLat || !user.lastLocationAt) {
    ppcs -= 0.30;
  } else {
    const minsSinceUpdate = (Date.now() - user.lastLocationAt.getTime()) / (1000 * 60);

    // Stale location (>30 min)
    if (minsSinceUpdate > 30) ppcs -= 0.15;

    // Large GPS jump from registered location (>50km = suspicious)
    if (user.registeredLat) {
      const jump = haversineKm(user.currentLat, user.currentLon, user.registeredLat, user.registeredLon);
      if (jump > JUMP_THRESHOLD_KM) ppcs -= 0.25;
    }
  }

  return Math.max(0.05, Math.min(1.0, ppcs));
};
