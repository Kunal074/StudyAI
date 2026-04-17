-- Run this in your Neon Postgres SQL Editor to add the OTP tracking table

CREATE TABLE IF NOT EXISTS otp_requests (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  otp VARCHAR(6) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(email)
);
