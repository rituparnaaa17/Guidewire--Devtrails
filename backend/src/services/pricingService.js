import prisma from '../config/db.js';
import { resolveZone } from './zoneService.js';

// ─────────────────────────────────────────────────────────────────────────────
// ZONE RISK PROFILES
// Per-zone flood and disruption data tuned from historical patterns.
// flood_risk:       0–1 likelihood of flood-level events
// disruption_freq:  0–1 how often this zone has weather-triggered disruptions
// ─────────────────────────────────────────────────────────────────────────────
const ZONE_RISK_PROFILES = {
  'MUM-C':   { flood_risk: 0.85, disruption_freq: 0.75 },  // Mumbai Central — extreme monsoon floods
  'MUM-S':   { flood_risk: 0.60, disruption_freq: 0.55 },  // Mumbai Suburbs
  'DEL-C':   { flood_risk: 0.40, disruption_freq: 0.70 },  // Delhi NCR — AQI/smog dominant
  'DEL-O':   { flood_risk: 0.35, disruption_freq: 0.60 },  // Delhi Outer
  'BLR-U':   { flood_risk: 0.45, disruption_freq: 0.40 },  // Bangalore Urban — waterlogging
  'BLR-R':   { flood_risk: 0.20, disruption_freq: 0.20 },  // Bangalore Rural
  'PUN-C':   { flood_risk: 0.40, disruption_freq: 0.35 },  // Pune
  'CHN-C':   { flood_risk: 0.55, disruption_freq: 0.50 },  // Chennai — cyclone coast
  'CHN-VEL': { flood_risk: 0.70, disruption_freq: 0.60 },  // Velachery — notoriously flood-prone
  'HYD-C':   { flood_risk: 0.45, disruption_freq: 0.40 },  // Hyderabad
  'KOL-C':   { flood_risk: 0.65, disruption_freq: 0.60 },  // Kolkata
  'DEFAULT': { flood_risk: 0.40, disruption_freq: 0.35 },
};

// ─────────────────────────────────────────────────────────────────────────────
// WORK TYPE EXPOSURE MULTIPLIERS
// How exposed is this work type to weather disruptions
// ─────────────────────────────────────────────────────────────────────────────
const WORK_TYPE_EXPOSURE = {
  construction: 1.35,
  factory:      1.20,
  agriculture:  1.15,
  delivery:     1.10,
  retail:       1.00,
  domestic:     0.90,
  other:        1.05,
};

// ─────────────────────────────────────────────────────────────────────────────
// SEASON DETECTION FROM MONTH
// Indian climate seasons
// ─────────────────────────────────────────────────────────────────────────────
const getSeasonMultiplier = (month) => {
  // June–September: Monsoon (peak risk)
  if (month >= 6 && month <= 9)  return { multiplier: 1.5, season: 'Monsoon' };
  // October–November: Post-monsoon / Winter AQI
  if (month >= 10 && month <= 11) return { multiplier: 1.2, season: 'Winter AQI Season' };
  // December–February: Winter / Dry
  if (month === 12 || month <= 2) return { multiplier: 0.8, season: 'Dry Season' };
  // March–May: Summer
  return { multiplier: 1.0, season: 'Summer' };
};

// ─────────────────────────────────────────────────────────────────────────────
// AQI SEVERITY NORMALISER
// Converts raw AQI value (0–500 scale) to 0–1 risk signal
// ─────────────────────────────────────────────────────────────────────────────
const normaliseAqi = (aqiRaw) => {
  if (!aqiRaw || isNaN(aqiRaw)) return 0.3; // default moderate
  const clamped = Math.min(Math.max(aqiRaw, 0), 500);
  return Math.round((clamped / 500) * 100) / 100;
};

// ─────────────────────────────────────────────────────────────────────────────
// RAINFALL INTENSITY NORMALISER
// Converts rainfall mm/hr to 0–1 risk signal
// 0–5 mm/hr  → drizzle (low), 35+ mm/hr → extreme (high)
// ─────────────────────────────────────────────────────────────────────────────
const normaliseRainfall = (rainfallMm) => {
  if (!rainfallMm || isNaN(rainfallMm)) return 0.2; // default light
  const clamped = Math.min(Math.max(rainfallMm, 0), 70);
  return Math.round((clamped / 70) * 100) / 100;
};

// ─────────────────────────────────────────────────────────────────────────────
// DYNAMIC RISK SCORE CALCULATOR
// risk_score = (0.4 × flood_risk) + (0.3 × rainfall_intensity)
//            + (0.2 × aqi_severity) + (0.1 × disruption_freq)
// ─────────────────────────────────────────────────────────────────────────────
const calcRiskScore = ({ flood_risk, rainfall_intensity, aqi_severity, disruption_freq }) => {
  const score =
    (0.4 * flood_risk) +
    (0.3 * rainfall_intensity) +
    (0.2 * aqi_severity) +
    (0.1 * disruption_freq);
  return Math.round(score * 1000) / 1000; // 3 decimal precision
};

// ─────────────────────────────────────────────────────────────────────────────
// EXPLANATION GENERATOR
// Produces a human-readable reason string based on the dominant risk factor
// ─────────────────────────────────────────────────────────────────────────────
const generateExplanation = ({ flood_risk, rainfall_intensity, aqi_severity, disruption_freq, season, risk_score, finalPremium }) => {
  const parts = [];

  if (flood_risk >= 0.65)          parts.push('high flood risk in your zone');
  if (rainfall_intensity >= 0.55)  parts.push('high rainfall intensity');
  if (aqi_severity >= 0.55)        parts.push('severe AQI pollution levels');
  if (disruption_freq >= 0.60)     parts.push('frequent historical disruptions');
  if (season === 'Monsoon')        parts.push('active monsoon season');
  if (season === 'Winter AQI Season') parts.push('winter AQI season');

  if (parts.length === 0) {
    if (risk_score <= 0.30) return 'Your zone has low environmental risk — you are getting a minimal premium.';
    return 'Your premium reflects the current environmental risk level in your zone.';
  }

  const dominant = parts.slice(0, 2).join(' and ');
  return `Premium is ${finalPremium > 90 ? 'higher' : 'moderate'} due to ${dominant}.`;
};

const round2 = (n) => Math.round(n * 100) / 100;

// ─────────────────────────────────────────────────────────────────────────────
// FETCH LIVE ENVIRONMENTAL SNAPSHOTS FROM DB
// Uses the most recent weather and AQI snapshots for the resolved zone
// ─────────────────────────────────────────────────────────────────────────────
const fetchZoneEnvironmentalData = async (zoneId) => {
  const [weatherSnap, aqiSnap] = await Promise.all([
    prisma.weatherSnapshot.findFirst({
      where: { zoneId },
      orderBy: { recordedAt: 'desc' },
    }),
    prisma.aqiSnapshot.findFirst({
      where: { zoneId },
      orderBy: { recordedAt: 'desc' },
    }),
  ]);

  return {
    rainfallMm: weatherSnap ? Number(weatherSnap.rainfallMmPerHour) : null,
    aqiRaw:     aqiSnap     ? Number(aqiSnap.aqi)                    : null,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT: calculatePremium
// ─────────────────────────────────────────────────────────────────────────────
export const calculatePremium = async ({
  city,
  pincode,
  weeklyIncome,
  workType       = 'other',
  yearsExperience = 0,
  userId         = null,
  // Optional overrides for environmental signals (used in tests/simulation)
  rainfallOverride = null,
  aqiOverride      = null,
}) => {
  // 1. Resolve zone
  const { zone, resolvedBy } = await resolveZone({ city, pincode });

  // 2. Get zone risk profile
  const profile = ZONE_RISK_PROFILES[zone.zoneCode] ?? ZONE_RISK_PROFILES['DEFAULT'];

  // 3. Fetch live environmental data from DB snapshots
  const envData = await fetchZoneEnvironmentalData(zone.id);
  const rainfallMm = rainfallOverride ?? envData.rainfallMm;
  const aqiRaw     = aqiOverride      ?? envData.aqiRaw;

  // 4. Normalise environmental signals to 0–1
  const rainfall_intensity = normaliseRainfall(rainfallMm);
  const aqi_severity       = normaliseAqi(aqiRaw);

  // 5. Zone-level signals (from profile + DB riskFactor)
  const flood_risk      = round2(Math.min(profile.flood_risk * Number(zone.riskFactor), 1.0));
  const disruption_freq = profile.disruption_freq;

  // 6. Compute risk score
  const risk_score = calcRiskScore({ flood_risk, rainfall_intensity, aqi_severity, disruption_freq });

  // 7. Season multiplier
  const currentMonth = new Date().getMonth() + 1; // 1–12
  const { multiplier: season_multiplier, season } = getSeasonMultiplier(currentMonth);

  // 8. Work type exposure adjustment
  const exposureFactor = WORK_TYPE_EXPOSURE[workType] ?? WORK_TYPE_EXPOSURE.other;

  // 9. Experience discount: 5+ yrs → 5% off
  const experienceDiscount = yearsExperience >= 5 ? 0.95 : 1.0;

  // 10. BASE PREMIUM FORMULA
  //     premium = weekly_income × 0.007 × risk_score × season_multiplier × exposure × exp_discount
  const BASE_RATE = 0.007;
  let rawPremium = weeklyIncome * BASE_RATE * risk_score * season_multiplier * exposureFactor * experienceDiscount;

  // 11. CLAMP: ₹30 – ₹180
  const PREMIUM_MIN = 30;
  const PREMIUM_MAX = 180;
  const finalPremium = round2(Math.max(PREMIUM_MIN, Math.min(PREMIUM_MAX, rawPremium)));

  // 12. Coverage = 2× weekly income, capped at ₹50,000
  const coverageAmount = round2(Math.min(weeklyIncome * 2, 50000));

  // 13. Explanation
  const explanation = generateExplanation({
    flood_risk, rainfall_intensity, aqi_severity,
    disruption_freq, season, risk_score, finalPremium,
  });

  // 14. Persist quote to DB
  const savedQuote = await prisma.pricingQuote.create({
    data: {
      ...(userId ? { userId } : {}),
      zoneId:           zone.id,
      city:             city ?? zone.city,
      pincode:          pincode ?? null,
      workType:         workType,
      dailyHours:       7,                    // kept for schema compat, not used in formula
      avgWeeklyIncome:  weeklyIncome,
      planTier:         'standard',           // base quote always stored as standard; tier applied at plan-selection time
      basePremium:      round2(weeklyIncome * BASE_RATE),
      locRiskSurcharge: round2(risk_score * season_multiplier * 10),
      workerExpFactor:  experienceDiscount * 10 - 10,
      planSurcharge:    0,
      discountApplied:  round2(rawPremium - finalPremium > 0 ? rawPremium - finalPremium : 0),
      finalPremium,
      coverageAmount,
      riskBand:         risk_score >= 0.65 ? 'very_high'
                       : risk_score >= 0.50 ? 'high'
                       : risk_score >= 0.35 ? 'medium'
                       : risk_score >= 0.20 ? 'low' : 'very_low',
    },
  });

  return {
    quoteId:   savedQuote.id,
    createdAt: savedQuote.createdAt,
    zone: {
      id:         zone.id,
      name:       zone.zoneName,
      code:       zone.zoneCode,
      city:       zone.city,
      state:      zone.state,
      riskLevel:  zone.riskLevel,
      riskFactor: Number(zone.riskFactor),
      resolvedBy,
    },
    input: {
      city, pincode, workType, weeklyIncome, yearsExperience,
      rainfallMm: rainfallMm ?? 'no live data',
      aqiRaw:     aqiRaw     ?? 'no live data',
    },
    result: {
      finalPremium,
      coverageAmount,
      currency:   'INR',
      period:     'weekly',
    },
    risk: {
      risk_score,
      season,
      season_multiplier,
      explanation,
    },
    breakdown: {
      flood_risk,
      rainfall_intensity,
      aqi_severity,
      disruption_freq,
      exposure_factor:    exposureFactor,
      experience_discount: experienceDiscount,
      raw_premium:        round2(rawPremium),
    },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// getQuoteById — used by policyService when confirming payment
// ─────────────────────────────────────────────────────────────────────────────
export const getQuoteById = async (quoteId) => {
  return prisma.pricingQuote.findUnique({
    where: { id: quoteId },
    include: { zone: true },
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// TIER PLAN DEFINITIONS
// Multipliers applied on top of the dynamic base_premium.
// Coverage is the % of net loss paid out on a claim.
// ─────────────────────────────────────────────────────────────────────────────
export const TIER_PLANS = [
  { tier: 'basic',    name: 'Basic',    multiplier: 0.7,  coverage: 50 },
  { tier: 'standard', name: 'Standard', multiplier: 1.0,  coverage: 70 },
  { tier: 'premium',  name: 'Premium',  multiplier: 1.3,  coverage: 85 },
];

const TIER_PREMIUM_MIN = 20;
const TIER_PREMIUM_MAX = 120;

const clampTierPremium = (v) =>
  round2(Math.max(TIER_PREMIUM_MIN, Math.min(TIER_PREMIUM_MAX, v)));

// ─────────────────────────────────────────────────────────────────────────────
// getPricingOptions
// Returns base_premium + all 3 tier plan variants in one call.
// Used by GET /api/pricing/options
// ─────────────────────────────────────────────────────────────────────────────
export const getPricingOptions = async ({
  city,
  pincode,
  weeklyIncome,
  workType      = 'other',
  yearsExperience = 0,
  userId        = null,
  rainfallOverride = null,
  aqiOverride      = null,
}) => {
  // 1. Run the full dynamic pricing engine to get the base premium
  const base = await calculatePremium({
    city, pincode, weeklyIncome, workType, yearsExperience,
    userId, rainfallOverride, aqiOverride,
  });

  const basePremium = base.result.finalPremium;

  // 2. Apply each tier multiplier + clamp to produce the plan list
  const plans = TIER_PLANS.map(({ tier, name, multiplier, coverage }) => ({
    tier,
    name,
    premium:    clampTierPremium(basePremium * multiplier),
    coverage,
    multiplier,
  }));

  return {
    base_premium: basePremium,
    quoteId:      base.quoteId,
    zone:         base.zone,
    risk:         base.risk,
    breakdown:    base.breakdown,
    plans,
  };
};
