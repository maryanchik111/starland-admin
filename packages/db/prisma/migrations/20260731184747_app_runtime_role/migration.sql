-- Runtime role: no superuser, cannot bypass RLS.
-- Password comes from the environment; it is never present in this file.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_runtime') then
    create role app_runtime login noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
  end if;
end
$$;

-- No re-assertion of nosuperuser/nobypassrls on an already-existing role:
-- Supabase's `postgres` role is not itself a superuser here (only
-- bypassrls), and Postgres refuses to let a non-superuser touch the
-- superuser attribute on any role, even to reaffirm `false`. `create role`
-- above already fixes both attributes at creation time; nothing later in
-- this migration (or elsewhere) ever grants superuser to app_runtime, so
-- there is nothing to re-assert.

-- Privileges come from Supabase's built-in `authenticated` role, so we don't
-- have to re-grant on every new table.
grant authenticated to app_runtime;
grant usage on schema public to app_runtime;

-- Tables created by the `postgres` role (as opposed to `supabase_admin`) do
-- NOT get default privileges for `authenticated` — RLS without a select
-- grant means "connected and sees nothing", not "sees its own rows". So:
-- 1) explicit grant on tables that already exist,
grant select, insert, update, delete on all tables in schema public to authenticated;

-- 2) default privileges, so every FUTURE table created by `postgres` gets
-- the same grant automatically, without editing this block again.
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to authenticated;
