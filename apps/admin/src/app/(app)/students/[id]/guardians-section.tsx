'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { uk } from '@starland/i18n'
import { usePersonModal } from '@/components/person-modal-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'

type ActionResult = { ok: true } | { ok: false; message: string }
type GuardianRow = {
  guardianshipId: string
  fullName: string
  relation: string
  phone: string | null
}
type SearchResult = { id: string; name: string; phone: string | null }

const emptyRelationFields = {
  relation: '',
  isLegalRepresentative: false,
  canPickUp: true,
  receivesNotifications: true,
}

export function GuardiansSection({
  guardians,
  canManage,
  searchAction,
  linkAction,
  unlinkAction,
}: {
  guardians: GuardianRow[]
  canManage: boolean
  searchAction: (query: string) => Promise<SearchResult[]>
  linkAction: (raw: unknown) => Promise<ActionResult>
  unlinkAction: (guardianshipId: string) => Promise<ActionResult>
}) {
  const { refresh } = usePersonModal()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedPerson, setSelectedPerson] = useState<SearchResult | null>(null)

  const [newFirstName, setNewFirstName] = useState('')
  const [newLastName, setNewLastName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newEmail, setNewEmail] = useState('')

  const [relation, setRelation] = useState(emptyRelationFields.relation)
  const [isLegalRepresentative, setIsLegalRepresentative] = useState(emptyRelationFields.isLegalRepresentative)
  const [canPickUp, setCanPickUp] = useState(emptyRelationFields.canPickUp)
  const [receivesNotifications, setReceivesNotifications] = useState(emptyRelationFields.receivesNotifications)

  function resetForm() {
    setQuery('')
    setResults([])
    setSelectedPerson(null)
    setNewFirstName('')
    setNewLastName('')
    setNewPhone('')
    setNewEmail('')
    setRelation(emptyRelationFields.relation)
    setIsLegalRepresentative(emptyRelationFields.isLegalRepresentative)
    setCanPickUp(emptyRelationFields.canPickUp)
    setReceivesNotifications(emptyRelationFields.receivesNotifications)
  }

  function handleSearch(value: string) {
    setQuery(value)
    setSelectedPerson(null)
    if (value.trim().length < 2) {
      setResults([])
      return
    }
    setIsSearching(true)
    startTransition(async () => {
      const found = await searchAction(value)
      setResults(found)
      setIsSearching(false)
    })
  }

  function handleLinkExisting() {
    if (!selectedPerson || !relation.trim()) return
    startTransition(async () => {
      const result = await linkAction({
        mode: 'existing',
        personId: selectedPerson.id,
        relation,
        isLegalRepresentative,
        canPickUp,
        receivesNotifications,
      })
      if (result.ok) {
        toast.success(uk.students.linkSuccess)
        setOpen(false)
        resetForm()
        refresh()
        return
      }
      toast.error(result.message)
    })
  }

  function handleCreateNew() {
    if (!newFirstName.trim() || !newLastName.trim() || !relation.trim()) return
    startTransition(async () => {
      const result = await linkAction({
        mode: 'new',
        firstName: newFirstName,
        lastName: newLastName,
        phone: newPhone || undefined,
        email: newEmail || undefined,
        relation,
        isLegalRepresentative,
        canPickUp,
        receivesNotifications,
      })
      if (result.ok) {
        toast.success(uk.students.linkSuccess)
        setOpen(false)
        resetForm()
        refresh()
        return
      }
      toast.error(result.message)
    })
  }

  function handleUnlink(guardianshipId: string) {
    startTransition(async () => {
      const result = await unlinkAction(guardianshipId)
      if (result.ok) {
        toast.success(uk.students.unlinkSuccess)
        refresh()
        return
      }
      toast.error(result.message)
    })
  }

  const relationFields = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="relation">{uk.students.relation}</Label>
        <Input
          id="relation"
          value={relation}
          onChange={(e) => setRelation(e.target.value)}
          placeholder={uk.students.relationPlaceholder}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={isLegalRepresentative} onCheckedChange={(v) => setIsLegalRepresentative(v === true)} />
        {uk.students.isLegalRepresentative}
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={canPickUp} onCheckedChange={(v) => setCanPickUp(v === true)} />
        {uk.students.canPickUp}
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={receivesNotifications} onCheckedChange={(v) => setReceivesNotifications(v === true)} />
        {uk.students.receivesNotifications}
      </label>
    </div>
  )

  return (
    <div className="space-y-3">
      <ul className="flex flex-col gap-2">
        {guardians.length === 0 && <li className="text-sm text-muted-foreground">{uk.students.noGuardians}</li>}
        {guardians.map((g) => (
          <li key={g.guardianshipId} className="flex items-center justify-between gap-3 text-sm">
            <span>
              {g.fullName} — {g.relation} {g.phone ?? ''}
            </span>
            {canManage && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={isPending}>
                    {uk.students.unlinkGuardian}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{uk.students.unlinkConfirmTitle}</AlertDialogTitle>
                    <AlertDialogDescription>{uk.students.unlinkConfirmDescription}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{uk.common.cancel}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleUnlink(g.guardianshipId)}>
                      {uk.students.unlinkGuardian}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </li>
        ))}
      </ul>

      {canManage && (
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v)
            if (!v) resetForm()
          }}
        >
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              {uk.students.addGuardian}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{uk.students.addGuardian}</DialogTitle>
            </DialogHeader>
            <Tabs defaultValue="existing">
              <TabsList>
                <TabsTrigger value="existing">{uk.students.linkExistingGuardian}</TabsTrigger>
                <TabsTrigger value="new">{uk.students.createNewGuardian}</TabsTrigger>
              </TabsList>

              <TabsContent value="existing" className="flex flex-col gap-3">
                <Input
                  value={query}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder={uk.students.searchGuardianPlaceholder}
                />
                {query.trim().length < 2 ? (
                  <p className="text-sm text-muted-foreground">{uk.students.searchGuardianHint}</p>
                ) : isSearching ? (
                  <p className="text-sm text-muted-foreground">{uk.common.loading}</p>
                ) : results.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{uk.students.noGuardianResults}</p>
                ) : (
                  <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                    {results.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedPerson(r)}
                          className={cn(
                            'w-full rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-muted',
                            selectedPerson?.id === r.id && 'border-primary bg-primary/5',
                          )}
                        >
                          {r.name} {r.phone ?? ''}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {selectedPerson && relationFields}
                <DialogFooter>
                  <Button onClick={handleLinkExisting} disabled={!selectedPerson || !relation.trim() || isPending}>
                    {uk.students.link}
                  </Button>
                </DialogFooter>
              </TabsContent>

              <TabsContent value="new" className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="new-lastName">{uk.students.lastName}</Label>
                  <Input id="new-lastName" value={newLastName} onChange={(e) => setNewLastName(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="new-firstName">{uk.students.firstName}</Label>
                  <Input id="new-firstName" value={newFirstName} onChange={(e) => setNewFirstName(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="new-phone">{uk.students.phone}</Label>
                  <Input id="new-phone" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="new-email">{uk.students.email}</Label>
                  <Input id="new-email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                </div>
                {relationFields}
                <DialogFooter>
                  <Button
                    onClick={handleCreateNew}
                    disabled={!newFirstName.trim() || !newLastName.trim() || !relation.trim() || isPending}
                  >
                    {uk.students.create}
                  </Button>
                </DialogFooter>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
