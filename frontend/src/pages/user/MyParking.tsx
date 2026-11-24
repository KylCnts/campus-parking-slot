import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, Map } from 'lucide-react'
import { EmptyState, LoadingRow, PageHeader, Pagination, StatusBadge } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/misc'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useLiveRefresh } from '@/context/RealtimeContext'
import { useFetch, useTick } from '@/lib/hooks'
import type { Paginated, ParkingSession } from '@/lib/types'
import { fmtDateTime, fmtDuration, fmtTime } from '@/lib/utils'

function CurrentSession({ session }: { session: ParkingSession }) {
  useTick(30000)
  const remaining = session.estimated_departure ? (new Date(session.estimated_departure).getTime() - Date.now()) / 60000 : null

  const tiles: [string, string, string?][] = [
    ['Parking area', session.area_name],
    ['Occupied parking space', session.slot_number],
    ['Vehicle', session.plate_number, [session.brand_model, session.vehicle_color, session.vehicle_type].filter(Boolean).join(' · ')],
    ['Session started', fmtTime(session.entry_time), fmtDateTime(session.entry_time)],
    [
      'Estimated departure',
      session.estimated_departure ? fmtTime(session.estimated_departure) : 'Not set',
      remaining === null ? undefined : remaining > 0 ? `${fmtDuration(remaining)} left` : 'Past the estimated departure time.',
    ],
  ]

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="size-4" /> Current active parking session</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map(([label, value, note]) => (
            <div key={label} className="bg-muted/50 rounded-lg p-3">
              <p className="text-muted-foreground text-xs">{label}</p>
              <p className="text-lg font-semibold">{value}</p>
              {note && <p className="text-muted-foreground text-xs">{note}</p>}
            </div>
          ))}
        </div>
        <p className="text-muted-foreground text-sm">The Admin / Security Guard records your exit when you leave the campus.</p>
      </CardContent>
    </Card>
  )
}

export default function MyParking() {
  const [page, setPage] = useState(1)
  const current = useFetch<ParkingSession | null>('/sessions/current/')
  const history = useFetch<Paginated<ParkingSession>>('/sessions/', { page, page_size: 10 })
  const reload = () => {
    current.reload()
    history.reload()
  }
  useLiveRefresh(reload)

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="My Parking" description="View your current parking session and your parking history." />
      {current.loading && !current.data ? <Skeleton className="h-48" /> : current.data ? (
        <CurrentSession session={current.data} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No active parking session</CardTitle>
            <CardDescription>The Admin / Security Guard records your vehicle entry at the gate. You can check available spaces on the parking map first.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline"><Link to="/parking-map"><Map /> View parking map</Link></Button>
          </CardContent>
        </Card>
      )}
      <Card className="gap-0 py-0">
        <div className="border-b px-5 py-4"><h2 className="font-semibold">Parking activity history</h2></div>
        <Table stack>
          <TableHeader>
            <TableRow>
              <TableHead>Space</TableHead>
              <TableHead>Vehicle</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Ended</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Extended</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>How it ended</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.loading && !history.data ? <LoadingRow cols={8} /> : history.data?.results.map((s) => (
              <TableRow key={s.id}>
                <TableCell label="Space" className="font-semibold">{s.slot_number}</TableCell>
                <TableCell label="Vehicle" className="font-mono text-xs">{s.plate_number}</TableCell>
                <TableCell label="Started" className="text-xs">{fmtDateTime(s.entry_time)}</TableCell>
                <TableCell label="Ended" className="text-xs">{fmtDateTime(s.exit_time)}</TableCell>
                <TableCell label="Duration">{fmtDuration(s.duration_minutes)}</TableCell>
                <TableCell label="Extended" className="tabular-nums">{s.extension_count}</TableCell>
                <TableCell label="Status"><StatusBadge status={s.status} /></TableCell>
                <TableCell label="How it ended" className="text-muted-foreground text-xs">{s.release_display || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {history.data && !history.data.results.length && <EmptyState title="No parking activity yet" />}
        <div className="pb-4"><Pagination page={page} count={history.data?.count ?? 0} pageSize={10} onPage={setPage} /></div>
      </Card>
    </div>
  )
}
