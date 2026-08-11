create or replace function current_app_user_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from app_users where auth_user_id = auth.uid()
$$;

create or replace function has_scope(
  p_permission text,
  p_scope_type scope_type,
  p_scope_id uuid default null
) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_effective_scopes s
    where s.user_id = current_app_user_id()
      and s.permission_code = p_permission
      and s.scope_type = p_scope_type
      and (p_scope_id is null or s.scope_id = p_scope_id)
  )
$$;
