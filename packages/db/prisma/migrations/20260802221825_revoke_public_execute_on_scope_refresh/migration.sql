-- Final-review finding I4.
--
-- `refresh_user_effective_scopes(uuid)` and `refresh_expired_grants()` are
-- SECURITY DEFINER and, by Postgres's default, had EXECUTE granted to PUBLIC.
-- Neither can escalate privileges directly (both recompute from the
-- source-of-truth tables rather than accepting a desired result), but any
-- authenticated user could trigger a full permission recomputation for an
-- arbitrary user id. That is unintended surface area, and the same class of
-- issue was already fixed for `health_key()` in 20260801131500.
--
-- Nothing legitimate loses access:
--   * `trg_refresh_scopes_for_user`, `trg_refresh_scopes_for_teacher` and
--     `trg_refresh_scopes_for_mentor` call `refresh_user_effective_scopes`
--     from inside their own SECURITY DEFINER bodies, so those calls are made
--     as the function OWNER, not as the triggering role — unaffected by a
--     PUBLIC revoke.
--   * No application or test code calls either function directly (checked
--     across packages/db/src, packages/db/test, packages/db/prisma/seed and
--     apps/**).
--   * A future nightly cron for `refresh_expired_grants()` runs through the
--     privileged `postgres` connection, which keeps its own inherent
--     privileges and does not depend on the PUBLIC grant.

revoke execute on function refresh_user_effective_scopes(uuid) from public;
revoke execute on function refresh_expired_grants() from public;
