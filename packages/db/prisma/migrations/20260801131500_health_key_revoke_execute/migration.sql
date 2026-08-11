-- Postgres grants EXECUTE on new functions to PUBLIC by default, and the
-- original health_data migration never revoked it. Any role with schema
-- access (plausibly `authenticated`, since it needs it for the other
-- RLS-integrated functions) could call `select health_key()` directly and
-- get the raw pgcrypto symmetric key, defeating
-- student_health_notes_no_direct_read: with the key in hand, ciphertext
-- obtained through any other path (backups, a future reporting feature, a
-- service-role query) can be decrypted with zero audit trail.
--
-- read_health_note/write_health_note are SECURITY DEFINER, so they run as
-- the function owner regardless of the calling role's own execute grant on
-- health_key() — revoking public execute doesn't break them, it just closes
-- the direct-call path for everyone else.

revoke execute on function health_key() from public;
