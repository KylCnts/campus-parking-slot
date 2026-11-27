import { Link } from 'react-router-dom'
import { ArrowRight, CalendarClock, CalendarDays, CarFront, FileWarning, Mail, ParkingSquare, ShieldCheck, SquareCheckBig, Users } from 'lucide-react'
import { ChartCard, EntriesExitsChart, OccupancyBars, shortDate } from '@/components/charts'
import { AvailabilityCard, ParkingAreasCard } from '@/components/parking'
import { MetricCard, PageHeader, StatusBadge } from '@/components/shared'
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
        <Link to="/user-management?tab=verification" className="border-reserved/50 bg-reserved/10 flex items-center gap-3 rounded-lg border px-4 py-3 text-sm">
          <ShieldCheck className="size-5 shrink-0" />
          <span><strong>{s.pending_verifications}</strong> registration(s) are waiting for School ID verification.</span>
          <ArrowRight className="ml-auto size-4 shrink-0" />
        </Link>
      )}

      {/*
        The ten original statistics, grouped into four cards. Each card keeps one headline number and lists the
        related figures underneath. All values come from the same /dashboard/summary/ calculations as before.
      */}
      {!s ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-56" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Available spaces"
            value={s.overall.available}
            sub={`${s.overall.availability_pct}% of all spaces are free`}
            icon={SquareCheckBig}
            tone="available"
            details={[
              { label: 'Total spaces', value: s.overall.total, hint: `${s.car.total} car · ${s.motorcycle.total} motorcycle` },
              { label: 'Occupied', value: s.overall.occupied, hint: `${s.overall.occupancy_pct}% occupancy` },
            ]}
          />
          <MetricCard
            label="Currently parked"
            value={s.currently_parked}
            sub="Vehicles on campus right now"
            icon={CarFront}
            details={[
              { label: 'Entries today', value: s.today.entries },
              { label: 'Exits today', value: s.today.exits },
              { label: 'Registered vehicles', value: s.registered_vehicles },
              { label: 'Open record reports', value: s.open_reports },
            ]}
          />
          <MetricCard
            label="Registered users"
            value={s.users.students + s.users.faculty}
            sub="Approved student assistants and faculty"
            icon={Users}
            tone="muted"
            details={[
              { label: 'Student assistants', value: s.users.students, hint: `Student spaces: ${s.student.total} (${s.student.available} available)` },
              { label: 'Faculty members', value: s.users.faculty, hint: `Faculty spaces: ${s.faculty.total} (${s.faculty.available} available)` },
            ]}
          />
          <MetricCard
            label="Upcoming events"
            value={s.upcoming_events}
            sub="Published events"
            icon={CalendarDays}
            tone="event"
            details={[{ label: 'Event-reserved spaces', value: s.overall.event_reserved, hint: 'Held for events right now' }]}
            footer={
              <Link to="/event-parking" className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline">
                Manage event parking <ArrowRight className="size-3" />
              </Link>
            }
          />
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
              <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm sm:flex-nowrap sm:px-5">
                <span className={`size-2 shrink-0 rounded-full ${t.status === 'ACTIVE' ? 'bg-occupied' : 'bg-available'}`} />
                <span className="font-mono font-semibold sm:w-24">{t.plate_number}</span>
                <span className="text-muted-foreground hidden min-w-0 flex-1 truncate sm:block">
                  {t.owner} · {t.category_display}
                </span>
                <span className="font-medium sm:w-16">{t.slot_number}</span>
                <StatusBadge status={t.status === 'ACTIVE' ? 'ACTIVE' : t.status} />
                <span className="text-muted-foreground ml-auto text-right text-xs tabular-nums sm:w-24">{fmtTime(t.exit_time ?? t.entry_time)}</span>
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
