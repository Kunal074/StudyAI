-- Run this in your Neon Postgres SQL Editor to add the limit tracking

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS daily_ai_calls INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_reset_date DATE DEFAULT CURRENT_DATE;
