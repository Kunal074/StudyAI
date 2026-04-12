/**
 * server.js
 * ─────────────────────────────────────────────
 * Main entry point — StudyAI Backend
 *
 * Kaam karta hai:
 *  1. Environment variables load karo
 *  2. PostgreSQL connect check karo
 *  3. Express app banao
 *  4. Middleware lagao
 *  5. Routes mount karo
 *  6. Server start karo
 */

require('dotenv').config(); // sabse pehle

const express = require('express');
const path    = require('path');
const cors    = require('cors');
const db      = require('./db'); // PostgreSQL connection

// ── Routes ────────────────────────────────────────────────────────────────────
const authRouter  = require('./routes/auth');
const notesRouter = require('./routes/notes');

// ── Express app ───────────────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────

// JSON body parse karo
app.use(express.json());

// CORS — extension aur frontend allow karo
app.use(cors({
  origin:         '*',
  methods:        ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Static files — public folder
app.use(express.static(path.join(__dirname, 'public')));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);  // signup, login, me
app.use('/api',      notesRouter); // notes CRUD

// ── Catch-all — frontend serve karo ──────────────────────────────────────────
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Server start ──────────────────────────────────────────────────────────────
// PostgreSQL pool automatically connect hoti hai db.js mein
// Isliye seedha server start karo
app.listen(PORT, () => {
  console.log('\n─────────────────────────────────');
  console.log('  🚀 StudyAI running!');
  console.log(`  http://localhost:${PORT}`);
  console.log('─────────────────────────────────\n');
});