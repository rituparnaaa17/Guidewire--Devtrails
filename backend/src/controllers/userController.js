import prisma from '../config/db.js';
import { updateUserLocation } from '../services/locationService.js';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/user/me  (JWT-protected)
// ─────────────────────────────────────────────────────────────────────────────
export const getProfile = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { userSettings: true, workerProfile: true },
    });
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    // Return under 'data' key so frontend can read data.data consistently
    return res.status(200).json({ success: true, data: user });
  } catch (err) {
    console.error('getProfile error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch profile.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/user/onboarding  (JWT-protected, multi-step saves)
// Accepts any subset of onboarding fields and upserts them.
// ─────────────────────────────────────────────────────────────────────────────
export const saveOnboarding = async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      // Step 3 — Profile
      name, aadhaarLast4, upiId, platforms,
      // Step 4 — Work details
      city, zone, weeklyIncome, workingHours, shiftStart, shiftEnd, workingDays,
      workType, yearsExperience,
      // Step 5 — Consent
      consentGPS, consentPayment, consentPlatform,
    } = req.body;

    // Build update object (only include provided fields)
    const userUpdate = {};
    if (name          !== undefined) userUpdate.name           = name;
    if (aadhaarLast4  !== undefined) userUpdate.aadhaarLast4   = String(aadhaarLast4);
    if (upiId         !== undefined) userUpdate.upiId          = upiId;
    if (platforms     !== undefined) userUpdate.platforms      = Array.isArray(platforms) ? platforms : [platforms];
    if (city          !== undefined) userUpdate.city           = city;
    if (zone          !== undefined) userUpdate.zone           = zone;
    if (weeklyIncome  !== undefined) userUpdate.weeklyIncome   = Number(weeklyIncome);
    if (workingHours  !== undefined) userUpdate.workingHours   = Number(workingHours);
    if (shiftStart    !== undefined) userUpdate.shiftStart     = shiftStart;
    if (shiftEnd      !== undefined) userUpdate.shiftEnd       = shiftEnd;
    if (workingDays   !== undefined) userUpdate.workingDays    = Array.isArray(workingDays) ? workingDays : [workingDays];
    if (consentGPS    !== undefined) userUpdate.consentGPS     = Boolean(consentGPS);
    if (consentPayment !== undefined) userUpdate.consentPayment = Boolean(consentPayment);
    if (consentPlatform !== undefined) userUpdate.consentPlatform = Boolean(consentPlatform);

    // Mark onboarding done when all consents given
    if (consentGPS && consentPayment && consentPlatform) {
      userUpdate.onboardingDone = true;
    }

    const user = await prisma.user.update({ where: { id: userId }, data: userUpdate });

    // Upsert worker profile if work fields provided
    if (workType || weeklyIncome || workingHours) {
      await prisma.workerProfile.upsert({
        where: { userId },
        create: {
          userId,
          workType: workType || 'delivery',
          yearsExperience: Number(yearsExperience ?? 0),
          avgWeeklyIncome: Number(weeklyIncome ?? 0),
          dailyHours: Number(workingHours ?? 8),
          weeklyActiveHours: Number(workingHours ?? 8) * (workingDays?.length ?? 5),
          preferredWorkStart: shiftStart,
          preferredWorkEnd: shiftEnd,
        },
        update: {
          workType: workType || 'delivery',
          yearsExperience: Number(yearsExperience ?? 0),
          avgWeeklyIncome: Number(weeklyIncome ?? 0),
          dailyHours: Number(workingHours ?? 8),
          weeklyActiveHours: Number(workingHours ?? 8) * (workingDays?.length ?? 5),
          preferredWorkStart: shiftStart,
          preferredWorkEnd: shiftEnd,
        },
      });
    }

    // Return ALL user fields so frontend localStorage stays fully populated
    return res.status(200).json({
      success: true,
      message: 'Onboarding data saved.',
      user: {
        id:             user.id,
        phone:          user.phone,
        name:           user.name,
        aadhaarLast4:   user.aadhaarLast4,
        upiId:          user.upiId,
        platforms:      user.platforms,
        city:           user.city,
        zone:           user.zone,
        weeklyIncome:   user.weeklyIncome,
        workingHours:   user.workingHours,
        workType:       user.workType,
        shiftStart:     user.shiftStart,
        shiftEnd:       user.shiftEnd,
        workingDays:    user.workingDays,
        onboardingDone: user.onboardingDone,
      },
    });
  } catch (err) {
    console.error('saveOnboarding error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to save onboarding data.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/user/settings  (JWT-protected)
// ─────────────────────────────────────────────────────────────────────────────
export const updateSettings = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { connectedPlatform, activePlan, autoRenewal, primaryUpiId,
            backupBankAccount, payoutFrequency, weatherWarnings,
            claimUpdates, weeklySummary } = req.body;

    const settings = await prisma.userSettings.upsert({
      where: { userId },
      create: { userId, connectedPlatform, activePlan, autoRenewal, primaryUpiId, backupBankAccount, payoutFrequency, weatherWarnings, claimUpdates, weeklySummary },
      update: { connectedPlatform, activePlan, autoRenewal, primaryUpiId, backupBankAccount, payoutFrequency, weatherWarnings, claimUpdates, weeklySummary },
    });

    return res.status(200).json({ success: true, settings });
  } catch (err) {
    console.error('updateSettings error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update settings.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/users/location  (JWT-protected)
// Body: { lat: number, lon: number }
// ─────────────────────────────────────────────────────────────────────────────
export const updateLocation = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { lat, lon } = req.body;

    if (typeof lat !== 'number' || typeof lon !== 'number') {
      return res.status(400).json({ success: false, message: 'lat and lon (numbers) are required.' });
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return res.status(400).json({ success: false, message: 'Invalid coordinates.' });
    }

    const { locationLabel, gpsJump } = await updateUserLocation(userId, lat, lon);

    return res.status(200).json({
      success: true,
      message: 'Location updated.',
      data: { lat, lon, locationLabel, gpsJump: Math.round(gpsJump * 10) / 10 },
    });
  } catch (err) {
    console.error('updateLocation error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update location.' });
  }
};
