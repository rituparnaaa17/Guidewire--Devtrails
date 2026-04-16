/**
 * services/aqiService.js — Updated AQI Edition
 * ─────────────────────────────────────────────────────────────────────────────
 * PRIMARY:  OpenWeatherMap Air Pollution API (same key, lat/lon → AQI)
 *           https://api.openweathermap.org/data/2.5/air_pollution
 * FALLBACK: Zone-hash simulation
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from '../config/db.js';

const OWM_KEY    = process.env.OPENWEATHER_API_KEY;
const OWM_AQI_URL = 'https://api.openweathermap.org/data/2.5/air_pollution';
const TIMEOUT_MS  = 5000;

// ─── AQI index → US AQI equivalent conversion ────────────────────────────────
// OWM uses 1–5 scale: 1=Good 2=Fair 3=Moderate 4=Poor 5=VeryPoor
const OWM_TO_US_AQI = { 1: 25, 2: 75, 3: 125, 4: 200, 5: 300 };

const getCategory = (aqi) =>
  aqi > 300 ? 'Hazardous'
  : aqi > 200 ? 'Very Unhealthy'
  : aqi > 150 ? 'Unhealthy'
  : aqi > 100 ? 'Unhealthy for Sensitive Groups'
  : aqi > 50  ? 'Moderate'
  : 'Good';

// ─── Real AQI fetch via OpenWeatherMap Air Pollution API ─────────────────────

export const fetchAqiForCoords = async (lat, lon) => {
  if (!OWM_KEY) throw new Error('OPENWEATHER_API_KEY not set');

  const url        = `${OWM_AQI_URL}?lat=${lat}&lon=${lon}&appid=${OWM_KEY}`;
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res  = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`OWM AQI ${res.status}`);

    const data = await res.json();
    const item = data.list?.[0];
    if (!item) throw new Error('No AQI data');

    const owmAqi  = item.main?.aqi ?? 1;             // 1–5
    const usAqi   = OWM_TO_US_AQI[owmAqi] ?? 50;
    const pm25    = item.components?.pm2_5 ?? 0;
    const pm10    = item.components?.pm10  ?? 0;
    const category = getCategory(usAqi);

    return {
      aqi: usAqi, pm25, pm10, category,
      source: 'openweathermap-air-pollution',
      rawPayload: { provider: 'openweathermap-air-pollution', lat, lon, owm_aqi: owmAqi, us_aqi: usAqi, pm2_5: pm25, pm10, category },
    };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
};

// ─── Fallback: zone-hash simulation ──────────────────────────────────────────

const buildFallbackAqi = (zone) => {
  const seed = `${zone.id}:${zone.zoneCode}`;
  let total = 0;
  for (const ch of seed) total += ch.charCodeAt(0);

  const isDemoZone = /delhi/i.test(zone.city) || zone.zoneCode === 'DEL-C';
  if (isDemoZone) {
    return { aqi: 350, category: 'Hazardous', source: 'simulation-demo',
      rawPayload: { provider: 'simulation-demo', us_aqi: 350, category: 'Hazardous' } };
  }

  const aqi      = (total % 150) + 50;
  const category = getCategory(aqi);
  return { aqi, category, source: 'simulation-fallback',
    rawPayload: { provider: 'simulation-fallback', us_aqi: aqi, category } };
};

// ─── Per-zone snapshot (for scheduler) ───────────────────────────────────────

export const fetchAqiSnapshotForZone = async (zone) => {
  let reading;

  if (OWM_KEY && zone.centerLat && zone.centerLon) {
    try {
      reading = await fetchAqiForCoords(zone.centerLat, zone.centerLon);
    } catch (err) {
      console.warn(`[aqiService] OWM AQI failed for ${zone.zoneCode}: ${err.message} — using fallback`);
      reading = buildFallbackAqi(zone);
    }
  } else {
    reading = buildFallbackAqi(zone);
  }

  return prisma.aqiSnapshot.create({
    data: { zoneId: zone.id, aqi: reading.aqi, source: reading.source, rawPayload: reading.rawPayload },
  });
};

export const getLatestAqiSnapshots = async () => {
  const zones = await prisma.zone.findMany({ select: { id: true } });
  const snapshots = await Promise.all(
    zones.map((z) => prisma.aqiSnapshot.findFirst({ where: { zoneId: z.id }, orderBy: { recordedAt: 'desc' } }))
  );
  return snapshots.filter(Boolean);
};