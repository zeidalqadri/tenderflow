-- Add passwordHash field to users table
-- Migration: Add password hash security field

BEGIN;

-- Add passwordHash column to users table
ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL DEFAULT '';

-- Update existing users with a temporary hash (they'll need to reset passwords)
-- Using a clearly invalid hash that will force password reset
UPDATE users SET password_hash = '$2b$12$invalidhashforreset' WHERE password_hash = '';

-- Remove default constraint now that all users have a value
ALTER TABLE users ALTER COLUMN password_hash DROP DEFAULT;

-- Add index for performance if needed (optional for password hashes)
-- CREATE INDEX CONCURRENTLY idx_users_password_hash ON users (password_hash);

COMMIT;