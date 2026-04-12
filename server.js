/**
 * server.js
 * ─────────────────────────────────────────────
 * Main entry point for the StudyAI Node.js backend.
 *
 * Responsibilities:
 *  1. Create Express app
 *  2. Apply middleware (JSON parsing, static files, CORS)
 *  3. Mount API routes
 *  4. Start the server
 */

const express = require('express');
const path    = require('path');
const cors    = require('cors');

// ── Import routes ─────────────────────────────────────────────────────────────
const notesRouter = require('./routes/notes');

// ── Create Express app ────────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────

// 1. Parse incoming JSON request bodies
app.use(express.json());

// 2. CORS — allow Chrome extension + any local frontend to call the API
//    The extension runs from a chrome-extension:// origin, so we allow all
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

// 3. Serve the frontend (public folder)
//    index.html, CSS, JS files are served from here
app.use(express.static(path.join(__dirname, 'public')));

// ── Mount API routes ──────────────────────────────────────────────────────────
// All note-related endpoints live under /api
app.use('/api', notesRouter);

// ── Catch-all route ───────────────────────────────────────────────────────────
// For any unknown route, serve index.html
// This allows the frontend to handle its own navigation
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('\n─────────────────────────────────');
  console.log(`  🚀 StudyAI running!`);
  console.log(`  http://localhost:${PORT}`);
  console.log('─────────────────────────────────\n');
});
