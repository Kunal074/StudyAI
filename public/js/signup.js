/**
 * js/signup.js
 * ─────────────────────────────────────────────
 * Signup page ka logic:
 *
 *  1. Form submit handle karo
 *  2. Passwords match check karo
 *  3. POST /api/auth/signup call karo
 *  4. Token + user localStorage mein save karo
 *  5. index.html pe redirect karo
 */

// ── Agar already logged in hai toh seedha app pe bhejo ───────────────────────
if (localStorage.getItem('token')) {
  window.location.href = 'index.html';
}

// ── DOM refs ──────────────────────────────────────────────────────────────────
const nameInput    = document.getElementById('name');
const emailInput   = document.getElementById('email');
const passInput    = document.getElementById('password');
const confirmInput = document.getElementById('confirm-password');
const otpInput     = document.getElementById('otp');
const otpGroup     = document.getElementById('otp-group');
const sendOtpBtn   = document.getElementById('send-otp-btn');
const signupBtn    = document.getElementById('signup-btn');
const errorMsg     = document.getElementById('error-msg');
const successMsg   = document.getElementById('success-msg');

// ── Buttons click ─────────────────────────────────────────────────────────────
sendOtpBtn.addEventListener('click', handleSendOtp);
signupBtn.addEventListener('click', handleSignup);

// Enter key se bhi submit ho
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    if (signupBtn.style.display !== 'none') handleSignup();
    else handleSendOtp();
  }
});

// ── Send OTP function ─────────────────────────────────────────────────────────
async function handleSendOtp() {
  const name     = nameInput.value.trim();
  const email    = emailInput.value.trim();
  const password = passInput.value.trim();
  const confirm  = confirmInput.value.trim();

  // Validate base fields first
  if (!name || !email || !password || !confirm) {
    showError('Saare fields required hain (Name, Email, Passwords).');
    return;
  }
  if (password.length < 6) {
    showError('Password kam se kam 6 characters ka hona chahiye.');
    return;
  }
  if (password !== confirm) {
    showError('Passwords match nahi kar rahe!');
    return;
  }

  setLoading(sendOtpBtn, true, 'Sending OTP…');
  hideMessages();

  try {
    const response = await fetch('/api/auth/send-otp', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await response.json();

    if (!response.ok || !data.success) throw new Error(data.error || 'Failed to send OTP');

    showSuccess('OTP successfully sent! Please check your email.');
    
    // Switch UI to verification mode
    sendOtpBtn.style.display = 'none';
    otpGroup.style.display   = 'block';
    signupBtn.style.display  = 'block';
    
    // Make email read-only so they don't change it after OTP is sent
    emailInput.readOnly = true;

  } catch (err) {
    showError(err.message);
  } finally {
    setLoading(sendOtpBtn, false, 'Send OTP');
  }
}


// ── Main signup function ──────────────────────────────────────────────────────
async function handleSignup() {
  const name     = nameInput.value.trim();
  const email    = emailInput.value.trim();
  const password = passInput.value.trim();
  const otp      = otpInput.value.trim();

  // ── Validate ──────────────────────────────────────────────────────────────
  if (!otp) {
    showError('Please enter the verification code.');
    return;
  }

  if (password.length < 6) {
    showError('Password kam se kam 6 characters ka hona chahiye.');
    return;
  }

  if (password !== confirm) {
    showError('Passwords match nahi kar rahe!');
    return;
  }

  // ── Loading state ─────────────────────────────────────────────────────────
  setLoading(signupBtn, true, 'Verifying & Creating…');
  hideMessages();

  try {
    // ── API call ──────────────────────────────────────────────────────────
    const response = await fetch('/api/auth/signup', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, otp })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Signup failed');
    }

    // ── Success: token + user save karo ───────────────────────────────────
    localStorage.setItem('token', data.token);
    localStorage.setItem('user',  JSON.stringify(data.user));

    // ── Success message dikhao phir redirect karo ─────────────────────────
    showSuccess('Account ban gaya! Redirecting…');

    setTimeout(() => {
      window.location.href = 'index.html';
    }, 1200);

  } catch (err) {
    showError(err.message);
  } finally {
    setLoading(signupBtn, false, 'Verify & Create Account');
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function setLoading(btnElement, isLoading, text) {
  btnElement.disabled    = isLoading;
  btnElement.textContent = text;
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.classList.remove('hidden');
  successMsg.classList.add('hidden');
}

function showSuccess(msg) {
  successMsg.textContent = msg;
  successMsg.classList.remove('hidden');
  errorMsg.classList.add('hidden');
}

function hideMessages() {
  errorMsg.classList.add('hidden');
  successMsg.classList.add('hidden');
}