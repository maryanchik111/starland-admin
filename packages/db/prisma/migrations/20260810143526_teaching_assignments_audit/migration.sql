-- teaching_assignments holds only UUIDs/timestamps (no personal data), so it
-- reuses the plain audit trigger (see 20260801221754_audit_logs/migration.sql),
-- the same one attached to permission_grants/user_roles — not the redacted
-- variant used for students/app_users.
--
-- A teaching assignment change is a scope change (CLAUDE.md §3: it defines
-- the 'own_teaching' scope_kind), so it must be audited like any other
-- access change.
create trigger teaching_assignments_audit
  after insert or update or delete on teaching_assignments
  for each row execute function trg_write_audit_log();
