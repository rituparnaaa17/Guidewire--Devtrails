/**
 * simulateService.js — Real Weather + Live Location Edition
 * ─────────────────────────────────────────────────────────────────────────────
 * Pipeline:
 *   1. Fetch user + active policy
 *   2. If lat/lon provided → fetch REAL weather from OpenWeatherMap + AQI
 *   3. Evaluate whether the real conditions actually trigger the requested type
 *   4. Build 14-feature ML vector (with real location_match, real ppcs_score)
 *   5. Call XGBoost fraud ML service
 *   6. Persist Claim with all GPS + ML fields
 *   7. Return full response with live_verified, location, real_weather
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma                           from '../config/db.js';
import { createError }                  from '../utils/errorHandler.js';
import { buildFeatureVector, evaluateFraudML } from './fraudService.js';
import { LEVEL_MULTIPLIERS, TRIGGER_TIERS }    from './triggerService.js';
import { fetchWeatherForCoords }               from './weatherService.js';
import { fetchAqiForCoords }                   from './aqiService.js';
import { getLocationContext, computeGpsPpcs }  from './locationService.js';
import { reverseGeocode }                      from '../utils/geoUtils.js';

// ─── Maps ─────────────────────────────────────────────────────────────────────

const TRIGGER_TYPE_MAP = {
  rain:  'HEAVY_RAIN',
  aqi:   'SEVERE_AQI',
  heat:  'HEATWAVE',
  flood: 'FLOOD',
};

const TRIGGER_LABELS = {
  HEAVY_RAIN: 'Rain', SEVERE_AQI: 'AQI', HEATWAVE: 'Heat', FLOOD: 'Flood',
};

const THRESHOLD_REASONS = {
  HEAVY_RAIN: { 1: 'Rainfall exceeded 35 mm/h', 2: 'Rainfall exceeded 50 mm/h', 3: 'Rainfall exceeded 75 mm/h' },
  SEVERE_AQI: { 1: 'AQI exceeded 200 (Unhealthy)', 2: 'AQI exceeded 300 (Very Unhealthy)', 3: 'AQI exceeded 400 (Hazardous)' },
  HEATWAVE:   { 1: 'Temperature exceeded 38\u00b0C', 2: 'Temperature exceeded 42\u00b0C', 3: 'Temperature exceeded 46\u00b0C' },
  FLOOD:      { 1: 'Flood severity exceeded 70%', 2: 'Flood severity exceeded 85%', 3: 'Flood severity exceeded 95%' },
};

const SYNTHETIC_SEVERITY = {
  HEAVY_RAIN: { 1: 38, 2: 56, 3: 82 },
  SEVERE_AQI: { 1: 230, 2: 340, 3: 420 },
  HEATWAVE:   { 1: 39, 2: 43, 3: 47 },
  FLOOD:      { 1: 75, 2: 88, 3: 97 },
};

const DURATION_HOURS = { 1: 1, 2: 2, 3: 3 };
const round2 = (v) => Math.round(Number(v) * 100) / 100;

// ─── Real weather evaluator ───────────────────────────────────────────────────

const evaluateRealTrigger = (triggerType, realWeather, realAqi) => {
  if (!realWeather && !realAqi) return null;

  const tiers = TRIGGER_TIERS[triggerType];
  if (!tiers) return null;

  let rawValue;
  if (triggerType === 'HEAVY_RAIN' || triggerType === 'FLOOD') {
    rawValue = realWeather?.rainfallMmPerHour ?? 0;
    if (triggerType === 'FLOOD') rawValue = rawValue * 2.1; // flood severity proxy
  } else if (triggerType === 'SEVERE_AQI') {
    rawValue = realAqi?.aqi ?? 0;
  } else if (triggerType === 'HEATWAVE') {
    rawValue = realWeather?.heatIndex ?? 0;
  }

  let matched = null;
  for (const tier of tiers) {
    if (rawValue >= tier.threshold) matched = tier;
  }

  return matched ? { ...matched, rawValue, realData: true } : null;
};

// ─── Main simulator ───────────────────────────────────────────────────────────

export const simulateClaim = async ({ user_id, trigger_type: rawTrigger, level: rawLevel, lat, lon }) => {
  // ── 1. Validate inputs ──────────────────────────────────────────────────────
  const level       = Math.min(3, Math.max(1, parseInt(rawLevel, 10) || 1));
  const triggerType = TRIGGER_TYPE_MAP[String(rawTrigger).toLowerCase()] ?? String(rawTrigger).toUpperCase();

  if (!TRIGGER_TIERS[triggerType]) {
    throw createError(`Unsupported trigger_type "${rawTrigger}". Use: rain, aqi, heat, flood`, 400);
  }

  // ── 2. Fetch user + policy ──────────────────────────────────────────────────
  const user = await prisma.user.findUnique({
    where: { id: user_id }, include: { workerProfile: true },
  });
  if (!user) throw createError('User not found', 404);

  const policy = await prisma.policy.findFirst({
    where:   { userId: user_id, status: 'active', validUntil: { gt: new Date() } },
    include: { quote: { include: { zone: true } } },
    orderBy: { createdAt: 'desc' },
  });
  if (!policy) throw createError('No active policy found for this user', 409);

  const zone         = policy.quote.zone;
  const weeklyIncome = Number(user.workerProfile?.avgWeeklyIncome ?? policy.quote.avgWeeklyIncome ?? 4500);
  const coveragePct  = 80;
  const multiplier   = LEVEL_MULTIPLIERS[level];

  // ── 3. Live GPS + reverse geocode ──────────────────────────────────────────
  const hasGps       = typeof lat === 'number' && typeof lon === 'number';
  let locationLabel  = zone.zoneName;
  let locationCtx    = { locationMatch: 1, gpsJitter: 0, timeSinceUpdate: 0, hasLiveGps: false };
  let liveVerified   = false;

  if (hasGps) {
    try {
      locationLabel = await reverseGeocode(lat, lon);
      locationCtx   = await getLocationContext(user_id, zone.id);
      liveVerified  = locationCtx.locationMatch === 1;
    } catch (err) {
      console.warn('[simulateService] Location context error:', err.message);
    }
  }

  // ── 4. Real weather + AQI fetch ─────────────────────────────────────────────
  let realWeather = null, realAqi = null;
  const coordLat  = hasGps ? lat  : (zone.centerLat ?? null);
  const coordLon  = hasGps ? lon  : (zone.centerLon ?? null);

  if (coordLat && coordLon) {
    const [weatherResult, aqiResult] = await Promise.allSettled([
      fetchWeatherForCoords(coordLat, coordLon),
      fetchAqiForCoords(coordLat, coordLon),
    ]);
    if (weatherResult.status === 'fulfilled') {
      realWeather = weatherResult.value;
      console.log(`[simulateService] Real weather: ${realWeather.rainfallMmPerHour}mm/h, ${realWeather.heatIndex}°C — ${realWeather.source}`);
    } else {
      console.warn('[simulateService] Weather API failed:', weatherResult.reason?.message);
    }
    if (aqiResult.status === 'fulfilled') {
      realAqi = aqiResult.value;
      console.log(`[simulateService] Real AQI: ${realAqi.aqi} (${realAqi.category}) — ${realAqi.source}`);
    } else {
      console.warn('[simulateService] AQI API failed:', aqiResult.reason?.message);
    }
  }

  // ── 5. Check if real conditions actually trigger ────────────────────────────
  const realTriggerMatch = realWeather || realAqi
    ? evaluateRealTrigger(triggerType, realWeather, realAqi)
    : null;

  // Use real level if conditions allow it; otherwise use requested level (demo mode)
  const effectiveLevel     = realTriggerMatch ? realTriggerMatch.level : level;
  const effectiveMultiplier = LEVEL_MULTIPLIERS[effectiveLevel];
  const thresholdReason    = THRESHOLD_REASONS[triggerType]?.[effectiveLevel] ?? `${triggerType} L${effectiveLevel}`;
  const triggerLabel       = `${TRIGGER_LABELS[triggerType] ?? triggerType} Level ${effectiveLevel}`;
  const severity           = SYNTHETIC_SEVERITY[triggerType]?.[effectiveLevel] ?? effectiveLevel * 30;
  const hours              = DURATION_HOURS[effectiveLevel];

  // ── 6. Payout math ──────────────────────────────────────────────────────────
  const startTime       = new Date();
  const endTime         = new Date(startTime.getTime() + hours * 60 * 60 * 1000);
  const hourlyRate      = weeklyIncome / 7 / 10;
  const predictedIncome = round2(hourlyRate * hours);
  const actualEarned    = 0;
  const netLoss         = predictedIncome;
  const payout          = round2(Math.min(netLoss * (coveragePct / 100) * effectiveMultiplier, Number(policy.coverageAmount)));

  // ── 7. Persist simulated trigger event ─────────────────────────────────────
  const triggerEvent = await prisma.triggerEvent.create({
    data: {
      zoneId: zone.id, triggerType, severity, startTime, endTime,
      status: 'resolved', source: hasGps ? 'simulation-live-gps' : 'simulation',
      rawPayload: {
        simulation: true, trigger_level: effectiveLevel, multiplier: effectiveMultiplier,
        threshold_reason: thresholdReason, trigger_label: triggerLabel,
        real_weather: realWeather?.rawPayload ?? null,
        real_aqi:     realAqi?.rawPayload     ?? null,
        user_lat: lat ?? null, user_lon: lon ?? null,
      },
    },
  });

  // ── 8. Real ppcs_score from GPS ─────────────────────────────────────────────
  let ppcsScore = 0.75;
  try {
    ppcsScore = await computeGpsPpcs(user_id);
  } catch {}

  // ── 9. Build ML feature vector ──────────────────────────────────────────────
  let features;
  try {
    features = await buildFeatureVector({
      userId: user_id, zoneId: zone.id, triggerType,
      predictedIncome, actualEarned, payout, policy: { ...policy, quote: policy.quote },
    });
    // Override with real computed values
    features.trigger_valid  = 1;
    features.duplicate_flag = 0;
    features.zone_match     = locationCtx.locationMatch;
    features.ppcs_score     = ppcsScore;
  } catch (err) {
    console.error('[simulateService] Feature build error:', err.message);
    features = {
      predicted_income: predictedIncome, actual_income: 0, payout,
      income_ratio: 0, account_age_days: 1, claims_last_7d: 0, claims_last_28d: 0,
      velocity_ratio: 0, policy_age_hours: 24,
      zone_match: locationCtx.locationMatch, duplicate_flag: 0, trigger_valid: 1,
      upi_cluster_size: 1, ppcs_score: ppcsScore,
    };
  }

  // ── 10. ML Fraud evaluation ──────────────────────────────────────────────────
  const fraud = await evaluateFraudML(features);

  // ── 11. HIGH risk → DO NOT persist claim — return fraud-blocked result ────────
  const realWeatherLine = realWeather
    ? `Real weather at your location: ${realWeather.rainfallMmPerHour}mm/h rain, ${realWeather.heatIndex}°C (${realWeather.description})`
    : null;
  const realAqiLine = realAqi
    ? `Real AQI: ${realAqi.aqi} — ${realAqi.category}`
    : null;

  const explanation = [
    hasGps
      ? locationCtx.locationMatch ? `\uD83D\uDCCD Live GPS matched registered zone (${locationCtx.distFromZoneKm}km from zone center)` : `\u26A0\uFE0F Location mismatch — ${locationCtx.distFromZoneKm}km from registered zone`
      : 'Simulation mode (no live GPS)',
    realWeatherLine,
    realAqiLine,
    thresholdReason,
    `Disruption: ${hours}h (${triggerLabel})`,
    `Predicted loss: \u20b9${predictedIncome} | Payout: \u20b9${payout} (${coveragePct}% \u00d7 ${effectiveMultiplier})`,
    `ML fraud probability: ${(fraud.fraudProbability * 100).toFixed(1)}% \u2192 ${fraud.riskLevel} risk`,
    ...fraud.riskFactors.slice(0, 2).map((f) => `\u26A0 ${f}`),
    fraud.usedFallback ? '(Rule-based fallback — ML service offline)' : '(XGBoost model)',
  ].filter(Boolean);

  const baseResponse = {
    status:           fraud.fraudStatus,
    risk_level:       fraud.riskLevel,
    trigger:          triggerLabel,
    zone:             zone.zoneName,
    location:         locationLabel,
    live_verified:    liveVerified,
    payout,
    fraud_probability: fraud.fraudProbability,
    fraud_score:       fraud.fraudScore,
    top_factors:       fraud.riskFactors,
    ml_used:           !fraud.usedFallback,
    real_weather: realWeather ? {
      rainfall_mm: realWeather.rainfallMmPerHour,
      temp_c:      realWeather.heatIndex,
      description: realWeather.description,
      city:        realWeather.cityName,
      source:      realWeather.source,
    } : null,
    real_aqi: realAqi ? {
      aqi:      realAqi.aqi,
      category: realAqi.category,
      source:   realAqi.source,
    } : null,
    breakdown: {
      weekly_income:    weeklyIncome,
      hourly_rate:      round2(hourlyRate),
      disruption_hours: hours,
      predicted_income: predictedIncome,
      actual_earned:    0,
      net_loss:         netLoss,
      coverage_pct:     coveragePct,
      level_multiplier: effectiveMultiplier,
    },
    features,
    explanation,
    simulated: true,
  };

  if (fraud.riskLevel === 'HIGH') {
    // Fraud detected — delete the trigger event we created (cleanup) and do NOT create a claim
    await prisma.triggerEvent.delete({ where: { id: triggerEvent.id } }).catch(() => {});
    console.log(`[simulateService] HIGH fraud risk (${(fraud.fraudProbability * 100).toFixed(1)}%) — claim NOT created`);
    return { ...baseResponse, claimId: null, claim_blocked: true, created_at: new Date().toISOString() };
  }

  // ── 12. LOW / MEDIUM — persist claim ────────────────────────────────────────
  const claimStatus  = fraud.claimStatus; // 'paid' | 'under_review'
  const reviewReason = fraud.riskLevel === 'LOW'
    ? `ML auto-approved (fraud probability ${(fraud.fraudProbability * 100).toFixed(1)}%)`
    : `ML flagged for review (probability ${(fraud.fraudProbability * 100).toFixed(1)}%, risk: ${fraud.riskLevel})`;

  const claim = await prisma.claim.create({
    data: {
      userId: user_id, policyId: policy.id, triggerEventId: triggerEvent.id,
      claimStatus, estimatedIncomeLoss: predictedIncome, actualEarned: 0,
      netLoss, payoutAmount: payout,
      triggerLevel: effectiveLevel, levelMultiplier: effectiveMultiplier, coveragePercentage: coveragePct,
      triggerReason: thresholdReason,
      fraudScore:       fraud.fraudScore,
      fraudReasons:     fraud.fraudReasons,
      fraudProbability: fraud.fraudProbability,
      riskLevel:        fraud.riskLevel,
      riskFactors:      fraud.riskFactors,
      locationMatch:    locationCtx.locationMatch === 1,
      locationLat:      lat ?? null,
      locationLon:      lon ?? null,
      locationLabel,
      liveVerified,
      reviewReason,
    },
  });

  return { ...baseResponse, claimId: claim.id, claim_blocked: false, created_at: claim.createdAt };
};
