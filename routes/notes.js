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
const apiLimiter = require('../middleware/usage');

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
// Generate English notes
router.post('/notes', protect, apiLimiter, async (req, res) => {
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
router.post('/notes/translate', protect, apiLimiter, async (req, res) => {
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
  return `You are an expert study-notes generator for students. Topic: "${query}"

Generate DETAILED and PRACTICAL study notes. Follow these rules strictly:

1. DEFINITION: Write 3-4 sentences. Cover what it is, why it exists, and where it's used.

2. KEY POINTS: Write exactly 6 key points. Each point must:
   - Be specific and informative (not vague)
   - Include actual values, numbers, or comparisons where possible
   - Example for CSS Units: "1rem = 16px by default (root font size). Use rem for scalable layouts."
   - Each point should be 1-2 sentences long

3. EXAMPLE: Give a real, practical example that a student can relate to.
   - Should explain HOW and WHY, not just what
   - Minimum 2-3 sentences

4. FORMULA/CODE: 
   - For programming topics: Write actual working code with comments
   - For math topics: Write the formula with explanation of each variable
   - For science topics: Write the equation or process
   - NEVER write just syntax — always write a complete working example
   - Minimum 4-5 lines of code with comments explaining each line
   - Example for CSS Units:
     /* Absolute units - fixed size */
     .box { font-size: 16px; }  /* always 16px */
     
     /* Relative units - scales with parent */
     .box { font-size: 1.5em; }  /* 1.5x parent font size */
     
     /* Root relative - scales with html */
     .box { font-size: 1rem; }   /* 1rem = 16px default */
     
     /* Viewport units */
     .box { width: 50vw; }       /* 50% of viewport width */

5. RELATED TOPICS: 3 closely related topics

Respond ONLY with valid JSON, no markdown, no backticks:

{
  "title": "Clear topic title",
  "definition": "3-4 sentence detailed definition explaining what, why, and where",
  "keyPoints": [
    "specific point with actual values/numbers",
    "specific point with actual values/numbers",
    "specific point with actual values/numbers",
    "specific point with actual values/numbers",
    "specific point with actual values/numbers",
    "specific point with actual values/numbers"
  ],
  "example": "Practical 2-3 sentence example with HOW and WHY",
  "formulaOrCode": "Complete working code/formula with comments — minimum 4 lines",
  "formulaLabel": "Language or type label e.g. CSS Example, Python Code, Math Formula",
  "relatedTopics": ["topic1", "topic2", "topic3"]
}`;
}

// ── Hinglish translate prompt ─────────────────────────────────────────────────
function buildTranslatePrompt(notes) {
  return `You are a Hinglish translator for Indian students. 

Convert these English study notes to Hinglish (Hindi + English mix).

Hinglish rules:
- Technical terms, code, formulas → NEVER translate (keep exactly as is)
- Sentences → Hindi structure with English words mixed naturally
- Sound like a Indian friend explaining, not a textbook
- Numbers and values → keep as is
- Code blocks → keep EXACTLY as is, do not translate any code
- Example of good Hinglish: "CSS mein rem unit use karte hain kyunki yeh root element ke font-size pe based hota hai, default 16px hota hai"

Input JSON:
${JSON.stringify(notes, null, 2)}

Rules for output:
- "formulaOrCode" field → NEVER translate, keep exactly as original
- "formulaLabel" → translate to hinglish
- "relatedTopics" → keep in English
- Everything else → translate to Hinglish

Respond ONLY with raw JSON, no markdown, no backticks.`;
}

// ── PUT /api/notes/:id — update a saved note's content ───────────────────────
router.put('/notes/:id', protect, async (req, res) => {
  const { notes } = req.body;
  if (!notes) {
    return res.status(400).json({ success: false, error: 'notes content is required' });
  }

  try {
    const { rows } = await db.query(
      `UPDATE notes SET notes = $1 WHERE id = $2 AND user_id = $3 RETURNING *`,
      [JSON.stringify(notes), req.params.id, req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Note not found or not yours' });
    }

    return res.json({ success: true, note: rows[0] });

  } catch (err) {
    console.error('[PUT /api/notes/:id]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to update note.' });
  }
});

module.exports = router;