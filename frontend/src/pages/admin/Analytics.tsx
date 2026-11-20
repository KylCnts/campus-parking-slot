import { Gauge, GraduationCap, Percent, Presentation } from 'lucide-react'
import { ChartCard, EntriesExitsChart, OccupancyBars, SingleBarChart, TrendChart, shortDate } from '@/components/charts'
import { PageHeader, StatCard } from '@/components/shared'
import { Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc'
import { useLiveRefresh } from '@/context/RealtimeContext'
import { useFetch } from '@/lib/hooks'
import type { AvailabilitySummary } from '@/lib/types'

interface AnalyticsData {
  summary: AvailabilitySummary
  daily: { date: string; entries: number; exits: number }[]
  weekly: { week: string; entries: number; exits: number }[]
  monthly: { month: string; entries: number; exits: number }[]
  hourly_today: { hour: string; entries: number }[]
  by_area: { name: string; total: number; occupied: number; available: number }[]
}

export default function Analytics() {
  const { data, reload } = useFetch<AnalyticsData>('/analytics/')
  useLiveRefresh(() => reload())

  if (!data)
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    )

  const { summary } = data
  const statusRows = [
    { name: 'Overall', occupied: summary.overall.occupied, available: summary.overall.available, other: summary.overall.event_reserved },
    { name: 'Student', occupied: summary.student.occupied, available: summary.student.available, other: summary.student.event_reserved },
    { name: 'Faculty', occupied: summary.faculty.occupied, available: summary.faculty.available, other: summary.faculty.event_reserved },
  ]

  return (
    <div className="space-y-6">
      <PageHeader title="Parking Analytics" description="Utilization and traffic trends across campus parking." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Overall occupancy" value={`${summary.overall.occupancy_pct}%`} icon={Gauge} sub={`${summary.overall.occupied} of ${summary.overall.total} spaces`} />
        <StatCard label="Availability" value={`${summary.overall.availability_pct}%`} icon={Percent} tone="available" sub={`${summary.overall.available} spaces free`} />
        <StatCard label="Student utilization" value={`${summary.student.occupancy_pct}%`} icon={GraduationCap} tone="muted" sub={`${summary.student.occupied} / ${summary.student.total} occupied`} />
        <StatCard label="Faculty utilization" value={`${summary.faculty.occupancy_pct}%`} icon={Presentation} tone="muted" sub={`${summary.faculty.occupied} / ${summary.faculty.total} occupied`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Available vs occupied" description="Current space status by category">
          <OccupancyBars data={statusRows} />
        </ChartCard>
        <ChartCard title="Occupancy by area" description="Current status per parking area">
          <OccupancyBars data={data.by_area.map((a) => ({ name: a.name, occupied: a.occupied, available: a.available, other: a.total - a.occupied - a.available }))} />
        </ChartCard>
      </div>

      <ChartCard title="Vehicle entries and exits" description="Traffic trends over time">
        <Tabs defaultValue="daily">
          <TabsList className="mb-4">
            <TabsTrigger value="daily">Daily</TabsTrigger>
            <TabsTrigger value="weekly">Weekly</TabsTrigger>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
          </TabsList>
          <TabsContent value="daily">
            <EntriesExitsChart data={data.daily} xKey="date" tickFormat={shortDate} height={300} />
          </TabsContent>
          <TabsContent value="weekly">
            <TrendChart data={data.weekly} xKey="week" height={300} />
          </TabsContent>
          <TabsContent value="monthly">
            <TrendChart data={data.monthly} xKey="month" height={300} />
          </TabsContent>
        </Tabs>
      </ChartCard>

      <ChartCard title="Entries by hour today" description="Peak arrival times">
        <SingleBarChart data={data.hourly_today} xKey="hour" yKey="entries" name="Entries" />
      </ChartCard>
    </div>
  )
}
