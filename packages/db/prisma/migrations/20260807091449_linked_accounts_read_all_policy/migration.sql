-- linked_accounts had only self-scoped SELECT (linked_accounts_own). The
-- Task 8 effective-permissions profile screen expands own_children-scoped
-- role permissions through this table for an arbitrary target user, so a
-- director with global users.read needs to read it too — same shape as the
-- other *_read_all policies from this task.
create policy linked_accounts_read_all on linked_accounts for select
  using (has_scope('users.read', 'global'));