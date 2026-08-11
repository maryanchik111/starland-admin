-- Director-level gap review (2026-08-10-staff-and-status-model.md, Task 3):
-- staff_profiles required a system login (user_id NOT NULL), so positions
-- with no admin access (security guard, cook, cleaner) could never be
-- entered as employees at all. Employee gets its own identity, same pattern
-- as guardian_persons already uses for parents (independent of app_users,
-- optionally linked to it later).

-- Cleanup first: every existing staff_profiles row in this environment is
-- orphaned leftover test data (user_id points at an app_user long deleted by
-- test cleanup, which never cascaded here) — confirmed by inspection before
-- writing this migration (40/40 rows orphaned, all position='Вчитель').
-- staff_awards cascades on delete, so removing the profiles is enough.
delete from staff_profiles sp
where not exists (select 1 from app_users u where u.id = sp.user_id);

alter table staff_profiles rename to employees;
alter table staff_awards rename column profile_id to employee_id;

alter table employees
  alter column user_id drop not null,
  add column first_name text,
  add column last_name text,
  add column middle_name text,
  add column email text,
  add column position_code text references staff_positions(code),
  add column employment_status employment_status_kind not null default 'working',
  add column hired_on date,
  add column dismissed_on date,
  add column status_order_id uuid references school_orders(id);

-- Backfill the (now guaranteed non-orphaned) remaining rows from app_users,
-- and the one free-text position value seen in this environment onto the
-- new catalog code — best-effort, anything unrecognized stays NULL for the
-- director to fill in via the UI rather than guessed here.
update employees e
set first_name = split_part(u.full_name, ' ', 1),
    last_name = nullif(substr(u.full_name, length(split_part(u.full_name, ' ', 1)) + 2), '')
from app_users u
where u.id = e.user_id and e.first_name is null;

update employees set last_name = '—' where last_name is null or last_name = '';

update employees set position_code = 'teacher' where position = 'Вчитель';

alter table employees
  alter column first_name set not null,
  alter column last_name set not null,
  drop column position;

drop policy staff_profiles_read on employees;
create policy employees_read on employees
  for select using (has_scope('staff.read', 'global') or user_id = current_app_user_id());

-- employees now holds PII (first_name/last_name/phone/email), so it takes
-- the redacted audit trigger (CLAUDE.md §7: no personal data in audit_logs),
-- same as students. This also covers employment_status/position/order
-- changes, which CLAUDE.md §3 requires a trail for.
create trigger employees_audit
  after insert or update or delete on employees
  for each row execute function trg_write_audit_log_redacted();
