const db = require('../db');

/**
 * apiLimiter middleware
 * 
 * Protects AI endpoints from abuse. Limit set to 10 per day.
 * Skips logic entirely for VIP user (kunalsahu23777@gmail.com).
 */
const apiLimiter = async (req, res, next) => {
  const VIP_EMAIL = 'kunalsahu23777@gmail.com';
  const DAILY_LIMIT = 10;

  try {
    // 1. Fetch user data (req.user is set by the auth middleware)
    const { rows } = await db.query(
      'SELECT email, daily_ai_calls, last_reset_date FROM users WHERE id = $1',
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }

    const user = rows[0];

    // 2. VIP pass? Skip to the API logic!
    if (user.email === VIP_EMAIL) {
      return next();
    }

    // 3. Reset logic: Has the date changed since the last reset?
    const currentDate = new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"
    let aiCalls = user.daily_ai_calls || 0;
    
    // Dates from postgres are returned as Date objects, convert to string
    const lastResetDateObj = user.last_reset_date || new Date();
    const lastResetDateStr = new Date(lastResetDateObj).toISOString().split('T')[0];

    if (currentDate !== lastResetDateStr) {
      aiCalls = 0; // It's a new day, reset limits!
    }

    // 4. Check limit
    if (aiCalls >= DAILY_LIMIT) {
      return res.status(429).json({ 
        success: false, 
        error: `Daily AI limit reached (${DAILY_LIMIT}/${DAILY_LIMIT}). Please try again tomorrow or ask Kunal to increase limits.` 
      });
    }

    // 5. Update and increment usage in DB
    await db.query(
      `UPDATE users 
       SET daily_ai_calls = $1, last_reset_date = CURRENT_DATE 
       WHERE id = $2`,
      [aiCalls + 1, req.user.id]
    );

    // 6. Allowed! Continue to the route handler
    next();

  } catch (err) {
    console.error('[API Limiter]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to verify API limits.' });
  }
};

module.exports = apiLimiter;
