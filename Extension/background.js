/**
 * background.js
 * ─────────────────────────────────────────────
 * Chrome Extension Service Worker.
 * Runs in the background, always listening for messages.
 *
 * Handles these message types:
 *  1. GENERATE_AND_SAVE  → call StudyAI API + save note to chrome.storage
 *  2. GET_NOTES          → return all saved notes
 *  3. DELETE_NOTE        → delete a note by id
 *  4. CLEAR_ALL          → wipe everything
 *  5. SYNC_FROM_SERVER   → pull all notes from Node server into chrome.storage
 */

// ── Config ────────────────────────────────────────────────────────────────────
const API_BASE    = 'https://studyai-jptp.onrender.com/api';
const STORAGE_KEY = 'studyai_notes';

// ── Message Router ────────────────────────────────────────────────────────────
// Listens for messages from content.js and popup.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // Route to the correct handler based on message type
  switch (message.type) {

    case 'GENERATE_AND_SAVE':
      generateAndSave(message.query)
        .then(sendResponse);
      return true; // keeps the message channel open for async response

    case 'GET_NOTES':
      getNotes()
        .then(notes => sendResponse(notes));
      return true;

    case 'DELETE_NOTE':
      deleteNote(message.id)
        .then(sendResponse);
      return true;

    case 'CLEAR_ALL':
      clearAll()
        .then(sendResponse);
      return true;

    case 'SYNC_FROM_SERVER':
      syncFromServer()
        .then(sendResponse);
      return true;
  }

});

// ── Handler 1: Generate notes via API + save ──────────────────────────────────
async function generateAndSave(query) {
  try {
    // ── Step 1: Token lo localStorage se ─────────────────────────────────
    // App se token lenge — same user ke liye save hoga
    const tokenRes = await chrome.storage.local.get('studyai_token');
    const token    = tokenRes.studyai_token;

    if (!token) {
      return { 
        success: false, 
        error: 'Please login to StudyAI app first!' 
      };
    }

    // ── Step 2: Notes generate karo ───────────────────────────────────────
    const genResponse = await fetch('https://studyai-jptp.onrender.com/api/notes', {
      method:  'POST',
      headers: { 
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ query })
    });

    if (!genResponse.ok) throw new Error('Generation failed');
    const genData = await genResponse.json();
    if (!genData.success) throw new Error(genData.error);

    // ── Step 3: Note save karo server pe ─────────────────────────────────
    const saveResponse = await fetch('https://studyai-jptp.onrender.com/api/notes/save', {
      method:  'POST',
      headers: { 
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ 
        query, 
        notes:  genData.notes,
        source: 'auto'
      })
    });

    if (!saveResponse.ok) throw new Error('Save failed');
    const saveData = await saveResponse.json();
    if (!saveData.success) throw new Error(saveData.error);

    // ── Step 4: Chrome storage mein bhi save karo (popup ke liye) ────────
    const existing = await getNotes();
    const dupIndex = existing.findIndex(
      n => n.query.toLowerCase() === query.toLowerCase()
    );

    const note = {
      id:      Date.now().toString(),
      query,
      savedAt: new Date().toISOString(),
      source:  'auto',
      synced:  true,
      notes:   genData.notes
    };

    if (dupIndex >= 0) existing[dupIndex] = note;
    else existing.unshift(note);

    await chrome.storage.local.set({ [STORAGE_KEY]: existing });

    return { success: true, note };

  } catch (err) {
    console.error('[StudyAI] generateAndSave error:', err.message);
    return { success: false, error: err.message };
  }
}

// ── Handler 2: Get all notes from chrome.storage ──────────────────────────────
async function getNotes() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || [];
}

// ── Handler 3: Delete a single note by id ────────────────────────────────────
async function deleteNote(id) {
  try {
    const notes    = await getNotes();
    const filtered = notes.filter(n => n.id !== id);
    await chrome.storage.local.set({ [STORAGE_KEY]: filtered });

    // Also delete from server (best effort)
    fetch(`${API_BASE}/notes/${id}`, { method: 'DELETE' }).catch(() => {});

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Handler 4: Clear all notes ────────────────────────────────────────────────
async function clearAll() {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: [] });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Handler 5: Pull all notes from server into chrome.storage ─────────────────
async function syncFromServer() {
  try {
    const response = await fetch(`${API_BASE}/notes/all`);
    if (!response.ok) throw new Error('Server unreachable');

    const data = await response.json();
    if (!data.success) throw new Error('Sync failed');

    // Merge strategy:
    // - Server notes are source of truth for overlapping queries
    // - Keep any local-only notes that aren't on the server yet
    const local      = await getNotes();
    const serverKeys = new Set(data.notes.map(n => n.query.toLowerCase()));
    const localOnly  = local.filter(n => !serverKeys.has(n.query.toLowerCase()));

    const merged = [
      ...data.notes.map(n => ({ ...n, synced: true })),
      ...localOnly
    ];

    await chrome.storage.local.set({ [STORAGE_KEY]: merged });

    return { success: true, count: merged.length };

  } catch (err) {
    console.error('[StudyAI] syncFromServer error:', err.message);
    return { success: false, error: err.message };
  }
}

// ── Helper: push a single note to the Node server ────────────────────────────
// Called silently after saving locally — failure is okay (offline-first)
async function syncNoteToServer(note) {
  await fetch(`${API_BASE}/notes/save`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query:  note.query,
      notes:  note.notes,
      source: note.source
    })
  });
}
