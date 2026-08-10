-- 20260806233731_app_users_audit_trigger fired on DELETE as well as
-- INSERT/UPDATE, contradicting CLAUDE.md's rule that app_users (like every
-- domain table) is never physically deleted -- only soft-toggled via
-- is_active. No code path calls .delete() on appUser today, but the trigger
-- shouldn't structurally endorse a path that must not exist.
drop trigger app_users_audit on app_users;

create trigger app_users_audit
  after insert or update on app_users
  for each row execute function trg_write_audit_log_redacted();
