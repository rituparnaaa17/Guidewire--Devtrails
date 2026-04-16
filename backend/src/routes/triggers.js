import { Router } from 'express';
import { getActiveTriggers, getTriggers, runSimulation } from '../controllers/triggerController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/active',    getActiveTriggers);
router.get('/',          getTriggers);
router.post('/simulate', requireAuth, runSimulation);   // ← new

export default router;