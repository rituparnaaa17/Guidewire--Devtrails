/**
 * utils/geoUtils.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Geographic utilities for ShieldPay live-location system.
 *
 * Exports:
 *   haversineKm(lat1, lon1, lat2, lon2) → distance in km
 *   getZoneFromCoordinates(lat, lon)     → nearest Zone from DB
 *   reverseGeocode(lat, lon)             → city string via Nominatim (free)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from '../config/db.js';

// ─── Haversine formula ────────────────────────────────────────────────────────

export const haversineKm = (lat1, lon1, lat2, lon2) => {
  const R     = 6371; // Earth radius km
  const dLat  = (lat2 - lat1) * Math.PI / 180;
  const dLon  = (lon2 - lon1) * Math.PI / 180;
  const a     = Math.sin(dLat / 2) ** 2
              + Math.cos(lat1 * Math.PI / 180)
              * Math.cos(lat2 * Math.PI / 180)
              * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ─── Zone lookup ──────────────────────────────────────────────────────────────

/**
 * Find the nearest Zone to the given coordinates.
 * Falls back to the first zone alphabetically if no zones have coordinates.
 */
export const getZoneFromCoordinates = async (lat, lon) => {
  const zones = await prisma.zone.findMany();

  // Filter zones that have coordinates seeded
  const georefZones = zones.filter((z) => z.centerLat && z.centerLon);

  if (georefZones.length === 0) {
    // No coords seeded yet — return first zone as fallback
    return zones[0] ?? null;
  }

  let nearest = null;
  let minDist = Infinity;

  for (const zone of georefZones) {
    const dist = haversineKm(lat, lon, zone.centerLat, zone.centerLon);
    if (dist < minDist) {
      minDist = dist;
      nearest = zone;
    }
  }

  return { zone: nearest, distanceKm: minDist };
};

// ─── Reverse geocode (city name) ──────────────────────────────────────────────

/**
 * Get a human-readable location label from lat/lon.
 * Uses OpenStreetMap Nominatim (completely free, no key needed).
 */
export const reverseGeocode = async (lat, lon) => {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);

    const res  = await fetch(url, {
      signal:  controller.signal,
      headers: { 'User-Agent': 'ShieldPay/2.0 (hackathon demo)' },
    });
    clearTimeout(timer);

    if (!res.ok) throw new Error('Nominatim error');
    const data = await res.json();

    const addr    = data.address ?? {};
    const suburb  = addr.suburb || addr.neighbourhood || addr.residential || '';
    const city    = addr.city || addr.town || addr.county || addr.state_district || '';
    const state   = addr.state || '';

    const label = [suburb, city].filter(Boolean).join(', ') || state || 'India';
    return label;
  } catch {
    return 'India'; // safe fallback
  }
};
