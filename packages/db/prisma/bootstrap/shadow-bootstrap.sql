-- Prerequisites for the Prisma shadow database (SHADOW_DATABASE_URL).
--
-- `prisma migrate dev` replays the full migration history against a shadow
-- database to detect drift. Our migrations create RLS policies that call
-- Supabase's `auth.uid()`, but that function only exists in the real
-- Supabase-managed database — a fresh shadow database has no `auth` schema
-- at all. This script creates a stand-in so migration history can be
-- replayed there. It never touches the real `auth.uid()` (defined by
-- Supabase/GoTrue) in the actual application database.
--
-- Applied by `pnpm --filter @starland/db run shadow:bootstrap`
-- (see packages/db/scripts/bootstrap-shadow-db.mjs).
-- Safe to re-run: every statement below is idempotent.

create schema if not exists auth;

create or replace function auth.uid() returns uuid
  language sql
  stable
as $$
  select null::uuid
$$;
