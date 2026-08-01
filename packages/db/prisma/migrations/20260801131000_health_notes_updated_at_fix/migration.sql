-- `updated_at` on student_health_notes is NOT NULL with no DB default
-- (Prisma's @updatedAt is enforced only at the application layer, not by
-- Postgres). write_health_note's raw INSERT never set it, so every insert
-- failed with a not-null violation. Set it explicitly on insert.

create or replace function write_health_note(p_student_id uuid, p_content text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
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
