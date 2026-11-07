-- Author pages on for everyone who has published something (BMS 2026-11-01).
-- Off left bylines unlinked and the author URL a 404. Accounts with nothing
-- published (moderators, admins who only manage) are left as they are.
UPDATE users SET public_profile = 1 WHERE public_profile = 0 AND id IN (SELECT author_id FROM posts WHERE status = 'published' AND deleted_at IS NULL AND author_id IS NOT NULL);
