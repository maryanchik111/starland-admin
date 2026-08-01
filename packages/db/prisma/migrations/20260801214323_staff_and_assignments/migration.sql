-- CreateTable
CREATE TABLE "staff_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "phone" TEXT,
    "category" TEXT,
    "experience_years" INTEGER,
    "position" TEXT,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "staff_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_awards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profile_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "awarded_on" DATE NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "staff_awards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teaching_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "teacher_user_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "teaching_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_profiles_user_id_key" ON "staff_profiles"("user_id");

-- CreateIndex
CREATE INDEX "teaching_assignments_teacher_user_id_idx" ON "teaching_assignments"("teacher_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "teaching_assignments_teacher_user_id_subject_id_class_id_pe_key" ON "teaching_assignments"("teacher_user_id", "subject_id", "class_id", "period_id");

-- AddForeignKey
ALTER TABLE "staff_awards" ADD CONSTRAINT "staff_awards_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS: enable on every new table in the same migration that creates it.
alter table staff_profiles       enable row level security;
alter table staff_awards         enable row level security;
alter table teaching_assignments enable row level security;

create policy staff_profiles_read on staff_profiles
  for select using (has_scope('staff.read', 'global') or user_id = current_app_user_id());

create policy staff_awards_read on staff_awards
  for select using (has_scope('staff.read', 'global'));

create policy teaching_assignments_read on teaching_assignments
  for select using (has_scope('staff.read', 'global') or teacher_user_id = current_app_user_id());

-- Тепер існують усі таблиці-джерела, тому створюємо перерахунок проєкції.
-- Дослівно скопійовано з «Додатка А» плану Т1.

create or replace function refresh_user_effective_scopes(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from user_effective_scopes where user_id = p_user_id;

  -- 1. Глобальні дозволи з ролей
  insert into user_effective_scopes (user_id, permission_code, scope_type, scope_id)
  select distinct ur.user_id, p.code, 'global'::scope_type, null::uuid
  from user_roles ur
  join role_permissions rp on rp.role_id = ur.role_id
  join permissions p on p.id = rp.permission_id
  where ur.user_id = p_user_id and rp.scope_kind = 'global';

  -- 2. Дозволи в межах власних пар предмет+клас
  insert into user_effective_scopes (user_id, permission_code, scope_type, scope_id)
  select distinct ur.user_id, p.code, 'teaching_assignment'::scope_type, ta.id
  from user_roles ur
  join role_permissions rp on rp.role_id = ur.role_id
  join permissions p on p.id = rp.permission_id
  join teaching_assignments ta on ta.teacher_user_id = ur.user_id and ta.deleted_at is null
  where ur.user_id = p_user_id and rp.scope_kind = 'own_teaching';

  -- 3. Дозволи класного керівника на свій клас
  insert into user_effective_scopes (user_id, permission_code, scope_type, scope_id)
  select distinct ur.user_id, p.code, 'class'::scope_type, c.id
  from user_roles ur
  join role_permissions rp on rp.role_id = ur.role_id
  join permissions p on p.id = rp.permission_id
  join classes c on c.mentor_user_id = ur.user_id and c.deleted_at is null
  where ur.user_id = p_user_id and rp.scope_kind = 'mentor_classes';

  -- 4. Дозволи родини на своїх дітей
  insert into user_effective_scopes (user_id, permission_code, scope_type, scope_id)
  select distinct ur.user_id, p.code, 'student'::scope_type, la.student_id
  from user_roles ur
  join role_permissions rp on rp.role_id = ur.role_id
  join permissions p on p.id = rp.permission_id
  join linked_accounts la on la.owner_user_id = ur.user_id
  where ur.user_id = p_user_id and rp.scope_kind = 'own_children';

  -- 5. Персональні дозволи «allow»
  insert into user_effective_scopes (user_id, permission_code, scope_type, scope_id)
  select distinct g.user_id, p.code, g.scope_type, g.scope_id
  from permission_grants g
  join permissions p on p.id = g.permission_id
  where g.user_id = p_user_id
    and g.effect = 'allow'
    and g.revoked_at is null
    and (g.expires_at is null or g.expires_at > now())
  on conflict do nothing;

  -- 6. Персональні заборони знімають усе, що збіглося
  delete from user_effective_scopes ues
  using permission_grants g
  join permissions p on p.id = g.permission_id
  where ues.user_id = p_user_id
    and g.user_id = p_user_id
    and g.effect = 'deny'
    and g.revoked_at is null
    and (g.expires_at is null or g.expires_at > now())
    and ues.permission_code = p.code
    and (
      g.scope_type = 'global'
      or (ues.scope_type = g.scope_type and ues.scope_id is not distinct from g.scope_id)
    );
end;
$$;

-- Тригерна обгортка: визначає, чийого користувача чіпали
create or replace function trg_refresh_scopes_for_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected uuid;
begin
  affected := coalesce(
    case tg_op when 'DELETE' then old.user_id else new.user_id end,
    null
  );
  if affected is not null then
    perform refresh_user_effective_scopes(affected);
  end if;
  return null;
end;
$$;

create trigger user_roles_refresh_scopes
  after insert or update or delete on user_roles
  for each row execute function trg_refresh_scopes_for_user();

create trigger permission_grants_refresh_scopes
  after insert or update or delete on permission_grants
  for each row execute function trg_refresh_scopes_for_user();

-- Гранти з терміном дії протухають самі по собі; проєкція про це не дізнається,
-- поки її не перерахують. Викликається нічним cron у Т3.
create or replace function refresh_expired_grants()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_user uuid;
  n integer := 0;
begin
  for affected_user in
    select distinct user_id from permission_grants
    where expires_at is not null and expires_at <= now() and revoked_at is null
  loop
    perform refresh_user_effective_scopes(affected_user);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Зміна призначень і класного керівництва теж змінює ефективні права.
create or replace function trg_refresh_scopes_for_teacher()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'INSERT' then
    perform refresh_user_effective_scopes(old.teacher_user_id);
  end if;
  if tg_op <> 'DELETE' then
    perform refresh_user_effective_scopes(new.teacher_user_id);
  end if;
  return null;
end;
$$;

create trigger teaching_assignments_refresh_scopes
  after insert or update or delete on teaching_assignments
  for each row execute function trg_refresh_scopes_for_teacher();

create or replace function trg_refresh_scopes_for_mentor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'INSERT' and old.mentor_user_id is not null then
    perform refresh_user_effective_scopes(old.mentor_user_id);
  end if;
  if tg_op <> 'DELETE' and new.mentor_user_id is not null then
    perform refresh_user_effective_scopes(new.mentor_user_id);
  end if;
  return null;
end;
$$;

create trigger classes_refresh_mentor_scopes
  after insert or update or delete on classes
  for each row execute function trg_refresh_scopes_for_mentor();

-- Тепер, коли teaching_assignments існує, розширюємо політики з Task 6 і Task 7
-- гілкою «свої пари предмет+клас». Postgres не має CREATE OR REPLACE POLICY,
-- тому drop + create.
drop policy classes_read on classes;
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
    or id in (
      select ta.class_id from teaching_assignments ta
      where ta.deleted_at is null
        and ta.id in (
          select s.scope_id from user_effective_scopes s
          where s.user_id = current_app_user_id()
            and s.permission_code = 'classes.read'
            and s.scope_type = 'teaching_assignment'
        )
    )
  );

drop policy students_read on students;
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
    or id in (
      select e.student_id from enrollments e
      where e.to_date is null
        and e.class_id in (
          select ta.class_id from teaching_assignments ta
          where ta.deleted_at is null
            and ta.id in (
              select s.scope_id from user_effective_scopes s
              where s.user_id = current_app_user_id()
                and s.permission_code = 'students.read'
                and s.scope_type = 'teaching_assignment'
            )
        )
    )
  );

-- Backfill: одноразовий перерахунок для всіх наявних користувачів.
select refresh_user_effective_scopes(id) from app_users;
