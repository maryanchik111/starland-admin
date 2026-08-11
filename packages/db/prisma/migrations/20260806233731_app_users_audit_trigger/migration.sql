-- app_users holds personal data (full_name, email), so it reuses the
-- redacted audit trigger already attached to students (see
-- 20260801221754_audit_logs/migration.sql), not the plain trg_write_audit_log
-- used for permission_grants/user_roles.
create trigger app_users_audit
  after insert or update or delete on app_users
  for each row execute function trg_write_audit_log_redacted();
