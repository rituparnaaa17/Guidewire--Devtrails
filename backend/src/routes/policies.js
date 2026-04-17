import { Router } from 'express';
import {
  createPolicyHandler,
  verifyPaymentHandler,
  demoActivateHandler,
  getUserPolicies,
  getPolicyHandler,
  updatePlanHandler,
} from '../controllers/policyController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/create',          requireAuth, createPolicyHandler);
router.post('/verify-payment',  requireAuth, verifyPaymentHandler);
router.post('/demo-activate',   requireAuth, demoActivateHandler);  // demo bypass
router.post('/update-plan',     requireAuth, updatePlanHandler);    // plan switch
router.get('/user',             requireAuth, getUserPolicies);
router.get('/:policyId',        requireAuth, getPolicyHandler);

export default router;
