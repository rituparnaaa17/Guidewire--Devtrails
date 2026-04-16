/**
 * services/weatherService.js — Real OpenWeatherMap Edition
 * ─────────────────────────────────────────────────────────────────────────────
 * PRIMARY:  OpenWeatherMap API (lat/lon → real rainfall, temperature)
 * FALLBACK: Zone-hash simulation (when API key missing / rate-limited)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from '../config/db.js';

const OWM_KEY     = process.env.OPENWEATHER_API_KEY;
const OWM_URL     = 'https://api.openweathermap.org/data/2.5/weather';
const TIMEOUT_MS  = 5000;

const round2 = (v) => Math.round(v * 100) / 100;

// ─── Real OpenWeatherMap fetch ────────────────────────────────────────────────

export const fetchWeatherForCoords = async (lat, lon) => {
  if (!OWM_KEY) throw new Error('OPENWEATHER_API_KEY not set');

  const url        = `${OWM_URL}?lat=${lat}&lon=${lon}&appid=${OWM_KEY}&units=metric`;
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res  = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`OWM ${res.status}: ${res.statusText}`);
    const data = await res.json();

    // OWM reports rain as mm in last 1h or 3h
    const rainfall1h  = data.rain?.['1h']  ?? 0;
    const rainfall3h  = (data.rain?.['3h'] ?? 0) / 3;
    const rainfall    = round2(Math.max(rainfall1h, rainfall3h));
    const temp        = round2(data.main?.temp ?? 0);
    const humidity    = data.main?.humidity ?? 0;
    const description = data.weather?.[0]?.description ?? 'unknown';
    const cityName    = data.name ?? 'Unknown';

    return {
      rainfallMmPerHour: rainfall,
      heatIndex:         temp,
      humidity,
      weatherStatus:     rainfall > 10 ? 'heavy_rain' : temp > 35 ? 'heat_stress' : 'clear',
      cityName,
      description,
      source:            'openweathermap-live',
      rawPayload: {
        provider: 'openweathermap', lat, lon, rainfall_mm: rainfall,
        temp_c: temp, humidity, description, city: cityName,
      },
    };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
};

// ─── Fallback: zone-hash deterministic simulation ─────────────────────────────

const hashZone = (zone) => {
  const seed = `${zone.id}:${zone.zoneCode}:${zone.zoneName}`;
  let total = 0;
  for (const ch of seed) total += ch.charCodeAt(0);
  return total;
};

const buildFallbackReading = (zone) => {
  const hash       = hashZone(zone);
  const isDemoZone = /velachery/i.test(zone.zoneName) || zone.zoneCode === 'CHN-VEL';

  if (isDemoZone) {
    return { rainfallMmPerHour: 42, heatIndex: 37, weatherStatus: 'heavy_rain', source: 'simulation-demo',
      cityName: 'Chennai', rawPayload: { provider: 'simulation-demo', rainfall_mm: 42, temp_c: 37 } };
  }
  const rainfall = round2((hash % 18) + 2);
  const heat     = round2(28 + (hash % 11));
  return { rainfallMmPerHour: rainfall, heatIndex: heat,
    weatherStatus: rainfall >= 25 ? 'heavy_rain' : 'clear', source: 'simulation-fallback',
    cityName: zone.city, rawPayload: { provider: 'simulation-fallback', rainfall_mm: rainfall, temp_c: heat } };
};

// ─── Per-zone snapshot (for scheduler) ───────────────────────────────────────

export const fetchWeatherSnapshotForZone = async (zone) => {
  let reading;

  // If zone has coordinates, try real API
  if (OWM_KEY && zone.centerLat && zone.centerLon) {
    try {
      reading = await fetchWeatherForCoords(zone.centerLat, zone.centerLon);
    } catch (err) {
      console.warn(`[weatherService] OWM failed for ${zone.zoneCode}: ${err.message} — using fallback`);
      reading = buildFallbackReading(zone);
    }
  } else {
    reading = buildFallbackReading(zone);
  }

  return prisma.weatherSnapshot.create({
    data: {
      zoneId:            zone.id,
      rainfallMmPerHour: reading.rainfallMmPerHour,
      heatIndex:         reading.heatIndex,
      weatherStatus:     reading.weatherStatus,
      source:            reading.source,
      rawPayload:        reading.rawPayload,
    },
  });
};

export const getLatestWeatherSnapshots = async () => {
  const zones = await prisma.zone.findMany({ select: { id: true } });
  const snapshots = await Promise.all(
    zones.map((z) => prisma.weatherSnapshot.findFirst({ where: { zoneId: z.id }, orderBy: { recordedAt: 'desc' } }))
  );
  return snapshots.filter(Boolean);
};

export const getAllZones = async () => prisma.zone.findMany({ orderBy: { zoneName: 'asc' } });