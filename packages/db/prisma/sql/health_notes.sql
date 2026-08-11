create extension if not exists pgcrypto;

-- Ключ читається з налаштування бази, а не зберігається в ній.
-- Локально задається через: alter database postgres set app.health_key = '...';
-- На проді значення приходить із Supabase Vault.
create or replace function health_key() returns text
language sql stable as $$ select current_setting('app.health_key', false) $$;

-- Postgres grants EXECUTE on new functions to PUBLIC by default. Revoke it so
-- only SECURITY DEFINER functions that run as the owner (read_health_note,
-- write_health_note below) can call health_key() — no other role can pull
-- the raw key directly, which would defeat student_health_notes_no_direct_read.
revoke execute on function health_key() from public;

-- current_app_user_id() і has_scope() вже створені міграцією з Task 5.

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
  -- Mirrors read_health_note's guard. Without it, `security definer` plus the
  -- default PUBLIC execute grant let any authenticated user overwrite any
  -- student's encrypted medical note. `health.write` at global scope is what
  -- the `nurse` role carries in prisma/seed/roles.ts.
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
