-- CreateEnum
CREATE TYPE "calendar_day_kind" AS ENUM ('holiday', 'vacation', 'remote', 'exam');

-- CreateTable
CREATE TABLE "academic_years" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_periods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "academic_year_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "academic_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "academic_year_id" UUID NOT NULL,
    "grade_level" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "mentor_user_id" UUID,
    "assistant_user_id" UUID,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "capacity" INTEGER,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bell_slots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ordinal" INTEGER NOT NULL,
    "starts_at" VARCHAR(5) NOT NULL,
    "ends_at" VARCHAR(5) NOT NULL,
    "grade_level" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "bell_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_calendar" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "academic_year_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "kind" "calendar_day_kind" NOT NULL,
    "title" TEXT NOT NULL,
    "is_teaching_day" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "academic_calendar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_name_key" ON "academic_years"("name");

-- CreateIndex
CREATE UNIQUE INDEX "academic_periods_academic_year_id_ordinal_key" ON "academic_periods"("academic_year_id", "ordinal");

-- CreateIndex
CREATE INDEX "classes_mentor_user_id_idx" ON "classes"("mentor_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "classes_academic_year_id_name_key" ON "classes"("academic_year_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_code_key" ON "subjects"("code");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_name_key" ON "rooms"("name");

-- CreateIndex
CREATE UNIQUE INDEX "bell_slots_ordinal_grade_level_key" ON "bell_slots"("ordinal", "grade_level");

-- CreateIndex
CREATE UNIQUE INDEX "academic_calendar_academic_year_id_date_key" ON "academic_calendar"("academic_year_id", "date");

-- AddForeignKey
ALTER TABLE "academic_periods" ADD CONSTRAINT "academic_periods_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_calendar" ADD CONSTRAINT "academic_calendar_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enable RLS
alter table academic_years     enable row level security;
alter table academic_periods   enable row level security;
alter table classes            enable row level security;
alter table subjects           enable row level security;
alter table rooms              enable row level security;
alter table bell_slots         enable row level security;
alter table academic_calendar  enable row level security;

-- Policies: calendar reference tables readable by any authenticated user
create policy academic_years_read    on academic_years    for select using (auth.uid() is not null);
create policy academic_periods_read  on academic_periods  for select using (auth.uid() is not null);
create policy subjects_read          on subjects          for select using (auth.uid() is not null);
create policy rooms_read             on rooms             for select using (auth.uid() is not null);
create policy bell_slots_read        on bell_slots        for select using (auth.uid() is not null);
create policy academic_calendar_read on academic_calendar for select using (auth.uid() is not null);

-- Classes: global permission or scoped read permission
create policy classes_read on classes
  for select
  using (
    has_scope('classes.read', 'global')
    or id in (
      select s.scope_id from user_effective_scopes s
      where s.user_id = current_app_user_id()
        and s.permission_code = 'classes.read'
        and s.scope_type = 'class'
    )
  );
