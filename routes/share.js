/**
 * routes/share.js
 * ─────────────────────────────────────────────
 * Collaborative note sharing endpoints — Phase 2
 *
 *  POST   /api/share/create               → Create a share link (owner)
 *  GET    /api/share/:token               → Get note by share token (public)
 *  POST   /api/share/:token/join          → Join as collaborator (auth)
 *  GET    /api/share/:token/collaborators → List collaborators (auth)
 *  DELETE /api/share/:token               → Revoke share link (owner only)
 *  POST   /api/share/:token/comment       → Post a comment (auth)
 *  GET    /api/share/:token/comments      → Get all comments (public)
 */

const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const db      = require('../db');
const protect = require('../middleware/auth');

// ── POST /api/share/create ────────────────────────────────────────────────────
router.post('/share/create', protect, async (req, res) => {
  const { note_id, permission = 'view' } = req.body;

  if (!note_id) {
    return res.status(400).json({ success: false, error: 'note_id is required' });
  }

  try {
    // Verify note ownership
    const { rows: noteRows } = await db.query(
      'SELECT id FROM notes WHERE id = $1 AND user_id = $2',
      [note_id, req.user.id]
    );
    if (noteRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Note not found' });
    }

    // Check if a share already exists for this note
    const { rows: existing } = await db.query(
      'SELECT * FROM note_shares WHERE note_id = $1 AND owner_id = $2',
      [note_id, req.user.id]
    );

    if (existing.length > 0) {
      // Update permission if changed
      if (existing[0].permission !== permission) {
        await db.query(
          'UPDATE note_shares SET permission = $1 WHERE id = $2',
          [permission, existing[0].id]
        );
        existing[0].permission = permission;
      }

      const shareUrl = buildShareUrl(req, existing[0].share_token);
      return res.json({
        success: true,
        token:      existing[0].share_token,
        permission: existing[0].permission,
        shareUrl
      });
    }

    // Create a new share token
    const token = crypto.randomUUID();
    await db.query(
      `INSERT INTO note_shares (note_id, owner_id, share_token, permission)
       VALUES ($1, $2, $3, $4)`,
      [note_id, req.user.id, token, permission]
    );

    return res.status(201).json({
      success: true,
      token,
      permission,
      shareUrl: buildShareUrl(req, token)
    });

  } catch (err) {
    console.error('[/api/share/create]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to create share link.' });
  }
});

// ── GET /api/share/:token ─────────────────────────────────────────────────────
// Public — returns note content + share metadata
router.get('/share/:token', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT ns.share_token, ns.permission, ns.note_id,
              n.query, n.notes, n.hinglish, n.created_at AS note_created_at,
              u.name AS owner_name
       FROM   note_shares ns
       JOIN   notes  n ON ns.note_id  = n.id
       JOIN   users  u ON ns.owner_id = u.id
       WHERE  ns.share_token = $1`,
      [req.params.token]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Share link not found or has been revoked.'
      });
    }

    const s = rows[0];
    return res.json({
      success: true,
      share: {
        token:      s.share_token,
        permission: s.permission,
        ownerName:  s.owner_name,
        noteId:     s.note_id,
        query:      s.query,
        notes:      s.notes,
        hinglish:   s.hinglish
      }
    });

  } catch (err) {
    console.error('[/api/share/:token GET]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to load shared note.' });
  }
});

// ── POST /api/share/:token/join ───────────────────────────────────────────────
router.post('/share/:token/join', protect, async (req, res) => {
  try {
    const { rows: shareRows } = await db.query(
      'SELECT id FROM note_shares WHERE share_token = $1',
      [req.params.token]
    );
    if (shareRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Share not found' });
    }

    await db.query(
      `INSERT INTO note_collaborators (share_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (share_id, user_id) DO NOTHING`,
      [shareRows[0].id, req.user.id]
    );

    return res.json({ success: true });

  } catch (err) {
    console.error('[/api/share/:token/join]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to join.' });
  }
});

// ── GET /api/share/:token/collaborators ───────────────────────────────────────
router.get('/share/:token/collaborators', protect, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT u.name, u.email, nc.joined_at
       FROM   note_collaborators nc
       JOIN   note_shares ns ON nc.share_id = ns.id
       JOIN   users u        ON nc.user_id  = u.id
       WHERE  ns.share_token = $1
       ORDER  BY nc.joined_at DESC`,
      [req.params.token]
    );

    return res.json({ success: true, collaborators: rows });

  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed.' });
  }
});

// ── DELETE /api/share/:token ──────────────────────────────────────────────────
router.delete('/share/:token', protect, async (req, res) => {
  try {
    const { rows } = await db.query(
      `DELETE FROM note_shares
       WHERE share_token = $1 AND owner_id = $2
       RETURNING id`,
      [req.params.token, req.user.id]
    );

    if (rows.length === 0) {
      return res.status(403).json({ success: false, error: 'Not authorized to revoke this link.' });
    }

    return res.json({ success: true, message: 'Share link revoked.' });

  } catch (err) {
    console.error('[/api/share/:token DELETE]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to revoke.' });
  }
});

// ── POST /api/share/:token/comment ────────────────────────────────────────────
router.post('/share/:token/comment', protect, async (req, res) => {
  const { content } = req.body;

  if (!content?.trim()) {
    return res.status(400).json({ success: false, error: 'Comment content is required' });
  }

  try {
    const { rows: shareRows } = await db.query(
      'SELECT note_id FROM note_shares WHERE share_token = $1',
      [req.params.token]
    );
    if (shareRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Share not found' });
    }

    const { rows } = await db.query(
      `INSERT INTO note_comments (note_id, user_id, user_name, content)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [shareRows[0].note_id, req.user.id, req.user.name, content.trim()]
    );

    const comment = rows[0];

    // Broadcast to all users in this note's room via Socket.io
    const io = req.app.get('io');
    if (io) io.to(`room_${req.params.token}`).emit('new_comment', comment);

    return res.status(201).json({ success: true, comment });

  } catch (err) {
    console.error('[/api/share/:token/comment]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to post comment.' });
  }
});

// ── GET /api/share/:token/comments ───────────────────────────────────────────
router.get('/share/:token/comments', async (req, res) => {
  try {
    const { rows: shareRows } = await db.query(
      'SELECT note_id FROM note_shares WHERE share_token = $1',
      [req.params.token]
    );
    if (shareRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Share not found' });
    }

    const { rows } = await db.query(
      `SELECT * FROM note_comments
       WHERE note_id = $1
       ORDER BY created_at ASC`,
      [shareRows[0].note_id]
    );

    return res.json({ success: true, comments: rows });

  } catch (err) {
    console.error('[/api/share/:token/comments]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to load comments.' });
  }
});

// ── Helper ────────────────────────────────────────────────────────────────────
function buildShareUrl(req, token) {
  const host = req.get('host');
  const protocol = req.protocol;
  return `${protocol}://${host}/?token=${token}`;
}

module.exports = router;
