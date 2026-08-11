-- CreateTable
CREATE TABLE "student_health" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "health_group" TEXT,
    "pe_group" TEXT,
    "allergy_codes" TEXT[],
    "chronic_codes" TEXT[],
    "activity_limits" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "student_health_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_health_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "content_cipher" BYTEA NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "student_health_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sensitive_access_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sensitive_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "student_health_student_id_key" ON "student_health"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_health_notes_student_id_key" ON "student_health_notes"("student_id");

-- CreateIndex
CREATE INDEX "sensitive_access_logs_entity_type_entity_id_idx" ON "sensitive_access_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "sensitive_access_logs_user_id_created_at_idx" ON "sensitive_access_logs"("user_id", "created_at");

-- Health notes access functions (Task 8)

create extension if not exists pgcrypto;

-- Ключ читається з налаштування бази, а не зберігається в ній.
-- Локально задається через: alter database postgres set app.health_key = '...';
-- На проді значення приходить із Supabase Vault.
create or replace function health_key() returns text
language sql stable as $$ select current_setting('app.health_key', false) $$;

-- current_app_user_id() і has_scope() вже створені міграцією з Task 5.

create or replace function read_health_note(p_student_id uuid)
returns text
language plpgsql
security definer
set search_path = public
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
set search_path = public
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

-- Row level security (Task 8)

alter table student_health       enable row level security;
alter table student_health_notes enable row level security;
alter table sensitive_access_logs enable row level security;

-- Пряме читання зашифрованої таблиці заборонене всім: тільки через read_health_note().
create policy student_health_notes_no_direct_read on student_health_notes
  for select using (false);

create policy student_health_read on student_health
  for select using (has_scope('health.read', 'global'));

create policy sensitive_logs_read on sensitive_access_logs
  for select using (has_scope('audit.read', 'global'));
