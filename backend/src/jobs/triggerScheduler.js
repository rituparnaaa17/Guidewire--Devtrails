/**
 * jobs/triggerScheduler.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Automated Parametric Insurance Pipeline — runs every 30 minutes
 *
 * Full pipeline executed on each tick:
 *   1. Fetch mock external data (rainfall, AQI, temperature) per zone
 *   2. Persist snapshots to DB (weather_snapshots, aqi_snapshots)
 *   3. Run trigger detection → evaluate L1/L2/L3 tiers per zone
 *   4. Upsert/resolve trigger_events in DB
 *   5. Auto-process claims for newly active triggers
 *
 * Uses node-cron (already in dependencies, see package.json).
 * Also exported as a plain async function so tests / manual runs can call it.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import cron from 'node-cron';
import { getAllZones, fetchWeatherSnapshotForZone } from '../services/weatherService.js';
import { fetchAqiSnapshotForZone }                  from '../services/aqiService.js';
import { evaluateTriggerRules }                     from '../services/triggerService.js';
import { processClaimsForActiveTriggers }           from '../services/claimService.js';

// ─── Core pipeline ────────────────────────────────────────────────────────────

/**
 * runParametricPipeline()
 *
 * Executes one full tick of the automated insurance pipeline.
 * Safe to call at any time; errors in one phase are caught and logged
 * without killing the scheduler.
 */
export const runParametricPipeline = async () => {
  const start = Date.now();
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  🔄  Parametric pipeline tick starting...     ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // ── Phase 1: Fetch external data ──────────────────────────────────────────
  console.log('[trigger-scheduler] Phase 1 — fetching external sensor data');
  let zones = [];
  try {
    zones = await getAllZones();
    console.log(`[trigger-scheduler]   ↳ ${zones.length} zone(s) found`);
  } catch (err) {
    console.error('[trigger-scheduler] Phase 1 FAILED (zone fetch):', err.message);
    return;
  }

  // ── Phase 2: Persist snapshots ────────────────────────────────────────────
  console.log('[trigger-scheduler] Phase 2 — persisting weather + AQI snapshots');
  let weatherCount = 0, aqiCount = 0;
  try {
    await Promise.all(
      zones.map(async (zone) => {
        await fetchWeatherSnapshotForZone(zone); weatherCount++;
        await fetchAqiSnapshotForZone(zone);     aqiCount++;
      })
    );
    console.log(`[trigger-scheduler]   ↳ ${weatherCount} weather + ${aqiCount} AQI snapshots stored`);
  } catch (err) {
    console.error('[trigger-scheduler] Phase 2 FAILED (snapshot store):', err.message);
  }

  // ── Phase 3 + 4: Trigger detection & DB upsert ───────────────────────────
  console.log('[trigger-scheduler] Phase 3/4 — evaluating trigger rules');
  let triggerResults = [];
  try {
    triggerResults = await evaluateTriggerRules();
    const created  = triggerResults.filter((r) => r.action === 'created').length;
    const updated  = triggerResults.filter((r) => r.action === 'updated').length;
    const resolved = triggerResults.filter((r) => r.action === 'resolved').length;

    console.log(`[trigger-scheduler]   ↳ ${created} created | ${updated} updated | ${resolved} resolved`);

    // Log active triggers with levels
    triggerResults
      .filter((r) => r.action !== 'resolved' && r.triggerLevel)
      .forEach((r) => {
        console.log(
          `[trigger-scheduler]   ⚡ ${r.trigger.triggerType} L${r.triggerLevel} ` +
          `(×${r.multiplier}) — zone ${r.trigger.zoneId?.slice(0, 8)}`
        );
        if (r.triggerReason) console.log(`[trigger-scheduler]      ${r.triggerReason}`);
      });
  } catch (err) {
    console.error('[trigger-scheduler] Phase 3/4 FAILED (trigger eval):', err.message);
  }

  // ── Phase 5: Auto-claim processing ────────────────────────────────────────
  console.log('[trigger-scheduler] Phase 5 — auto-processing claims');
  try {
    const claimResults = await processClaimsForActiveTriggers();
    const newClaims    = claimResults.filter((r) => r.claims?.length > 0);
    console.log(`[trigger-scheduler]   ↳ ${newClaims.length} trigger batch(es) generated new claims`);
    newClaims.forEach((r) => {
      console.log(`[trigger-scheduler]      Trigger ${r.triggerEventId?.slice(0, 8)} → ${r.claims.length} claim(s)`);
    });
  } catch (err) {
    console.error('[trigger-scheduler] Phase 5 FAILED (claim processing):', err.message);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(2);
  console.log(`\n[trigger-scheduler] ✅ Pipeline tick complete in ${elapsed}s\n`);
};

// ─── Cron scheduler ───────────────────────────────────────────────────────────

let _cronHandle = null;

/**
 * startTriggerScheduler()
 *
 * Registers the parametric pipeline cron job (every 30 minutes).
 * Call once from app.js / server startup.
 * Returns the cron task handle so it can be stopped (e.g. in tests).
 */
export const startTriggerScheduler = () => {
  if (_cronHandle) return _cronHandle; // idempotent

  console.log('[trigger-scheduler] ⏰ Registering cron — every 30 minutes (*/30 * * * *)');

  // Run once immediately on startup, then on schedule
  runParametricPipeline().catch((err) =>
    console.error('[trigger-scheduler] Initial run failed:', err.message)
  );

  _cronHandle = cron.schedule('*/30 * * * *', () => {
    runParametricPipeline().catch((err) =>
      console.error('[trigger-scheduler] Scheduled run failed:', err.message)
    );
  });

  return _cronHandle;
};

/**
 * stopTriggerScheduler()
 * Gracefully stops the cron job. Useful for clean server shutdown.
 */
export const stopTriggerScheduler = () => {
  if (_cronHandle) {
    _cronHandle.stop();
    _cronHandle = null;
    console.log('[trigger-scheduler] Cron stopped.');
  }
};
