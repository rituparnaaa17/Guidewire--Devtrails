import cron from 'node-cron';
import { config } from '../config/env.js';
import { getAllZones } from '../services/weatherService.js';
import { fetchWeatherSnapshotForZone } from '../services/weatherService.js';
import { fetchAqiSnapshotForZone } from '../services/aqiService.js';
import { evaluateTriggerRules } from '../services/triggerService.js';
import { processClaimsForActiveTriggers } from '../services/claimService.js';

const toMinutes = (minutes) => `*/${minutes} * * * *`;

export const startSchedulers = () => {
  console.log('⏰ Starting ShieldPay schedulers...');

  // Poll weather data
  cron.schedule(toMinutes(config.intervals.pollWeatherMinutes), async () => {
    try {
      const zones = await getAllZones();
      await Promise.all(zones.map((z) => fetchWeatherSnapshotForZone(z)));
      console.log(`🌦️  Weather polled for ${zones.length} zones`);
    } catch (err) {
      console.error('Weather poll error:', err.message);
    }
  });

  // Poll AQI data
  cron.schedule(toMinutes(config.intervals.pollAqiMinutes), async () => {
    try {
      const zones = await getAllZones();
      await Promise.all(zones.map((z) => fetchAqiSnapshotForZone(z)));
      console.log(`💨 AQI polled for ${zones.length} zones`);
    } catch (err) {
      console.error('AQI poll error:', err.message);
    }
  });

  // Detect triggers
  cron.schedule(toMinutes(config.intervals.detectTriggersMinutes), async () => {
    try {
      const results = await evaluateTriggerRules();
      const active  = results.filter((r) => r.action !== 'resolved').length;
      const resolved = results.filter((r) => r.action === 'resolved').length;
      if (results.length) console.log(`⚡ Triggers: ${active} active, ${resolved} resolved`);
    } catch (err) {
      console.error('Trigger detection error:', err.message);
    }
  });

  // Process claims
  cron.schedule(toMinutes(config.intervals.processClaimsMinutes), async () => {
    try {
      const results = await processClaimsForActiveTriggers();
      if (results.length) console.log(`🧾 Claims processed: ${results.length} updates`);
    } catch (err) {
      console.error('Claim processing error:', err.message);
    }
  });

  console.log('✅ All schedulers active');
};