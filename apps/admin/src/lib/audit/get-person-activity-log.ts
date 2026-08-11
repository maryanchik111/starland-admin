import { prisma } from '@starland/db'
import { requirePermission, type EffectivePermissions } from '@starland/domain'

/**
 * Structurally identical to `withUserContext`'s tx client (same generated
 * Prisma schema) — typed off `prisma` here only because `@starland/db`
 * exports the privileged client but not the transaction type by name. Same
 * convention as `apps/admin/src/lib/users/effective-permissions.ts`.
 */
type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

export type ActivityLogTarget = { entityType: string; entityId: string }

export type ActivityLogRow = {
  id: string
  entityType: string
  action: string
  changedFields: string[]
  actorId: string | null
  actorName: string | null
  occurredAt: Date
}

/**
 * Which top-level JSON keys actually differ between `old_values` and
 * `new_values`. Deliberately returns key names only, never values — for
 * tables audited by `trg_write_audit_log_redacted()` (app_users, employees,
 * students) the values are already the literal string '[REDACTED]', but for
 * tables audited by the plain `trg_write_audit_log()` (user_roles,
 * permission_grants, teaching_assignments) the real values ARE stored, and
 * some of those (e.g. a grant's free-text `reason`) are not meant for
 * display here — CLAUDE.md §3's "журнал дій" requirement is about *what*
 * changed and *who*, not a value inspector.
 */
function changedFields(action: string, oldValues: unknown, newValues: unknown): string[] {
  const oldObj = oldValues && typeof oldValues === 'object' ? (oldValues as Record<string, unknown>) : {}
  const newObj = newValues && typeof newValues === 'object' ? (newValues as Record<string, unknown>) : {}
  if (action === 'INSERT') return Object.keys(newObj)
  if (action === 'DELETE') return Object.keys(oldObj)
  const keys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)])
  return [...keys].filter((key) => JSON.stringify(oldObj[key]) !== JSON.stringify(newObj[key]))
}

/**
 * Aggregated activity trail for one person: `audit_logs` keys rows by
 * `(entity_type, entity_id)` of the table actually written to, which for
 * roles/grants/teaching assignments is the join row's own id, not the
 * person's — callers must resolve the full set of target rows (including
 * revoked/historical ones, not just the currently-active set another tab
 * might already have in hand) before calling this.
 */
export async function getPersonActivityLogWithPermissions(
  permissions: EffectivePermissions,
  tx: TxClient,
  targets: ActivityLogTarget[],
): Promise<ActivityLogRow[]> {
  requirePermission(permissions, 'audit.read')
  if (targets.length === 0) return []

  const rows = await tx.auditLog.findMany({
    where: { OR: targets.map((t) => ({ entityType: t.entityType, entityId: t.entityId })) },
    orderBy: [{ createdAt: 'desc' }],
  })

  const actorIds = [...new Set(rows.map((r) => r.userId).filter((v): v is string => v !== null))]
  const actors = actorIds.length
    ? await tx.appUser.findMany({ where: { id: { in: actorIds } }, select: { id: true, fullName: true } })
    : []
  const actorNameById = new Map(actors.map((a) => [a.id, a.fullName]))

  return rows.map((row) => ({
    id: row.id,
    entityType: row.entityType,
    action: row.action,
    changedFields: changedFields(row.action, row.oldValues, row.newValues),
    actorId: row.userId,
    actorName: row.userId ? (actorNameById.get(row.userId) ?? null) : null,
    occurredAt: row.createdAt,
  }))
}
