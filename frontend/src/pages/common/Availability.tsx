import { AvailabilityCard } from '@/components/parking'
import ParkingMapPanel from '@/components/ParkingMapPanel'
import { LiveIndicator, PageHeader } from '@/components/shared'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/context/AuthContext'
import { useLiveRefresh, useRealtime } from '@/context/RealtimeContext'
import { useFetch } from '@/lib/hooks'
import type { AvailabilitySummary, CategoryStats } from '@/lib/types'

export default function Availability() {
  const { user } = useAuth()
  const { summary: live } = useRealtime()
  const staff = user?.role === 'ADMIN'
  const initial = useFetch<AvailabilitySummary>(staff ? '/dashboard/summary/' : null)
  const own = useFetch<{ stats: CategoryStats }>(staff ? null : '/dashboard/summary/')
  const summary = live ?? initial.data
  useLiveRefresh(() => own.reload())

  return (
    <div className="space-y-6">
      <PageHeader title={staff ? 'Live Parking Map' : 'Parking Spaces'} description={staff ? 'Select a green box to record a vehicle entry, or a red box to record an exit.' : 'Live parking availability. The Admin / Security Guard records every vehicle entry and exit.'} actions={<LiveIndicator />} />
      {staff ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <AvailabilityCard title="Car parking" stats={summary?.car} />
          <AvailabilityCard title="Motorcycle parking" stats={summary?.motorcycle} />
        </div>
      ) : (
        <AvailabilityCard title={`${user?.role === 'FACULTY' ? 'Faculty' : 'Student assistant'} parking`} stats={own.data?.stats} />
      )}
      <Card>
        <CardContent>
          <ParkingMapPanel />
        </CardContent>
      </Card>
    </div>
  )
}
