/**
 * db.js
 * ─────────────────────────────────────────────
 * PostgreSQL connection setup using 'pg' library.
 *
 * Supports two modes:
 *  1. DATABASE_URL  — used by Neon / Railway / cloud providers
 *  2. Individual vars — DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD (local dev)
 *
 * SSL is required by Neon (and most cloud Postgres providers).
 */

const { Pool } = require('pg');

// ── Build pool config ─────────────────────────────────────────────────────────
let poolConfig;

if (process.env.DATABASE_URL) {
  // Cloud mode — Neon / Railway / etc.
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }  // required by Neon
  };
} else {
  // Local dev mode — individual env vars
  poolConfig = {
    host:     process.env.DB_HOST,
    port:     process.env.DB_PORT     || 5432,
    database: process.env.DB_NAME,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  };
}

const pool = new Pool(poolConfig);

// ── Test connection on startup ────────────────────────────────────────────────
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ PostgreSQL connection failed:', err.message);
    return;
  }
  console.log('✅ PostgreSQL connected!');
  release();
});

// ── Helper ────────────────────────────────────────────────────────────────────
const db = {
  query: (text, params) => pool.query(text, params),
};

module.exports = db;