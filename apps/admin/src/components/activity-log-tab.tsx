import { uk } from '@starland/i18n'
import type { ActivityLogRow } from '@/lib/audit/get-person-activity-log'
import { PersonLink } from '@/components/person-link'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

function formatKyivDateTime(date: Date): string {
  return date.toLocaleString('uk-UA', {
    timeZone: 'Europe/Kyiv',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function entityLabel(entityType: string): string {
  return (uk.audit.entityTypes as Record<string, string>)[entityType] ?? entityType
}

function actionLabel(action: string): string {
  return (uk.audit.actions as Record<string, string>)[action] ?? action
}

// Some rows (e.g. permission_grants create) touch a dozen-plus columns —
// joining them all as one string forces `whitespace-nowrap` cells to blow
// the row width out. Cap what's shown inline; the rest is one hover away.
const MAX_VISIBLE_CHANGED_FIELDS = 4

function ChangedFields({ fields }: { fields: string[] }) {
  if (fields.length === 0) return <span>—</span>

  const visible = fields.slice(0, MAX_VISIBLE_CHANGED_FIELDS)
  const hiddenCount = fields.length - visible.length

  return (
    <span>
      {visible.join(', ')}
      {hiddenCount > 0 && (
        <span title={fields.join(', ')} className="ml-1 text-muted-foreground/70 cursor-help">
          +{hiddenCount}
        </span>
      )}
    </span>
  )
}

/**
 * Purely presentational — the caller (`user-profile-content.tsx`,
 * `staff-profile-content.tsx`) is responsible for the `audit.read` gate and
 * for aggregating rows across every `entity_type`/`entity_id` that belongs
 * to the person being viewed. Field names are shown as technical
 * identifiers (monospace), not translated prose — the underlying DB trigger
 * already reduces personal-data tables to '[REDACTED]' values, this
 * component never renders old/new values at all, only which keys changed.
 */
export function ActivityLogTab({ rows }: { rows: ActivityLogRow[] }) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">{uk.users.noActivityLog}</p>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>{uk.audit.action}</TableHead>
          <TableHead>{uk.audit.entity}</TableHead>
          <TableHead>{uk.audit.changedFields}</TableHead>
          <TableHead>{uk.audit.who}</TableHead>
          <TableHead>{uk.audit.when}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium">{actionLabel(row.action)}</TableCell>
            <TableCell className="text-muted-foreground">{entityLabel(row.entityType)}</TableCell>
            <TableCell className="text-muted-foreground font-mono text-xs">
              <ChangedFields fields={row.changedFields} />
            </TableCell>
            <TableCell>
              {row.actorId ? (
                <PersonLink id={row.actorId} name={row.actorName ?? row.actorId} kind="user" />
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell className="text-muted-foreground">{formatKyivDateTime(row.occurredAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
