-- DropIndex
DROP INDEX "user_roles_user_id_role_id_key";

-- AlterTable
ALTER TABLE "user_roles" ADD COLUMN     "revoked_at" TIMESTAMPTZ,
ADD COLUMN     "revoked_by" UUID;

-- Prisma can't declare a partial unique index, so the (userId, roleId)
-- uniqueness constraint moves here: a user can hold the same role again
-- after a prior grant of it was revoked, but never hold two *active* rows
-- for the same (user, role) pair at once.
CREATE UNIQUE INDEX "user_roles_user_id_role_id_active_key"
  ON "user_roles" ("user_id", "role_id")
  WHERE "revoked_at" IS NULL;

-- Revoked roles must stop contributing to user_effective_scopes. Every join
-- against user_roles in refresh_user_effective_scopes() gets
-- "and ur.revoked_at is null" — same shape as the already-existing
-- "and g.revoked_at is null" guard on permission_grants below.
create or replace function refresh_user_effective_scopes(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from user_effective_scopes where user_id = p_user_id;

  -- 1. Глобальні дозволи з ролей
  insert into user_effective_scopes (user_id, permission_code, scope_type, scope_id, updated_at)
  select distinct ur.user_id, p.code, 'global'::scope_type, null::uuid, now()
  from user_roles ur
  join role_permissions rp on rp.role_id = ur.role_id
  join permissions p on p.id = rp.permission_id
  where ur.user_id = p_user_id and ur.revoked_at is null and rp.scope_kind = 'global';

  -- 2. Дозволи в межах власних пар предмет+клас
  insert into user_effective_scopes (user_id, permission_code, scope_type, scope_id, updated_at)
  select distinct ur.user_id, p.code, 'teaching_assignment'::scope_type, ta.id, now()
  from user_roles ur
  join role_permissions rp on rp.role_id = ur.role_id
  join permissions p on p.id = rp.permission_id
  join teaching_assignments ta on ta.teacher_user_id = ur.user_id and ta.deleted_at is null
  where ur.user_id = p_user_id and ur.revoked_at is null and rp.scope_kind = 'own_teaching';

  -- 3. Дозволи класного керівника на свій клас
  insert into user_effective_scopes (user_id, permission_code, scope_type, scope_id, updated_at)
  select distinct ur.user_id, p.code, 'class'::scope_type, c.id, now()
  from user_roles ur
  join role_permissions rp on rp.role_id = ur.role_id
  join permissions p on p.id = rp.permission_id
  join classes c on c.mentor_user_id = ur.user_id and c.deleted_at is null
  where ur.user_id = p_user_id and ur.revoked_at is null and rp.scope_kind = 'mentor_classes';

  -- 4. Дозволи родини на своїх дітей
  insert into user_effective_scopes (user_id, permission_code, scope_type, scope_id, updated_at)
  select distinct ur.user_id, p.code, 'student'::scope_type, la.student_id, now()
  from user_roles ur
  join role_permissions rp on rp.role_id = ur.role_id
  join permissions p on p.id = rp.permission_id
  join linked_accounts la on la.owner_user_id = ur.user_id
  where ur.user_id = p_user_id and ur.revoked_at is null and rp.scope_kind = 'own_children';

  -- 5. Персональні дозволи «allow»
  insert into user_effective_scopes (user_id, permission_code, scope_type, scope_id, updated_at)
  select distinct g.user_id, p.code, g.scope_type, g.scope_id, now()
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

-- Backfill: existing rows have revoked_at is null, so this is a no-op for
-- everyone today, but re-running the projection keeps it consistent with the
-- function body above.
select refresh_user_effective_scopes(id) from app_users;
