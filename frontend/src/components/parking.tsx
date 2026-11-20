import { useState } from 'react'
import { MapPin } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress, Skeleton } from '@/components/ui/misc'
import type { CategoryStats, ParkingArea } from '@/lib/types'
import { cn, timeAgo } from '@/lib/utils'

/** Availability summary card for one category (student / faculty / overall). */
export function AvailabilityCard({ title, stats, className }: { title: string; stats?: CategoryStats | null; className?: string }) {
  const s = stats
  return (
    <Card className={cn('gap-4', className)}>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">{title}</CardTitle>
        {s?.last_updated && <span className="text-muted-foreground text-xs">Updated {timeAgo(s.last_updated)}</span>}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-4xl font-semibold tabular-nums">{s?.available ?? '—'}</p>
            <p className="text-muted-foreground text-sm">available of {s?.total ?? '—'} spaces</p>
          </div>
          <p className="text-available text-2xl font-semibold tabular-nums">{s ? `${s.availability_pct}%` : ''}</p>
        </div>
        <Progress value={s?.availability_pct ?? 0} barClassName={cn((s?.availability_pct ?? 0) < 15 ? 'bg-occupied' : 'bg-available')} />
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          {(
            [
              ['Available', s?.available, 'text-available'],
              ['Occupied', s?.occupied, 'text-occupied'],
              ['Event', s?.event_reserved, 'text-event'],
            ] as const
          ).map(([l, v, c]) => (
            <div key={l} className="bg-muted/50 rounded-md py-2">
              <p className={cn('text-base font-semibold tabular-nums', c)}>{v ?? '—'}</p>
              <p className="text-muted-foreground">{l}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

const AREA_ORDER = ['A', 'D']

/** Live slot counts for each parking area. Main Building Row and Offices Row come first. */
export function ParkingAreasCard({ areas }: { areas?: ParkingArea[] }) {
  const rank = (a: ParkingArea) => {
    const i = AREA_ORDER.indexOf(a.code)
    return i < 0 ? AREA_ORDER.length : i
  }
  const rows = (areas ?? []).filter((a) => a.total_spaces > 0).sort((a, b) => rank(a) - rank(b))
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Parking areas</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {!areas
          ? [0, 1].map((i) => <Skeleton key={i} className="h-32" />)
          : rows.map((a) => {
              const pct = Math.round(((a.available ?? a.available_spaces) / a.total_spaces) * 100)
              return (
                <div key={a.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{a.name}</p>
                      <p className="text-muted-foreground flex items-center gap-1 text-xs">
                        <MapPin className="size-3 shrink-0" /> <span className="truncate">{a.location || a.code}</span>
                      </p>
                    </div>
                    <p className="text-muted-foreground shrink-0 text-xs tabular-nums">Maximum {a.effective_capacity ?? a.total_spaces}{a.restricted ? ` of ${a.maximum}` : ''}</p>
                  </div>
                  {!!a.over_capacity && (
                    <p role="alert" className="bg-occupied/10 text-occupied mt-2 rounded-md px-2 py-1 text-xs font-medium">Over capacity by {a.over_capacity} because of an event. Parked vehicles remain recorded.</p>
                  )}
                  <Progress value={pct} className="mt-3" barClassName={pct < 15 ? 'bg-occupied' : 'bg-available'} />
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    {(
                      [
                        ['Available', a.available ?? a.available_spaces, 'text-available'],
                        ['Occupied', a.occupied_spaces, 'text-occupied'],
                        ['Event', a.event_reserved_spaces, 'text-event'],
                      ] as const
                    ).map(([label, value, color]) => (
                      <div key={label} className="bg-muted/50 rounded-md py-1.5">
                        <dd className={cn('text-base font-semibold tabular-nums', color)}>{value}</dd>
                        <dt className="text-muted-foreground">{label}</dt>
                      </div>
                    ))}
                  </dl>
                </div>
              )
            })}
      </CardContent>
    </Card>
  )
}

export function useFlash() {
  const [flash, setFlash] = useState<Set<string>>(new Set())
  const trigger = (slot?: string) => {
    if (!slot) return
    setFlash((f) => new Set(f).add(slot))
    setTimeout(
      () =>
        setFlash((f) => {
          const n = new Set(f)
          n.delete(slot)
          return n
        }),
      1200,
    )
  }
  return [flash, trigger] as const
}
