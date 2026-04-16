import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

/**
 * JWT Authentication Middleware
 * Expects: Authorization: Bearer <token>
 */
export const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Missing or invalid Authorization header.' });
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = decoded; // { userId, phone, iat, exp }
    next();
  } catch (err) {
    const message = err.name === 'TokenExpiredError'
      ? 'Session expired. Please log in again.'
      : 'Invalid token. Please log in.';
    return res.status(401).json({ success: false, message });
  }
};

/**
 * Optional auth — attaches user if token present, doesn't block if missing
 */
export const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(authHeader.slice(7), config.jwtSecret);
    } catch {
      req.user = null;
    }
  }
  next();
};
