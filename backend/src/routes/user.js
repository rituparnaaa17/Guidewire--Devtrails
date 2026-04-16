import { Router } from 'express';
import { getProfile, saveOnboarding, updateSettings, updateLocation } from '../controllers/userController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/me',       requireAuth, getProfile);
router.get('/profile',  requireAuth, getProfile);   // alias used by settings page
router.put('/onboarding',   requireAuth, saveOnboarding);
router.put('/settings',     requireAuth, updateSettings);
router.put('/location',     requireAuth, updateLocation);   // ← live GPS update

export default router;
