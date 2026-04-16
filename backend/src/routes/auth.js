import { Router } from 'express';
import { sendOtp, verifyOtp, getMe } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/send-otp',   sendOtp);
router.post('/verify-otp', verifyOtp);
router.get('/me',          requireAuth, getMe);

export default router;
