import Razorpay from 'razorpay';
import crypto from 'crypto';
import { config } from '../config/env.js';

const razorpay = new Razorpay({
  key_id: config.razorpay.keyId,
  key_secret: config.razorpay.keySecret,
});

/**
 * Create a Razorpay order
 * @param {number} amountInPaise - Amount in paise (1 INR = 100 paise)
 * @param {string} receipt - Unique receipt identifier
 * @param {object} notes - Optional metadata
 */
export const createOrder = async (amountInPaise, receipt, notes = {}) => {
  const order = await razorpay.orders.create({
    amount: amountInPaise,
    currency: 'INR',
    receipt: receipt.slice(0, 40), // Razorpay receipt max 40 chars
    notes,
    payment_capture: true,
  });
  return order;
};

/**
 * Verify Razorpay payment signature (HMAC-SHA256)
 * @param {string} orderId - Razorpay order_id
 * @param {string} paymentId - Razorpay payment_id from client
 * @param {string} signature - Razorpay signature from client
 * @returns {boolean}
 */
export const verifyPaymentSignature = (orderId, paymentId, signature) => {
  const expectedSignature = crypto
    .createHmac('sha256', config.razorpay.keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return expectedSignature === signature;
};

/**
 * Fetch payment details from Razorpay (for server-side verification)
 */
export const fetchPayment = async (paymentId) => {
  return razorpay.payments.fetch(paymentId);
};

export default razorpay;
