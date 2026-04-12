/**
 * middleware/auth.js
 * ─────────────────────────────────────────────
 * JWT Authentication Middleware
 *
 * Kaam karta hai:
 *  1. Request header se token nikalo
 *  2. Token verify karo
 *  3. User PostgreSQL se fetch karo
 *  4. req.user mein daal do
 *  5. Next route pe jaao
 */

const jwt = require('jsonwebtoken');
const db  = require('../db');

const protect = async (req, res, next) => {
  try {

    // ── Step 1: Header se token nikalo ───────────────────────────────────────
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
    // decoded = { id: 1, iat: ..., exp: ... }

    // ── Step 3: User PostgreSQL se fetch karo ────────────────────────────────
    const { rows } = await db.query(
      'SELECT id, name, email, created_at FROM users WHERE id = $1',
      [decoded.id]
    );

    // User nahi mila
    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        error:   'User not found. Please login again.'
      });
    }

    // ── Step 4: User info request mein attach karo ───────────────────────────
    req.user = rows[0];

    // ── Step 5: Aage jaao ─────────────────────────────────────────────────────
    next();

  } catch (err) {

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