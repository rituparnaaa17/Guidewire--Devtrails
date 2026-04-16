import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config/env.js';
import { testConnection } from './config/db.js';
import { notFound, globalErrorHandler } from './utils/errorHandler.js';

// Routes
import authRoutes    from './routes/auth.js';
import userRoutes    from './routes/user.js';
import pricingRoutes from './routes/pricing.js';
import policyRoutes  from './routes/policies.js';
import triggerRoutes from './routes/triggers.js';
import claimRoutes   from './routes/claims.js';
import weatherRoutes from './routes/weather.js';

// Scheduler
import { startSchedulers }        from './jobs/scheduler.js';
import { startTriggerScheduler }   from './jobs/triggerScheduler.js';

const app = express();

// ── Security middleware ───────────────────────────────────────────────────────
app.use(helmet());
// Parse comma-separated CORS origins (e.g. "http://localhost:3000,http://localhost:3001")
const allowedOrigins = config.corsOrigin
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // allow non-browser requests (curl, Postman, server-to-server)
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '10kb' }));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10000,
  message: { success: false, message: 'Too many requests, slow down.' },
}));

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    success: true,
    message:   'ShieldPay API is running',
    version:   '2.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/user',     userRoutes);
app.use('/api/pricing',  pricingRoutes);
app.use('/api/policies', policyRoutes);
app.use('/api/triggers', triggerRoutes);
app.use('/api/claims',   claimRoutes);
app.use('/api/weather',  weatherRoutes);

// ── Error handling ────────────────────────────────────────────────────────────
app.use(notFound);
app.use(globalErrorHandler);

// ── Start server ──────────────────────────────────────────────────────────────
const start = async () => {
  await testConnection();
  startSchedulers();
  startTriggerScheduler();   // ← parametric pipeline (every 30 min)

  const server = app.listen(config.port, () => {
    console.log(`🚀 ShieldPay API v2.0 → http://localhost:${config.port}`);
    console.log(`   ENV: ${config.nodeEnv} | DB: Prisma/PostgreSQL`);
  });

  server.on('error', (error) => {
    if (error?.code === 'EADDRINUSE') {
      console.error(`Port ${config.port} is already in use. Change PORT in backend/.env`);
      process.exit(1);
    }
    throw error;
  });
};

start();
