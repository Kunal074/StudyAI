/**
 * middleware/auth.js
 * ─────────────────────────────────────────────
 * JWT Authentication Middleware.
 *
 * Kaam kya karta hai:
 *  - Har protected route pe pehle yeh run hota hai
 *  - Request header se JWT token nikalta hai
 *  - Token verify karta hai
 *  - Agar valid → user info req.user mein daal deta hai
 *  - Agar invalid → 401 error return karta hai
 *
 * Usage:
 *  router.get('/protected', protect, (req, res) => {
 *    res.json({ user: req.user });
 *  });
 */

const jwt  = require('jsonwebtoken');
const User = require('../models/user');

// ── Protect middleware ────────────────────────────────────────────────────────
const protect = async (req, res, next) => {

  try {
    // ── Step 1: Token nikalo header se ───────────────────────────────────────
    // Frontend token bhejta hai is format mein:
    // Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error:   'Access denied. Please login first.'
      });
    }

    // "Bearer TOKEN" se sirf TOKEN nikalo
    const token = authHeader.split(' ')[1];

    // ── Step 2: Token verify karo ─────────────────────────────────────────────
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // decoded mein hoga: { id: 'user_id', iat: ..., exp: ... }

    // ── Step 3: User database se nikalo ──────────────────────────────────────
    // Password field exclude karo — security
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res.status(401).json({
        success: false,
        error:   'User not found. Please login again.'
      });
    }

    // ── Step 4: User info request mein attach karo ────────────────────────────
    // Ab kisi bhi route mein req.user se user info milegi
    req.user = user;

    // ── Step 5: Aage badhao ───────────────────────────────────────────────────
    next();

  } catch (err) {

    // Token expired ya invalid
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error:   'Session expired. Please login again.'
      });
    }

    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error:   'Invalid token. Please login again.'
      });
    }

    return res.status(500).json({
      success: false,
      error:   'Authentication failed.'
    });
  }
};

module.exports = protect;