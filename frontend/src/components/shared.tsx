import { useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Eye, EyeOff, Inbox, Loader2, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/form-controls'
import { Badge } from '@/components/ui/misc'
import { useRealtime } from '@/context/RealtimeContext'
import { useTick } from '@/lib/hooks'
import type { SpaceStatus, TxnStatus } from '@/lib/types'
import { cn, timeAgo } from '@/lib/utils'

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight break-words sm:text-2xl">{title}</h1>
        {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Heading for one section of a tabbed page: a short description on the left, actions on the right. */
export function SectionHeader({ description, actions }: { description?: string; actions?: ReactNode }) {
  if (!description && !actions) return null
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {description ? <p className="text-muted-foreground min-w-0 text-sm">{description}</p> : <span />}
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

const tones = {
  default: 'bg-primary/10 text-primary',
  available: 'bg-available/15 text-available',
  occupied: 'bg-occupied/15 text-occupied',
  reserved: 'bg-reserved/20 text-[oklch(0.55_0.13_70)]',
  event: 'bg-event/15 text-event',
  muted: 'bg-muted text-muted-foreground',
}

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'default',
  sub,
  className,
}: {
  label: string
  value: ReactNode
  icon: LucideIcon
  tone?: keyof typeof tones
  sub?: ReactNode
  className?: string
}) {
  return (
    <Card className={cn('gap-0 py-4', className)}>
      <div className="flex items-start justify-between gap-3 px-4">
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums">{value}</p>
          {sub && <p className="text-muted-foreground mt-1 text-xs">{sub}</p>}
        </div>
        <div className={cn('rounded-lg p-2', tones[tone])}>
          <Icon className="size-5" />
        </div>
      </div>
    </Card>
  )
}

/**
 * One headline number with its related figures listed underneath, so several statistics share one card.
 */
export function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'default',
  details,
  footer,
  className,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  icon: LucideIcon
  tone?: keyof typeof tones
  details: { label: string; value: ReactNode; hint?: ReactNode }[]
  footer?: ReactNode
  className?: string
}) {
  return (
    <Card className={cn('gap-0 py-0', className)}>
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
          <p className="mt-1.5 text-3xl font-semibold tabular-nums">{value}</p>
          {sub && <p className="text-muted-foreground mt-1 text-xs">{sub}</p>}
        </div>
        <div className={cn('shrink-0 rounded-lg p-2', tones[tone])}>
          <Icon className="size-5" />
        </div>
      </div>
      <dl className="bg-muted/30 mt-auto divide-y border-t text-sm">
        {details.map((d) => (
          <div key={d.label} className="flex items-baseline justify-between gap-3 px-4 py-2">
            <dt className="text-muted-foreground min-w-0">{d.label}</dt>
            <dd className="text-right">
              <span className="font-semibold tabular-nums">{d.value}</span>
              {d.hint && <span className="text-muted-foreground block text-xs">{d.hint}</span>}
            </dd>
          </div>
        ))}
        {footer && <div className="px-4 py-2">{footer}</div>}
      </dl>
    </Card>
  )
}

const statusVariant: Record<string, 'available' | 'occupied' | 'reserved' | 'inactive' | 'event' | 'secondary' | 'destructive' | 'default'> = {
  AVAILABLE: 'available',
  OCCUPIED: 'occupied',
  RESERVED: 'reserved',
  EVENT_RESERVED: 'event',
  APPROVED: 'available',
  REJECTED: 'occupied',
  SUSPENDED: 'reserved',
  ARCHIVED: 'inactive',
  PUBLISHED: 'event',
  DRAFT: 'secondary',
  SENT: 'available',
  LOGGED: 'reserved',
  PENDING: 'reserved',
  FAILED: 'occupied',
  FULFILLED: 'available',
  EXPIRED: 'inactive',
  ACTIVE: 'default',
  COMPLETED: 'available',
  CANCELLED: 'inactive',
  OPEN: 'occupied',
  IN_REVIEW: 'reserved',
  RESOLVED: 'available',
  DISMISSED: 'inactive',
  SUBMITTED: 'occupied',
  UNDER_REVIEW: 'reserved',
  IN_PROGRESS: 'event',
}

export function StatusBadge({ status }: { status: SpaceStatus | TxnStatus | string }) {
  return <Badge variant={statusVariant[status] ?? 'secondary'}>{status === 'EVENT_RESERVED' ? 'RESERVED FOR EVENT' : status === 'LOGGED' ? 'CONSOLE ONLY' : status.replace('_', ' ')}</Badge>
}

export function CategoryBadge({ category }: { category: string }) {
  return (
    <Badge variant="outline" className={category === 'FACULTY' ? 'border-violet-400/50 text-violet-600 dark:text-violet-300' : 'border-sky-400/50 text-sky-600 dark:text-sky-300'}>
      {category === 'FACULTY' ? 'Faculty' : 'Student Assistant'}
    </Badge>
  )
}

export function Pagination({ page, count, pageSize, onPage }: { page: number; count: number; pageSize: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(count / pageSize))
  const from = count ? (page - 1) * pageSize + 1 : 0
  const to = Math.min(page * pageSize, count)
  return (
    <div className="no-print flex flex-wrap items-center justify-between gap-2 border-t px-4 pt-4 text-sm">
      <span className="text-muted-foreground">
        {from}–{to} of {count}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" className="size-8" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft />
        </Button>
        <span className="px-2 tabular-nums">
          {page} / {pages}
        </span>
        <Button variant="outline" size="icon" className="size-8" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight />
        </Button>
      </div>
    </div>
  )
}

export function EmptyState({ title, description, icon: Icon = Inbox }: { title: string; description?: string; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <div className="bg-muted rounded-full p-3">
        <Icon className="text-muted-foreground size-6" />
      </div>
      <p className="font-medium">{title}</p>
      {description && <p className="text-muted-foreground max-w-sm text-sm">{description}</p>}
    </div>
  )
}

export function LoadingRow({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols} className="py-10 text-center">
        <Loader2 className="text-muted-foreground mx-auto size-5 animate-spin" />
      </td>
    </tr>
  )
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  destructive,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  description?: ReactNode
  confirmLabel?: string
  destructive?: boolean
  onConfirm: () => Promise<void> | void
}) {
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription asChild><div>{description}</div></DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await onConfirm()
                onOpenChange(false)
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy && <Loader2 className="animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function PasswordInput(props: React.ComponentProps<'input'>) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input {...props} type={show ? 'text' : 'password'} className={cn('pr-10', props.className)} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex cursor-pointer items-center px-3"
        aria-label={show ? 'Hide password' : 'Show password'}
        tabIndex={-1}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}

export function LiveIndicator({ updatedAt }: { updatedAt?: string | Date | null }) {
  const { connected, lastUpdate } = useRealtime()
  useTick(10000)
  const ts = lastUpdate ?? (updatedAt ? new Date(updatedAt) : null)
  return (
    <div className="text-muted-foreground flex items-center gap-2 text-xs">
      <span className="relative flex size-2.5">
        {connected && <span className="bg-available absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" />}
        <span className={cn('relative inline-flex size-2.5 rounded-full', connected ? 'bg-available' : 'bg-inactive')} />
      </span>
      <span>{connected ? 'Live' : 'Reconnecting…'}</span>
      {ts && <span>· Updated {timeAgo(ts.toISOString())}</span>}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-5 animate-spin', className)} />
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <Input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? 'Search…'} aria-label={placeholder ?? 'Search'} className="w-full sm:max-w-xs" />
}

export function Card2({ children, className }: { children: ReactNode; className?: string }) {
  return <Card className={cn('gap-0 py-0', className)}>{children}</Card>
}
