/**
 * db.js
 * ─────────────────────────────────────────────
 * PostgreSQL connection setup using 'pg' library.
 *
 * Pool use kar rahe hain — iska matlab:
 *  - Ek baar connect hota hai
 *  - Multiple requests ek saath handle kar sakta hai
 *  - Connection baar baar open/close nahi hoti
 */

const { Pool } = require('pg');

// ── Connection pool banao .env se ─────────────────────────────────────────────
const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     process.env.DB_PORT,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// ── Test connection on startup ────────────────────────────────────────────────
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ PostgreSQL connection failed:', err.message);
    return;
  }
  console.log('✅ PostgreSQL connected!');
  release(); // connection pool ko wapas do
});

// ── Helper function — query run karna easy ho jaye ────────────────────────────
// Pura app mein aise use hoga:
// const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [id]);
const db = {
  query: (text, params) => pool.query(text, params),
};

module.exports = db;