import jwt from 'jsonwebtoken';
import prisma from '../config/db.js';
import { config } from '../config/env.js';

// Demo OTP — in production, use SMS provider (Twilio/MSG91)
const DEMO_OTP = '123456';
const OTP_TTL_MINUTES = 10;

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/send-otp
// ─────────────────────────────────────────────────────────────────────────────
export const sendOtp = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone || !/^\d{10}$/.test(String(phone).replace(/\s|\+91/g, ''))) {
      return res.status(400).json({ success: false, message: 'A valid 10-digit phone number is required.' });
    }

    const cleanPhone = String(phone).replace(/\s|\+91/g, '').slice(-10);

    // Store OTP (demo: always 123456)
    await prisma.otpStore.create({
      data: {
        phone: cleanPhone,
        otp: DEMO_OTP,
        expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
        used: false,
      },
    });

    console.log(`🔑 [OTP] Demo OTP for ${cleanPhone}: ${DEMO_OTP}`);

    return res.status(200).json({
      success: true,
      message: `OTP sent to +91 ${cleanPhone}`,
      // Demo only — remove in production
      _demo: { otp: DEMO_OTP, hint: 'Use 123456 for demo' },
    });
  } catch (err) {
    console.error('sendOtp error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to send OTP. Please try again.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/verify-otp
// ─────────────────────────────────────────────────────────────────────────────
export const verifyOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ success: false, message: 'Phone and OTP are required.' });
    }

    const cleanPhone = String(phone).replace(/\s|\+91/g, '').slice(-10);

    // Find valid OTP
    const otpRecord = await prisma.otpStore.findFirst({
      where: {
        phone: cleanPhone,
        otp: String(otp),
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      return res.status(401).json({ success: false, message: 'Invalid or expired OTP.' });
    }

    // Mark OTP as used
    await prisma.otpStore.update({ where: { id: otpRecord.id }, data: { used: true } });

    // Upsert user
    let user = await prisma.user.findUnique({ where: { phone: cleanPhone } });
    const isNewUser = !user;

    if (!user) {
      user = await prisma.user.create({ data: { phone: cleanPhone } });
    }

    // Issue JWT
    const token = jwt.sign(
      { userId: user.id, phone: user.phone },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );

    return res.status(200).json({
      success: true,
      message: isNewUser ? 'Account created. Welcome to ShieldPay!' : 'Welcome back!',
      token,
      isNewUser,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        onboardingDone: user.onboardingDone,
      },
    });
  } catch (err) {
    console.error('verifyOtp error:', err.message);
    return res.status(500).json({ success: false, message: 'OTP verification failed. Please try again.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/me  (JWT-protected — used to restore session)
// ─────────────────────────────────────────────────────────────────────────────
export const getMe = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { userSettings: true, workerProfile: true },
    });

    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    return res.status(200).json({ success: true, user });
  } catch (err) {
    console.error('getMe error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch user.' });
  }
};
