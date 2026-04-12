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
const API_BASE    = 'http://localhost:3000/api';
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

    // Step 1: Call the StudyAI Node.js backend
    const response = await fetch(`${API_BASE}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });

    if (!response.ok) throw new Error(`Server error: ${response.status}`);

    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'API failed');

    // Step 2: Build the note object
    const note = {
      id:      Date.now().toString(),
      query:   query,
      savedAt: new Date().toISOString(),
      source:  'auto',   // saved from Google search (not manually)
      synced:  true,     // came from server so it's already synced
      notes:   data.notes
    };

    // Step 3: Load existing notes, check for duplicate query
    const existing = await getNotes();
    const dupIndex = existing.findIndex(
      n => n.query.toLowerCase() === query.toLowerCase()
    );

    // If same query already saved → update it, else prepend
    if (dupIndex >= 0) {
      existing[dupIndex] = { ...note, id: existing[dupIndex].id };
    } else {
      existing.unshift(note);
    }

    // Step 4: Save back to chrome.storage.local
    await chrome.storage.local.set({ [STORAGE_KEY]: existing });

    // Step 5: Also save to the Node server (so app stays in sync)
    syncNoteToServer(note).catch(() => {}); // fire and forget

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
