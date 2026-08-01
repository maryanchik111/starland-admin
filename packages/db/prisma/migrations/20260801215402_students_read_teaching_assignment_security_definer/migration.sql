-- Fix a regression introduced by the students_read policy from the T1 plan's
-- Task 9 brief (20260801214323_staff_and_assignments): its new
-- teaching_assignment branch queries `enrollments` directly. Task 7
-- (20260801100515_fix_students_guardians_rls_scope) deliberately dropped the
-- permissive default `enrollments_read` policy, leaving `enrollments` RLS
-- enabled with no policies (default-deny). Any raw subquery against
-- `enrollments` from another table's policy therefore sees zero rows for a
-- normal authenticated user — that is exactly why the class-scope branch
-- was rewritten to go through the SECURITY DEFINER helper
-- `student_visible_via_class_scope()`. The teaching_assignment branch needs
-- the same treatment; without it, a teacher with only a `teaching_assignment`
-- scope on `students.read` sees no students at all.
create or replace function student_visible_via_teaching_assignment_scope(p_student_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from enrollments e
    where e.student_id = p_student_id
      and e.to_date is null
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
  )
$$;

drop policy students_read on students;

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
    or student_visible_via_class_scope(id)
    or student_visible_via_teaching_assignment_scope(id)
  );
