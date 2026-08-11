-- Task 15 prerequisite: make `students_read` genuinely comply with CLAUDE.md
-- rule 1a instead of relying on the documented exception from Task 7/Task 9.
--
-- Before this migration, branches 3 and 4 of `students_read` called scalar
-- SECURITY DEFINER helpers with the row's own `id` as an argument:
--   student_visible_via_class_scope(id)
--   student_visible_via_teaching_assignment_scope(id)
-- A scalar function taking a row-varying argument cannot be hoisted by the
-- planner: it is executed once per candidate row of `students`. That is
-- exactly the shape rule 1a forbids and exactly what Task 15's performance
-- test asserts against.
--
-- The replacements return `setof uuid` and take NO arguments, so the planner
-- can evaluate them a single time per query (hashed SubPlan / InitPlan) and
-- probe the resulting set per row. The security property is unchanged: both
-- are still `security definer`, so they still bypass the RLS of `enrollments`
-- (RLS enabled, zero read policies, by design since Task 7) and of
-- `teaching_assignments` internally, which means the enclosing policy still
-- does not have to open those tables to every authenticated user.

drop policy students_read on students;

drop function student_visible_via_class_scope(uuid);
drop function student_visible_via_teaching_assignment_scope(uuid);

create or replace function students_visible_via_class_scope() returns setof uuid
language sql stable security definer set search_path = public as $$
  select e.student_id
  from enrollments e
  where e.to_date is null
    and e.class_id in (
      select s.scope_id from user_effective_scopes s
      where s.user_id = current_app_user_id()
        and s.permission_code = 'students.read'
        and s.scope_type = 'class'
    )
$$;

create or replace function students_visible_via_teaching_assignment_scope() returns setof uuid
language sql stable security definer set search_path = public as $$
  select e.student_id
  from enrollments e
  where e.to_date is null
    and e.class_id in (
      select ta.class_id from teaching_assignments ta
      where ta.deleted_at is null
        and ta.id in (
          select s.scope_id from user_effective_scopes s
          where s.user_id = current_app_user_id()
            and s.permission_code = 'students.read'
            and s.scope_type = 'teaching_assignment'
        )
    )
$$;

create policy students_read on students
  for select
  using (
    has_scope('students.read', 'global')
    or id in (
      select s.scope_id from user_effective_scopes s
      where s.user_id = current_app_user_id()
        and s.permission_code = 'students.read'
        and s.scope_type = 'student'
    )
    or id in (select * from students_visible_via_class_scope())
    or id in (select * from students_visible_via_teaching_assignment_scope())
  );
