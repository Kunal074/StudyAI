/**
 * server.js
 * ─────────────────────────────────────────────
 * Main entry point — StudyAI Backend (Phase 2)
 *
 *  1. Environment variables load karo
 *  2. PostgreSQL connect check karo
 *  3. Express app banao + Socket.io wrap karo
 *  4. Middleware lagao
 *  5. All routes mount karo
 *  6. Socket.io room events handle karo
 *  7. Server start karo
 */

require('dotenv').config();

const express    = require('express');
const http       = require('http');
const path       = require('path');
const cors       = require('cors');
const { Server } = require('socket.io');
const db         = require('./db');

// ── Routes ────────────────────────────────────────────────────────────────────
const authRouter  = require('./routes/auth');
const notesRouter = require('./routes/notes');
const quizRouter  = require('./routes/quiz');
const shareRouter = require('./routes/share');

// ── Express app ───────────────────────────────────────────────────────────────
const app        = express();
const httpServer = http.createServer(app);
const PORT       = process.env.PORT || 3000;

// ── Socket.io ─────────────────────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

io.on('connection', (socket) => {

  // User joins a shared note room
  socket.on('join_note', ({ token, user }) => {
    socket.join(`room_${token}`);
    socket.data.token = token;
    socket.data.user  = user;

    // Tell others in the room that someone joined
    socket.to(`room_${token}`).emit('user_joined', user);
    console.log(`[socket] ${user?.name || 'Guest'} joined room_${token}`);
  });

  // User disconnects — notify room
  socket.on('disconnect', () => {
    if (socket.data?.token) {
      socket.to(`room_${socket.data.token}`).emit('user_left', socket.data.user);
    }
  });

});

// Make io accessible inside route handlers via req.app.get('io')
app.set('io', io);

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());

app.use(cors({
  origin:         '*',
  methods:        ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.static(path.join(__dirname, 'public')));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);   // signup, login, me
app.use('/api',      notesRouter);  // notes CRUD + Groq generation
app.use('/api',      quizRouter);   // Phase 2: quiz generate, submit, history
app.use('/api',      shareRouter);  // Phase 2: share links, comments

// ── Catch-all — frontend serve karo ──────────────────────────────────────────
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Server start ──────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log('\n─────────────────────────────────');
  console.log('  🚀 StudyAI running!');
  console.log(`  http://localhost:${PORT}`);
  console.log('  🔌 Socket.io enabled');
  console.log('─────────────────────────────────\n');
});