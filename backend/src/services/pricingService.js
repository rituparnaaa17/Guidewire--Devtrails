import prisma from '../config/db.js';
import { resolveZone } from './zoneService.js';

// ── Plan configuration ────────────────────────────────────────────────────────
const PLAN_CONFIG = {
  basic:    { surcharge: 0,  coverageMultiplier: 10, maxCoverage: 50000,  label: 'Basic' },
  standard: { surcharge: 25, coverageMultiplier: 20, maxCoverage: 150000, label: 'Standard' },
  premium:  { surcharge: 60, coverageMultiplier: 35, maxCoverage: 500000, label: 'Premium' },
};

// ── Work type risk factors ────────────────────────────────────────────────────
const WORK_TYPE_FACTORS = {
  construction: 1.40, factory: 1.25, agriculture: 1.15,
  delivery: 1.10,     retail: 1.00,  domestic: 0.90,    other: 1.05,
};

const calcWorkerExpFactor = (yearsExperience = 0) => {
  if (yearsExperience >= 10) return -10;
  if (yearsExperience >= 5)  return -5;
  if (yearsExperience >= 2)  return 0;
  return 10;
};

const calcIncomeFactor = (avgWeeklyIncome) => {
  if (avgWeeklyIncome <= 2000)  return 1.20;
  if (avgWeeklyIncome <= 4000)  return 1.10;
  if (avgWeeklyIncome <= 6000)  return 1.00;
  if (avgWeeklyIncome <= 10000) return 0.95;
  return 0.90;
};

const calcHoursFactor = (dailyHours) => {
  if (dailyHours <= 4)  return 0.85;
  if (dailyHours <= 6)  return 0.95;
  if (dailyHours <= 8)  return 1.00;
  if (dailyHours <= 10) return 1.10;
  return 1.20;
};

const getRiskBand = (score) => {
  if (score < 1.0)  return 'very_low';
  if (score < 1.25) return 'low';
  if (score < 1.50) return 'medium';
  if (score < 1.75) return 'high';
  return 'very_high';
};

const round2 = (n) => Math.round(n * 100) / 100;

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PRICING FORMULA
// ─────────────────────────────────────────────────────────────────────────────
export const calculatePremium = async ({
  city, pincode, workType, dailyHours, avgWeeklyIncome,
  planTier, yearsExperience = 0, userId = null,
}) => {
  const { zone, resolvedBy } = await resolveZone({ city, pincode });
  const plan = PLAN_CONFIG[planTier];
  if (!plan) throw Object.assign(new Error(`Invalid plan tier: ${planTier}`), { statusCode: 400 });

  const workTypeFactor  = WORK_TYPE_FACTORS[workType] ?? WORK_TYPE_FACTORS.other;
  const incomeFactor    = calcIncomeFactor(avgWeeklyIncome);
  const hoursFactor     = calcHoursFactor(dailyHours);

  const basePremium       = round2(Number(zone.basePremium) * workTypeFactor * incomeFactor * hoursFactor);
  const locRiskSurcharge  = round2(Number(zone.basePremium) * (Number(zone.riskFactor) - 1));
  const workerExpFactor   = calcWorkerExpFactor(yearsExperience);
  const planSurcharge     = plan.surcharge;

  const subTotal          = basePremium + locRiskSurcharge + workerExpFactor + planSurcharge;
  const discountCap       = round2((basePremium + locRiskSurcharge) * 0.20);

  let discountApplied = 0;
  if (yearsExperience >= 5)     discountApplied += round2(subTotal * 0.05);
  if (avgWeeklyIncome <= 2000)  discountApplied += round2(subTotal * 0.03);
  discountApplied = round2(Math.min(discountApplied, discountCap));

  const tierMin = { basic: 45, standard: 85, premium: 120 };
  const tierMax = { basic: 75, standard: 130, premium: 180 };
  let finalPremium = round2(subTotal - discountApplied);
  finalPremium = Math.max(finalPremium, tierMin[planTier]);
  finalPremium = Math.min(finalPremium, tierMax[planTier]);

  const coverageAmount = round2(Math.min(finalPremium * plan.coverageMultiplier, plan.maxCoverage));
  const riskScore = round2(Number(zone.riskFactor) * workTypeFactor * hoursFactor);
  const riskBand  = getRiskBand(riskScore);

  // Persist quote via Prisma
  const savedQuote = await prisma.pricingQuote.create({
    data: {
      ...(userId ? { userId } : {}),
      zoneId:           zone.id,
      city:             city ?? zone.city,
      pincode:          pincode ?? null,
      workType,
      dailyHours,
      avgWeeklyIncome,
      planTier,
      basePremium,
      locRiskSurcharge,
      workerExpFactor,
      planSurcharge,
      discountApplied,
      finalPremium,
      coverageAmount,
      riskBand,
    },
  });

  return {
    quoteId:   savedQuote.id,
    createdAt: savedQuote.createdAt,
    zone: {
      id: zone.id, name: zone.zoneName, code: zone.zoneCode,
      city: zone.city, state: zone.state, riskLevel: zone.riskLevel,
      riskFactor: Number(zone.riskFactor), resolvedBy,
    },
    input: { city, pincode, workType, dailyHours, avgWeeklyIncome, planTier, yearsExperience },
    factors: { workTypeFactor, incomeFactor, hoursFactor, riskScore, riskBand },
    breakdown: { basePremium, locRiskSurcharge, workerExpAdjustment: workerExpFactor, planSurcharge, discountApplied },
    result: { finalPremium, coverageAmount, planLabel: plan.label, currency: 'INR', period: 'weekly' },
  };
};

export const getQuoteById = async (quoteId) => {
  return prisma.pricingQuote.findUnique({
    where: { id: quoteId },
    include: { zone: true },
  });
};
