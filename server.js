/**
 * server.js
 * ─────────────────────────────────────────────
 * Main entry point — StudyAI Backend
 *
 * Kaam karta hai:
 *  1. Environment variables load karo
 *  2. MongoDB se connect karo
 *  3. Express app banao
 *  4. Middleware lagao
 *  5. Routes mount karo
 *  6. Server start karo
 */

require('dotenv').config(); // sabse pehle — .env load karo

const express  = require('express');
const mongoose = require('mongoose');
const path     = require('path');
const cors     = require('cors');

// ── Routes import ─────────────────────────────────────────────────────────────
const authRouter  = require('./routes/auth');
const notesRouter = require('./routes/notes');

// ── Express app ───────────────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────

// JSON body parse karo
app.use(express.json());

// CORS — extension aur frontend dono allow karo
app.use(cors({
  origin:         '*',
  methods:        ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Static files — public folder serve karo
app.use(express.static(path.join(__dirname, 'public')));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',  authRouter);   // /api/auth/signup, /api/auth/login
app.use('/api',       notesRouter);  // /api/notes, /api/notes/save, etc.

// ── Catch-all — frontend serve karo ──────────────────────────────────────────
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── MongoDB connect + Server start ────────────────────────────────────────────
async function startServer() {
  try {
    // MongoDB se connect karo
    await mongoose.connect(process.env.MONGODB_URI);

    console.log('\n─────────────────────────────────');
    console.log('  ✅ MongoDB connected!');

    // Server start karo sirf MongoDB connect hone ke baad
    app.listen(PORT, () => {
      console.log(`  🚀 StudyAI running!`);
      console.log(`  http://localhost:${PORT}`);
      console.log('─────────────────────────────────\n');
    });

  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1); // server band kar do agar DB connect na ho
  }
}

startServer();