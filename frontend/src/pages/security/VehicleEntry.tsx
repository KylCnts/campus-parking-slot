import ParkingMapPanel from '@/components/ParkingMapPanel'
import { LiveIndicator, PageHeader } from '@/components/shared'
import { Card, CardContent } from '@/components/ui/card'

const STEPS = [
  'Select a green parking box on the map.',
  'Type the vehicle’s license plate number.',
  'Check the owner and vehicle details that appear.',
  'Click Confirm Vehicle Entry. The box turns red for everyone.',
]

export default function VehicleEntry() {
  return (
    <div className="space-y-6">
      <PageHeader title="Vehicle Entry" description="Record a registered Faculty Member or Student Assistant vehicle entering the campus." actions={<LiveIndicator />} />
      <ol className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, i) => (
          <li key={step} className="bg-card flex gap-3 rounded-lg border px-3 py-2.5">
            <span className="bg-primary/10 text-primary flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">{i + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <Card>
        <CardContent>
          <ParkingMapPanel />
        </CardContent>
      </Card>
    </div>
  )
}
