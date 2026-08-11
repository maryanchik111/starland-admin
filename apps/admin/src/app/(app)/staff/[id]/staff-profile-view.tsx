'use client'

import { z } from 'zod'
import { uk } from '@starland/i18n'
import { updateEmployeeProfile, addEmployeeAward, removeEmployeeAward } from '@/app/(app)/staff/actions'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StaffTab } from '@/components/employee/staff-tab'
import { AwardsTab } from '@/components/employee/awards-tab'
import { ActivityLogTab } from '@/components/activity-log-tab'
import type { StaffProfileData } from './staff-profile-content'

type ActionResult = { ok: true } | { ok: false; message: string }

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase()
}

/**
 * Renders the `{ view: 'staff' }` branch of `getStaffProfileData`'s result
 * — a plain Client Component. See the comment atop
 * `apps/admin/src/app/(app)/users/[id]/user-profile-content.tsx` for why
 * this split from the old server-rendered shell exists. The `{ view: 'user' }`
 * branch renders `UserProfileView` instead — picked by `PersonModalProvider`.
 */
export function StaffProfileView({ data }: { data: StaffProfileData }) {
  const { id, fullName, profile, awards, positions, activityLog, canManageStaff, canViewAuditLog } = data

  async function submitSaveStaffProfile(raw: unknown): Promise<ActionResult> {
    try {
      await updateEmployeeProfile(id, raw)
      return { ok: true }
    } catch (err) {
      if (err instanceof z.ZodError) return { ok: false, message: err.issues[0]?.message ?? uk.users.staffProfileSaveError }
      return { ok: false, message: uk.users.staffProfileSaveError }
    }
  }

  async function submitAddAward(raw: unknown): Promise<ActionResult> {
    try {
      await addEmployeeAward(id, raw)
      return { ok: true }
    } catch (err) {
      if (err instanceof z.ZodError) return { ok: false, message: err.issues[0]?.message ?? uk.users.addAwardError }
      return { ok: false, message: uk.users.addAwardError }
    }
  }

  async function submitRemoveAward(raw: unknown): Promise<ActionResult> {
    try {
      await removeEmployeeAward(id, raw)
      return { ok: true }
    } catch (err) {
      if (err instanceof z.ZodError) return { ok: false, message: err.issues[0]?.message ?? uk.users.removeAwardError }
      return { ok: false, message: uk.users.removeAwardError }
    }
  }

  return (
    <div className="flex flex-col gap-8 pb-8">
      <div className="flex gap-2 pb-6">
        <Avatar className="h-48 w-48 rounded-none">
          <AvatarFallback className="bg-muted text-muted-foreground text-xl rounded-none font-medium">
            {getInitials(fullName)}
          </AvatarFallback>
        </Avatar>
        <div className="flex items-center">
          <div className="flex flex-col">
            <h2 className="text-2xl font-semibold tracking-tight">{fullName}</h2>
            <div className="items-start flex flex-col flex-wrap items-center text-sm text-muted-foreground">
              <span>{uk.users.userId}: {id}</span>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <Badge variant="outline" className="rounded-none shadow-none">{uk.staff.noAccount}</Badge>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="staff" className="w-full">
        <TabsList className="bg-transparent border-b w-full justify-start rounded-none p-0 mb-8 gap-8 h-auto flex-wrap">
          <TabsTrigger value="staff" className="rounded-none px-0 py-2.5 text-sm font-medium border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none data-[state=active]:bg-transparent">{uk.users.staffTab}</TabsTrigger>
          <TabsTrigger value="awards" className="rounded-none px-0 py-2.5 text-sm font-medium border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none data-[state=active]:bg-transparent">{uk.users.awardsTab}</TabsTrigger>
          {canViewAuditLog && (
            <TabsTrigger value="activity" className="rounded-none px-0 py-2.5 text-sm font-medium border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none data-[state=active]:bg-transparent">{uk.users.activityLogTab}</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="staff" className="mt-0">
          <div className="border border-border p-6">
            <StaffTab
              profile={profile}
              positions={positions}
              canManage={canManageStaff}
              saveProfileAction={submitSaveStaffProfile}
            />
          </div>
        </TabsContent>

        <TabsContent value="awards" className="mt-0">
          <div className="border border-border p-6">
            <AwardsTab
              awards={awards}
              canManage={canManageStaff}
              addAwardAction={submitAddAward}
              removeAwardAction={submitRemoveAward}
            />
          </div>
        </TabsContent>

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
