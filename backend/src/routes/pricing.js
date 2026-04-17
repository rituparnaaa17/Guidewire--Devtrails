import { Router } from 'express';
import { getQuote, getOptions } from '../controllers/pricingController.js';

const router = Router();

// POST /api/pricing/quote — single dynamic quote (existing)
router.post('/quote', getQuote);

// GET /api/pricing/options — all 3 tier plans with dynamic pricing
router.get('/options', getOptions);

export default router;
