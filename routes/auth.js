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
const nodemailer = require('nodemailer');
const db       = require('../db');
const protect  = require('../middleware/auth');

const router   = express.Router();

// ── Mailer Setup ─────────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});


// ── Helper: JWT token generate karo ──────────────────────────────────────────
function generateToken(userId) {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// ── POST /api/auth/send-otp ───────────────────────────────────────────────────
router.post('/send-otp', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, error: 'Email is required' });

  try {
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) return res.status(400).json({ success: false, error: 'Email already registered. Please login.' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Delete any old OTP and insert new
    await db.query('DELETE FROM otp_requests WHERE email = $1', [email.toLowerCase()]);
    await db.query('INSERT INTO otp_requests (email, otp) VALUES ($1, $2)', [email.toLowerCase(), otp]);

    const mailOptions = {
      from: `"StudyAI" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'StudyAI - Your Verification Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 10px;">
          <h2 style="color: #4f46e5;">Welcome to StudyAI!</h2>
          <p>Please use the verification code below to complete your sign-up process. This code will expire in 10 minutes.</p>
          <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px;">
            ${otp}
          </div>
          <p style="font-size: 12px; color: #888; margin-top: 20px;">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    return res.json({ success: true, message: 'OTP sent to email.' });

  } catch (err) {
    console.error('[/api/auth/send-otp]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to send OTP.' });
  }
});

// ── POST /api/auth/signup ─────────────────────────────────────────────────────
router.post('/signup', async (req, res) => {
  const { name, email, password, otp } = req.body;

  // ── Step 1: Validate ──────────────────────────────────────────────────────
  if (!name || !email || !password || !otp) {
    return res.status(400).json({
      success: false,
      error:   'Name, email, password and OTP are required'
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

    // ── Step 2.5: Verify OTP ──────────────────────────────────────────────────
    const otpRes = await db.query(
      'SELECT created_at FROM otp_requests WHERE email = $1 AND otp = $2',
      [email.toLowerCase(), otp.trim()]
    );

    if (otpRes.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'Invalid or missing OTP.' });
    }

    const createdAt = new Date(otpRes.rows[0].created_at);
    const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
    if (createdAt < tenMinsAgo) {
      return res.status(400).json({ success: false, error: 'OTP has expired. Request a new one.' });
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

    // Cleanup OTP
    await db.query('DELETE FROM otp_requests WHERE email = $1', [email.toLowerCase()]);

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