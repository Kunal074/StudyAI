/**
 * content.js
 * ─────────────────────────────────────────────
 * Injected automatically on every Google Search page.
 *
 * What it does:
 *  1. Reads the search query from the URL (?q=...)
 *  2. Injects a small floating widget (bottom-right corner)
 *  3. Widget shows the query + "Save as Notes" button
 *  4. On click → sends message to background.js
 *  5. background.js calls StudyAI API → saves note
 *  6. Handles Google's SPA navigation (search without page reload)
 */

(function () {

  // ── Step 1: Read query from URL ──────────────────────────────────────────
  function getQuery() {
    return new URLSearchParams(window.location.search).get('q') || '';
  }

  // ── Step 2: Inject CSS (only once) ──────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('sai-styles')) return;

    const style = document.createElement('style');
    style.id = 'sai-styles';
    style.textContent = `
      #sai-widget {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 2147483647;
        font-family: -apple-system, 'Segoe UI', sans-serif;
      }

      #sai-box {
        background: #13131a;
        border: 1px solid #2a2a3a;
        border-radius: 16px;
        padding: 14px 16px;
        min-width: 240px;
        max-width: 290px;
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.7);
        animation: sai-in 0.3s cubic-bezier(.4, 0, .2, 1);
      }

      @keyframes sai-in {
        from { opacity: 0; transform: translateY(14px); }
        to   { opacity: 1; transform: translateY(0); }
      }

      #sai-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 6px;
      }

      #sai-logo {
        font-size: 14px;
        font-weight: 700;
        color: #e8e6f0;
        letter-spacing: -0.01em;
      }

      #sai-logo em {
        font-style: italic;
        color: #e8c97a;
      }

      #sai-dismiss {
        background: none;
        border: none;
        color: #4a4960;
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
        padding: 0;
        transition: color 0.2s;
      }

      #sai-dismiss:hover { color: #8887a0; }

      #sai-query {
        font-size: 12px;
        color: #8887a0;
        margin-bottom: 12px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      #sai-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        width: 100%;
        background: #e8c97a;
        color: #0a0a0f;
        border: none;
        border-radius: 999px;
        padding: 9px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: opacity 0.2s;
      }

      #sai-btn:hover   { opacity: 0.85; }
      #sai-btn:disabled { opacity: 0.5; cursor: not-allowed; }

      #sai-status {
        margin-top: 10px;
        font-size: 12px;
        text-align: center;
        padding: 6px 10px;
        border-radius: 8px;
        display: none;
      }

      #sai-status.ok  {
        background: rgba(111, 207, 151, 0.12);
        color: #6fcf97;
        display: block;
      }

      #sai-status.err {
        background: rgba(232, 122, 122, 0.12);
        color: #e87a7a;
        display: block;
      }

      #sai-status.loading {
        color: #8887a0;
        display: block;
      }

      @keyframes sai-spin {
        to { transform: rotate(360deg); }
      }

      .sai-spinner {
        display: inline-block;
        width: 12px;
        height: 12px;
        border: 2px solid #0a0a0f;
        border-top-color: transparent;
        border-radius: 50%;
        animation: sai-spin 0.7s linear infinite;
      }
    `;

    document.head.appendChild(style);
  }

  // ── Step 3: Build and inject the widget ─────────────────────────────────
  function injectWidget(query) {
    // Remove any existing widget first
    document.getElementById('sai-widget')?.remove();

    // Don't show widget for empty or very short queries
    if (!query || query.trim().length < 2) return;

    injectStyles();

    const widget = document.createElement('div');
    widget.id = 'sai-widget';
    widget.innerHTML = `
      <div id="sai-box">
        <div id="sai-top">
          <div id="sai-logo">Study<em>AI</em></div>
          <button id="sai-dismiss" title="Dismiss">×</button>
        </div>
        <div id="sai-query">"${escapeHtml(query)}"</div>
        <button id="sai-btn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2.5"
            stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v14a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
            <polyline points="7 3 7 8 15 8"/>
          </svg>
          Save as Notes
        </button>
        <div id="sai-status"></div>
      </div>
    `;

    document.body.appendChild(widget);

    // ── Step 4: Wire up buttons ────────────────────────────────────────────

    // Dismiss button — remove widget
    document.getElementById('sai-dismiss').addEventListener('click', () => {
      widget.remove();
    });

    // Save button — send message to background.js
    document.getElementById('sai-btn').addEventListener('click', async () => {
      const btn    = document.getElementById('sai-btn');
      const status = document.getElementById('sai-status');

      // Show loading state
      btn.disabled = true;
      btn.innerHTML = `<span class="sai-spinner"></span> Generating…`;
      status.className = 'loading';
      status.textContent = 'Connecting to StudyAI…';

      try {
        // ── Step 5: Send to background.js ──────────────────────────────
        const response = await chrome.runtime.sendMessage({
          type: 'GENERATE_AND_SAVE',
          query: query
        });

        if (response.success) {
          btn.innerHTML = '✓ Saved!';
          status.className = 'ok';
          status.textContent = 'Open StudyAI to view your notes →';
          // Auto-dismiss after 4 seconds
          setTimeout(() => widget.remove(), 4000);
        } else {
          throw new Error(response.error || 'Failed');
        }

      } catch (err) {
        btn.disabled = false;
        btn.innerHTML = `
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2.5"
            stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v14a2 2 0 0 1-2 2z"/>
          </svg>
          Retry`;
        status.className = 'err';
        status.textContent = 'Make sure StudyAI app is running on port 3000';
      }
    });
  }

  // ── Step 6: Handle Google SPA navigation ────────────────────────────────
  // Google updates search results without a full page reload.
  // MutationObserver watches for URL changes to re-inject the widget.
  let lastUrl = location.href;

  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      // Small delay so Google has time to update the URL
      setTimeout(() => injectWidget(getQuery()), 700);
    }
  }).observe(document.body, { childList: true, subtree: true });

  // ── Initial inject on page load ──────────────────────────────────────────
  injectWidget(getQuery());

  // ── Helper: escape HTML to prevent XSS ──────────────────────────────────
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

})();
