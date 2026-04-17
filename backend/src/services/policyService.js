import prisma from '../config/db.js';
import { v4 as uuidv4 } from 'uuid';
import { createOrder } from './razorpayService.js';
import { TIER_PLANS } from './pricingService.js';

const COVERAGE_TRIGGERS_DEFAULT = ['HEAVY_RAIN', 'FLOOD', 'SEVERE_AQI', 'HEATWAVE', 'ZONE_SHUTDOWN'];

/**
 * Generate a policy number like "SP-A1B2C3D4"
 */
const genPolicyNumber = () => `SP-${uuidv4().slice(0, 8).toUpperCase()}`;

/**
 * Create a new policy from a quote + create Razorpay order.
 * Policy starts with paymentStatus='pending' until payment is verified.
 */
export const createPolicy = async ({ quoteId, userId, planTier = 'standard' }) => {
  const quote = await prisma.pricingQuote.findUnique({
    where: { id: quoteId },
    include: { zone: true },
  });

  if (!quote) throw Object.assign(new Error('Quote not found.'), { statusCode: 404 });

  const expiresAt = new Date(quote.expiresAt);
  if (expiresAt < new Date()) {
    throw Object.assign(new Error('Quote has expired. Please request a new quote.'), { statusCode: 410 });
  }

  const tierDef = TIER_PLANS.find((t) => t.tier === planTier) || TIER_PLANS.find(t => t.tier === 'standard');
  const basePremium = Number(quote.finalPremium);
  const TIER_MIN = 20;
  const TIER_MAX = 120;
  const finalPremiumCalculated = Math.round(
    Math.max(TIER_MIN, Math.min(TIER_MAX, basePremium * tierDef.multiplier)) * 100
  ) / 100;

  const policyNumber = genPolicyNumber();
  const amountInPaise = Math.round(finalPremiumCalculated * 100);

  // Create Razorpay order
  const razorpayOrder = await createOrder(amountInPaise, policyNumber, {
    policyNumber,
    userId,
    quoteId,
  });

  // Create policy in DB (pending payment)
  const policy = await prisma.policy.create({
    data: {
      userId,
      quoteId,
      policyNumber,
      planTier: tierDef.tier,
      status: 'active', // will be valid once payment confirmed
      finalPremium: finalPremiumCalculated,
      coverageAmount: quote.coverageAmount,
      coverageTriggers: COVERAGE_TRIGGERS_DEFAULT,
      razorpayOrderId: razorpayOrder.id,
      paymentStatus: 'pending',
    },
  });

  return { policy, razorpayOrder };
};

/**
 * Activate policy after successful payment
 */
export const activatePolicy = async ({ policyId, razorpayPaymentId }) => {
  return prisma.policy.update({
    where: { id: policyId },
    data: {
      paymentStatus: 'paid',
      razorpayPaymentId,
      status: 'active',
    },
  });
};

/**
 * Get all active policies for a user (with zone info via quote join)
 */
export const getActivePoliciesByUser = async (userId) => {
  return prisma.policy.findMany({
    where: { userId },
    include: {
      quote: { include: { zone: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
};

/**
 * Get a single policy with all relations
 */
export const getPolicyById = async (policyId) => {
  return prisma.policy.findUnique({
    where: { id: policyId },
    include: {
      quote: { include: { zone: true } },
      claims: { include: { triggerEvent: true } },
    },
  });
};

/**
 * Expire overdue policies (called by scheduler)
 */
export const expireOverduePolicies = async () => {
  return prisma.policy.updateMany({
    where: { status: 'active', validUntil: { lt: new Date() } },
    data: { status: 'expired' },
  });
};
