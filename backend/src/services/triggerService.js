/**
 * triggerService.js — Prisma edition
 * ─────────────────────────────────────────────────────────────────────────────
 * Parametric Insurance — Trigger Detection Engine (L1 / L2 / L3 tiers)
 *
 *   RAIN     L1 > 35 mm/h  |  L2 > 50 mm/h  |  L3 > 75 mm/h
 *   AQI      L1 > 200      |  L2 > 300       |  L3 > 400
 *   HEAT     L1 > 38 °C    |  L2 > 42 °C     |  L3 > 46 °C
 *   FLOOD    derived from rainfall * 2 severity formula
 *   ZONE_SHUTDOWN  admin flag via ZONE_SHUTDOWN_ZONE_CODES env var
 *
 * Level multipliers (used downstream for payout):
 *   L1 → 0.60  |  L2 → 0.85  |  L3 → 1.00
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from '../config/db.js';
import { config } from '../config/env.js';
import { getLatestAqiSnapshots } from './aqiService.js';
import { getLatestWeatherSnapshots } from './weatherService.js';

// ─── Tier definitions ─────────────────────────────────────────────────────────

export const TRIGGER_TIERS = {
  HEAVY_RAIN:    [
    { level: 1, threshold: 35,  multiplier: 0.60, label: 'Rain Level 1' },
    { level: 2, threshold: 50,  multiplier: 0.85, label: 'Rain Level 2' },
    { level: 3, threshold: 75,  multiplier: 1.00, label: 'Rain Level 3' },
  ],
  SEVERE_AQI:   [
    { level: 1, threshold: 200, multiplier: 0.60, label: 'AQI Level 1' },
    { level: 2, threshold: 300, multiplier: 0.85, label: 'AQI Level 2' },
    { level: 3, threshold: 400, multiplier: 1.00, label: 'AQI Level 3' },
  ],
  HEATWAVE:     [
    { level: 1, threshold: 38,  multiplier: 0.60, label: 'Heat Level 1' },
    { level: 2, threshold: 42,  multiplier: 0.85, label: 'Heat Level 2' },
    { level: 3, threshold: 46,  multiplier: 1.00, label: 'Heat Level 3' },
  ],
  FLOOD:        [
    { level: 1, threshold: 70,  multiplier: 0.60, label: 'Flood Level 1' },
    { level: 2, threshold: 85,  multiplier: 0.85, label: 'Flood Level 2' },
    { level: 3, threshold: 95,  multiplier: 1.00, label: 'Flood Level 3' },
  ],
  ZONE_SHUTDOWN: [
    { level: 3, threshold: 1,   multiplier: 1.00, label: 'Zone Shutdown' },
  ],
};

export const LEVEL_MULTIPLIERS = { 1: 0.60, 2: 0.85, 3: 1.00 };
export const TRIGGER_TYPES_SUPPORTED = Object.keys(TRIGGER_TIERS);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * detectTriggerLevel(triggerType, rawValue) → highest breached tier | null
 */
export const detectTriggerLevel = (triggerType, rawValue) => {
  const tiers = TRIGGER_TIERS[triggerType];
  if (!tiers) return null;

  let matched = null;
  for (const tier of tiers) {
    if (Number(rawValue) >= tier.threshold) matched = tier;
  }
  if (!matched) return null;

  const unit = triggerType === 'HEAVY_RAIN' || triggerType === 'FLOOD'
    ? 'mm/h'
    : triggerType === 'SEVERE_AQI' ? 'AQI' : '°C';

  return {
    ...matched,
    triggerReason: `${matched.label} — ${rawValue} ${unit} ≥ threshold ${matched.threshold} ${unit}`,
  };
};

/**
 * detectTriggers(zoneData) → array of active trigger descriptors for this zone
 */
export const detectTriggers = (zoneData) => {
  const { zone, weather, aqi } = zoneData;

  const rainfall    = Number(weather?.rainfallMmPerHour ?? 0);
  const heatIndex   = Number(weather?.heatIndex         ?? 0);
  const aqiValue    = Number(aqi?.aqi                   ?? 0);
  const rawPayload  = weather?.rawPayload ?? {};
  const aqiPayload  = aqi?.rawPayload    ?? {};

  const floodSeverity = typeof rawPayload.flood_severity === 'number'
    ? rawPayload.flood_severity
    : Math.min(100, Math.round(rainfall * 2 + (rawPayload.weather_status === 'heavy_rain' ? 15 : 0)));

  const candidates = [
    { type: 'HEAVY_RAIN',    value: rainfall,      source: weather?.source ?? 'mock-weather', payload: rawPayload },
    { type: 'FLOOD',          value: floodSeverity, source: weather?.source ?? 'mock-weather', payload: { ...rawPayload, flood_severity: floodSeverity } },
    { type: 'SEVERE_AQI',    value: aqiValue,      source: aqi?.source    ?? 'mock-aqi',     payload: aqiPayload },
    { type: 'HEATWAVE',      value: heatIndex,     source: weather?.source ?? 'mock-weather', payload: rawPayload },
    {
      type:    'ZONE_SHUTDOWN',
      value:   isZoneShutdown(zone) ? 100 : 0,
      source:  'mock-zone-shutdown',
      payload: { zone_code: zone.zoneCode, shutdown: isZoneShutdown(zone) },
    },
  ];

  const results = [];
  for (const c of candidates) {
    const tier = detectTriggerLevel(c.type, c.value);
    if (tier) {
      results.push({
        zoneId:        zone.id,
        triggerType:   c.type,
        severity:      c.value,
        triggerLevel:  tier.level,
        multiplier:    tier.multiplier,
        triggerReason: tier.triggerReason,
        source:        c.source,
        rawPayload:    { ...c.payload, trigger_level: tier.level, multiplier: tier.multiplier },
        startTime:     new Date(),
      });
    }
  }
  return results;
};

const isZoneShutdown = (zone) => {
  const codes = (process.env.ZONE_SHUTDOWN_ZONE_CODES ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return codes.includes(zone.zoneCode) || /shutdown/i.test(zone.zoneName);
};

// ─── DB persistence ───────────────────────────────────────────────────────────

const upsertActiveTrigger = async ({ zoneId, triggerType, severity, source, rawPayload, startTime }) => {
  const existing = await prisma.triggerEvent.findFirst({
    where: { zoneId, triggerType, status: 'active' },
    orderBy: { createdAt: 'desc' },
  });

  if (existing) {
    return prisma.triggerEvent.update({
      where: { id: existing.id },
      data:  { severity, source, rawPayload, endTime: new Date() },
    });
  }

  return prisma.triggerEvent.create({
    data: { zoneId, triggerType, severity, source, rawPayload, startTime, status: 'active' },
  });
};

const resolveTrigger = async (trigger) => {
  if (!trigger || trigger.status !== 'active') return null;
  return prisma.triggerEvent.update({
    where: { id: trigger.id },
    data:  { status: 'resolved', endTime: trigger.endTime ?? new Date() },
  });
};

// ─── Main evaluation pipeline ─────────────────────────────────────────────────

export const getLatestSnapshotsByZone = async () => {
  const [weatherSnapshots, aqiSnapshots, zones] = await Promise.all([
    getLatestWeatherSnapshots(),
    getLatestAqiSnapshots(),
    prisma.zone.findMany({ orderBy: { zoneName: 'asc' } }),
  ]);

  const weatherByZone = new Map(weatherSnapshots.map((s) => [s.zoneId, s]));
  const aqiByZone     = new Map(aqiSnapshots.map((s) => [s.zoneId, s]));

  return zones.map((zone) => ({
    zone,
    weather: weatherByZone.get(zone.id) ?? null,
    aqi:     aqiByZone.get(zone.id)     ?? null,
  }));
};

export const evaluateTriggerRules = async () => {
  const zones   = await getLatestSnapshotsByZone();
  const results = [];

  for (const zoneData of zones) {
    const activeTriggers     = detectTriggers(zoneData);
    const activeTriggerTypes = new Set(activeTriggers.map((t) => t.triggerType));

    for (const t of activeTriggers) {
      const trigger = await upsertActiveTrigger({
        zoneId:      t.zoneId,
        triggerType: t.triggerType,
        severity:    t.severity,
        source:      t.source,
        rawPayload:  t.rawPayload,
        startTime:   t.startTime,
      });
      const isNew = !trigger.endTime || (new Date(trigger.endTime).getTime() === new Date(trigger.startTime).getTime());
      results.push({
        action:        isNew ? 'created' : 'updated',
        trigger,
        triggerLevel:  t.triggerLevel,
        multiplier:    t.multiplier,
        triggerReason: t.triggerReason,
      });
    }

    // Resolve stale active triggers
    for (const type of TRIGGER_TYPES_SUPPORTED) {
      if (!activeTriggerTypes.has(type)) {
        const stale = await prisma.triggerEvent.findFirst({
          where: { zoneId: zoneData.zone.id, triggerType: type, status: 'active' },
        });
        if (stale) {
          const resolved = await resolveTrigger(stale);
          if (resolved) results.push({ action: 'resolved', trigger: resolved });
        }
      }
    }
  }

  return results;
};

// ─── Query helpers ────────────────────────────────────────────────────────────

export const listActiveTriggers = async ({ zoneId = null } = {}) => {
  const where = { status: 'active', ...(zoneId ? { zoneId } : {}) };
  return prisma.triggerEvent.findMany({
    where,
    include: { zone: { select: { zoneName: true, zoneCode: true, city: true, state: true } } },
    orderBy: { createdAt: 'desc' },
  });
};

export const listAllTriggers = async () => {
  return prisma.triggerEvent.findMany({
    include: { zone: { select: { zoneName: true, zoneCode: true, city: true, state: true } } },
    orderBy: { createdAt: 'desc' },
  });
};

export const getTriggerById = async (triggerId) => {
  return prisma.triggerEvent.findUnique({ where: { id: triggerId } });
};