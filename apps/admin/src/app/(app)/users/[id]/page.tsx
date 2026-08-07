import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'
import { withUserContext } from '@starland/db'
import { uk } from '@starland/i18n'
import { ConflictError, NotFoundError } from '@starland/domain'
import { requireSession } from '@/lib/session'
import { getEffectivePermissionsProfile } from '@/lib/users/effective-permissions'
import { assignRole, revokeRole } from '@/app/(app)/users/actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { RolesTab } from './roles-tab'

export default async function UserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requireSession()
  if (!session.permissions.can('users.read')) redirect('/')

  const { user, activeRoles, allRoles, effectiveRows } = await withUserContext(session.authUserId, async (tx) => {
    const user = await tx.appUser.findUnique({ where: { id } })
    if (!user) return { user: null, activeRoles: [], allRoles: [], effectiveRows: [] }

    const [activeRoles, allRoles, effectiveRows] = await Promise.all([
      tx.userRole.findMany({ where: { userId: id, revokedAt: null }, include: { role: true } }),
      tx.role.findMany({ orderBy: [{ name: 'asc' }], select: { code: true, name: true } }),
      getEffectivePermissionsProfile(tx, session.permissions, { userId: id }),
    ])
    return { user, activeRoles, allRoles, effectiveRows }
  })
  if (!user) notFound()

  const canManageRoles = session.permissions.can('roles.manage')

  type ActionResult = { ok: true } | { ok: false; message: string }

  async function submitAssignRole(raw: unknown): Promise<ActionResult> {
    'use server'

    try {
      await assignRole(id, raw)
      return { ok: true }
    } catch (err) {
      if (err instanceof z.ZodError) return { ok: false, message: err.issues[0]?.message ?? uk.users.assignError }
      if (err instanceof ConflictError) return { ok: false, message: err.message }
      if (err instanceof NotFoundError) return { ok: false, message: uk.users.unknownRole }
      return { ok: false, message: uk.users.assignError }
    }
  }

  async function submitRevokeRole(raw: unknown): Promise<ActionResult> {
    'use server'

    try {
      await revokeRole(id, raw)
      return { ok: true }
    } catch (err) {
      if (err instanceof z.ZodError) return { ok: false, message: err.issues[0]?.message ?? uk.users.revokeError }
      if (err instanceof ConflictError) return { ok: false, message: err.message }
      if (err instanceof NotFoundError) return { ok: false, message: uk.users.revokeError }
      return { ok: false, message: uk.users.revokeError }
    }
  }

  return (
    <main className="p-6">
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>
            {uk.users.profile}: {user.fullName}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">{uk.users.overview}</TabsTrigger>
              <TabsTrigger value="roles">{uk.users.rolesTab}</TabsTrigger>
              <TabsTrigger value="effective">{uk.users.effectivePermissions}</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-3">
              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <span className="text-muted-foreground">{uk.users.fullName}</span>
                <span>{user.fullName}</span>
                <span className="text-muted-foreground">{uk.users.email}</span>
                <span>{user.email}</span>
                <span className="text-muted-foreground">{uk.users.status}</span>
                <span>
                  <Badge variant={user.isActive ? 'default' : 'outline'}>
                    {user.isActive ? uk.users.active : uk.users.inactive}
                  </Badge>
                </span>
                <span className="text-muted-foreground">{uk.users.activeRoles}</span>
                <span className="flex flex-wrap gap-1">
                  {activeRoles.length ? (
                    activeRoles.map((ur) => (
                      <Badge key={ur.id} variant="secondary">
                        {ur.role.name}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-muted-foreground">{uk.users.noRoles}</span>
                  )}
                </span>
              </div>
            </TabsContent>

            <TabsContent value="roles">
              <RolesTab
                activeRoles={activeRoles.map((ur) => ({ id: ur.id, roleCode: ur.role.code, roleName: ur.role.name }))}
                allRoles={allRoles}
                canManage={canManageRoles}
                assignAction={submitAssignRole}
                revokeAction={submitRevokeRole}
              />
            </TabsContent>

            <TabsContent value="effective">
              {effectiveRows.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{uk.users.permission}</TableHead>
                      <TableHead>{uk.users.scope}</TableHead>
                      <TableHead>{uk.users.source}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {effectiveRows.map((row) => (
                      <TableRow key={`${row.permissionCode}|${row.scopeType}|${row.scopeId ?? ''}`}>
                        <TableCell>{row.permissionCode}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {row.scopeType}
                          {row.scopeId ? `: ${row.scopeId}` : ''}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {row.origins.map((origin, i) =>
                              origin.type === 'role' ? (
                                <Badge key={i} variant="secondary">
                                  {uk.users.sourceRole}: {origin.roleName}
                                </Badge>
                              ) : (
                                <Badge key={i} variant="outline">
                                  {uk.users.sourceGrant}: {origin.reason}
                                </Badge>
                              ),
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground text-sm">{uk.users.noEffectivePermissions}</p>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </main>
  )
}
