import { prisma, withUserContext } from '@starland/db'
import { requirePermission, type EffectivePermissions } from '@starland/domain'
import { UpdateStudentHealthInput, UpdateStudentHealthNoteInput } from './health-schema'

export { UpdateStudentHealthInput, UpdateStudentHealthNoteInput }

export type StudentHealthData = {
  healthGroup: string | null
  peGroup: string | null
  allergyCodes: string[]
  chronicCodes: string[]
  activityLimits: string | null
}

/**
 * `health.read` and `health_notes.read` are checked as GLOBAL scope only,
 * with no `{type: 'class', ...}` scope argument, even though
 * prisma/seed/roles.ts grants `mentor` a `mentor_classes`-scoped
 * `health.read`. This is deliberate, not an oversight: the actual RLS
 * policy this read relies on (`student_health_read` in
 * 20260801130000_health_data/migration.sql) is hardcoded to
 * `has_scope('health.read', 'global')` — it never checks a class scope at
 * all. A class-scoped permission check here would let a mentor pass this
 * gate and then hit the DB policy and get zero rows back regardless,
 * producing a section that renders but silently always shows "no data" for
 * that role. Matching the real RLS shape (global-only) is more honest than
 * pretending a scope the database does not enforce. The seed/policy mismatch
 * is pre-existing (T1 Task 8, already committed) and out of scope for Task 13
 * to fix — it is not touched here.
 */
export async function getStudentHealthWithPermissions(
  permissions: EffectivePermissions,
  actor: { authUserId: string },
  studentId: string,
): Promise<StudentHealthData | null> {
  requirePermission(permissions, 'health.read')

  // `student_health` has a real declarative RLS SELECT policy
  // (`student_health_read`), the same shape as the Student/Guardianship/
  // Measurement reads already on this profile page — so this goes through
  // `withUserContext`, not the privileged client, exactly like those. The
  // bare privileged `prisma` client is reserved for the small non-sensitive
  // reference-list case documented in students/[id]/page.tsx (the class
  // dropdown) — medical data is not that case.
  return withUserContext(actor.authUserId, (tx) =>
    tx.studentHealth.findUnique({
      where: { studentId },
      select: {
        healthGroup: true,
        peGroup: true,
        allergyCodes: true,
        chronicCodes: true,
        activityLimits: true,
      },
    }),
  )
}

/**
 * `health_notes.read` is a strictly separate, more restrictive permission
 * from `health.read` (CLAUDE.md §3: "Психологічні записи мають окремий
 * рівень доступу") — a role can hold one without the other (see `nurse` vs
 * every other role in prisma/seed/roles.ts), so this is its own gate, never
 * folded into `getStudentHealthWithPermissions`.
 *
 * Identity resolution: `read_health_note` is `SECURITY DEFINER` but still
 * calls `has_scope('health_notes.read', 'global')` and
 * `current_app_user_id()` internally, both of which resolve through
 * `auth.uid()` -> `request.jwt.claims`. That GUC has to be set on whichever
 * connection calls it. `withUserContext` sets it (plus switches to the
 * `authenticated` role) — and `authenticated` still holds a plain EXECUTE
 * grant on `read_health_note` (only `health_key()`'s EXECUTE was ever
 * revoked from `authenticated`, per 20260801131500 and
 * 20260807122815_health_key_vault_revoke_execute), so the call succeeds
 * through the same role real production traffic uses. This also keeps every
 * read on this profile page going through one convention rather than
 * introducing a second: if a future migration ever tightens
 * `read_health_note`'s EXECUTE grant (as already happened once to
 * `health_key()`), this call fails loudly through the real `authenticated`
 * role instead of silently succeeding via a bypass role that would not exist
 * on production traffic.
 *
 * The `requirePermission` call below is an application-level gate in
 * addition to the database's own check inside `read_health_note`: a caller
 * without the permission gets a clean `ForbiddenError` before any query is
 * attempted, instead of depending solely on the DB function's
 * `insufficient_permission` exception to produce a UI-appropriate result.
 */
export async function getStudentHealthNoteWithPermissions(
  permissions: EffectivePermissions,
  actor: { authUserId: string },
  studentId: string,
): Promise<string | null> {
  requirePermission(permissions, 'health_notes.read')

  return withUserContext(actor.authUserId, async (tx) => {
    const rows = await tx.$queryRaw<{ read_health_note: string | null }[]>`
      select read_health_note(${studentId}::uuid)
    `
    return rows[0]?.read_health_note ?? null
  })
}

/**
 * `student_health` has NO write RLS policy at all — only the SELECT policy
 * used above (see 20260801130000_health_data/migration.sql). So, exactly
 * like every other write in this codebase (update-student.ts,
 * create-student.ts), this goes through the privileged `prisma` client with
 * `request.jwt.claims` set transaction-locally, WITHOUT
 * `set local role authenticated` — CLAUDE.md's global constraint names this
 * pattern as the template for every new write function in this plan, and
 * here it is not merely conventional but required: `withUserContext`'s
 * `set local role authenticated` would hit a table with no INSERT/UPDATE
 * policy at all and fail outright.
 *
 * One row per student (optional 1:1 relation, see `@unique` on `studentId`
 * in schema.prisma) — upsert rather than update, since the row may not exist
 * yet the first time health data is recorded for a student.
 */
export async function updateStudentHealthWithPermissions(
  permissions: EffectivePermissions,
  actor: { authUserId: string },
  studentId: string,
  raw: unknown,
): Promise<void> {
  requirePermission(permissions, 'health.write')
  const input = UpdateStudentHealthInput.parse(raw)

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('request.jwt.claims', ${JSON.stringify({
      sub: actor.authUserId,
      role: 'authenticated',
    })}, true)`
    await tx.studentHealth.upsert({
      where: { studentId },
      create: {
        studentId,
        healthGroup: input.healthGroup,
        peGroup: input.peGroup,
        allergyCodes: input.allergyCodes ?? [],
        chronicCodes: input.chronicCodes ?? [],
        activityLimits: input.activityLimits,
      },
      update: input,
    })
  })
}

/**
 * `write_health_note` is `SECURITY DEFINER`, but it is still a *write* by
 * every meaning that matters here: it inserts/updates
 * `student_health_notes` and `sensitive_access_logs`. CLAUDE.md's global
 * constraint names the privileged-`prisma` + set_config-without-
 * set-local-role pattern as the template for "КОЖНОЇ нової функції запису"
 * (every new write function) in this plan, with no carve-out for functions
 * that happen to be `SECURITY DEFINER` — so this follows update-student.ts
 * exactly, the same as `updateStudentHealthWithPermissions` above, rather
 * than `withUserContext`. That is a deliberate choice between two patterns
 * that both work here (unlike the structured-data write above, where
 * `withUserContext` would outright fail): `write_health_note` also has a
 * plain EXECUTE grant for `authenticated` and is itself `SECURITY DEFINER`
 * (so it does not need table-level INSERT/UPDATE RLS to succeed), so
 * `withUserContext` would work too. But reusing the exact same
 * write-identity mechanism as every other write in this codebase, rather
 * than introducing a second one just for this function, is what CLAUDE.md's
 * "не додавати залежність/патерн без потреби" spirit and the plan's explicit
 * "шаблон для КОЖНОЇ нової функції запису" both call for.
 *
 * `write_health_note` stamps its own audit row (`sensitive_access_logs`) via
 * `current_app_user_id()` -> `auth.uid()` -> `request.jwt.claims` — the same
 * GUC the `set_config` call below sets transaction-locally, so the actor is
 * recorded correctly.
 */
export async function updateStudentHealthNoteWithPermissions(
  permissions: EffectivePermissions,
  actor: { authUserId: string },
  studentId: string,
  raw: unknown,
): Promise<void> {
  requirePermission(permissions, 'health.write')
  const { content } = UpdateStudentHealthNoteInput.parse(raw)

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('request.jwt.claims', ${JSON.stringify({
      sub: actor.authUserId,
      role: 'authenticated',
    })}, true)`
    await tx.$executeRaw`select write_health_note(${studentId}::uuid, ${content})`
  })
}
