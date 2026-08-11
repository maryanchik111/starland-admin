-- Drop overly permissive default policies that allowed any authenticated user to read sensitive data.
-- guardian_persons, guardianships, person_cards, student_measurements stay with RLS enabled
-- but no policies (default-deny) until later tasks add scoped access.
drop policy enrollments_read on enrollments;
drop policy guardian_persons_read on guardian_persons;
drop policy guardianships_read on guardianships;
drop policy person_cards_read on person_cards;
drop policy student_measurements_read on student_measurements;

-- Create SECURITY DEFINER helper function to safely access enrollments from the students_read policy.
-- This function bypasses enrollments' RLS internally while the students table's RLS is checked normally.
create or replace function student_visible_via_class_scope(p_student_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from enrollments e
    where e.student_id = p_student_id
      and e.to_date is null
      and e.class_id in (
        select s.scope_id from user_effective_scopes s
        where s.user_id = current_app_user_id()
          and s.permission_code = 'students.read'
          and s.scope_type = 'class'
      )
  )
$$;

-- Update students_read policy: replace raw enrollments subquery with helper function call.
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
  );
