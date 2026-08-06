-- `app_users` and `user_roles` only had self-scoped SELECT policies
-- (`app_users_self_select`, `user_roles_own`), so a director with global
-- `users.read` could not see any row but their own. These policies are
-- additive (RLS OR's multiple permissive policies together), so the
-- existing self-visibility keeps working for everyone else unchanged.
create policy app_users_read_all on app_users
  for select using (has_scope('users.read', 'global'));

create policy user_roles_read_all on user_roles
  for select using (has_scope('users.read', 'global'));
