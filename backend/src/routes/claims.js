import { Router } from 'express';
import {
  listAllClaims,
  listUserClaims,
  getClaim,
  explainClaim,
  confirmClaim,
  processClaims,
  autoProcess,
  listFraudLogs,
} from '../controllers/claimController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// ── Public / admin ──────────────────────────────────────────────────────────
router.get('/',         listAllClaims);   // admin: all claims
router.post('/process', processClaims);  // admin/dev: trigger cron manually

// ── Fraud log (audit) ───────────────────────────────────────────────────────
// GET /api/claims/fraud-log?limit=50&claim_id=<uuid>
router.get('/fraud-log', requireAuth, listFraudLogs);

// ── Protected (JWT) ─────────────────────────────────────────────────────────
router.get('/user',              requireAuth, listUserClaims);
router.get('/:claimId',          requireAuth, getClaim);
router.get('/:claimId/explain',  requireAuth, explainClaim);
router.post('/:claimId/confirm', requireAuth, confirmClaim);

// ── Parametric auto-process (enforcement engine entry point) ────────────────
// POST /api/claims/auto-process
// Returns HTTP 403 if any hard block condition is met.
router.post('/auto-process', requireAuth, autoProcess);

export default router;