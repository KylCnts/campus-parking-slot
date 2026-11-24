import { Car } from 'lucide-react'
import { CategoryBadge, EmptyState, PageHeader } from '@/components/shared'
import { VehicleColor } from '@/components/vehicle-color'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge, Skeleton } from '@/components/ui/misc'
import { useLiveRefresh } from '@/context/RealtimeContext'
import { useFetch } from '@/lib/hooks'
import type { Vehicle } from '@/lib/types'
import { fmtDate } from '@/lib/utils'

export default function MyVehicle() {
  const { data, reload } = useFetch<Vehicle[]>('/vehicles/mine/')
  useLiveRefresh(() => reload())

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="My Vehicle" description="Vehicle information registered to your account. Contact the administrator to make changes." />
      {!data ? (
        <Skeleton className="h-48" />
      ) : !data.length ? (
        <EmptyState icon={Car} title="No registered vehicle" description="Ask the parking administrator to register your vehicle." />
      ) : (
        <div className="space-y-4">
          {data.map((v) => (
            <Card key={v.id}>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="font-mono text-2xl">{v.plate_number}</CardTitle>
                {v.is_parked ? <Badge variant="occupied">Currently parked on campus</Badge> : <Badge variant="secondary">Not on campus</Badge>}
              </CardHeader>
              <CardContent>
                <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                  {[
                    ['Vehicle type', v.vehicle_type_display],
                    ['Color', <VehicleColor key="color" color={v.color} />],
                    ['Brand / model', v.brand_model || '—'],
                    ['Owner', v.owner_display],
                    ['Registered on', fmtDate(v.created_at)],
                    ['Status', v.is_active ? 'Active' : 'Inactive'],
                  ].map(([k, val]) => (
                    <div key={String(k)} className="flex justify-between gap-3 border-b pb-2">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="font-medium">{val}</dd>
                    </div>
                  ))}
                  <div className="flex justify-between border-b pb-2">
                    <dt className="text-muted-foreground">Parking category</dt>
                    <dd>
                      <CategoryBadge category={v.category} />
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
