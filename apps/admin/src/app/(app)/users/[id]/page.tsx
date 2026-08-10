import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { z } from 'zod'
import { ChevronLeft, Mail } from 'lucide-react'
import { withUserContext } from '@starland/db'
import { uk } from '@starland/i18n'
import { ConflictError, NotFoundError } from '@starland/domain'
import { requireSession } from '@/lib/session'
import { getEffectivePermissionsProfile } from '@/lib/users/effective-permissions'
import { assignRole, revokeRole, setUserActive } from '@/app/(app)/users/actions'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
import { StatusToggle } from './status-toggle'

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
}

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
  const canManageUsers = session.permissions.can('users.write')

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

  async function submitSetActive(nextIsActive: boolean): Promise<ActionResult> {
    'use server'

    try {
      await setUserActive(id, nextIsActive)
      return { ok: true }
    } catch (err) {
      if (err instanceof ConflictError) return { ok: false, message: uk.users.cannotDeactivateSelf }
      return { ok: false, message: nextIsActive ? uk.users.reactivateError : uk.users.deactivateError }
    }
  }

  return (
    <div className="flex flex-col gap-8 max-w-4xl">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/users" className="hover:text-foreground flex items-center gap-1 transition-colors">
          <ChevronLeft className="size-4" /> Назад до списку користувачів
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
        <div className="flex items-center gap-5">
          <Avatar className="h-20 w-20 rounded-xl bg-indigo-100 text-indigo-700 text-2xl">
            <AvatarFallback className="rounded-xl bg-indigo-100 text-indigo-700 font-semibold shadow-sm">
              {getInitials(user.fullName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-1.5">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{user.fullName}</h1>
            <div className="flex items-center gap-3 text-sm text-muted-foreground font-medium">
              <span className="flex items-center gap-1.5">
                <Mail className="size-4" /> {user.email}
              </span>
              <span className="text-border">•</span>
              <Badge variant={user.isActive ? 'default' : 'outline'} className={user.isActive ? 'bg-success hover:bg-success/90' : 'text-destructive border-destructive'}>
                {user.isActive ? uk.users.active : uk.users.inactive}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {activeRoles.length ? (
                activeRoles.map((ur) => (
                  <Badge key={ur.id} variant="secondary" className="font-medium text-xs">
                    {ur.role.name}
                  </Badge>
                ))
              ) : (
                <span className="text-muted-foreground text-xs">{uk.users.noRoles}</span>
              )}
            </div>
          </div>
        </div>
        {canManageUsers && (
          <div className="flex flex-col items-end gap-2 bg-muted/30 p-3 rounded-lg border border-border/50">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{uk.users.status}</span>
            <StatusToggle
              isActive={user.isActive}
              canManage={canManageUsers}
              setActiveAction={submitSetActive}
            />
          </div>
        )}
      </div>

      <Tabs defaultValue="roles" className="w-full">
        <TabsList className="bg-transparent border-b rounded-none w-full justify-start p-0 h-10 gap-6">
          <TabsTrigger 
            value="roles" 
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-0 py-2 h-10"
          >
            {uk.users.rolesTab}
          </TabsTrigger>
          <TabsTrigger 
            value="effective"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-0 py-2 h-10"
          >
            {uk.users.effectivePermissions}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="roles" className="mt-6">
          <div className="bg-card border rounded-lg p-6 shadow-sm">
            <RolesTab
              activeRoles={activeRoles.map((ur) => ({ id: ur.id, roleCode: ur.role.code, roleName: ur.role.name }))}
              allRoles={allRoles}
              canManage={canManageRoles}
              assignAction={submitAssignRole}
              revokeAction={submitRevokeRole}
            />
          </div>
        </TabsContent>

        <TabsContent value="effective" className="mt-6">
          <div className="bg-card border rounded-lg overflow-hidden shadow-sm">
            {effectiveRows.length ? (
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-10 font-semibold">{uk.users.permission}</TableHead>
                    <TableHead className="h-10 font-semibold">{uk.users.scope}</TableHead>
                    <TableHead className="h-10 font-semibold">{uk.users.source}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {effectiveRows.map((row) => (
                    <TableRow key={`${row.permissionCode}|${row.scopeType}|${row.scopeId ?? ''}`} className="hover:bg-muted/30">
                      <TableCell className="font-medium">{row.permissionCode}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.scopeType}
                        {row.scopeId ? `: ${row.scopeId}` : ''}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          {row.origins.map((origin, i) =>
                            origin.type === 'role' ? (
                              <Badge key={i} variant="secondary">
                                {uk.users.sourceRole}: {origin.roleName}
                              </Badge>
                            ) : (
                              <Badge key={i} variant="outline" className="border-indigo-200 text-indigo-700 bg-indigo-50">
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
              <div className="p-8 text-center text-muted-foreground">
                {uk.users.noEffectivePermissions}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
