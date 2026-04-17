-- ══════════════════════════════════════════════════════════════════════
-- StudyAI Phase 2 — Database Migration
-- Run this ONCE in your PostgreSQL database: studyai
-- ══════════════════════════════════════════════════════════════════════

-- ── Feature 1: Quiz Tables ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS quizzes (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id)  ON DELETE CASCADE,
  note_id     INTEGER REFERENCES notes(id)  ON DELETE CASCADE,
  note_query  TEXT    NOT NULL,
  questions   JSONB   NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER REFERENCES users(id)   ON DELETE CASCADE,
  quiz_id      INTEGER REFERENCES quizzes(id) ON DELETE CASCADE,
  answers      JSONB   NOT NULL,
  score        INTEGER NOT NULL,
  total        INTEGER NOT NULL,
  weak_topics  JSONB,
  completed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Feature 2: Collaboration Tables ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS note_shares (
  id           SERIAL PRIMARY KEY,
  note_id      INTEGER REFERENCES notes(id) ON DELETE CASCADE,
  owner_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
  share_token  VARCHAR(64) UNIQUE NOT NULL,
  permission   VARCHAR(10) DEFAULT 'view',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS note_collaborators (
  id        SERIAL PRIMARY KEY,
  share_id  INTEGER REFERENCES note_shares(id) ON DELETE CASCADE,
  user_id   INTEGER REFERENCES users(id)       ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(share_id, user_id)
);

CREATE TABLE IF NOT EXISTS note_comments (
  id         SERIAL PRIMARY KEY,
  note_id    INTEGER REFERENCES notes(id) ON DELETE CASCADE,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  user_name  TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Verify
SELECT 'Migration complete! Tables created:' AS status;
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('quizzes','quiz_attempts','note_shares','note_collaborators','note_comments');
