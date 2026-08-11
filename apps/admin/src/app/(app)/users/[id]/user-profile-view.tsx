'use client'

import { z } from 'zod'
import { uk } from '@starland/i18n'
import { ConflictError, NotFoundError } from '@starland/domain'
import { assignRole, revokeRole, setUserActive, assignTeaching, revokeTeaching, grantPermission, revokePermissionGrant, updateUser, updateStaffProfile, addAward, removeAward } from '@/app/(app)/users/actions'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { PersonLink } from '@/components/person-link'
import { ActivityLogTab } from '@/components/activity-log-tab'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { GeneralTab } from './general-tab'
import { RolesTab } from './roles-tab'
import { StatusToggle } from './status-toggle'
import { TeachingTab } from './teaching-tab'
import { GrantsTab } from './grants-tab'
import { StaffTab } from '@/components/employee/staff-tab'
import { AwardsTab } from '@/components/employee/awards-tab'
import type { UserProfileData } from './user-profile-content'

type ActionResult = { ok: true } | { ok: false; message: string }

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
}

function formatKyivDate(value: Date | string): string {
  return new Date(value).toLocaleDateString('uk-UA', { timeZone: 'Europe/Kyiv', day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Renders `getUserProfileData`'s result — a plain Client Component, imported
 * directly by `PersonModalProvider` (itself mounted in every page's tree),
 * so `Tabs` and friends are ordinary client bundle content, not something a
 * Server Action tries to ship across the RSC boundary on demand. See the
 * comment atop `user-profile-content.tsx` for why that split exists.
 *
 * Mutation handlers below call the same `apps/admin/src/app/(app)/users/actions.ts`
 * Server Actions the old inline closures did, with identical error mapping
 * — just as plain client-side functions now, since a Client Component can't
 * declare its own `'use server'` closures.
 */
export function UserProfileView({ data }: { data: UserProfileData }) {
  const {
    id,
    user,
    activeRoles,
    allRoles,
    effectiveRows,
    grantedByNameById: grantedByNameEntries,
    teachingAssignments,
    assignableSubjects,
    assignableClasses,
    assignablePeriods,
    activeGrants,
    allPermissions,
    staffProfile,
    staffAwards,
    activityLog,
    staffPositions,
    canManageUsers,
    canManageStaff,
    canViewStaff,
    canManageRoles,
    canViewAuditLog,
    canShowTeachingTab,
  } = data

  const grantedByNameById = new Map(grantedByNameEntries)

  async function submitAssignRole(raw: unknown): Promise<ActionResult> {
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

  async function submitGrantPermission(raw: unknown): Promise<ActionResult> {
    try {
      await grantPermission(id, raw)
      return { ok: true }
    } catch (err) {
      if (err instanceof z.ZodError) return { ok: false, message: err.issues[0]?.message ?? uk.users.grantPermissionError }
      if (err instanceof NotFoundError) return { ok: false, message: uk.users.unknownPermission }
      return { ok: false, message: uk.users.grantPermissionError }
    }
  }

  async function submitRevokePermissionGrant(raw: unknown): Promise<ActionResult> {
    try {
      await revokePermissionGrant(id, raw)
      return { ok: true }
    } catch (err) {
      if (err instanceof z.ZodError) return { ok: false, message: err.issues[0]?.message ?? uk.users.revokePermissionGrantError }
      if (err instanceof NotFoundError) return { ok: false, message: uk.users.revokePermissionGrantError }
      return { ok: false, message: uk.users.revokePermissionGrantError }
    }
  }

  async function submitAssignTeaching(raw: unknown): Promise<ActionResult> {
    try {
      await assignTeaching(id, raw)
      return { ok: true }
    } catch (err) {
      if (err instanceof z.ZodError) return { ok: false, message: err.issues[0]?.message ?? uk.users.assignTeachingError }
      if (err instanceof ConflictError) return { ok: false, message: uk.users.alreadyTeaching }
      if (err instanceof NotFoundError) return { ok: false, message: uk.users.unknownTeachingTarget }
      return { ok: false, message: uk.users.assignTeachingError }
    }
  }

  async function submitRevokeTeaching(raw: unknown): Promise<ActionResult> {
    try {
      await revokeTeaching(id, raw)
      return { ok: true }
    } catch (err) {
      if (err instanceof z.ZodError) return { ok: false, message: err.issues[0]?.message ?? uk.users.revokeTeachingError }
      if (err instanceof NotFoundError) return { ok: false, message: uk.users.revokeTeachingError }
      return { ok: false, message: uk.users.revokeTeachingError }
    }
  }

  async function submitSetActive(nextIsActive: boolean): Promise<ActionResult> {
    try {
      await setUserActive(id, nextIsActive)
      return { ok: true }
    } catch (err) {
      if (err instanceof ConflictError) return { ok: false, message: uk.users.cannotDeactivateSelf }
      return { ok: false, message: nextIsActive ? uk.users.reactivateError : uk.users.deactivateError }
    }
  }

  async function submitUpdateUser(raw: unknown): Promise<ActionResult> {
    try {
      await updateUser(id, raw)
      return { ok: true }
    } catch (err) {
      if (err instanceof z.ZodError) return { ok: false, message: err.issues[0]?.message ?? uk.users.updateError }
      return { ok: false, message: uk.users.updateError }
    }
  }

  async function submitSaveStaffProfile(raw: unknown): Promise<ActionResult> {
    try {
      await updateStaffProfile(id, raw)
      return { ok: true }
    } catch (err) {
      if (err instanceof z.ZodError) return { ok: false, message: err.issues[0]?.message ?? uk.users.staffProfileSaveError }
      return { ok: false, message: uk.users.staffProfileSaveError }
    }
  }

  async function submitAddAward(raw: unknown): Promise<ActionResult> {
    try {
      await addAward(id, raw)
      return { ok: true }
    } catch (err) {
      if (err instanceof z.ZodError) return { ok: false, message: err.issues[0]?.message ?? uk.users.addAwardError }
      return { ok: false, message: uk.users.addAwardError }
    }
  }

  async function submitRemoveAward(raw: unknown): Promise<ActionResult> {
    try {
      await removeAward(id, raw)
      return { ok: true }
    } catch (err) {
      if (err instanceof z.ZodError) return { ok: false, message: err.issues[0]?.message ?? uk.users.removeAwardError }
      if (err instanceof NotFoundError) return { ok: false, message: uk.users.removeAwardError }
      return { ok: false, message: uk.users.removeAwardError }
    }
  }

  // "Дозвіл"/"Скоуп" on the effective-permissions tab show the same
  // human-readable labels a director already sees when issuing a grant
  // (permissions.description), not the raw permission_code/scope_type the
  // RLS layer actually keys off — those stay the source of truth underneath,
  // this is display-only translation.
  const permissionDescriptionByCode = new Map(allPermissions.map((p) => [p.code, p.description]))

  return (
    <div className="flex flex-col gap-8 pb-8">
      {/* Header Info */}
      <div className="flex gap-2 pb-6">
        <Avatar className="h-48 w-48 rounded-none">
          <AvatarFallback className="bg-muted text-muted-foreground text-xl rounded-none font-medium">
            {getInitials(user.fullName)}
          </AvatarFallback>
        </Avatar>
        <div className="flex items-center">
          <div className="flex flex-col">
            <h2 className="text-2xl font-semibold tracking-tight">{user.fullName}</h2>
            <div className="items-start flex flex-col flex-wrap items-center text-sm text-muted-foreground">
              <span>{user.email}</span>
              <span>{uk.users.registeredOn} {formatKyivDate(user.createdAt)}</span>
              <span>{uk.users.userId}: {user.id}</span>
            </div>
            <div className="flex items-center gap-3">
              {canManageUsers ? (
                <StatusToggle
                  isActive={user.isActive}
                  canManage={canManageUsers}
                  setActiveAction={submitSetActive}
                  showBadge={true}
                  buttonClassName="rounded-none shadow-none"
                />
              ) : (
                <Badge variant={user.isActive ? 'default' : 'outline'} className={user.isActive ? 'bg-success hover:bg-success rounded-none shadow-none' : 'rounded-none shadow-none'}>
                  {user.isActive ? uk.users.active : uk.users.inactive}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="bg-transparent border-b w-full justify-start rounded-none p-0 mb-8 gap-8 h-auto flex-wrap">
          <TabsTrigger value="general" className="rounded-none px-0 py-2.5 text-sm font-medium border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none data-[state=active]:bg-transparent">{uk.users.generalTab}</TabsTrigger>
          <TabsTrigger value="roles" className="rounded-none px-0 py-2.5 text-sm font-medium border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none data-[state=active]:bg-transparent">{uk.users.rolesTab}</TabsTrigger>
          <TabsTrigger value="effective" className="rounded-none px-0 py-2.5 text-sm font-medium border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none data-[state=active]:bg-transparent">{uk.users.effectivePermissions}</TabsTrigger>
          {canShowTeachingTab && (
            <TabsTrigger value="teaching" className="rounded-none px-0 py-2.5 text-sm font-medium border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none data-[state=active]:bg-transparent">{uk.users.teachingTab}</TabsTrigger>
          )}
          {canViewStaff && (
            <TabsTrigger value="staff" className="rounded-none px-0 py-2.5 text-sm font-medium border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none data-[state=active]:bg-transparent">{uk.users.staffTab}</TabsTrigger>
          )}
          {canViewStaff && (
            <TabsTrigger value="awards" className="rounded-none px-0 py-2.5 text-sm font-medium border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none data-[state=active]:bg-transparent">{uk.users.awardsTab}</TabsTrigger>
          )}
          {canViewAuditLog && (
            <TabsTrigger value="activity" className="rounded-none px-0 py-2.5 text-sm font-medium border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none data-[state=active]:bg-transparent">{uk.users.activityLogTab}</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="general" className="space-y-6 mt-0">
          <GeneralTab
            id={user.id}
            fullName={user.fullName}
            email={user.email}
            registeredOn={formatKyivDate(user.createdAt)}
            canManage={canManageUsers}
            updateAction={submitUpdateUser}
          />
        </TabsContent>

        <TabsContent value="roles" className="mt-0">
          <div className="border border-border p-6 space-y-8">
            <RolesTab
              activeRoles={activeRoles}
              allRoles={allRoles}
              canManage={canManageRoles}
              assignAction={submitAssignRole}
              revokeAction={submitRevokeRole}
            />
            <GrantsTab
              grants={activeGrants}
              permissions={allPermissions}
              canManage={canManageRoles}
              grantAction={submitGrantPermission}
              revokeAction={submitRevokePermissionGrant}
            />
          </div>
        </TabsContent>

        <TabsContent value="effective" className="mt-0">
          <div className="border border-border overflow-hidden">
            {effectiveRows.length ? (
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-10 font-semibold">{uk.users.permission}</TableHead>
                    <TableHead className="h-10 font-semibold">{uk.users.scope}</TableHead>
                    <TableHead className="h-10 font-semibold">{uk.users.source}</TableHead>
                    <TableHead className="h-10 font-semibold">{uk.users.grantedByAndWhen}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {effectiveRows.map((row) => (
                    <TableRow key={`${row.permissionCode}|${row.scopeType}|${row.scopeId ?? ''}`} className="hover:bg-muted/20">
                      <TableCell className="font-medium">{permissionDescriptionByCode.get(row.permissionCode) ?? row.permissionCode}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {uk.users.scopeTypes[row.scopeType]}
                        {row.scopeId ? `: ${row.scopeId}` : ''}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          {row.origins.map((origin, i) =>
                            origin.type === 'role' ? (
                              <Badge key={i} variant="secondary" className="rounded-none">
                                {uk.users.sourceRole}: {origin.roleName}
                              </Badge>
                            ) : (
                              <Badge key={i} variant="outline" className="border-indigo-200 text-indigo-700 bg-indigo-50 rounded-none">
                                {uk.users.sourceGrant}: {origin.reason}
                              </Badge>
                            ),
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1.5">
                          {row.origins.map((origin, i) => (
                            <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              {origin.grantedBy ? (
                                <PersonLink id={origin.grantedBy} kind="user" name={grantedByNameById.get(origin.grantedBy) ?? origin.grantedBy} />
                              ) : (
                                <span>—</span>
                              )}
                              <span>· {formatKyivDate(origin.createdAt)}</span>
                            </div>
                          ))}
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

        {canShowTeachingTab && (
          <TabsContent value="teaching" className="mt-0">
            <div className="border border-border p-6">
              <TeachingTab
                assignments={teachingAssignments}
                subjects={assignableSubjects}
                classes={assignableClasses}
                periods={assignablePeriods}
                canManage={canManageStaff}
                assignAction={submitAssignTeaching}
                revokeAction={submitRevokeTeaching}
              />
            </div>
          </TabsContent>
        )}

        {canViewStaff && (
          <TabsContent value="staff" className="mt-0">
            <div className="border border-border p-6">
              <StaffTab
                profile={staffProfile}
                positions={staffPositions}
                canManage={canManageStaff}
                saveProfileAction={submitSaveStaffProfile}
              />
            </div>
          </TabsContent>
        )}

        {canViewStaff && (
          <TabsContent value="awards" className="mt-0">
            <div className="border border-border p-6">
              <AwardsTab
                awards={staffAwards}
                canManage={canManageStaff}
                addAwardAction={submitAddAward}
                removeAwardAction={submitRemoveAward}
              />
            </div>
          </TabsContent>
        )}

        {canViewAuditLog && (
          <TabsContent value="activity" className="mt-0">
            <div className="border border-border overflow-hidden">
              <ActivityLogTab rows={activityLog} />
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
