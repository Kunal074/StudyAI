/**
 * routes/notes.js
 * ─────────────────────────────────────────────
 * All notes endpoints — ab user-specific hain
 *
 *  POST   /api/notes              → Generate English notes via Gemini
 *  POST   /api/notes/translate    → Translate notes to Hinglish
 *  POST   /api/notes/save         → Save note to MongoDB
 *  GET    /api/notes/all          → Get logged-in user ke saare notes
 *  GET    /api/notes/search       → Topic se search karo
 *  DELETE /api/notes/:id          → Delete a note
 */

const express = require('express');
const router  = express.Router();
const Note    = require('../models/Note');
const protect = require('../middleware/auth');

// ── Gemini API config ─────────────────────────────────────────────────────────
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

// ── Helper: Gemini call karo ──────────────────────────────────────────────────
async function callGemini(prompt) {
  const response = await fetch(GEMINI_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini error: ${response.status}`);
  }

  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}

// ── POST /api/notes ───────────────────────────────────────────────────────────
// Generate English notes — no auth needed (search is public)
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
// Save note to MongoDB — protected (login required)
router.post('/notes/save', protect, async (req, res) => {
  const { query, notes, hinglish = null, source = 'manual' } = req.body;

  if (!query || !notes) {
    return res.status(400).json({
      success: false,
      error:   'query and notes are required'
    });
  }

  try {
    // Check karo agar same query ka note already hai is user ka
    const existing = await Note.findOne({
      user:  req.user._id,
      query: { $regex: new RegExp(`^${query}$`, 'i') } // case insensitive
    });

    if (existing) {
      // Update karo existing note
      existing.notes    = notes;
      existing.hinglish = hinglish;
      existing.source   = source;
      await existing.save();

      return res.json({
        success: true,
        note:    existing,
        message: 'Note updated'
      });
    }

    // Naya note banao
    const note = await Note.create({
      user:  req.user._id,
      query,
      notes,
      hinglish,
      source
    });

    return res.status(201).json({
      success: true,
      note,
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
// Get all notes of logged-in user — newest first
router.get('/notes/all', protect, async (req, res) => {
  try {
    const notes = await Note.find({ user: req.user._id })
      .sort({ createdAt: -1 }) // newest first
      .select('-__v');          // __v field exclude karo

    return res.json({
      success: true,
      count:   notes.length,
      notes
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
// Search notes by topic — only logged-in user ke notes mein
router.get('/notes/search', protect, async (req, res) => {
  const { q } = req.query;
  // /api/notes/search?q=photosynthesis

  if (!q || !q.trim()) {
    return res.status(400).json({
      success: false,
      error:   'Search query q is required'
    });
  }

  try {
    const notes = await Note.find({
      user:  req.user._id,
      // Search in query field and title
      $or: [
        { query:        { $regex: q, $options: 'i' } },
        { 'notes.title': { $regex: q, $options: 'i' } }
      ]
    })
    .sort({ createdAt: -1 })
    .select('-__v');

    return res.json({
      success: true,
      count:   notes.length,
      notes
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
// Delete a note — sirf apna note delete kar sakta hai user
router.delete('/notes/:id', protect, async (req, res) => {
  try {
    const note = await Note.findOne({
      _id:  req.params.id,
      user: req.user._id    // ensure ownership
    });

    if (!note) {
      return res.status(404).json({
        success: false,
        error:   'Note not found'
      });
    }

    await note.deleteOne();

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
- Sentences Hindi structure mein but English words freely use karo
- Simple aur conversational rakho jaise ek dost explain kar raha ho
- Pure Hindi ya pure English mat likho

Input JSON:
${JSON.stringify(notes, null, 2)}

Return SAME JSON structure with translated text.
Respond ONLY with raw JSON, no markdown, no backticks.`;
}

module.exports = router;