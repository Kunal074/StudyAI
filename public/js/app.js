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
const TOKEN       = localStorage.getItem('token');
const USER        = JSON.parse(localStorage.getItem('user') || '{}');
const SHARE_TOKEN = new URLSearchParams(window.location.search).get('token');

// ── Auth check — skip if opening a shared note link ───────────────────────────
if (!TOKEN && !SHARE_TOKEN) {
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
const libraryNotesMap = {}; // noteId → notes object (cached for edit modal)

// ══════════════════════════════════════════════════════
// 1. INIT — user info dikhao navbar mein
// ══════════════════════════════════════════════════════
function init() {
  if (USER.name) {
    userAvatar.textContent = USER.name.charAt(0).toUpperCase();
    userName.textContent   = USER.name.split(' ')[0];
  }

  // Token ko chrome.storage mein save karo
  // Taaki extension use kar sake
  if (TOKEN) {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ studyai_token: TOKEN })
        .then(() => console.log('Token shared with extension'))
        .catch(() => {});
    }
  }

  updateBadge();
}

init();

// ══════════════════════════════════════════════════════
// 2. PAGE NAVIGATION
// ══════════════════════════════════════════════════════
function showPage(page) {
  // Hide all pages including Phase 2 additions
  document.querySelectorAll('#homepage, #results-page, #library-page, #quiz-page, #collab-page')
    .forEach(p => p?.classList.add('hidden'));

  page.classList.remove('hidden');
  window.scrollTo(0, 0);

  // Disconnect socket when leaving the collab page
  if (page.id !== 'collab-page' && typeof window.collab !== 'undefined') {
    window.collab.disconnect();
  }
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

  // Save + Edit buttons
  html += `
    <div class="card-section card-actions-row">
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
      <button id="results-edit-btn" class="edit-note-btn">✏ Edit Note</button>
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

  // Edit button — opens edit modal for unsaved in-memory note
  $('results-edit-btn').addEventListener('click', () => openEditModal(null, query, currentNotes));
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
      libraryNotesMap[entry.id] = notes; // cache for edit modal

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
          <div class="lib-card-footer">
            <span class="lib-card-date">${date}</span>
            <div class="lib-card-actions">
              <button class="lib-action-btn quiz-btn" data-id="${entry.id}" data-query="${esc(entry.query)}" title="Take Quiz">🧠 Quiz</button>
              <button class="lib-action-btn share-btn" data-id="${entry.id}" data-query="${esc(entry.query)}" title="Share Note">🔗 Share</button>
              <button class="lib-action-btn edit-btn" data-id="${entry.id}" data-query="${esc(entry.query)}" title="Edit Note">✏ Edit</button>
            </div>
          </div>
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

    // Quiz buttons (Phase 2)
    libraryGrid.querySelectorAll('.quiz-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        openQuiz(btn.dataset.id, btn.dataset.query);
      });
    });

    // Share buttons (Phase 2)
    libraryGrid.querySelectorAll('.share-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        shareNote(btn.dataset.id, btn.dataset.query);
      });
    });

    // Edit buttons (Phase 2.1)
    libraryGrid.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        openEditModal(btn.dataset.id, btn.dataset.query, libraryNotesMap[btn.dataset.id]);
      });
    });

    // Quiz All button
    $('quiz-all-btn')?.removeEventListener('click', handleQuizAll);
    $('quiz-all-btn')?.addEventListener('click', handleQuizAll);

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
  const originalNotes    = entry.notes;
  let modalHinglishNotes = entry.hinglish || null;
  let modalIsHinglish    = false;

  function renderModalContent(notes) {
    const {
      title, definition, keyPoints = [],
      example, formulaOrCode, formulaLabel, relatedTopics = []
    } = notes;

    let html = `
      <div class="card-header" style="border-radius:0">
        <div class="card-header-top">
          <div class="card-badge">Study Notes</div>
          <button class="hinglish-btn ${modalIsHinglish ? 'active' : ''}" id="modal-hinglish-btn">
            ${modalIsHinglish ? '🇬🇧 English mein padho' : '🇮🇳 Hinglish mein padho'}
          </button>
        </div>
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

    html += `</div>`;

    // ── Inject HTML ────────────────────────────────────────────────────────
    modalContent.innerHTML = html;

    // ── Related chips ──────────────────────────────────────────────────────
    modalContent.querySelectorAll('.modal-related').forEach(c => {
      c.addEventListener('click', () => {
        closeModal();
        go(c.dataset.q);
      });
    });

    // ── Hinglish button ────────────────────────────────────────────────────
    document.getElementById('modal-hinglish-btn')
      .addEventListener('click', handleHinglishToggle);
  }

  // ── Hinglish toggle handler ──────────────────────────────────────────────
  async function handleHinglishToggle() {
    const btn = document.getElementById('modal-hinglish-btn');

    // English pe wapas jao
    if (modalIsHinglish) {
      modalIsHinglish = false;
      renderModalContent(originalNotes);
      return;
    }

    // Hinglish already translated hai
    if (modalHinglishNotes) {
      modalIsHinglish = true;
      renderModalContent(modalHinglishNotes);
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
        body: JSON.stringify({ notes: originalNotes })
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error);

      // Save karo — dobara translate na karna pade
      modalHinglishNotes = data.notes;
      modalIsHinglish    = true;

      renderModalContent(modalHinglishNotes);

    } catch (err) {
      btn.disabled    = false;
      btn.textContent = '🇮🇳 Hinglish mein padho';
      alert('Translation failed. Try again.');
    }
  }

  // ── Show modal ─────────────────────────────────────────────────────────────
  renderModalContent(originalNotes);
  noteModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
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

// ══════════════════════════════════════════════════════════════════
// PHASE 2 — QUIZ + COLLABORATION
// ══════════════════════════════════════════════════════════════════

// ── Quiz DOM refs ─────────────────────────────────────────────────
const quizPage          = $('quiz-page');
const quizIntroPanel    = $('quiz-intro');
const quizActivePanel   = $('quiz-active');
const quizResultsPanel  = $('quiz-results');
const quizBackBtn       = $('quiz-back-btn');
const quizExitBtn       = $('quiz-exit-btn');
const quizResultsBkBtn  = $('quiz-results-back-btn');
const startQuizBtn      = $('start-quiz-btn');
const quizNextBtn       = $('quiz-next-btn');
const retakeQuizBtn     = $('retake-quiz-btn');
const resultsLibBtn     = $('results-library-btn');
const quizTopicTitle    = $('quiz-topic-title');
const qCurrent          = $('q-current');
const qTotal            = $('q-total');
const quizProgressBar   = $('quiz-progress-bar');
const questionText      = $('question-text');
const optionsGrid       = $('options-grid');
const scoreRing         = $('score-ring');
const scoreNumber       = $('score-number');
const scoreMessage      = $('score-message');
const scorePctText      = $('score-pct-text');
const weakTopicsSection = $('weak-topics-section');
const weakTopicsList    = $('weak-topics-list');
const breakdownList     = $('breakdown-list');
const quizGenLoading    = $('quiz-gen-loading');

// ── Collab DOM refs ───────────────────────────────────────────────
const collabPage        = $('collab-page');
const collabBackBtn     = $('collab-back-btn');
const collabNoteTopic   = $('collab-note-topic');
const collabOwnerName   = $('collab-owner-name');
const presenceBar       = $('presence-bar');
const collabNoteContent = $('collab-note-content');
const collabPermBadge   = $('collab-permission-badge');
const commentsList      = $('comments-list');
const commentInput      = $('comment-input');
const postCommentBtn    = $('post-comment-btn');
const commentsCountBadge= $('comments-count');

// ── Share Modal DOM refs ──────────────────────────────────────────
const shareModal        = $('share-modal');
const shareModalClose   = $('share-modal-close');
const shareModalTitle   = $('share-modal-title');
const shareLinkInput    = $('share-link-input');
const copyLinkBtn       = $('copy-link-btn');
const collabListSection = $('collab-list-section');
const collabMembers     = $('collab-members');
const shareLinkRow      = $('share-link-row');
const shareLinkLoading  = $('share-link-loading');

// ── Quiz State ────────────────────────────────────────────────────
let currentQuiz        = null;
let quizAnswers        = [];
let quizCurrentQ       = 0;
let selectedOption     = null;
let currentNoteIdForQ  = null;

// ── Collab / Share State ──────────────────────────────────────────
let currentCollabToken     = null;
let currentSharePermission = 'view';
let currentShareNoteId     = null;

// ══════════════════════════════════════════════════════════════════
// QUIZ — Open
// ══════════════════════════════════════════════════════════════════
async function openQuiz(noteId, noteQuery) {
  currentNoteIdForQ = noteId;

  quizTopicTitle.textContent = noteQuery;
  quizIntroPanel.classList.remove('hidden');
  quizActivePanel.classList.add('hidden');
  quizResultsPanel.classList.add('hidden');
  quizGenLoading.classList.add('hidden');
  startQuizBtn.disabled = false;
  startQuizBtn.textContent = 'Start Quiz →';

  showPage(quizPage);
}

startQuizBtn.addEventListener('click', async () => {
  startQuizBtn.disabled = true;
  startQuizBtn.textContent = 'Generating…';
  quizGenLoading.classList.remove('hidden');

  try {
    const isAllMode = !currentNoteIdForQ;
    const endpoint  = isAllMode ? '/api/quiz/generate-all' : '/api/quiz/generate';
    const reqBody   = isAllMode ? {} : { note_id: currentNoteIdForQ };
    const res  = await fetch(endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
      body:    JSON.stringify(reqBody)
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error);

    currentQuiz    = data.quiz;
    quizAnswers    = new Array(getQuestions().length).fill(null);
    quizCurrentQ   = 0;
    selectedOption = null;

    showQuizActive();

  } catch (err) {
    quizGenLoading.classList.add('hidden');
    startQuizBtn.disabled = false;
    startQuizBtn.textContent = 'Start Quiz →';
    alert('Quiz generation failed: ' + (err.message || 'Try again.'));
  }
});

function getQuestions() {
  return currentQuiz?.questions?.questions || [];
}

function showQuizActive() {
  quizIntroPanel.classList.add('hidden');
  quizActivePanel.classList.remove('hidden');
  quizResultsPanel.classList.add('hidden');
  qTotal.textContent = getQuestions().length;
  renderQuestion(0);
}

function renderQuestion(index) {
  const questions = getQuestions();
  quizCurrentQ    = index;
  selectedOption  = quizAnswers[index];

  qCurrent.textContent = index + 1;
  quizProgressBar.style.width = `${((index + 1) / questions.length) * 100}%`;

  const q       = questions[index];
  const letters = ['A', 'B', 'C', 'D'];

  questionText.textContent = q.question;

  optionsGrid.innerHTML = q.options.map((opt, i) => `
    <button class="option-btn ${selectedOption === i ? 'selected' : ''}" data-index="${i}">
      <span class="option-letter">${letters[i]}</span>
      <span>${esc(opt)}</span>
    </button>
  `).join('');

  optionsGrid.querySelectorAll('.option-btn').forEach(btn => {
    btn.addEventListener('click', () => selectOption(parseInt(btn.dataset.index)));
  });

  quizNextBtn.disabled    = selectedOption === null;
  quizNextBtn.textContent = index === questions.length - 1 ? 'Submit Quiz ✓' : 'Next →';
}

function selectOption(index) {
  selectedOption            = index;
  quizAnswers[quizCurrentQ] = index;

  optionsGrid.querySelectorAll('.option-btn').forEach((btn, i) => {
    btn.classList.toggle('selected', i === index);
  });

  quizNextBtn.disabled = false;
}

quizNextBtn.addEventListener('click', () => {
  const questions = getQuestions();
  if (quizCurrentQ < questions.length - 1) {
    selectedOption = null;
    renderQuestion(quizCurrentQ + 1);
  } else {
    submitQuiz();
  }
});

async function submitQuiz() {
  quizNextBtn.disabled    = true;
  quizNextBtn.textContent = 'Submitting…';

  try {
    const res  = await fetch('/api/quiz/submit', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
      body:    JSON.stringify({ quiz_id: currentQuiz.id, answers: quizAnswers })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error);
    renderQuizResults(data);
  } catch (err) {
    quizNextBtn.disabled    = false;
    quizNextBtn.textContent = 'Submit Quiz ✓';
    alert('Submission failed. Try again.');
  }
}

function renderQuizResults(data) {
  quizActivePanel.classList.add('hidden');
  quizResultsPanel.classList.remove('hidden');

  const { score, total, percentage, breakdown, weakTopics } = data;

  // Animate score ring after short delay so transition is visible
  setTimeout(() => scoreRing.style.setProperty('--score-pct', percentage), 150);

  scoreNumber.textContent  = score;
  scorePctText.textContent = `${percentage}% — ${score} of ${total} correct`;

  const msgs = [
    { min: 90, text: '🏆 Outstanding! You\'ve mastered this topic.' },
    { min: 70, text: '🎉 Great job! Strong understanding.' },
    { min: 50, text: '📖 Good effort! Review the weak topics below.' },
    { min: 0,  text: '💪 Keep studying — you\'ll get there!' }
  ];
  scoreMessage.textContent = msgs.find(m => percentage >= m.min).text;

  // Weak topics
  if (weakTopics?.length > 0) {
    weakTopicsSection.classList.remove('hidden');
    weakTopicsList.innerHTML = weakTopics.map((t, i) => `
      <button class="weak-topic-pill" data-i="${i}">🔍 ${esc(t)}</button>
    `).join('');
    weakTopicsList.querySelectorAll('.weak-topic-pill').forEach(pill => {
      pill.addEventListener('click', () => go(weakTopics[parseInt(pill.dataset.i)]));
    });
  } else {
    weakTopicsSection.classList.add('hidden');
  }

  // Question breakdown
  breakdownList.innerHTML = breakdown.map(item => `
    <div class="breakdown-item ${item.isCorrect ? 'correct' : 'wrong'}">
      <div class="breakdown-q">
        <span class="breakdown-icon">${item.isCorrect ? '✅' : '❌'}</span>
        <span>${esc(item.question)}</span>
      </div>
      ${!item.isCorrect ? `
        <div class="breakdown-detail">
          <span class="breakdown-your">Your: ${esc(item.options[item.userAnswer] || '—')}</span>
          <span class="breakdown-correct">Correct: ${esc(item.options[item.correct])}</span>
        </div>
        <div class="breakdown-explanation">${esc(item.explanation)}</div>
      ` : ''}
    </div>
  `).join('');
}

// Quiz navigation buttons
quizBackBtn.addEventListener('click',      () => { showPage(libraryPage); loadLibrary(); });
quizExitBtn.addEventListener('click',      () => { quizIntroPanel.classList.remove('hidden'); quizActivePanel.classList.add('hidden'); });
quizResultsBkBtn.addEventListener('click', () => { showPage(libraryPage); loadLibrary(); });
resultsLibBtn.addEventListener('click',    () => { showPage(libraryPage); loadLibrary(); });

retakeQuizBtn.addEventListener('click', () => {
  quizAnswers    = new Array(getQuestions().length).fill(null);
  quizCurrentQ   = 0;
  selectedOption = null;
  scoreRing.style.setProperty('--score-pct', 0);
  showQuizActive();
});

// ══════════════════════════════════════════════════════════════════
// SHARE / COLLAB
// ══════════════════════════════════════════════════════════════════

shareModalClose.addEventListener('click', () => shareModal.classList.add('hidden'));
shareModal.addEventListener('click', e => { if (e.target === shareModal) shareModal.classList.add('hidden'); });

document.querySelectorAll('.perm-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.perm-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentSharePermission = btn.dataset.perm;
    if (currentShareNoteId) {
      shareLinkRow.classList.add('hidden');
      shareLinkLoading.classList.remove('hidden');
      shareLinkLoading.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px"></div><span>Generating link…</span>';
      createShareLink(currentShareNoteId);
    }
  });
});

copyLinkBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(shareLinkInput.value).then(() => {
    copyLinkBtn.textContent = '✓ Copied!';
    copyLinkBtn.style.background = 'var(--success)';
    setTimeout(() => {
      copyLinkBtn.textContent = 'Copy';
      copyLinkBtn.style.background = '';
    }, 2000);
  });
});

async function shareNote(noteId, noteQuery) {
  currentShareNoteId     = noteId;
  currentSharePermission = 'view';

  shareModalTitle.textContent = noteQuery;
  shareLinkInput.value        = '';
  shareLinkRow.classList.add('hidden');
  shareLinkLoading.classList.remove('hidden');
  shareLinkLoading.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px"></div><span>Generating link…</span>';
  collabListSection.classList.add('hidden');

  document.querySelectorAll('.perm-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.perm === 'view');
  });

  shareModal.classList.remove('hidden');
  await createShareLink(noteId);
}

async function createShareLink(noteId) {
  try {
    const res  = await fetch('/api/share/create', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
      body:    JSON.stringify({ note_id: noteId, permission: currentSharePermission })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error);

    currentCollabToken   = data.token;
    shareLinkInput.value = data.shareUrl;
    shareLinkLoading.classList.add('hidden');
    shareLinkRow.classList.remove('hidden');
    loadCollaborators(data.token);

  } catch (err) {
    shareLinkLoading.innerHTML = `<span style="color:var(--danger)">✗ ${esc(err.message)}</span>`;
  }
}

async function loadCollaborators(token) {
  try {
    const res  = await fetch(`/api/share/${token}/collaborators`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    const data = await res.json();
    if (!data.success || data.collaborators.length === 0) return;

    collabListSection.classList.remove('hidden');
    collabMembers.innerHTML = data.collaborators.map(c => `
      <div class="collab-member-item">
        <div class="collab-member-avatar">${esc(c.name.charAt(0).toUpperCase())}</div>
        <span>${esc(c.name)}</span>
      </div>
    `).join('');
  } catch {}
}

async function openCollabPage(token) {
  currentCollabToken = token;
  showPage(collabPage);

  try {
    const res  = await fetch(`/api/share/${token}`);
    const data = await res.json();

    if (!res.ok || !data.success) {
      collabNoteContent.innerHTML = `
        <div style="text-align:center;padding:80px 20px;color:var(--muted)">
          <div style="font-size:40px;margin-bottom:16px">🔗</div>
          <p>Share link not found or has been revoked.</p>
        </div>`;
      return;
    }

    const { share } = data;

    collabNoteTopic.textContent = share.query;
    collabOwnerName.textContent = `Shared by ${share.ownerName}`;

    if (share.permission === 'edit') {
      collabPermBadge.textContent = '✏ Can Edit';
      collabPermBadge.style.color  = 'var(--success)';
    }

    collabNoteContent.innerHTML = buildNoteHTML(share.notes);

    if (TOKEN) {
      fetch(`/api/share/${token}/join`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${TOKEN}` }
      }).catch(() => {});
    }

    if (window.collab) {
      window.collab.connect(token, USER.name ? { name: USER.name } : { name: 'Guest' }, {
        onUserJoined: (u) => addPresenceAvatar(u),
        onUserLeft:   () => {},
        onNewComment: (c) => appendComment(c)
      });
    }

    loadComments(token);

    if (!TOKEN) {
      const inputArea = document.getElementById('comment-input-area');
      if (inputArea) inputArea.innerHTML = `
        <p style="text-align:center;padding:16px 12px;font-size:12px;color:var(--muted)">
          <a href="/login.html" style="color:var(--accent)">Login</a> to add comments
        </p>`;
    }

  } catch {
    collabNoteContent.innerHTML = `
      <div style="text-align:center;padding:80px;color:var(--muted)">Error loading shared note.</div>`;
  }
}

function buildNoteHTML(notes) {
  if (!notes) return '';
  const {
    title = '', definition = '', keyPoints = [],
    example = '', formulaOrCode = '', formulaLabel = '', relatedTopics = []
  } = notes;

  let html = `
    <div class="card-header">
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
          ${relatedTopics.map(t => `<span class="related-chip">${esc(t)}</span>`).join('')}
        </div>
      </div>`;
  }

  html += `</div>`;
  return html;
}

function addPresenceAvatar(user) {
  const div       = document.createElement('div');
  div.className   = 'presence-avatar';
  div.title       = user.name || 'Guest';
  div.textContent = (user.name || 'G').charAt(0).toUpperCase();
  presenceBar.appendChild(div);
}

async function loadComments(token) {
  try {
    const res  = await fetch(`/api/share/${token}/comments`);
    const data = await res.json();
    if (!data.success) return;

    commentsList.innerHTML = '';
    if (data.comments.length === 0) {
      commentsList.innerHTML = '<div class="comments-empty">No comments yet. Be the first!</div>';
    } else {
      data.comments.forEach(c => appendComment(c));
    }
    updateCommentsCount(data.comments.length);
  } catch {}
}

function appendComment(comment) {
  const emptyEl = commentsList.querySelector('.comments-empty');
  if (emptyEl) emptyEl.remove();

  const date = new Date(comment.created_at).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit'
  });

  const div       = document.createElement('div');
  div.className   = 'comment-item';
  div.innerHTML   = `
    <div class="comment-author">
      ${esc(comment.user_name || 'Guest')}
      <span class="comment-time">${date}</span>
    </div>
    <div class="comment-content">${esc(comment.content)}</div>`;

  commentsList.appendChild(div);
  commentsList.scrollTop = commentsList.scrollHeight;
  updateCommentsCount(parseInt(commentsCountBadge.textContent || '0') + 1);
}

function updateCommentsCount(n) { commentsCountBadge.textContent = n; }

postCommentBtn?.addEventListener('click', async () => {
  const content = commentInput?.value.trim();
  if (!content || !currentCollabToken) return;

  postCommentBtn.disabled    = true;
  postCommentBtn.textContent = '…';

  try {
    const res  = await fetch(`/api/share/${currentCollabToken}/comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
      body:   JSON.stringify({ content })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error);
    commentInput.value = '';
    appendComment(data.comment);
  } catch { alert('Comment failed. Are you logged in?'); }
  finally {
    postCommentBtn.disabled    = false;
    postCommentBtn.textContent = 'Post';
  }
});

commentInput?.addEventListener('input', () => {
  commentInput.style.height = 'auto';
  commentInput.style.height = Math.min(commentInput.scrollHeight, 120) + 'px';
});

collabBackBtn?.addEventListener('click', () => {
  window.collab?.disconnect();
  if (TOKEN) { showPage(libraryPage); loadLibrary(); }
  else        { showPage(homepage); }
});

// ── Load shared note if token in URL ─────────────────────────────
if (SHARE_TOKEN) openCollabPage(SHARE_TOKEN);

// ══════════════════════════════════════════════════════════════════
// PHASE 2.1 — EDIT NOTE + QUIZ ALL
// ══════════════════════════════════════════════════════════════════

// ── Edit State ───────────────────────────────────────────────────────────
// null  = editing unsaved results-page note (in-memory)
// ≥ 1  = editing a saved library note (DB update via PUT)
let editingNoteId = null;
let editingQuery  = '';
let editingNotes  = {};   // deep clone of the note being edited

// ── Open Edit Modal ─────────────────────────────────────────────────────
function openEditModal(noteId, query, notesObj) {
  if (!notesObj) return alert('Note data not available. Please reload the library.');

  editingNoteId = noteId;
  editingQuery  = query;
  editingNotes  = JSON.parse(JSON.stringify(notesObj)); // deep clone

  document.getElementById('edit-modal-heading').textContent      = query;
  document.getElementById('edit-title').value                    = editingNotes.title        || '';
  document.getElementById('edit-definition').value              = editingNotes.definition   || '';
  document.getElementById('edit-example').value                 = editingNotes.example      || '';
  document.getElementById('edit-formula-label').value           = editingNotes.formulaLabel  || '';
  document.getElementById('edit-formula-code').value            = editingNotes.formulaOrCode || '';

  renderEditKeyPoints([...(editingNotes.keyPoints    || [])]);
  renderEditTopics   ([...(editingNotes.relatedTopics || [])]);

  document.getElementById('edit-note-modal').classList.remove('hidden');
}

// ── Render Key Points list ──────────────────────────────────────────────────
function renderEditKeyPoints(points) {
  editingNotes.keyPoints = points;
  const list = document.getElementById('edit-keypoints-list');
  list.innerHTML = points.map((p, i) => `
    <div class="edit-kp-row" data-index="${i}">
      <input class="edit-input edit-kp-input" value="${esc(p)}" data-index="${i}" placeholder="Key point ${i + 1}…"/>
      <button class="edit-remove-btn" data-index="${i}">×</button>
    </div>
  `).join('');

  list.querySelectorAll('.edit-kp-input').forEach(inp => {
    inp.addEventListener('input', () => {
      editingNotes.keyPoints[parseInt(inp.dataset.index)] = inp.value;
    });
  });

  list.querySelectorAll('.edit-remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      editingNotes.keyPoints.splice(parseInt(btn.dataset.index), 1);
      renderEditKeyPoints([...editingNotes.keyPoints]);
    });
  });
}

// ── Render Related Topics chips ──────────────────────────────────────────────
function renderEditTopics(topics) {
  editingNotes.relatedTopics = topics;
  const list = document.getElementById('edit-topics-list');
  list.innerHTML = topics.map((t, i) => `
    <span class="edit-topic-chip">
      ${esc(t)}<button class="edit-topic-del" data-index="${i}">×</button>
    </span>
  `).join('');

  list.querySelectorAll('.edit-topic-del').forEach(btn => {
    btn.addEventListener('click', () => {
      editingNotes.relatedTopics.splice(parseInt(btn.dataset.index), 1);
      renderEditTopics([...editingNotes.relatedTopics]);
    });
  });
}

// + Add Point button
document.getElementById('add-keypoint-btn')?.addEventListener('click', () => {
  editingNotes.keyPoints = editingNotes.keyPoints || [];
  editingNotes.keyPoints.push('');
  renderEditKeyPoints([...editingNotes.keyPoints]);
  const inputs = document.querySelectorAll('.edit-kp-input');
  inputs[inputs.length - 1]?.focus();
});

// + Add Topic button
document.getElementById('add-topic-btn')?.addEventListener('click', () => {
  const inp = document.getElementById('edit-topic-input');
  const val = inp.value.trim();
  if (!val) return;
  editingNotes.relatedTopics = editingNotes.relatedTopics || [];
  editingNotes.relatedTopics.push(val);
  renderEditTopics([...editingNotes.relatedTopics]);
  inp.value = '';
  inp.focus();
});

document.getElementById('edit-topic-input')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); document.getElementById('add-topic-btn')?.click(); }
});

// Close / Cancel modal
const editModalEl = document.getElementById('edit-note-modal');
const closeEditModal = () => editModalEl?.classList.add('hidden');

document.getElementById('edit-modal-close')?.addEventListener('click', closeEditModal);
document.getElementById('edit-cancel-btn')?.addEventListener('click', closeEditModal);
editModalEl?.addEventListener('click', e => { if (e.target === editModalEl) closeEditModal(); });

// Save Changes
document.getElementById('edit-save-btn')?.addEventListener('click', async () => {
  // Collect current form values
  const updatedNotes = {
    ...editingNotes,
    title:         document.getElementById('edit-title').value.trim(),
    definition:    document.getElementById('edit-definition').value.trim(),
    example:       document.getElementById('edit-example').value.trim(),
    formulaLabel:  document.getElementById('edit-formula-label').value.trim(),
    formulaOrCode: document.getElementById('edit-formula-code').value.trim(),
  };

  const btn = document.getElementById('edit-save-btn');
  btn.disabled    = true;
  btn.textContent = 'Saving…';

  try {
    if (editingNoteId) {
      // ── Saved note — update in DB via PUT ───────────────────────────────────
      const res  = await fetch(`/api/notes/${editingNoteId}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
        body:    JSON.stringify({ notes: updatedNotes })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error);

      libraryNotesMap[editingNoteId] = updatedNotes; // update cache
      closeEditModal();
      loadLibrary(); // refresh cards

    } else {
      // ── Unsaved results-page note — update in memory ────────────────────────
      currentNotes  = updatedNotes;
      hinglishNotes = null; // reset hinglish since content changed
      isHinglish    = false;
      renderNotesCard(currentNotes, editingQuery);
      closeEditModal();
    }
  } catch (err) {
    alert('Save failed: ' + err.message);
  } finally {
    btn.disabled  = false;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v14a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save Changes`;
  }
});

// ── QUIZ ALL NOTES ──────────────────────────────────────────────────────────────
function handleQuizAll() {
  currentNoteIdForQ          = null; // null → triggers all-notes endpoint
  quizTopicTitle.textContent = '🧠 All My Notes';
  document.querySelector('.quiz-meta-row').innerHTML = `
    <span class="quiz-meta-pill">📚 All Topics</span>
    <span class="quiz-meta-pill">🎯 MCQ Format</span>
    <span class="quiz-meta-pill">⏱ ~8 Minutes</span>
  `;
  quizIntroPanel.classList.remove('hidden');
  quizActivePanel.classList.add('hidden');
  quizResultsPanel.classList.add('hidden');
  quizGenLoading.classList.add('hidden');
  startQuizBtn.disabled    = false;
  startQuizBtn.textContent = 'Start Quiz →';
  showPage(quizPage);
}