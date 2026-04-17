/**
 * routes/quiz.js
 * ─────────────────────────────────────────────
 * MCQ Quiz endpoints — Phase 2
 *
 *  POST /api/quiz/generate     → Generate 10 MCQs from a saved note (Groq)
 *  POST /api/quiz/submit       → Grade answers, return score + weak topics
 *  GET  /api/quiz/history      → Past quiz attempts for this user
 *  GET  /api/quiz/note/:note_id → Existing quiz for a note (avoid regenerating)
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const protect = require('../middleware/auth');
const apiLimiter = require('../middleware/usage');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// ── Helper: call Groq ─────────────────────────────────────────────────────────
async function callGroq(prompt) {
  const res = await fetch(GROQ_URL, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model:      'llama-3.3-70b-versatile',
      messages:   [{ role: 'user', content: prompt }],
      max_tokens: 2500
    })
  });
  if (!res.ok) throw new Error(`Groq error: ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content;
}

// ── POST /api/quiz/generate ───────────────────────────────────────────────────
router.post('/quiz/generate', protect, apiLimiter, async (req, res) => {
  const { note_id } = req.body;

  if (!note_id) {
    return res.status(400).json({ success: false, error: 'note_id is required' });
  }

  try {
    // Fetch the note (must belong to this user)
    const { rows: noteRows } = await db.query(
      'SELECT * FROM notes WHERE id = $1 AND user_id = $2',
      [note_id, req.user.id]
    );
    if (noteRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Note not found' });
    }

    const note = noteRows[0];

    // Check for a recent quiz (within last 7 days) — avoid regenerating
    const { rows: existing } = await db.query(
      `SELECT * FROM quizzes
       WHERE note_id = $1 AND user_id = $2
         AND created_at > NOW() - INTERVAL '7 days'
       ORDER BY created_at DESC
       LIMIT 1`,
      [note_id, req.user.id]
    );

    if (existing.length > 0) {
      return res.json({ success: true, quiz: existing[0], cached: true });
    }

    // Generate new quiz via Groq
    const prompt = buildQuizPrompt(note.query, note.notes);
    const raw    = await callGroq(prompt);
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());

    // Save to DB
    const { rows } = await db.query(
      `INSERT INTO quizzes (user_id, note_id, note_query, questions)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.user.id, note_id, note.query, JSON.stringify(parsed)]
    );

    return res.status(201).json({ success: true, quiz: rows[0], cached: false });

  } catch (err) {
    console.error('[/api/quiz/generate]', err.message);
    return res.status(500).json({ success: false, error: 'Quiz generation failed. Try again.' });
  }
});

// ── POST /api/quiz/submit ─────────────────────────────────────────────────────
router.post('/quiz/submit', protect, async (req, res) => {
  const { quiz_id, answers } = req.body;

  if (!quiz_id || !Array.isArray(answers)) {
    return res.status(400).json({ success: false, error: 'quiz_id and answers[] are required' });
  }

  try {
    const { rows } = await db.query(
      'SELECT * FROM quizzes WHERE id = $1 AND user_id = $2',
      [quiz_id, req.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Quiz not found' });
    }

    const quiz      = rows[0];
    const questions = quiz.questions.questions || quiz.questions;
    let   score     = 0;
    const breakdown = [];
    const weakTopics = [];

    questions.forEach((q, i) => {
      const userAnswer = answers[i] ?? -1;
      const correct    = q.correct;
      const isCorrect  = userAnswer === correct;

      if (isCorrect) {
        score++;
      } else {
        // Trim long question text for weak topics display
        const shortQ = q.question.length > 60
          ? q.question.slice(0, 57) + '…'
          : q.question;
        weakTopics.push(shortQ);
      }

      breakdown.push({
        id:          q.id || (i + 1),
        question:    q.question,
        options:     q.options,
        userAnswer,
        correct,
        isCorrect,
        explanation: q.explanation || ''
      });
    });

    // Persist attempt
    await db.query(
      `INSERT INTO quiz_attempts (user_id, quiz_id, answers, score, total, weak_topics)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.user.id, quiz_id, JSON.stringify(answers), score, questions.length, JSON.stringify(weakTopics)]
    );

    return res.json({
      success:    true,
      score,
      total:      questions.length,
      percentage: Math.round((score / questions.length) * 100),
      breakdown,
      weakTopics,
      noteQuery:  quiz.note_query
    });

  } catch (err) {
    console.error('[/api/quiz/submit]', err.message);
    return res.status(500).json({ success: false, error: 'Submission failed. Try again.' });
  }
});

// ── GET /api/quiz/history ─────────────────────────────────────────────────────
router.get('/quiz/history', protect, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT qa.id, qa.score, qa.total, qa.weak_topics, qa.completed_at,
              q.note_query
       FROM quiz_attempts qa
       JOIN quizzes q ON qa.quiz_id = q.id
       WHERE qa.user_id = $1
       ORDER BY qa.completed_at DESC
       LIMIT 20`,
      [req.user.id]
    );

    return res.json({ success: true, attempts: rows });

  } catch (err) {
    console.error('[/api/quiz/history]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to load history.' });
  }
});

// ── GET /api/quiz/note/:note_id ───────────────────────────────────────────────
router.get('/quiz/note/:note_id', protect, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM quizzes
       WHERE note_id = $1 AND user_id = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [req.params.note_id, req.user.id]
    );

    return res.json({ success: true, quiz: rows[0] || null });

  } catch (err) {
    console.error('[/api/quiz/note/:note_id]', err.message);
    return res.status(500).json({ success: false, error: 'Failed.' });
  }
});

// ── POST /api/quiz/generate-all ──────────────────────────────────────────────
// Generate a combined quiz from ALL of the user's saved notes (up to 8 most recent)
router.post('/quiz/generate-all', protect, apiLimiter, async (req, res) => {
  try {
    const { rows: notes } = await db.query(
      `SELECT id, query, notes FROM notes WHERE user_id = $1 ORDER BY created_at DESC LIMIT 8`,
      [req.user.id]
    );

    if (notes.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No saved notes found. Save some notes first!'
      });
    }

    const questionCount = Math.min(15, notes.length * 2 + 3);
    const prompt = buildAllNotesQuizPrompt(notes, questionCount);
    const raw    = await callGroq(prompt);
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());

    if (!parsed.questions?.length) throw new Error('AI returned 0 questions');

    const label = `All Notes Quiz (${notes.length} topic${notes.length > 1 ? 's' : ''})`;

    // note_id is NULL because this spans multiple notes
    const { rows } = await db.query(
      `INSERT INTO quizzes (user_id, note_id, note_query, questions)
       VALUES ($1, NULL, $2, $3)
       RETURNING *`,
      [req.user.id, label, JSON.stringify(parsed)]
    );

    return res.status(201).json({ success: true, quiz: rows[0], cached: false });

  } catch (err) {
    console.error('[/api/quiz/generate-all]', err.message);
    return res.status(500).json({ success: false, error: 'Quiz generation failed. Try again.' });
  }
});

function buildAllNotesQuizPrompt(notes, questionCount) {
  const topicBlocks = notes.map((n, i) =>
    `--- Topic ${i + 1}: "${n.query}" ---\n${JSON.stringify(n.notes, null, 1)}`
  ).join('\n\n');

  return `You are an expert quiz creator. Create a MIXED quiz covering ALL the topics below.

${topicBlocks}

Requirements:
- Generate EXACTLY ${questionCount} multiple choice questions
- Spread questions EVENLY across all ${notes.length} topics (~${Math.ceil(questionCount / notes.length)} per topic)
- Mention the topic name in each question so it's clear which topic it refers to
- Each question has EXACTLY 4 options (plain text, no A/B/C/D prefix)
- "correct" is the 0-based index of the correct option (0, 1, 2, or 3)
- Mix difficulty: easy, medium, hard
- Each explanation must reference the relevant topic notes

Respond ONLY with valid JSON, no markdown, no backticks:

{
  "questions": [
    {
      "id": 1,
      "question": "Question text here?",
      "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
      "correct": 0,
      "explanation": "Explanation referencing the notes..."
    }
  ]
}`;
}


function buildQuizPrompt(query, notes) {
  return `You are an expert quiz creator for students. Create a quiz ONLY from the study notes provided below.

Topic: "${query}"
Notes:
${JSON.stringify(notes, null, 2)}

Requirements:
- Generate EXACTLY 10 multiple choice questions
- ALL questions must be based ONLY on the notes content above — no outside knowledge
- Each question has EXACTLY 4 options (just the text, no A/B/C/D prefix)
- "correct" is the 0-based index of the correct option (0, 1, 2, or 3)
- Vary difficulty: 3 easy, 4 medium, 3 hard
- Cover: definition, key points, example, and formula/code (if in notes)
- Each explanation must reference something specifically from the notes

Respond ONLY with valid JSON, no markdown, no backticks:

{
  "questions": [
    {
      "id": 1,
      "question": "Question text here?",
      "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
      "correct": 0,
      "explanation": "Explanation from the notes..."
    }
  ]
}`;
}

module.exports = router;
