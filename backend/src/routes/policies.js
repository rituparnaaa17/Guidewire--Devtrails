import { Router } from 'express';
import { createPolicyHandler, verifyPaymentHandler, demoActivateHandler, getUserPolicies, getPolicyHandler } from '../controllers/policyController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/create',          requireAuth, createPolicyHandler);
router.post('/verify-payment',  requireAuth, verifyPaymentHandler);
router.post('/demo-activate',   requireAuth, demoActivateHandler);  // demo bypass
router.get('/user',             requireAuth, getUserPolicies);
router.get('/:policyId',        requireAuth, getPolicyHandler);

export default router;

