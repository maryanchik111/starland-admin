-- permission_grants and user_effective_scopes previously only had
-- self-scoped SELECT policies. The Task 8 "effective permissions" profile
-- screen needs a director with global users.read to read another user's
-- rows on both — same shape as app_users_read_all / user_roles_read_all
-- from 20260807120000_users_read_policy.
create policy permission_grants_read_all on permission_grants for select
  using (has_scope('users.read', 'global'));

create policy user_effective_scopes_read_all on user_effective_scopes for select
  using (has_scope('users.read', 'global'));