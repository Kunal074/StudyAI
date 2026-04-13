/**
 * routes/notes.js
 * ─────────────────────────────────────────────
 * All notes endpoints — PostgreSQL ke saath
 *
 *  POST   /api/notes            → Generate English notes via Gemini
 *  POST   /api/notes/translate  → Translate notes to Hinglish
 *  POST   /api/notes/save       → Save note to PostgreSQL
 *  GET    /api/notes/all        → Logged-in user ke saare notes
 *  GET    /api/notes/search     → Topic se search karo
 *  DELETE /api/notes/:id        → Delete a note
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const protect = require('../middleware/auth');

/// ── Groq API config ───────────────────────────────────────────────────────────
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// ── Helper: Groq call karo ────────────────────────────────────────────────────
async function callGemini(prompt) {
  const response = await fetch(GROQ_URL, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model:    'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1500
    })
  });

  if (!response.ok) {
    throw new Error(`Groq error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// ── POST /api/notes ───────────────────────────────────────────────────────────
// Generate English notes — login required nahi
router.post('/notes', async (req, res) => {
  const { query } = req.body;

  if (!query || !query.trim()) {
    return res.status(400).json({
      success: false,
      error:   'Query is required'
    });
  }

  try {
    const raw   = await callGemini(buildPrompt(query));
    const notes = JSON.parse(raw.replace(/```json|```/g, '').trim());

    return res.json({ success: true, notes });

  } catch (err) {
    console.error('[/api/notes]', err.message);
    return res.status(500).json({
      success: false,
      error:   'Failed to generate notes. Try again.'
    });
  }
});

// ── POST /api/notes/translate ─────────────────────────────────────────────────
// Translate English notes to Hinglish
router.post('/notes/translate', async (req, res) => {
  const { notes } = req.body;

  if (!notes) {
    return res.status(400).json({
      success: false,
      error:   'notes object is required'
    });
  }

  try {
    const raw        = await callGemini(buildTranslatePrompt(notes));
    const translated = JSON.parse(raw.replace(/```json|```/g, '').trim());

    return res.json({ success: true, notes: translated });

  } catch (err) {
    console.error('[/api/notes/translate]', err.message);
    return res.status(500).json({
      success: false,
      error:   'Translation failed. Try again.'
    });
  }
});

// ── POST /api/notes/save ──────────────────────────────────────────────────────
// Save note to PostgreSQL — login required
router.post('/notes/save', protect, async (req, res) => {
  const { query, notes, hinglish = null, source = 'manual' } = req.body;

  if (!query || !notes) {
    return res.status(400).json({
      success: false,
      error:   'query and notes are required'
    });
  }

  try {
    // Check karo same query ka note already hai is user ka
    const existing = await db.query(
      `SELECT id FROM notes
       WHERE user_id = $1
       AND LOWER(query) = LOWER($2)`,
      [req.user.id, query]
    );

    if (existing.rows.length > 0) {
      // Update karo existing note
      const { rows } = await db.query(
        `UPDATE notes
         SET notes      = $1,
             hinglish   = $2,
             source     = $3,
             updated_at = NOW()
         WHERE id = $4
         RETURNING *`,
        [JSON.stringify(notes), hinglish ? JSON.stringify(hinglish) : null, source, existing.rows[0].id]
      );

      return res.json({
        success: true,
        note:    rows[0],
        message: 'Note updated'
      });
    }

    // Naya note banao
    const { rows } = await db.query(
      `INSERT INTO notes (user_id, query, notes, hinglish, source)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.user.id, query, JSON.stringify(notes), hinglish ? JSON.stringify(hinglish) : null, source]
    );

    return res.status(201).json({
      success: true,
      note:    rows[0],
      message: 'Note saved'
    });

  } catch (err) {
    console.error('[/api/notes/save]', err.message);
    return res.status(500).json({
      success: false,
      error:   'Failed to save note.'
    });
  }
});

// ── GET /api/notes/all ────────────────────────────────────────────────────────
// Logged-in user ke saare notes — newest first
router.get('/notes/all', protect, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM notes
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    return res.json({
      success: true,
      count:   rows.length,
      notes:   rows
    });

  } catch (err) {
    console.error('[/api/notes/all]', err.message);
    return res.status(500).json({
      success: false,
      error:   'Failed to fetch notes.'
    });
  }
});

// ── GET /api/notes/search ─────────────────────────────────────────────────────
// Apne notes mein search karo topic se
router.get('/notes/search', protect, async (req, res) => {
  const { q } = req.query;

  if (!q || !q.trim()) {
    return res.status(400).json({
      success: false,
      error:   'Search query q is required'
    });
  }

  try {
    const { rows } = await db.query(
      `SELECT * FROM notes
       WHERE user_id = $1
       AND (
         LOWER(query) LIKE LOWER($2)
         OR LOWER(notes->>'title') LIKE LOWER($2)
       )
       ORDER BY created_at DESC`,
      [req.user.id, `%${q}%`]
    );

    return res.json({
      success: true,
      count:   rows.length,
      notes:   rows
    });

  } catch (err) {
    console.error('[/api/notes/search]', err.message);
    return res.status(500).json({
      success: false,
      error:   'Search failed.'
    });
  }
});

// ── DELETE /api/notes/:id ─────────────────────────────────────────────────────
// Sirf apna note delete kar sakta hai
router.delete('/notes/:id', protect, async (req, res) => {
  try {
    const { rows } = await db.query(
      `DELETE FROM notes
       WHERE id = $1
       AND user_id = $2
       RETURNING id`,
      [req.params.id, req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error:   'Note not found'
      });
    }

    return res.json({
      success: true,
      message: 'Note deleted'
    });

  } catch (err) {
    console.error('[/api/notes/:id]', err.message);
    return res.status(500).json({
      success: false,
      error:   'Failed to delete note.'
    });
  }
});

// ── English notes prompt ──────────────────────────────────────────────────────
function buildPrompt(query) {
  return `You are an expert study-notes generator. Topic: "${query}"

Respond ONLY with a valid JSON object. No markdown, no backticks, just raw JSON:

{
  "title": "Clear topic title",
  "definition": "2-3 sentence definition in simple English",
  "keyPoints": ["point 1", "point 2", "point 3", "point 4", "point 5"],
  "example": "One concrete real-world example",
  "formulaOrCode": "Formula or code snippet if relevant, else empty string",
  "formulaLabel": "Label like 'Python Example' or empty string",
  "relatedTopics": ["topic1", "topic2", "topic3"]
}`;
}

// ── Hinglish translate prompt ─────────────────────────────────────────────────
function buildTranslatePrompt(notes) {
  return `You are a Hinglish translator. Convert these English study notes to Hinglish.

Hinglish rules:
- Mix Hindi and English naturally jaise Indians bolte hain
- Technical words English mein rehne do
- Simple aur conversational rakho jaise ek dost explain kar raha ho
- Pure Hindi ya pure English mat likho

Input JSON:
${JSON.stringify(notes, null, 2)}

Return SAME JSON structure with translated text.
Respond ONLY with raw JSON, no markdown, no backticks.`;
}

module.exports = router;