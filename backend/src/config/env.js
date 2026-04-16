import 'dotenv/config';

// ── Required env vars ─────────────────────────────────────────────────────────
const required = ['DATABASE_URL', 'JWT_SECRET', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`❌ Missing required env var: ${key}`);
    process.exit(1);
  }
}

export const config = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',

  // Auth
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  // Razorpay
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
  },

  // ML Service
  mlServiceUrl: process.env.ML_SERVICE_URL || 'http://localhost:8000',

  // Blockchain
  blockchainMode: process.env.BLOCKCHAIN_MODE || 'sha256_fallback',
  sepoliaRpcUrl: process.env.SEPOLIA_RPC_URL || null,
  walletPrivateKey: process.env.WALLET_PRIVATE_KEY || null,

  // Trigger thresholds (Tiered: L1, L2, L3)
  thresholds: {
    rain: {
      l1: Number(process.env.RAIN_L1 ?? 35),
      l2: Number(process.env.RAIN_L2 ?? 50),
      l3: Number(process.env.RAIN_L3 ?? 75),
    },
    aqi: {
      l1: Number(process.env.AQI_L1 ?? 200),
      l2: Number(process.env.AQI_L2 ?? 300),
      l3: Number(process.env.AQI_L3 ?? 400),
    },
    heat: {
      l1: Number(process.env.HEAT_L1 ?? 38),
      l2: Number(process.env.HEAT_L2 ?? 42),
      l3: Number(process.env.HEAT_L3 ?? 46),
    },
  },

  // Scheduler intervals (minutes)
  intervals: {
    pollWeatherMinutes: Number(process.env.POLL_WEATHER_INTERVAL_MINUTES ?? 15),
    pollAqiMinutes: Number(process.env.POLL_AQI_INTERVAL_MINUTES ?? 15),
    detectTriggersMinutes: Number(process.env.DETECT_TRIGGER_INTERVAL_MINUTES ?? 5),
    processClaimsMinutes: Number(process.env.PROCESS_CLAIMS_INTERVAL_MINUTES ?? 5),
  },

  // CORS
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
};
