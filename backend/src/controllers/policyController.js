import { createPolicy, activatePolicy, getActivePoliciesByUser, getPolicyById } from '../services/policyService.js';
import { verifyPaymentSignature } from '../services/razorpayService.js';
import { asyncHandler, createError } from '../utils/errorHandler.js';
import { TIER_PLANS, getQuoteById } from '../services/pricingService.js';
import prisma from '../config/db.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


// POST /api/policies/create — Create policy + Razorpay order
export const createPolicyHandler = asyncHandler(async (req, res) => {
  const { quote_id, plan_tier } = req.body;
  const userId = req.user.userId;

  if (!quote_id)                throw createError('quote_id is required.', 400);
  if (!UUID_REGEX.test(quote_id)) throw createError('quote_id must be a valid UUID.', 400);

  const { policy, razorpayOrder } = await createPolicy({ quoteId: quote_id, userId, planTier: plan_tier });

  res.status(201).json({
    success: true,
    data: {
      policyId:       policy.id,
      policyNumber:   policy.policyNumber,
      planTier:       policy.planTier,
      status:         policy.status,
      paymentStatus:  policy.paymentStatus,
      finalPremium:   parseFloat(policy.finalPremium),
      coverageAmount: parseFloat(policy.coverageAmount),
      validFrom:      policy.validFrom,
      validUntil:     policy.validUntil,
      currency:       'INR',
      razorpay: {
        orderId:   razorpayOrder.id,
        amount:    razorpayOrder.amount,
        currency:  razorpayOrder.currency,
        keyId:     process.env.RAZORPAY_KEY_ID,
      },
    },
  });
});

// POST /api/policies/verify-payment — Verify Razorpay signature + activate policy
export const verifyPaymentHandler = asyncHandler(async (req, res) => {
  const { policy_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!policy_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature)
    throw createError('policy_id, razorpay_order_id, razorpay_payment_id, and razorpay_signature are required.', 400);

  const isValid = verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
  if (!isValid) throw createError('Invalid payment signature. Payment verification failed.', 400);

  const policy = await activatePolicy({ policyId: policy_id, razorpayPaymentId: razorpay_payment_id });

  res.status(200).json({
    success: true,
    message: 'Payment verified. Policy is now active.',
    data: {
      policyId:      policy.id,
      policyNumber:  policy.policyNumber,
      status:        policy.status,
      paymentStatus: policy.paymentStatus,
      validFrom:     policy.validFrom,
      validUntil:    policy.validUntil,
    },
  });
});

// GET /api/policies/user — Get all policies for current user
export const getUserPolicies = asyncHandler(async (req, res) => {
  const userId   = req.user.userId;
  const policies = await getActivePoliciesByUser(userId);

  res.status(200).json({
    success: true,
    count: policies.length,
    data: policies.map((p) => ({
      policyId:        p.id,
      policyNumber:    p.policyNumber,
      planTier:        p.planTier,
      status:          p.status,
      paymentStatus:   p.paymentStatus,
      workType:        p.quote?.workType,
      city:            p.quote?.city,
      pincode:         p.quote?.pincode,
      zoneName:        p.quote?.zone?.zoneName,
      riskLevel:       p.quote?.zone?.riskLevel,
      riskBand:        p.quote?.riskBand,
      coverageTriggers: p.coverageTriggers,
      finalPremium:    parseFloat(p.finalPremium),
      coverageAmount:  parseFloat(p.coverageAmount),
      validFrom:       p.validFrom,
      validUntil:      p.validUntil,
      createdAt:       p.createdAt,
    })),
  });
});

// GET /api/policies/:policyId — Single policy detail
export const getPolicyHandler = asyncHandler(async (req, res) => {
  const policy = await getPolicyById(req.params.policyId);
  if (!policy) throw createError('Policy not found.', 404);
  res.status(200).json({ success: true, data: policy });
});

// POST /api/policies/demo-activate — Skip Razorpay for demo mode
// Marks any pending policy as paid without real payment verification.
export const demoActivateHandler = asyncHandler(async (req, res) => {
  const { policy_id } = req.body;
  if (!policy_id) throw createError('policy_id is required.', 400);

  const policy = await prisma.policy.update({
    where: { id: policy_id },
    data: {
      paymentStatus:    'paid',
      razorpayPaymentId: `demo_${Date.now()}`,
      status:           'active',
    },
  });

  res.status(200).json({
    success: true,
    message: 'Policy activated in demo mode.',
    data: {
      policyId:     policy.id,
      policyNumber: policy.policyNumber,
      status:       policy.status,
      paymentStatus: policy.paymentStatus,
    },
  });
});

// POST /api/policies/update-plan — Switch plan tier and recalculate premium dynamically
export const updatePlanHandler = asyncHandler(async (req, res) => {
  const { policy_id, plan_tier } = req.body;
  const userId = req.user.userId;

  if (!policy_id)  throw createError('policy_id is required.', 400);
  if (!plan_tier)  throw createError('plan_tier is required.', 400);

  const VALID_TIERS = ['basic', 'standard', 'premium'];
  if (!VALID_TIERS.includes(plan_tier))
    throw createError(`plan_tier must be one of: ${VALID_TIERS.join(', ')}.`, 400);

  // Load the policy and its associated quote
  const policy = await prisma.policy.findUnique({
    where: { id: policy_id },
    include: { quote: true },
  });

  if (!policy)               throw createError('Policy not found.', 404);
  if (policy.userId !== userId) throw createError('Unauthorized.', 403);
  if (policy.status !== 'active') throw createError('Only active policies can be updated.', 409);

  // Recalculate premium using existing quote's base premium + new tier multiplier
  const tierDef = TIER_PLANS.find((t) => t.tier === plan_tier);
  if (!tierDef) throw createError('Invalid plan tier definition.', 500);

  const basePremium = Number(policy.quote.finalPremium);
  const TIER_MIN = 20;
  const TIER_MAX = 120;
  const newPremium = Math.round(
    Math.max(TIER_MIN, Math.min(TIER_MAX, basePremium * tierDef.multiplier)) * 100
  ) / 100;

  // Coverage amount stays the same (2× weekly income cap), but we store the % change too
  const updatedPolicy = await prisma.policy.update({
    where: { id: policy_id },
    data: {
      planTier:     plan_tier,
      finalPremium: newPremium,
    },
  });

  res.status(200).json({
    success: true,
    message: `Plan updated to ${tierDef.name}.`,
    data: {
      policyId:           updatedPolicy.id,
      policyNumber:       updatedPolicy.policyNumber,
      planTier:           updatedPolicy.planTier,
      coverage:           tierDef.coverage,
      finalPremium:       parseFloat(updatedPolicy.finalPremium),
      coverageAmount:     parseFloat(updatedPolicy.coverageAmount),
      status:             updatedPolicy.status,
      explanation:        `Premium varies based on your location risk and selected coverage level. Your ${tierDef.name} plan provides ${tierDef.coverage}% income protection at ₹${newPremium}/week.`,
    },
  });
});
