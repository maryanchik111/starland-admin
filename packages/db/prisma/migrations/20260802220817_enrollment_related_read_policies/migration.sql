-- Final-review finding C1.
--
-- `enrollments`, `guardianships`, `guardian_persons` and `student_measurements`
-- have had RLS enabled with ZERO read policies since Task 7 (the blanket
-- "any authenticated user" policies were removed in
-- 20260801100515_fix_students_guardians_rls_scope as a security fix, and no
-- scoped replacement was ever added).
--
-- That is fail-closed and therefore safe, but it silently breaks the student
-- pages: they read these tables through `withUserContext` (the RLS-respecting
-- `app_runtime` connection) as Prisma relation `include`s. With no read
-- policy every include returns zero rows for every user, so the class column
-- always renders "—", the guardians and measurements lists are always empty,
-- and `canEdit` — which is derived from the (now always missing) active
-- enrollment — is false for everyone, hiding the edit link and bouncing every
-- visitor off the edit page regardless of their real permissions.
--
-- Fix: give each of these tables a SELECT policy whose visibility test is
-- exactly `students_read`'s, evaluated against the row's `student_id` instead
-- of `students.id`. The same zero-argument `security definer` set-returning
-- helpers introduced in 20260801234750 are reused verbatim, so:
--   * rule 1a still holds — no function is called with a row-varying argument,
--     the planner evaluates each helper once per query and probes the result
--     set per row;
--   * no new privileged surface is created — no new SECURITY DEFINER function
--     is added by this migration;
--   * the four tables can never become MORE visible than the parent `students`
--     row, because the predicate is character-for-character the same test.
--
-- `guardian_persons` has no `student_id`; it reaches a student only through
-- `guardianships.person_id`. Its policy therefore wraps the same test in a
-- correlated `exists (select 1 from guardianships g where g.person_id = ...)`.
-- That correlation compares the current row's own column against a lookup —
-- the established pattern already used by `app_users_self_select` and
-- `user_roles_own` — and is not what rule 1a forbids: rule 1a forbids passing
-- a row's value INTO A FUNCTION CALL as an argument, which this does not do.
-- The helper calls inside the `exists` still take no arguments.

create policy enrollments_read on enrollments
  for select
  using (
    has_scope('students.read', 'global')
    or student_id in (
      select s.scope_id from user_effective_scopes s
      where s.user_id = current_app_user_id()
        and s.permission_code = 'students.read'
        and s.scope_type = 'student'
    )
    or student_id in (select * from students_visible_via_class_scope())
    or student_id in (select * from students_visible_via_teaching_assignment_scope())
  );

create policy guardianships_read on guardianships
  for select
  using (
    has_scope('students.read', 'global')
    or student_id in (
      select s.scope_id from user_effective_scopes s
      where s.user_id = current_app_user_id()
        and s.permission_code = 'students.read'
        and s.scope_type = 'student'
    )
    or student_id in (select * from students_visible_via_class_scope())
    or student_id in (select * from students_visible_via_teaching_assignment_scope())
  );

create policy student_measurements_read on student_measurements
  for select
  using (
    has_scope('students.read', 'global')
    or student_id in (
      select s.scope_id from user_effective_scopes s
      where s.user_id = current_app_user_id()
        and s.permission_code = 'students.read'
        and s.scope_type = 'student'
    )
    or student_id in (select * from students_visible_via_class_scope())
    or student_id in (select * from students_visible_via_teaching_assignment_scope())
  );

create policy guardian_persons_read on guardian_persons
  for select
  using (
    exists (
      select 1 from guardianships g
      where g.person_id = guardian_persons.id
        and (
          has_scope('students.read', 'global')
          or g.student_id in (
            select s.scope_id from user_effective_scopes s
            where s.user_id = current_app_user_id()
              and s.permission_code = 'students.read'
              and s.scope_type = 'student'
          )
          or g.student_id in (select * from students_visible_via_class_scope())
          or g.student_id in (select * from students_visible_via_teaching_assignment_scope())
        )
    )
  );
