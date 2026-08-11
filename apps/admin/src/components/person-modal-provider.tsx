'use client'

import { createContext, useContext, useRef, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { uk } from '@starland/i18n'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { loadUserProfileData, loadNewUserData } from '@/app/(app)/users/modal-actions'
import { loadStudentProfileData, loadNewStudentData } from '@/app/(app)/students/modal-actions'
import { loadStaffProfileData, loadNewEmployeeData } from '@/app/(app)/staff/modal-actions'
import { UserProfileView } from '@/app/(app)/users/[id]/user-profile-view'
import { NewUserView } from '@/app/(app)/users/new/new-user-view'
import { StudentProfileView } from '@/app/(app)/students/[id]/student-profile-view'
import { NewStudentView } from '@/app/(app)/students/new/new-student-view'
import { StaffProfileView } from '@/app/(app)/staff/[id]/staff-profile-view'
import { NewEmployeeView } from '@/app/(app)/staff/new/new-employee-view'

type View = 'user' | 'student' | 'staff' | 'new-user' | 'new-student' | 'new-staff'
type Result = { view: View; data: unknown }
type Loader = () => Promise<Result>

type PersonModalContextValue = {
  openUser: (id: string) => void
  openNewUser: () => void
  openStudent: (id: string) => void
  openNewStudent: () => void
  openStaff: (id: string) => void
  openNewStaff: () => void
  close: () => void
  /**
   * Re-runs whatever created the currently open modal (no-op if none is
   * open) and refreshes the Server Component data behind it. Every mutation
   * handler in a profile/create form calls this instead of
   * `router.refresh()` — that alone only re-renders the route underneath,
   * which the modal is no longer tied to (CLAUDE.md decision: modals never
   * change the URL, so there's no route to re-render into).
   */
  refresh: () => void
}

const PersonModalContext = createContext<PersonModalContextValue | null>(null)

export function usePersonModal(): PersonModalContextValue {
  const ctx = useContext(PersonModalContext)
  if (!ctx) throw new Error('usePersonModal must be used within PersonModalProvider')
  return ctx
}

function renderResult(result: Result | null): ReactNode {
  if (!result) return null
  switch (result.view) {
    case 'user':
      return <UserProfileView data={result.data as Parameters<typeof UserProfileView>[0]['data']} />
    case 'student':
      return <StudentProfileView data={result.data as Parameters<typeof StudentProfileView>[0]['data']} />
    case 'staff':
      return <StaffProfileView data={result.data as Parameters<typeof StaffProfileView>[0]['data']} />
    case 'new-user':
      return <NewUserView data={result.data as Parameters<typeof NewUserView>[0]['data']} />
    case 'new-student':
      return <NewStudentView data={result.data as Parameters<typeof NewStudentView>[0]['data']} />
    case 'new-staff':
      return <NewEmployeeView data={result.data as Parameters<typeof NewEmployeeView>[0]['data']} />
  }
}

/**
 * Single app-wide host for every person/entity modal — mounted once in
 * `(app)/layout.tsx` so any component, at any nesting depth (a list row, a
 * "granted by" link three tabs deep in another modal), can open one via
 * `usePersonModal()`. There is deliberately no route behind any of this:
 * `/users/[id]`, `/students/new`, etc. do not exist as pages — a Server
 * Action fetches plain data on demand (`load*Data`) and a Client Component
 * (`*View`, imported directly here — not shipped across the RSC boundary)
 * renders it.
 *
 * That split — action returns data, an already-in-the-client-bundle
 * component renders it — is not a style preference. A Server Action that
 * *returns JSX* only works if the Client Components inside it (Radix
 * `Tabs`, `Select`, ...) are also statically reachable from some
 * `page.tsx`; since no route renders a profile/create form anymore, that
 * doesn't hold, and it crashes with "Could not find the module ... in the
 * React Client Manifest" (vercel/next.js#59565, #58125, #85883 — true on
 * both Turbopack and webpack). Importing the `*View` components directly
 * into this file sidesteps the whole problem: they're ordinary client
 * bundle content, reachable the normal way from every page via this
 * provider.
 */
export function PersonModalProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [, startTransition] = useTransition()
  const loaderRef = useRef<Loader | null>(null)

  function runLoader(loader: Loader, modalTitle: string) {
    loaderRef.current = loader
    setTitle(modalTitle)
    setResult(null)
    setOpen(true)
    startTransition(async () => {
      try {
        const next = await loader()
        setResult(next)
      } catch {
        toast.error(uk.common.loadError)
        setOpen(false)
        loaderRef.current = null
      }
    })
  }

  function close() {
    setOpen(false)
    loaderRef.current = null
    setResult(null)
  }

  function refresh() {
    router.refresh()
    const loader = loaderRef.current
    if (!loader) return
    startTransition(async () => {
      try {
        const next = await loader()
        setResult(next)
      } catch {
        // A transient refresh failure leaves the (now possibly stale)
        // content in place rather than yanking the modal away mid-edit.
      }
    })
  }

  const value: PersonModalContextValue = {
    openUser: (id) => runLoader(async () => ({ view: 'user', data: await loadUserProfileData(id) }), uk.users.profile),
    openNewUser: () => runLoader(async () => ({ view: 'new-user', data: await loadNewUserData() }), uk.users.newUser),
    openStudent: (id) => runLoader(async () => ({ view: 'student', data: await loadStudentProfileData(id) }), uk.students.profile),
    openNewStudent: () => runLoader(async () => ({ view: 'new-student', data: await loadNewStudentData() }), uk.students.newStudent),
    openStaff: (id) => runLoader(() => loadStaffProfileData(id), uk.staff.profile),
    openNewStaff: () => runLoader(async () => ({ view: 'new-staff', data: await loadNewEmployeeData() }), uk.staff.addEmployee),
    close,
    refresh,
  }

  return (
    <PersonModalContext.Provider value={value}>
      {children}
      <Dialog open={open} onOpenChange={(next) => { if (!next) close() }}>
        <DialogContent className="max-w-7xl max-h-[85vh] overflow-y-auto">
          <DialogTitle className="sr-only">{title}</DialogTitle>
          {result ? renderResult(result) : <div className="p-8 text-center text-muted-foreground">{uk.common.loading}</div>}
        </DialogContent>
      </Dialog>
    </PersonModalContext.Provider>
  )
}
