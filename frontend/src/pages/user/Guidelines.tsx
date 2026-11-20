import { Clock } from 'lucide-react'
import { PageHeader } from '@/components/shared'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/misc'
import { useFetch } from '@/lib/hooks'
import type { ParkingSettings } from '@/lib/types'

const fmt = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export default function Guidelines() {
  const { data } = useFetch<ParkingSettings>('/settings/')
  if (!data) return <Skeleton className="h-80" />
  const rules = data.guidelines.split('\n').filter((l) => l.trim())
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Campus Parking Guidelines" description={data.campus_name} />
      <Card className="flex-row items-center gap-3 px-5">
        <Clock className="text-primary size-5" />
        <div>
          <p className="text-muted-foreground text-xs">Parking hours</p>
          <p className="font-semibold">
            {fmt(data.opening_time)} – {fmt(data.closing_time)}
          </p>
        </div>
      </Card>
      <Card>
        <CardContent>
          <ol className="space-y-4">
            {rules.map((r, i) => (
              <li key={i} className="flex gap-4">
                <span className="bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold">{i + 1}</span>
                <p className="pt-0.5">{r}</p>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
