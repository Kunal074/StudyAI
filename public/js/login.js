/**
 * js/login.js
 * ─────────────────────────────────────────────
 * Login page ka logic:
 *
 *  1. Form submit handle karo
 *  2. POST /api/auth/login call karo
 *  3. Token + user localStorage mein save karo
 *  4. index.html pe redirect karo
 */

// ── Agar already logged in hai toh seedha app pe bhejo ───────────────────────
if (localStorage.getItem('token')) {
  window.location.href = 'index.html';
}

// ── DOM refs ──────────────────────────────────────────────────────────────────
const emailInput = document.getElementById('email');
const passInput  = document.getElementById('password');
const loginBtn   = document.getElementById('login-btn');
const errorMsg   = document.getElementById('error-msg');

// ── Login button click ────────────────────────────────────────────────────────
loginBtn.addEventListener('click', handleLogin);

// Enter key se bhi submit ho
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') handleLogin();
});

// ── Main login function ───────────────────────────────────────────────────────
async function handleLogin() {
  const email    = emailInput.value.trim();
  const password = passInput.value.trim();

  // ── Validate ──────────────────────────────────────────────────────────────
  if (!email || !password) {
    showError('Email aur password dono required hain.');
    return;
  }

  // ── Loading state ─────────────────────────────────────────────────────────
  setLoading(true);
  hideError();

  try {
    // ── API call ──────────────────────────────────────────────────────────
    const response = await fetch('/api/auth/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Login failed');
    }

    // ── Success: token + user save karo ───────────────────────────────────
    localStorage.setItem('token', data.token);
    localStorage.setItem('user',  JSON.stringify(data.user));

    // ── Redirect to main app ──────────────────────────────────────────────
    window.location.href = 'index.html';

  } catch (err) {
    showError(err.message);
    setLoading(false);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function setLoading(loading) {
  loginBtn.disabled    = loading;
  loginBtn.textContent = loading ? 'Logging in…' : 'Login';
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.classList.remove('hidden');
}

function hideError() {
  errorMsg.classList.add('hidden');
}