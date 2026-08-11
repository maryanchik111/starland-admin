-- The plain composite unique index blocks re-assigning the exact same
-- subject+class+period to a teacher after a prior assignment was
-- soft-deleted (revoke sets deleted_at, never DELETEs — CLAUDE.md §9). Same
-- fix as user_roles' partial unique index
-- (20260807085015_user_role_soft_revoke/migration.sql): uniqueness applies
-- only among active (not yet soft-deleted) rows.
DROP INDEX "teaching_assignments_teacher_user_id_subject_id_class_id_pe_key";

CREATE UNIQUE INDEX "teaching_assignments_active_key"
  ON "teaching_assignments" ("teacher_user_id", "subject_id", "class_id", "period_id")
  WHERE "deleted_at" IS NULL;
