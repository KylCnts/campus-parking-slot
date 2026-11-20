import { Link } from 'react-router-dom'
import { ArrowRight, CalendarClock, CalendarDays, Car, CarFront, FileWarning, GraduationCap, Mail, ParkingSquare, Presentation, ShieldCheck, SquareCheckBig, Users } from 'lucide-react'
import { ChartCard, EntriesExitsChart, OccupancyBars, shortDate } from '@/components/charts'
import { AvailabilityCard, ParkingAreasCard } from '@/components/parking'
import { PageHeader, StatCard, StatusBadge } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/misc'
import { useLiveRefresh } from '@/context/RealtimeContext'
import { useFetch } from '@/lib/hooks'
import type { AvailabilitySummary, ParkingArea, Paginated, Transaction } from '@/lib/types'
import { fmtTime } from '@/lib/utils'

type Summary = AvailabilitySummary & {
  users: { students: number; faculty: number }
  today: { entries: number; exits: number }
  open_reports: number
  registered_vehicles: number
  upcoming_events: number
  pending_verifications: number
  over_capacity_zones: string[]
  areas: ParkingArea[]
}

export default function AdminDashboard() {
  const summary = useFetch<Summary>('/dashboard/summary/')
  const analytics = useFetch<{ daily: { date: string; entries: number; exits: number }[] }>('/analytics/')
  const recent = useFetch<Paginated<Transaction>>('/transactions/', { page_size: 8, ordering: '-id' })

  useLiveRefresh(() => {
    summary.reload()
    recent.reload()
    analytics.reload()
  })

  const s = summary.data
  return (
    <div className="space-y-6">
      <PageHeader
        title="Administrator Dashboard"
        description="Overview of campus parking, updated in real time."
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/parking-spaces">
                <ParkingSquare /> Manage parking slots
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/event-parking">
                <CalendarClock /> Event parking
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/email-history">
                <Mail /> Email history
              </Link>
            </Button>
          </>
        }
      />

      {!!s?.over_capacity_zones.length && (
        <div role="alert" className="border-occupied/40 bg-occupied/10 text-occupied rounded-lg border px-4 py-3 text-sm font-medium">
          Over capacity: {s.over_capacity_zones.join(', ')}. New parking is blocked and parked vehicles remain recorded.
        </div>
      )}
      {!!s?.pending_verifications && (
        <Link to="/verifications" className="border-reserved/50 bg-reserved/10 flex items-center gap-3 rounded-lg border px-4 py-3 text-sm">
          <ShieldCheck className="size-5 shrink-0" />
          <span><strong>{s.pending_verifications}</strong> registration(s) are waiting for School ID verification.</span>
          <ArrowRight className="ml-auto size-4" />
        </Link>
      )}

      {!s ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Total spaces" value={s.overall.total} icon={ParkingSquare} sub={`${s.car.total} car · ${s.motorcycle.total} motorcycle`} />
          <StatCard label="Available" value={s.overall.available} icon={SquareCheckBig} tone="available" sub={`${s.overall.availability_pct}% of all spaces`} />
          <StatCard label="Occupied" value={s.overall.occupied} icon={Car} tone="occupied" sub={`${s.overall.occupancy_pct}% occupancy`} />
          <StatCard label="Event-reserved" value={s.overall.event_reserved} icon={CalendarClock} tone="event" sub="Held for events" />
          <StatCard label="Upcoming events" value={s.upcoming_events} icon={CalendarDays} tone="event" sub="Published events" />
          <StatCard label="Currently parked" value={s.currently_parked} icon={CarFront} sub={`${s.today.entries} entries · ${s.today.exits} exits today`} />
          <StatCard label="Student spaces" value={s.student.total} icon={GraduationCap} tone="muted" sub={`${s.student.available} available`} />
          <StatCard label="Faculty spaces" value={s.faculty.total} icon={Presentation} tone="muted" sub={`${s.faculty.available} available`} />
          <StatCard label="Registered students" value={s.users.students} icon={Users} tone="muted" sub={`${s.registered_vehicles} vehicles registered`} />
          <StatCard label="Registered faculty" value={s.users.faculty} icon={Users} tone="muted" sub={s.open_reports ? `${s.open_reports} open record report(s)` : 'No open record reports'} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <AvailabilityCard title="Student parking" stats={s?.student} />
        <AvailabilityCard title="Faculty parking" stats={s?.faculty} />
      </div>

      <ParkingAreasCard areas={s?.areas} />

      <div className="grid gap-4 lg:grid-cols-5">
        <ChartCard title="Occupancy by parking area" description="Current status of every space" className="lg:col-span-2">
          {s ? (
            <OccupancyBars
              data={s.areas.map((a) => ({
                name: a.name,
                occupied: a.occupied_spaces,
                available: a.available_spaces,
                other: a.total_spaces - a.occupied_spaces - a.available_spaces,
              }))}
            />
          ) : (
            <Skeleton className="h-52" />
          )}
        </ChartCard>
        <ChartCard title="Daily entries and exits" description="Last 14 days" className="lg:col-span-3">
          {analytics.data ? <EntriesExitsChart data={analytics.data.daily} xKey="date" tickFormat={shortDate} /> : <Skeleton className="h-64" />}
        </ChartCard>
      </div>

      <Card className="gap-3">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Latest vehicle activity</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link to="/transactions">
              View all <ArrowRight />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="px-0">
          <ul className="divide-y">
            {recent.data?.results.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <span className={`size-2 shrink-0 rounded-full ${t.status === 'ACTIVE' ? 'bg-occupied' : 'bg-available'}`} />
                <span className="w-24 font-mono font-semibold">{t.plate_number}</span>
                <span className="text-muted-foreground hidden min-w-0 flex-1 truncate sm:block">
                  {t.owner} · {t.category_display}
                </span>
                <span className="w-16 font-medium">{t.slot_number}</span>
                <StatusBadge status={t.status === 'ACTIVE' ? 'ACTIVE' : t.status} />
                <span className="text-muted-foreground w-24 text-right text-xs tabular-nums">{fmtTime(t.exit_time ?? t.entry_time)}</span>
              </li>
            ))}
            {recent.data && !recent.data.results.length && <li className="text-muted-foreground px-5 py-6 text-center text-sm">No transactions yet.</li>}
          </ul>
        </CardContent>
      </Card>
      {!!s?.open_reports && (
        <Link to="/incident-reports" className="border-reserved/50 bg-reserved/10 flex items-center gap-3 rounded-lg border px-4 py-3 text-sm">
          <FileWarning className="text-[oklch(0.55_0.13_70)] size-5" />
          <span>
            <strong>{s.open_reports}</strong> parking record report(s) from security need your review.
          </span>
          <ArrowRight className="ml-auto size-4" />
        </Link>
      )}
    </div>
  )
}
