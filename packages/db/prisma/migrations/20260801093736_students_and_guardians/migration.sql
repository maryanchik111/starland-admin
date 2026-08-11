-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "middle_name" TEXT,
    "born_on" DATE NOT NULL,
    "photo_path" TEXT,
    "living_address" TEXT,
    "critical_note" TEXT,
    "parental_consent_given_at" DATE,
    "parental_consent_entered_by" UUID,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardian_persons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "middle_name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "guardian_persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardianships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "relation" TEXT NOT NULL,
    "is_legal_representative" BOOLEAN NOT NULL DEFAULT false,
    "can_pick_up" BOOLEAN NOT NULL DEFAULT true,
    "receives_notifications" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "guardianships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "from_date" DATE NOT NULL,
    "to_date" DATE,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_cards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID,
    "staff_user_id" UUID,
    "qr_code" TEXT NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "person_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_measurements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "measured_on" DATE NOT NULL,
    "height_cm" INTEGER,
    "weight_kg" DECIMAL(5,2),
    "entered_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "student_measurements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "linked_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_user_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "linked_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "linked_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "students_last_name_first_name_idx" ON "students"("last_name", "first_name");

-- CreateIndex
CREATE UNIQUE INDEX "guardianships_student_id_person_id_key" ON "guardianships"("student_id", "person_id");

-- CreateIndex
CREATE INDEX "enrollments_class_id_to_date_idx" ON "enrollments"("class_id", "to_date");

-- CreateIndex
CREATE INDEX "enrollments_student_id_idx" ON "enrollments"("student_id");

-- CreateIndex
CREATE INDEX "person_cards_qr_code_idx" ON "person_cards"("qr_code");

-- CreateIndex
CREATE UNIQUE INDEX "student_measurements_student_id_measured_on_key" ON "student_measurements"("student_id", "measured_on");

-- CreateIndex
CREATE UNIQUE INDEX "linked_accounts_owner_user_id_student_id_key" ON "linked_accounts"("owner_user_id", "student_id");

-- AddForeignKey
ALTER TABLE "guardianships" ADD CONSTRAINT "guardianships_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardianships" ADD CONSTRAINT "guardianships_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "guardian_persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_cards" ADD CONSTRAINT "person_cards_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_measurements" ADD CONSTRAINT "student_measurements_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Один QR не може одночасно належати двом людям.
-- Частковий унікальний індекс: діють лише активні привʼязки.
create unique index person_cards_active_qr on person_cards (qr_code) where valid_to is null;

alter table students             enable row level security;
alter table guardian_persons     enable row level security;
alter table guardianships        enable row level security;
alter table enrollments          enable row level security;
alter table person_cards         enable row level security;
alter table student_measurements enable row level security;
alter table linked_accounts      enable row level security;

-- Гілку «учні з моїх пар предмет+клас» додає Task 9 разом із таблицею
-- teaching_assignments. Тут — глобальний доступ, свої діти, свій клас.
create policy students_read on students
  for select
  using (
    has_scope('students.read', 'global')
    or id in (
      select s.scope_id from user_effective_scopes s
      where s.user_id = current_app_user_id()
        and s.permission_code = 'students.read'
        and s.scope_type = 'student'
    )
    or id in (
      select e.student_id from enrollments e
      where e.to_date is null
        and e.class_id in (
          select s.scope_id from user_effective_scopes s
          where s.user_id = current_app_user_id()
            and s.permission_code = 'students.read'
            and s.scope_type = 'class'
        )
    )
  );

create policy linked_accounts_own on linked_accounts
  for select
  using (owner_user_id = (select id from app_users where auth_user_id = auth.uid()));

-- Default policies for other tables: allow select if user is authenticated.
-- More granular policies will be added in later tasks.
create policy enrollments_read on enrollments
  for select
  using (current_app_user_id() is not null);

create policy guardian_persons_read on guardian_persons
  for select
  using (current_app_user_id() is not null);

create policy guardianships_read on guardianships
  for select
  using (current_app_user_id() is not null);

create policy person_cards_read on person_cards
  for select
  using (current_app_user_id() is not null);

create policy student_measurements_read on student_measurements
  for select
  using (current_app_user_id() is not null);
