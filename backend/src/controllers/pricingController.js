import { calculatePremium, getPricingOptions } from '../services/pricingService.js';
import { asyncHandler } from '../utils/errorHandler.js';

const VALID_WORK_TYPES = ['construction', 'domestic', 'delivery', 'factory', 'agriculture', 'retail', 'other'];

// ── POST /api/pricing/quote ────────────────────────────────────────────────────
export const getQuote = asyncHandler(async (req, res) => {
  const {
    city,
    pincode,
    work_type,
    avg_weekly_income,
    years_experience,
    user_id,
    // Optional live-data overrides (from client geolocation + widget)
    rainfall_mm,
    aqi,
    // Legacy fields — ignored but accepted so old frontend calls don't 400
    daily_hours,
    plan_tier,
  } = req.body;

  const parsedIncome = Number(avg_weekly_income);
  const parsedExp    = Number(years_experience ?? 0);

  // ── Validation ─────────────────────────────────────────────────────────────
  const errors = [];

  if (!city && !pincode)
    errors.push('Provide at least city or pincode.');

  if (!work_type || !VALID_WORK_TYPES.includes(work_type))
    errors.push(`work_type must be one of: ${VALID_WORK_TYPES.join(', ')}.`);

  if (!avg_weekly_income || isNaN(parsedIncome) || parsedIncome <= 0)
    errors.push('avg_weekly_income must be a positive number.');

  if (errors.length > 0) {
    return res.status(400).json({ success: false, message: 'Validation failed.', errors });
  }

  const result = await calculatePremium({
    city:             city?.trim() ?? null,
    pincode:          pincode?.toString().trim() ?? null,
    weeklyIncome:     parsedIncome,
    workType:         work_type,
    yearsExperience:  parsedExp,
    userId:           user_id ?? null,
    rainfallOverride: rainfall_mm != null ? Number(rainfall_mm) : null,
    aqiOverride:      aqi        != null ? Number(aqi)         : null,
  });

  res.status(200).json({ success: true, data: result });
});

// ── GET /api/pricing/options ────────────────────────────────────────────────────
// Returns base_premium + 3 tier plan variants (Basic / Standard / Premium)
// with fully dynamic risk-based pricing. No fixed prices.
export const getOptions = asyncHandler(async (req, res) => {
  const {
    city,
    pincode,
    work_type,
    avg_weekly_income,
    years_experience,
    user_id,
    rainfall_mm,
    aqi,
  } = req.query;

  const parsedIncome = Number(avg_weekly_income);
  const parsedExp    = Number(years_experience ?? 0);

  // ── Validation ─────────────────────────────────────────────────────────────
  const errors = [];

  if (!city && !pincode)
    errors.push('Provide at least city or pincode.');

  if (!work_type || !VALID_WORK_TYPES.includes(work_type))
    errors.push(`work_type must be one of: ${VALID_WORK_TYPES.join(', ')}.`);

  if (!avg_weekly_income || isNaN(parsedIncome) || parsedIncome <= 0)
    errors.push('avg_weekly_income must be a positive number.');

  if (errors.length > 0) {
    return res.status(400).json({ success: false, message: 'Validation failed.', errors });
  }

  const result = await getPricingOptions({
    city:             city?.trim() ?? null,
    pincode:          pincode?.toString().trim() ?? null,
    weeklyIncome:     parsedIncome,
    workType:         work_type,
    yearsExperience:  parsedExp,
    userId:           user_id ?? null,
    rainfallOverride: rainfall_mm != null ? Number(rainfall_mm) : null,
    aqiOverride:      aqi        != null ? Number(aqi)         : null,
  });

  res.status(200).json({ success: true, data: result });
});
