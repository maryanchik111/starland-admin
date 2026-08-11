-- Director-level gap review (2026-08-10-staff-and-status-model.md, Task 4):
-- enrollments.status was a free-text column that the app always wrote as
-- 'active' and never read — "withdrawn"/"graduated"/"expelled" had no
-- vocabulary at all, so a student who left the school looked identical to
-- one mid-transfer. This replaces it with the enum from Task 1 plus a
-- mandatory reason and an optional link to the order (наказ) that made it
-- official.

alter table enrollments
  add column status_kind enrollment_status_kind not null default 'active',
  add column reason text,
  add column status_order_id uuid references school_orders(id);

-- Conservative backfill for any already-closed rows: mark them as an
-- internal transfer, the least presumptive guess, and leave `reason` empty
-- for the director to fill in if a different reason is known. At the time
-- of writing this environment has zero closed enrollments, so this is a
-- no-op guard for whatever exists by the time the migration runs elsewhere.
update enrollments set status_kind = 'transferred_internal'::enrollment_status_kind
  where to_date is not null;

alter table enrollments drop column status;
