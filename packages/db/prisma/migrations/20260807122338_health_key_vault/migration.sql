-- ADR 0003: hosted Supabase blocks `ALTER DATABASE/ROLE ... SET` for custom
-- GUCs even for the project owner (confirmed: 42501 on both), so the
-- original "local: GUC, prod: Vault" split from 20260801130000_health_data
-- is not viable for a hosted dev project. `health_key()` now reads from
-- Supabase Vault everywhere, no environment-specific branch.
--
-- `security definer` + explicit `search_path`: `vault.decrypted_secrets` is
-- only readable by `postgres`/`service_role`. `health_key()` is called from
-- inside `read_health_note`/`write_health_note`, which are already
-- `security definer` owned by `postgres` — this function needs the same to
-- reach the view from that context.
--
-- Explicit `raise exception` on a missing secret preserves the fail-loud
-- behaviour `current_setting(name, false)` had (`false` = error, not
-- silently return null) — a silently-null key would mean silently
-- encrypting/decrypting garbage instead of a loud, obvious failure.
create or replace function health_key() returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  result text;
begin
  select decrypted_secret into result from vault.decrypted_secrets where name = 'app_health_key';
  if result is null then
    raise exception 'app_health_key secret not found in vault';
  end if;
  return result;
end;
$$;