-- pgcrypto lives in the `extensions` schema on Supabase (not `public`).
-- `read_health_note`/`write_health_note` are SECURITY DEFINER with an
-- explicit search_path, so pgp_sym_encrypt/pgp_sym_decrypt were not found.
-- Fix: include `extensions` in the search_path for both functions.

create or replace function read_health_note(p_student_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  result text;
begin
  if not has_scope('health_notes.read', 'global') then
    raise exception 'insufficient_permission' using errcode = '42501';
  end if;

  select pgp_sym_decrypt(content_cipher, health_key())
  into result
  from student_health_notes
  where student_id = p_student_id;

  insert into sensitive_access_logs (user_id, entity_type, entity_id, action)
  values (current_app_user_id(), 'student_health_note', p_student_id, 'read');

  return result;
end;
$$;

create or replace function write_health_note(p_student_id uuid, p_content text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  insert into student_health_notes (student_id, content_cipher, updated_by)
  values (p_student_id, pgp_sym_encrypt(p_content, health_key()), current_app_user_id())
  on conflict (student_id) do update
    set content_cipher = excluded.content_cipher,
        updated_by = excluded.updated_by,
        updated_at = now();

  insert into sensitive_access_logs (user_id, entity_type, entity_id, action)
  values (current_app_user_id(), 'student_health_note', p_student_id, 'write');
end;
$$;
