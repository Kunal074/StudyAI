/**
 * js/app.js
 * ─────────────────────────────────────────────
 * Main app logic:
 *
 *  1. Auth check — login nahi hai toh redirect
 *  2. User info navbar mein dikhao
 *  3. Search → notes generate karo
 *  4. Hinglish toggle
 *  5. Save to library
 *  6. Library page — notes grid
 *  7. Library search
 *  8. Note modal — full view
 *  9. Logout
 */

// ── Constants ─────────────────────────────────────────────────────────────────
const TOKEN = localStorage.getItem('token');
const USER  = JSON.parse(localStorage.getItem('user') || '{}');

// ── Auth check — login nahi hai toh login page pe bhejo ──────────────────────
if (!TOKEN) {
  window.location.href = 'login.html';
}

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const homepage      = $('homepage');
const resultsPage   = $('results-page');
const libraryPage   = $('library-page');
const searchForm    = $('search-form');
const searchInput   = $('search-input');
const topSearchForm = $('top-search-form');
const topSearchInput= $('top-search-input');
const backBtn       = $('back-btn');
const libBackBtn    = $('lib-back-btn');
const navLibBtn     = $('nav-library-btn');
const notesBadge    = $('notes-badge');
const loadingState  = $('loading-state');
const errorState    = $('error-state');
const errorMessage  = $('error-message');
const retryBtn      = $('retry-btn');
const notesCard     = $('notes-card');
const libraryEmpty  = $('library-empty');
const libraryGrid   = $('library-grid');
const libSearch     = $('lib-search');
const noteModal     = $('note-modal');
const modalContent  = $('modal-content');
const modalClose    = $('modal-close');
const logoutBtn     = $('logout-btn');
const userAvatar    = $('user-avatar');
const userName      = $('user-name');
const libSearchBtn  = $('lib-search-btn');

// ── State ─────────────────────────────────────────────────────────────────────
let lastQuery    = '';
let currentNotes = null;   // English notes currently shown
let hinglishNotes= null;   // Hinglish translated notes
let isHinglish   = false;  // toggle state

// ══════════════════════════════════════════════════════
// 1. INIT — user info dikhao navbar mein
// ══════════════════════════════════════════════════════
function init() {
  // User avatar aur name set karo
  if (USER.name) {
    userAvatar.textContent = USER.name.charAt(0).toUpperCase();
    userName.textContent   = USER.name.split(' ')[0]; // first name only
  }

  // Notes badge update karo
  updateBadge();
}

init();

// ══════════════════════════════════════════════════════
// 2. PAGE NAVIGATION
// ══════════════════════════════════════════════════════
function showPage(page) {
  homepage.classList.add('hidden');
  resultsPage.classList.add('hidden');
  libraryPage.classList.add('hidden');

  page.classList.remove('hidden');
  window.scrollTo(0, 0);
}

// Back buttons
backBtn.addEventListener('click', () => showPage(homepage));
libBackBtn.addEventListener('click', () => showPage(homepage));

// Library button navbar mein
navLibBtn.addEventListener('click', () => {
  showPage(libraryPage);
  loadLibrary();
});

// Library empty state search button
libSearchBtn?.addEventListener('click', () => showPage(homepage));

// ══════════════════════════════════════════════════════
// 3. SEARCH
// ══════════════════════════════════════════════════════
searchForm.addEventListener('submit', e => {
  e.preventDefault();
  go(searchInput.value);
});

topSearchForm.addEventListener('submit', e => {
  e.preventDefault();
  go(topSearchInput.value);
});

// Suggestion chips
document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => go(chip.dataset.query));
});

// Retry button
retryBtn.addEventListener('click', () => {
  if (lastQuery) fetchNotes(lastQuery);
});

function go(query) {
  if (!query?.trim()) return;
  lastQuery = query.trim();
  topSearchInput.value = lastQuery;
  showPage(resultsPage);
  fetchNotes(lastQuery);
}

// ══════════════════════════════════════════════════════
// 4. FETCH NOTES FROM API
// ══════════════════════════════════════════════════════
async function fetchNotes(query) {
  // Reset state
  currentNotes  = null;
  hinglishNotes = null;
  isHinglish    = false;

  showLoading();

  try {
    const res  = await fetch('/api/notes', {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`
      },
      body: JSON.stringify({ query })
    });

    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Failed');

    currentNotes = data.notes;
    renderNotesCard(currentNotes, query);

  } catch (err) {
    showError(err.message || 'Could not generate notes. Try again.');
  }
}

// ══════════════════════════════════════════════════════
// 5. RENDER NOTES CARD
// ══════════════════════════════════════════════════════
function renderNotesCard(notes, query) {
  const isSaved = false; // will check separately
  const {
    title, definition, keyPoints = [],
    example, formulaOrCode, formulaLabel, relatedTopics = []
  } = notes;

  let html = `
    <div class="card-header">
      <div class="card-header-top">
        <div class="card-badge">Study Notes</div>
        <button class="hinglish-btn" id="hinglish-btn">
          🇮🇳 Hinglish mein padho
        </button>
      </div>
      <h2 class="card-title">${esc(title)}</h2>
    </div>
    <div class="card-body">
      <div class="card-section">
        <div class="section-label">Definition</div>
        <p class="definition-text">${esc(definition)}</p>
      </div>
      <div class="card-section">
        <div class="section-label">Key Points</div>
        <ul class="key-points">
          ${keyPoints.map(p => `<li>${esc(p)}</li>`).join('')}
        </ul>
      </div>
      <div class="card-section">
        <div class="section-label">Example</div>
        <div class="example-box">${esc(example)}</div>
      </div>`;

  if (formulaOrCode?.trim()) {
    html += `
      <div class="card-section">
        <div class="section-label">Formula / Code</div>
        ${formulaLabel ? `<div class="code-label">${esc(formulaLabel)}</div>` : ''}
        <pre class="code-block">${esc(formulaOrCode)}</pre>
      </div>`;
  }

  if (relatedTopics.length) {
    html += `
      <div class="card-section">
        <div class="section-label">Related Topics</div>
        <div class="related-chips">
          ${relatedTopics.map(t =>
            `<button class="related-chip" data-q="${esc(t)}">${esc(t)}</button>`
          ).join('')}
        </div>
      </div>`;
  }

  // Save button
  html += `
    <div class="card-section">
      <button id="save-btn" class="save-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2.5"
          stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v14a2 2 0 0 1-2 2z"/>
          <polyline points="17 21 17 13 7 13 7 21"/>
          <polyline points="7 3 7 8 15 8"/>
        </svg>
        Save to Library
      </button>
    </div>
    </div>`;

  notesCard.innerHTML = html;
  notesCard.classList.remove('hidden');
  loadingState.classList.add('hidden');
  errorState.classList.add('hidden');

  // ── Wire up buttons ────────────────────────────────────────────────────────

  // Related chips
  notesCard.querySelectorAll('.related-chip').forEach(c => {
    c.addEventListener('click', () => go(c.dataset.q));
  });

  // Hinglish toggle
  $('hinglish-btn').addEventListener('click', () => toggleHinglish(query));

  // Save button
  $('save-btn').addEventListener('click', () => saveNote(query));
}

// ══════════════════════════════════════════════════════
// 6. HINGLISH TOGGLE
// ══════════════════════════════════════════════════════
async function toggleHinglish(query) {
  const btn = $('hinglish-btn');

  // Agar already hinglish mein hai toh English pe wapas jao
  if (isHinglish) {
    isHinglish = false;
    btn.classList.remove('active');
    btn.textContent = '🇮🇳 Hinglish mein padho';
    renderNotesCard(currentNotes, query);
    return;
  }

  // Agar hinglish notes already hain toh dobara API call mat karo
  if (hinglishNotes) {
    isHinglish = true;
    btn.classList.add('active');
    btn.textContent = '🇬🇧 English mein padho';
    renderNotesCard(hinglishNotes, query);
    return;
  }

  // Pehli baar translate karo
  btn.disabled    = true;
  btn.textContent = '⏳ Translating…';

  try {
    const res = await fetch('/api/notes/translate', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${TOKEN}`
      },
      body: JSON.stringify({ notes: currentNotes })
    });

    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error);

    hinglishNotes = data.notes;
    isHinglish    = true;

    renderNotesCard(hinglishNotes, query);

    // Button state update
    const newBtn = $('hinglish-btn');
    newBtn.classList.add('active');
    newBtn.textContent = '🇬🇧 English mein padho';

  } catch (err) {
    btn.disabled    = false;
    btn.textContent = '🇮🇳 Hinglish mein padho';
    alert('Translation failed. Try again.');
  }
}

// ══════════════════════════════════════════════════════
// 7. SAVE NOTE
// ══════════════════════════════════════════════════════
async function saveNote(query) {
  const btn = $('save-btn');
  btn.disabled    = true;
  btn.textContent = 'Saving…';

  try {
    const res = await fetch('/api/notes/save', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${TOKEN}`
      },
      body: JSON.stringify({
        query,
        notes:    currentNotes,
        hinglish: hinglishNotes, // agar translate hua hai toh save karo
        source:   'manual'
      })
    });

    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error);

    // Button saved state
    btn.className   = 'save-btn saved';
    btn.innerHTML   = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2.5"
        stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      Saved to Library`;

    updateBadge();

  } catch (err) {
    btn.disabled    = false;
    btn.textContent = 'Save to Library';
    alert('Save failed. Try again.');
  }
}

// ══════════════════════════════════════════════════════
// 8. LIBRARY — load + render
// ══════════════════════════════════════════════════════
async function loadLibrary(searchQuery = '') {
  libraryGrid.innerHTML = '';

  try {
    // Search ya all notes
    const url = searchQuery
      ? `/api/notes/search?q=${encodeURIComponent(searchQuery)}`
      : '/api/notes/all';

    const res  = await fetch(url, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });

    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error);

    // Badge update
    notesBadge.textContent = data.count;
    if (data.count > 0) notesBadge.classList.remove('hidden');
    else notesBadge.classList.add('hidden');

    // Empty state
    if (data.notes.length === 0) {
      libraryEmpty.classList.remove('hidden');
      libraryGrid.classList.add('hidden');
      return;
    }

    libraryEmpty.classList.add('hidden');
    libraryGrid.classList.remove('hidden');

    // Render cards
    libraryGrid.innerHTML = data.notes.map((entry, i) => {
      const date  = new Date(entry.created_at).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', year: '2-digit'
      });
      const notes = entry.notes;

      return `
        <div class="lib-card" data-id="${entry.id}" style="animation-delay:${i * 0.04}s">
          <div class="lib-card-top">
            <span class="lib-card-badge">Study Notes</span>
            <button class="lib-card-del" data-id="${entry.id}" title="Delete">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/>
                <path d="M9 6V4h6v2"/>
              </svg>
            </button>
          </div>
          <div class="lib-card-title">${esc(notes.title || entry.query)}</div>
          <div class="lib-card-def">${esc(notes.definition || '')}</div>
          <div class="lib-card-date">${date}</div>
        </div>`;
    }).join('');

    // Card click → modal
    libraryGrid.querySelectorAll('.lib-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('.lib-card-del')) return;
        const entry = data.notes.find(n => n.id == card.dataset.id);
        if (entry) openModal(entry);
      });
    });

    // Delete buttons
    libraryGrid.querySelectorAll('.lib-card-del').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        deleteNote(btn.dataset.id);
      });
    });

  } catch (err) {
    libraryGrid.innerHTML = `
      <div style="color:var(--muted);text-align:center;padding:40px">
        Notes load nahi ho sake. Try again.
      </div>`;
  }
}

// ── Library search ────────────────────────────────────────────────────────────
let searchTimeout;
libSearch.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    loadLibrary(libSearch.value.trim());
  }, 400); // 400ms debounce
});

// ── Update badge ──────────────────────────────────────────────────────────────
async function updateBadge() {
  try {
    const res  = await fetch('/api/notes/all', {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    const data = await res.json();
    if (data.success && data.count > 0) {
      notesBadge.textContent = data.count;
      notesBadge.classList.remove('hidden');
    }
  } catch {}
}

// ══════════════════════════════════════════════════════
// 9. DELETE NOTE
// ══════════════════════════════════════════════════════
async function deleteNote(id) {
  if (!confirm('Yeh note delete karna chahte ho?')) return;

  try {
    const res = await fetch(`/api/notes/${id}`, {
      method:  'DELETE',
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });

    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error);

    // Reload library
    loadLibrary(libSearch.value.trim());

  } catch (err) {
    alert('Delete failed. Try again.');
  }
}

// ══════════════════════════════════════════════════════
// 10. MODAL — full note view
// ══════════════════════════════════════════════════════
function openModal(entry) {
  const notes = entry.notes;
  const {
    title, definition, keyPoints = [],
    example, formulaOrCode, formulaLabel, relatedTopics = []
  } = notes;

  let html = `
    <div class="card-header" style="border-radius:0">
      <div class="card-badge">Study Notes</div>
      <h2 class="card-title" style="margin-top:10px">${esc(title)}</h2>
    </div>
    <div>
      <div class="card-section">
        <div class="section-label">Definition</div>
        <p class="definition-text">${esc(definition)}</p>
      </div>
      <div class="card-section">
        <div class="section-label">Key Points</div>
        <ul class="key-points">
          ${keyPoints.map(p => `<li>${esc(p)}</li>`).join('')}
        </ul>
      </div>
      <div class="card-section">
        <div class="section-label">Example</div>
        <div class="example-box">${esc(example)}</div>
      </div>`;

  if (formulaOrCode?.trim()) {
    html += `
      <div class="card-section">
        <div class="section-label">Formula / Code</div>
        ${formulaLabel ? `<div class="code-label">${esc(formulaLabel)}</div>` : ''}
        <pre class="code-block">${esc(formulaOrCode)}</pre>
      </div>`;
  }

  if (relatedTopics.length) {
    html += `
      <div class="card-section">
        <div class="section-label">Related Topics</div>
        <div class="related-chips">
          ${relatedTopics.map(t =>
            `<button class="related-chip modal-related" data-q="${esc(t)}">${esc(t)}</button>`
          ).join('')}
        </div>
      </div>`;
  }

  // Hinglish version bhi saved hai toh button dikhao
  if (entry.hinglish) {
    html += `
      <div class="card-section">
        <button class="hinglish-btn" id="modal-hinglish-btn">
          🇮🇳 Hinglish mein dekho
        </button>
      </div>`;
  }

  html += `</div>`;

  modalContent.innerHTML = html;
  noteModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // Related chips in modal
  modalContent.querySelectorAll('.modal-related').forEach(c => {
    c.addEventListener('click', () => {
      closeModal();
      go(c.dataset.q);
    });
  });

  // Hinglish toggle in modal
  const modalHinglishBtn = $('modal-hinglish-btn');
  if (modalHinglishBtn) {
    let showingHinglish = false;
    modalHinglishBtn.addEventListener('click', () => {
      showingHinglish = !showingHinglish;
      if (showingHinglish) {
        openModal({ ...entry, notes: entry.hinglish, hinglish: entry.notes });
      } else {
        openModal(entry);
      }
    });
  }
}

function closeModal() {
  noteModal.classList.add('hidden');
  document.body.style.overflow = '';
}

modalClose.addEventListener('click', closeModal);
noteModal.addEventListener('click', e => {
  if (e.target === noteModal) closeModal();
});

// ══════════════════════════════════════════════════════
// 11. LOGOUT
// ══════════════════════════════════════════════════════
logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = 'login.html';
});

// ══════════════════════════════════════════════════════
// 12. HELPERS
// ══════════════════════════════════════════════════════
function showLoading() {
  loadingState.classList.remove('hidden');
  errorState.classList.add('hidden');
  notesCard.classList.add('hidden');
  notesCard.innerHTML = '';
}

function showError(msg) {
  loadingState.classList.add('hidden');
  notesCard.classList.add('hidden');
  errorMessage.textContent = msg;
  errorState.classList.remove('hidden');
}

function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}