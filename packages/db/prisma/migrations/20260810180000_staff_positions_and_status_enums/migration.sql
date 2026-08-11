-- Director-level gap review (2026-08-10-staff-and-status-model.md, Task 1):
-- enrollments.status was a free string that nothing ever read, and there was
-- no vocabulary for withdrawal/graduation. Positions are a director-editable
-- catalog (CLAUDE.md §4: catalogs are data, not code enums); the status
-- vocabularies below are legally/structurally fixed, so they follow the same
-- precedent as calendar_day_kind — a Postgres enum, not a table.

-- CreateEnum
CREATE TYPE "enrollment_status_kind" AS ENUM ('active', 'transferred_internal', 'withdrawn', 'graduated', 'expelled', 'academic_leave');

-- CreateEnum
CREATE TYPE "employment_status_kind" AS ENUM ('working', 'vacation', 'sick_leave', 'maternity_leave', 'unpaid_leave', 'dismissed');

-- CreateEnum
CREATE TYPE "order_kind" AS ENUM ('enrollment', 'exclusion', 'graduation', 'transfer', 'hiring', 'dismissal', 'leave', 'award');

-- CreateTable
CREATE TABLE "staff_positions" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_teaching" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "staff_positions_pkey" PRIMARY KEY ("code")
);

-- RLS: enable on every new table in the same migration that creates it.
alter table staff_positions enable row level security;

-- Reference table: same rule as subjects/rooms/bell_slots — any authenticated
-- session reads it, no scope needed. Director-only writes go through the
-- privileged prisma connection, same as other catalogs.
create policy staff_positions_read on staff_positions
  for select using (auth.uid() is not null);

insert into staff_positions (code, name, is_teaching, updated_at) values
  ('teacher', 'Вчитель', true, now()),
  ('mentor', 'Класний керівник', true, now()),
  ('psychologist', 'Психолог', true, now()),
  ('speech_therapist', 'Логопед', true, now()),
  ('nurse', 'Медсестра', true, now()),
  ('director', 'Директор', false, now()),
  ('deputy_director', 'Заступник директора', false, now()),
  ('admin', 'Адміністратор', false, now()),
  ('secretary', 'Секретар', false, now()),
  ('accountant', 'Бухгалтер', false, now()),
  ('facilities_manager', 'Завгосп', false, now()),
  ('security_guard', 'Охорона', false, now()),
  ('cleaner', 'Прибиральниця', false, now()),
  ('cook', 'Кухар', false, now()),
  ('librarian', 'Бібліотекар', false, now()),
  ('it_specialist', 'IT-спеціаліст', false, now())
on conflict (code) do nothing;
