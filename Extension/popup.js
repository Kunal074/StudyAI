/**
 * popup.js
 * ─────────────────────────────────────────────
 * Handles all interactivity inside popup.html:
 *
 *  1. Tab switching
 *  2. Load + render saved notes list
 *  3. Update stats bar (total / auto / synced)
 *  4. Google Takeout JSON file import
 *  5. Manual query import (textarea)
 *  6. Server sync (pull from Node server)
 *  7. Clear all notes
 *  8. Open app in new tab
 *
 * Communicates with background.js via chrome.runtime.sendMessage()
 */

// ── DOM references ────────────────────────────────────────────────────────────
const notesList      = document.getElementById('notes-list');
const statTotal      = document.getElementById('stat-total');
const statAuto       = document.getElementById('stat-auto');
const statSynced     = document.getElementById('stat-synced');
const syncBtn        = document.getElementById('sync-btn');
const openAppBtn     = document.getElementById('open-app-btn');
const clearBtn       = document.getElementById('clear-btn');
const pullSyncBtn    = document.getElementById('pull-sync-btn');
const syncStatus     = document.getElementById('sync-status');
const fileInput      = document.getElementById('file-input');
const uploadZone     = document.getElementById('upload-zone');
const fileStatus     = document.getElementById('file-status');
const importFileBtn  = document.getElementById('import-file-btn');
const importManualBtn= document.getElementById('import-manual-btn');
const manualInput    = document.getElementById('manual-input');
const progressWrap   = document.getElementById('progress-wrap');
const progressBar    = document.getElementById('progress-bar');
const progressText   = document.getElementById('progress-text');

// Stores queries parsed from the uploaded JSON file
let parsedQueries = [];

// ── 1. Tab switching ──────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    // Deactivate all tabs and panels
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));

    // Activate clicked tab and matching panel
    tab.classList.add('active');
    document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');
  });
});

// ── 2. Load notes on popup open ───────────────────────────────────────────────
async function loadNotes() {
  const notes = await msg('GET_NOTES');
  renderStats(notes);
  renderNotesList(notes);
}

// ── 3. Render stats bar ───────────────────────────────────────────────────────
function renderStats(notes) {
  statTotal.textContent  = notes.length;
  statAuto.textContent   = notes.filter(n => n.source === 'auto').length;
  statSynced.textContent = notes.filter(n => n.synced).length;
}

// ── 4. Render notes list ──────────────────────────────────────────────────────
function renderNotesList(notes) {
  if (notes.length === 0) {
    notesList.innerHTML = `
      <div class="empty-msg">
        No notes saved yet.<br/>
        Search something on Google<br/>
        and click "Save as Notes"!
      </div>`;
    return;
  }

  // Show latest 6 notes (rest visible in the main app)
  notesList.innerHTML = notes.slice(0, 6).map(note => {
    const date = new Date(note.savedAt).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short'
    });

    // Dot color: green if synced, blue if auto, gold if manual
    const dotClass = note.synced ? 'synced' : note.source === 'auto' ? 'auto' : '';

    // Badge label
    const badge = note.synced
      ? `<span class="note-badge synced">synced</span>`
      : note.source === 'auto'
      ? `<span class="note-badge auto">auto</span>`
      : `<span class="note-badge manual">manual</span>`;

    return `
      <div class="note-item">
        <div class="note-dot ${dotClass}"></div>
        <div class="note-meta">
          <div class="note-title">${esc(note.notes?.title || note.query)}</div>
          <div class="note-info">
            ${badge}
            <span>${date}</span>
          </div>
        </div>
      </div>`;
  }).join('');

  // If more than 6 notes, show a count
  if (notes.length > 6) {
    notesList.innerHTML += `
      <div style="text-align:center; font-size:11px; color:var(--dim); padding:8px 0">
        +${notes.length - 6} more — open the app to see all
      </div>`;
  }
}

// ── 5. Header sync button ─────────────────────────────────────────────────────
syncBtn.addEventListener('click', () => doSync());

// ── 6. Settings: pull sync ────────────────────────────────────────────────────
pullSyncBtn.addEventListener('click', () => doSync());

async function doSync() {
  syncBtn.textContent = '⇅ Syncing…';
  syncBtn.disabled = true;

  const result = await msg('SYNC_FROM_SERVER');

  syncBtn.textContent = '⇅ Sync';
  syncBtn.disabled = false;

  if (result.success) {
    syncStatus.className = 'sync-status ok';
    syncStatus.textContent = `✓ Synced ${result.count} notes from server`;
    loadNotes(); // refresh the list
  } else {
    syncStatus.className = 'sync-status err';
    syncStatus.textContent = '✗ Server unreachable. Is StudyAI running?';
  }
}

// ── 7. Settings: clear all ────────────────────────────────────────────────────
clearBtn.addEventListener('click', async () => {
  if (!confirm('Delete all locally saved notes? Server notes will remain.')) return;
  await msg('CLEAR_ALL');
  loadNotes();
});

// ── 8. Open main app in new tab ───────────────────────────────────────────────
openAppBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: 'http://localhost:3000' });
});

// ── 9. File upload — Google Takeout JSON ──────────────────────────────────────
uploadZone.addEventListener('click', () => fileInput.click());

// Drag and drop support
uploadZone.addEventListener('dragover', e => {
  e.preventDefault();
  uploadZone.style.borderColor = 'var(--accent)';
});
uploadZone.addEventListener('dragleave', () => {
  uploadZone.style.borderColor = '';
});
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.style.borderColor = '';
  const file = e.dataTransfer.files[0];
  if (file) processFile(file);
});

fileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) processFile(file);
});

function processFile(file) {
  const reader = new FileReader();

  reader.onload = ev => {
    try {
      const json = JSON.parse(ev.target.result);

      // Google Takeout format: array of objects with "title" like "Searched for X"
      // Support multiple possible structures
      const raw = Array.isArray(json)
        ? json
        : (json.event || json.searches || Object.values(json)[0] || []);

      // Extract and clean queries
      const queries = [...new Set(
        raw
          .map(item => {
            const t = item.title || item.query || '';
            // Remove "Searched for " prefix that Google adds
            return t.startsWith('Searched for ')
              ? t.slice(13).trim()
              : t.trim();
          })
          .filter(q => q.length > 2 && q.length < 100)
      )].slice(0, 50); // cap at 50

      if (queries.length === 0) throw new Error('No valid queries found');

      parsedQueries = queries;
      fileStatus.className = 'file-status ok';
      fileStatus.textContent = `✓ Found ${queries.length} unique searches`;
      importFileBtn.disabled = false;

    } catch (err) {
      fileStatus.className = 'file-status err';
      fileStatus.textContent = '✗ Could not read file. Use Searches.json from Google Takeout.';
      importFileBtn.disabled = true;
    }
  };

  reader.readAsText(file);
}

// ── 10. Import from file ──────────────────────────────────────────────────────
importFileBtn.addEventListener('click', () => {
  if (parsedQueries.length > 0) runImport(parsedQueries);
});

// ── 11. Manual import from textarea ──────────────────────────────────────────
importManualBtn.addEventListener('click', () => {
  const raw = manualInput.value.trim();
  if (!raw) return;

  const queries = [...new Set(
    raw
      .split('\n')
      .map(q => q.trim())
      .filter(q => q.length > 1)
  )];

  if (queries.length > 0) runImport(queries);
});

// ── 12. Run import — generates notes one by one ───────────────────────────────
async function runImport(queries) {
  // Disable buttons during import
  importFileBtn.disabled   = true;
  importManualBtn.disabled = true;

  // Show progress bar
  progressWrap.classList.add('visible');
  progressBar.style.width      = '0%';
  progressBar.style.background = 'var(--accent)';
  progressText.textContent     = `0 / ${queries.length}`;

  let successCount = 0;
  let failCount    = 0;

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];

    progressText.textContent = `Generating: "${query}"… (${i + 1} / ${queries.length})`;

    const result = await msg('GENERATE_AND_SAVE', { query });

    if (result.success) successCount++;
    else failCount++;

    // Update progress bar
    const pct = Math.round(((i + 1) / queries.length) * 100);
    progressBar.style.width = pct + '%';
  }

  // Done — show result
  progressBar.style.background = successCount > 0 ? 'var(--success)' : 'var(--danger)';
  progressText.textContent = `✓ Done! ${successCount} saved, ${failCount} failed.`;

  // Re-enable buttons
  importFileBtn.disabled   = false;
  importManualBtn.disabled = false;

  // Refresh notes list
  loadNotes();
}

// ── Helper: send message to background.js ────────────────────────────────────
function msg(type, extra = {}) {
  return chrome.runtime.sendMessage({ type, ...extra });
}

// ── Helper: escape HTML to prevent XSS ───────────────────────────────────────
function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── Init — load notes when popup opens ───────────────────────────────────────
loadNotes();
