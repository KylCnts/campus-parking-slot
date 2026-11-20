import { Link } from 'react-router-dom'
import { ArrowRight, BookOpen, Car, Map } from 'lucide-react'
import { AvailabilityCard, ParkingAreasCard } from '@/components/parking'
import { LiveIndicator, PageHeader } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/context/AuthContext'
import { useLiveRefresh } from '@/context/RealtimeContext'
import { useFetch } from '@/lib/hooks'
import type { CategoryStats, ParkingArea, ParkingSettings } from '@/lib/types'

type Summary = { category: string; stats: CategoryStats; areas: ParkingArea[]; timestamp: string }

export default function UserDashboard() {
  const { user } = useAuth()
  const isFaculty = user?.role === 'FACULTY'
  const label = isFaculty ? 'Faculty' : 'Student Assistant'
  const summary = useFetch<Summary>('/dashboard/summary/')
  const settings = useFetch<ParkingSettings>('/settings/')

  useLiveRefresh(() => summary.reload())

  const s = summary.data?.stats
  const vehicle = user?.vehicles[0]
  const guidelines = settings.data?.guidelines.split('\n').filter(Boolean) ?? []

  return (
    <div className="space-y-6">
      <PageHeader title={`${label} Parking Dashboard`} description={`Welcome back, ${user?.full_name.split(' ')[0]}. Check ${label.toLowerCase()} parking before you arrive.`} actions={
          <>
            <LiveIndicator updatedAt={s?.last_updated} />
            <Button asChild size="sm">
              <Link to="/my-parking">
                <Car /> My Parking
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/availability">
                <Map /> Open Parking Spaces
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <AvailabilityCard title={isFaculty ? 'Faculty parking availability' : 'Student assistant motorcycle parking'} stats={s} className="lg:col-span-2" />
        <Card className="gap-4">
          <CardHeader>
            <CardTitle className="text-base">My registered vehicle</CardTitle>
          </CardHeader>
          <CardContent>
            {vehicle ? (
              <div className="space-y-3">
                <div className="bg-muted/50 flex items-center gap-3 rounded-lg p-3">
                  <div className="bg-primary/15 text-primary rounded-md p-2">
                    <Car className="size-5" />
                  </div>
                  <div>
                    <p className="font-mono text-lg font-bold">{vehicle.plate_number}</p>
                    <p className="text-muted-foreground text-sm capitalize">
                      {vehicle.color} {vehicle.vehicle_type.toLowerCase()}
                    </p>
                    {vehicle.brand_model && <p className="text-muted-foreground text-sm">{vehicle.brand_model}</p>}
                  </div>
                </div>
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link to="/my-vehicle">
                    Vehicle details & parking history <ArrowRight />
                  </Link>
                </Button>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No vehicle registered. Contact the parking administrator.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <ParkingAreasCard areas={summary.data?.areas} />

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="size-4" /> Campus parking guidelines
          </CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link to="/guidelines">
              View all <ArrowRight />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm">
            {guidelines.slice(0, 4).map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
