import axios from 'axios';
import { config } from '../config/env.js';

const ML_TIMEOUT_MS = 5000; // 5 second timeout before fallback

/**
 * City-to-risk mapping for rule-based fallback
 */
const CITY_RISK = {
  Mumbai: 1.50,
  Delhi: 1.80,
  Bangalore: 1.15,
  Chennai: 1.25,
  Pune: 1.10,
  Hyderabad: 1.20,
  Kolkata: 1.30,
  Default: 1.00,
};

const TRIGGER_SEVERITY = {
  HEAVY_RAIN: 0.8,
  FLOOD: 1.0,
  SEVERE_AQI: 0.6,
  HEATWAVE: 0.5,
  ZONE_SHUTDOWN: 0.9,
};

/**
 * Rule-based fallback: estimates loss the same way eligibilityService does,
 * but returns in the same shape as the ML response.
 */
const ruleBasedFallback = ({ weeklyIncome, hoursPerDay, city, triggerType }) => {
  const cityRisk = CITY_RISK[city] ?? CITY_RISK.Default;
  const triggerFactor = TRIGGER_SEVERITY[triggerType] ?? 0.7;
  const hourlyIncome = weeklyIncome / (hoursPerDay * 7 || 1);
  const affectedHours = hoursPerDay * triggerFactor * cityRisk;
  const predictedLoss = Math.round(hourlyIncome * affectedHours * 100) / 100;

  return {
    predictedLoss,
    confidence: 0.65, // rule-based confidence floor
    modelVersion: 'rule-based-fallback-v1',
    isML: false,
  };
};

/**
 * Call FastAPI ML service for predicted_loss.
 * Falls back gracefully to rule-based logic if ML is unavailable.
 *
 * @param {{ weeklyIncome, hoursPerDay, city, triggerType, accountAgeDays }} params
 * @returns {{ predictedLoss, confidence, modelVersion, isML }}
 */
export const predictLoss = async ({ weeklyIncome, hoursPerDay, city, triggerType, accountAgeDays = 30 }) => {
  try {
    const response = await axios.post(
      `${config.mlServiceUrl}/predict`,
      {
        weekly_income: Number(weeklyIncome),
        hours_per_day: Number(hoursPerDay),
        city: String(city || 'Default'),
        trigger_type: String(triggerType),
        account_age_days: Number(accountAgeDays),
      },
      { timeout: ML_TIMEOUT_MS }
    );

    const { predicted_loss, confidence, model_version } = response.data;
    return {
      predictedLoss: Math.round(Number(predicted_loss) * 100) / 100,
      confidence: Number(confidence),
      modelVersion: model_version || 'ml-v1',
      isML: true,
    };
  } catch (err) {
    const reason = err.code === 'ECONNREFUSED' ? 'ML service offline' : err.message;
    console.warn(`⚠️  ML service unavailable (${reason}), using rule-based fallback`);
    return ruleBasedFallback({ weeklyIncome, hoursPerDay, city, triggerType });
  }
};

/**
 * Health check for the ML service
 */
export const checkMlServiceHealth = async () => {
  try {
    const res = await axios.get(`${config.mlServiceUrl}/health`, { timeout: 2000 });
    return res.data;
  } catch {
    return { status: 'offline' };
  }
};
