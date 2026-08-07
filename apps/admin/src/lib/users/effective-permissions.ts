import { prisma } from '@starland/db'
import { requirePermission, type EffectivePermissions, type ScopeType } from '@starland/domain'

export type PermissionOrigin =
  | { type: 'role'; roleId: string; roleCode: string; roleName: string }
  | { type: 'grant'; grantId: string; reason: string; grantedBy: string; expiresAt: Date | null }

export interface EffectivePermissionRow {
  permissionCode: string
  scopeType: ScopeType
  scopeId: string | null
  origins: PermissionOrigin[]
}

/**
 * Structurally identical to `withUserContext`'s tx client (same generated
 * Prisma schema) — typed off `prisma` here only because `@starland/db`
 * exports the privileged client but not the transaction type by name.
 */
type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

function key(permissionCode: string, scopeType: string, scopeId: string | null): string {
  return `${permissionCode}|${scopeType}|${scopeId ?? ''}`
}

/**
 * Independently recomputes "who granted this permission, and how" from the
 * same source tables `refresh_user_effective_scopes()` reads (user_roles →
 * role_permissions, expanded through teaching_assignments/classes/
 * linked_accounts per scope_kind, plus active permission_grants), then
 * cross-checks the result against the materialized `user_effective_scopes`
 * rows.
 *
 * This is the profile screen's core invariant (CLAUDE.md §3, Task 8 spec):
 * every row shown on screen must be 1-to-1 with user_effective_scopes, and
 * vice versa. A mismatch means the SQL projection and this TS recomputation
 * have drifted apart — surfaced as an error rather than silently shown,
 * since a screen that can diverge from the real access check is exactly
 * what CLAUDE.md §3 forbids ("будується з тієї самої проєкції, що виконує
 * перевірку").
 *
 * `tx` must be a `withUserContext` transaction client, not the privileged
 * `prisma` export — this is a read, and ADR 0001 requires reads to go
 * through RLS (`app_runtime`), not the migrations-only bypass connection.
 */
export async function getEffectivePermissionsProfile(
  tx: TxClient,
  permissions: EffectivePermissions,
  target: { userId: string },
): Promise<EffectivePermissionRow[]> {
  requirePermission(permissions, 'users.read')

  const [materialized, activeRoles, activeGrants, teachingAssignments, mentoredClasses, linkedAccounts] =
    await Promise.all([
      tx.userEffectiveScope.findMany({ where: { userId: target.userId } }),
      tx.userRole.findMany({
        where: { userId: target.userId, revokedAt: null },
        include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
      }),
      tx.permissionGrant.findMany({
        where: {
          userId: target.userId,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        include: { permission: true },
      }),
      tx.teachingAssignment.findMany({ where: { teacherUserId: target.userId, deletedAt: null } }),
      tx.class.findMany({ where: { mentorUserId: target.userId, deletedAt: null } }),
      tx.linkedAccount.findMany({ where: { ownerUserId: target.userId } }),
    ])

  const origins = new Map<string, PermissionOrigin[]>()
  function addOrigin(permissionCode: string, scopeType: string, scopeId: string | null, origin: PermissionOrigin) {
    const k = key(permissionCode, scopeType, scopeId)
    const list = origins.get(k) ?? []
    list.push(origin)
    origins.set(k, list)
  }

  for (const userRole of activeRoles) {
    const roleOrigin = (): PermissionOrigin => ({
      type: 'role',
      roleId: userRole.role.id,
      roleCode: userRole.role.code,
      roleName: userRole.role.name,
    })
    for (const rp of userRole.role.rolePermissions) {
      const code = rp.permission.code
      switch (rp.scopeKind) {
        case 'global':
          addOrigin(code, 'global', null, roleOrigin())
          break
        case 'own_teaching':
          for (const ta of teachingAssignments) addOrigin(code, 'teaching_assignment', ta.id, roleOrigin())
          break
        case 'mentor_classes':
          for (const cls of mentoredClasses) addOrigin(code, 'class', cls.id, roleOrigin())
          break
        case 'own_children':
          for (const la of linkedAccounts) addOrigin(code, 'student', la.studentId, roleOrigin())
          break
        case 'self':
          // Never materialized by refresh_user_effective_scopes() — no
          // scope_type mapping exists for it, so it contributes nothing here.
          break
      }
    }
  }

  const denyGrants = activeGrants.filter((g) => g.effect === 'deny')
  for (const grant of activeGrants) {
    if (grant.effect !== 'allow') continue
    addOrigin(grant.permission.code, grant.scopeType, grant.scopeId, {
      type: 'grant',
      grantId: grant.id,
      reason: grant.reason,
      grantedBy: grant.grantedBy,
      expiresAt: grant.expiresAt,
    })
  }

  // Mirrors refresh_user_effective_scopes() step 6: a deny grant removes
  // every row for its permission code — every scope if scopeType is
  // 'global', otherwise only the matching (scopeType, scopeId) pair.
  for (const deny of denyGrants) {
    for (const k of [...origins.keys()]) {
      const [code, scopeType, scopeId] = k.split('|')
      if (code !== deny.permission.code) continue
      if (deny.scopeType === 'global' || (scopeType === deny.scopeType && (scopeId || null) === deny.scopeId)) {
        origins.delete(k)
      }
    }
  }

  const rows: EffectivePermissionRow[] = materialized.map((row) => {
    const k = key(row.permissionCode, row.scopeType, row.scopeId)
    const rowOrigins = origins.get(k)
    if (!rowOrigins || rowOrigins.length === 0) {
      throw new Error(
        `Effective permissions drift: user_effective_scopes has ${k} for user ${target.userId} with no matching role or grant`,
      )
    }
    origins.delete(k)
    return { permissionCode: row.permissionCode, scopeType: row.scopeType, scopeId: row.scopeId, origins: rowOrigins }
  })

  if (origins.size > 0) {
    throw new Error(
      `Effective permissions drift: computed ${[...origins.keys()].join(', ')} for user ${target.userId} with no matching user_effective_scopes row`,
    )
  }

  return rows
}
