import { asyncHandler, createError }   from '../utils/errorHandler.js';
import { listActiveTriggers, listAllTriggers } from '../services/triggerService.js';
import { simulateClaim }               from '../services/simulateService.js';

export const getActiveTriggers = asyncHandler(async (req, res) => {
  const { zone_id } = req.query;
  const triggers = await listActiveTriggers({ zoneId: zone_id ?? null });

  res.status(200).json({
    success: true,
    count: triggers.length,
    data: triggers,
  });
});

export const getTriggers = asyncHandler(async (_req, res) => {
  const triggers = await listAllTriggers();

  res.status(200).json({
    success: true,
    count: triggers.length,
    data: triggers,
  });
});

// ── POST /api/triggers/simulate (real GPS + live weather) ─────────────────────
export const runSimulation = asyncHandler(async (req, res) => {
  const { user_id, trigger_type, level, lat, lon } = req.body;

  if (!user_id)      throw createError('user_id is required', 400);
  if (!trigger_type) throw createError('trigger_type is required (rain | aqi | heat | flood)', 400);
  if (!level)        throw createError('level is required (1 | 2 | 3)', 400);

  // lat/lon optional — enables real weather + location verification
  const coords = (typeof lat === 'number' && typeof lon === 'number') ? { lat, lon } : {};

  const result = await simulateClaim({ user_id, trigger_type, level, ...coords });

  res.status(201).json({
    success: true,
    message: result.risk_level === 'LOW'
      ? `Claim approved — \u20b9${result.payout} credited (simulated)`
      : `Claim flagged for review (ML fraud probability ${(result.fraud_probability * 100).toFixed(1)}%)`,
    data: result,
  });
});