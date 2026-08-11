-- Final-review finding I1.
--
-- `read_health_note` checks `has_scope('health_notes.read', 'global')` before
-- decrypting. `write_health_note` checked nothing. Combined with
-- `security definer` (which bypasses `student_health_notes_no_direct_read`)
-- and Postgres's default `EXECUTE` grant to PUBLIC (only `health_key()`'s
-- execute was revoked, in 20260801131500), ANY authenticated user could run
-- `select write_health_note('<student uuid>', '...')` and silently overwrite
-- any student's encrypted medical note. Task 8's own test demonstrated this
-- without noticing: it seeds a note as a *secretary*, an identity with no
-- health permissions whatsoever, and the write succeeded.
--
-- `health.write` at global scope is the permission the `nurse` role already
-- carries in prisma/seed/roles.ts, so no seed change is needed.
--
-- The rest of the body is unchanged from
-- 20260801131000_health_notes_updated_at_fix; only the guard is new.

create or replace function write_health_note(p_student_id uuid, p_content text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not has_scope('health.write', 'global') then
    raise exception 'insufficient_permission' using errcode = '42501';
  end if;

  insert into student_health_notes (student_id, content_cipher, updated_by, updated_at)
  values (p_student_id, pgp_sym_encrypt(p_content, health_key()), current_app_user_id(), now())
  on conflict (student_id) do update
    set content_cipher = excluded.content_cipher,
        updated_by = excluded.updated_by,
        updated_at = now();

  insert into sensitive_access_logs (user_id, entity_type, entity_id, action)
  values (current_app_user_id(), 'student_health_note', p_student_id, 'write');
end;
$$;
