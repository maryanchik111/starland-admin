create or replace function trg_write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
begin
  begin
    actor := current_app_user_id();
  exception when others then
    actor := null;
  end;

  insert into audit_logs (user_id, entity_type, entity_id, action, old_values, new_values)
  values (
    actor,
    tg_table_name,
    case tg_op when 'DELETE' then old.id else new.id end,
    tg_op,
    case tg_op when 'INSERT' then null else to_jsonb(old) end,
    case tg_op when 'DELETE' then null else to_jsonb(new) end
  );
  return null;
end;
$$;

create trigger permission_grants_audit
  after insert or update or delete on permission_grants
  for each row execute function trg_write_audit_log();

create trigger user_roles_audit
  after insert or update or delete on user_roles
  for each row execute function trg_write_audit_log();

-- Redacted audit trigger for tables holding personal data (e.g. `students`).
--
-- CLAUDE.md forbids storing personal/medical data in audit_logs, even inside
-- `old_values`/`new_values`. `trg_write_audit_log()` above stores the full
-- row via to_jsonb(), which is fine for non-PII tables (permission_grants,
-- user_roles) but not acceptable here.
--
-- Redaction rule: walk the row's JSON representation key by key. A key whose
-- value is SQL NULL stays NULL (so an auditor can still tell a field was
-- empty vs. populated — e.g. `{"living_address": null}`). A key with any
-- non-null value is replaced with the literal string '[REDACTED]' (so an
-- auditor can tell the field was populated/changed shape, and see WHICH
-- fields changed between old and new, without ever seeing the actual
-- personal-data content). This function is generic over any table's column
-- set and can be attached to future PII tables unmodified.
create or replace function trg_write_audit_log_redacted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
  redacted_old jsonb;
  redacted_new jsonb;
  key text;
  raw jsonb;
begin
  begin
    actor := current_app_user_id();
  exception when others then
    actor := null;
  end;

  if tg_op != 'INSERT' then
    raw := to_jsonb(old);
    redacted_old := '{}'::jsonb;
    for key in select jsonb_object_keys(raw) loop
      if raw -> key = 'null'::jsonb then
        redacted_old := redacted_old || jsonb_build_object(key, null);
      else
        redacted_old := redacted_old || jsonb_build_object(key, '[REDACTED]');
      end if;
    end loop;
  end if;

  if tg_op != 'DELETE' then
    raw := to_jsonb(new);
    redacted_new := '{}'::jsonb;
    for key in select jsonb_object_keys(raw) loop
      if raw -> key = 'null'::jsonb then
        redacted_new := redacted_new || jsonb_build_object(key, null);
      else
        redacted_new := redacted_new || jsonb_build_object(key, '[REDACTED]');
      end if;
    end loop;
  end if;

  insert into audit_logs (user_id, entity_type, entity_id, action, old_values, new_values)
  values (
    actor,
    tg_table_name,
    case tg_op when 'DELETE' then old.id else new.id end,
    tg_op,
    redacted_old,
    redacted_new
  );
  return null;
end;
$$;

create trigger students_audit
  after insert or update or delete on students
  for each row execute function trg_write_audit_log_redacted();
