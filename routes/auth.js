/**
 * routes/auth.js
 * ─────────────────────────────────────────────
 * Authentication endpoints:
 *
 *  POST /api/auth/signup  → New user register karo
 *  POST /api/auth/login   → Login karo, JWT token milega
 *  GET  /api/auth/me      → Apni profile dekho (protected)
 */

const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const db       = require('../db');
const protect  = require('../middleware/auth');

const router   = express.Router();

// ── Helper: JWT token generate karo ──────────────────────────────────────────
function generateToken(userId) {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// ── POST /api/auth/signup ─────────────────────────────────────────────────────
router.post('/signup', async (req, res) => {
  const { name, email, password } = req.body;

  // ── Step 1: Validate ──────────────────────────────────────────────────────
  if (!name || !email || !password) {
    return res.status(400).json({
      success: false,
      error:   'Name, email and password are required'
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      error:   'Password must be at least 6 characters'
    });
  }

  try {
    // ── Step 2: Email already exist karta hai? ────────────────────────────────
    const existing = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error:   'Email already registered. Please login.'
      });
    }

    // ── Step 3: Password hash karo ────────────────────────────────────────────
    const hashedPassword = await bcrypt.hash(password, 10);

    // ── Step 4: User banao ────────────────────────────────────────────────────
    const { rows } = await db.query(
      `INSERT INTO users (name, email, password)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, created_at`,
      [name, email.toLowerCase(), hashedPassword]
    );

    const user = rows[0];

    // ── Step 5: Token generate karo ───────────────────────────────────────────
    const token = generateToken(user.id);

    return res.status(201).json({
      success: true,
      token,
      user: {
        id:    user.id,
        name:  user.name,
        email: user.email
      }
    });

  } catch (err) {
    console.error('[/api/auth/signup]', err.message);
    return res.status(500).json({
      success: false,
      error:   'Signup failed. Please try again.'
    });
  }
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  // ── Step 1: Validate ──────────────────────────────────────────────────────
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error:   'Email and password are required'
    });
  }

  try {
    // ── Step 2: Email se user dhundo ──────────────────────────────────────────
    const { rows } = await db.query(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        error:   'Invalid email or password'
      });
    }

    const user = rows[0];

    // ── Step 3: Password check karo ───────────────────────────────────────────
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error:   'Invalid email or password'
      });
    }

    // ── Step 4: Token generate karo ───────────────────────────────────────────
    const token = generateToken(user.id);

    return res.json({
      success: true,
      token,
      user: {
        id:    user.id,
        name:  user.name,
        email: user.email
      }
    });

  } catch (err) {
    console.error('[/api/auth/login]', err.message);
    return res.status(500).json({
      success: false,
      error:   'Login failed. Please try again.'
    });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', protect, async (req, res) => {
  return res.json({
    success: true,
    user: {
      id:         req.user.id,
      name:       req.user.name,
      email:      req.user.email,
      created_at: req.user.created_at
    }
  });
});

module.exports = router;