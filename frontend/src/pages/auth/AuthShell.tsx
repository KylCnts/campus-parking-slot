import type { ReactNode } from 'react'
import { CircleCheck, ParkingSquare, Radio, ShieldCheck } from 'lucide-react'

export default function AuthShell({ title, subtitle, children, wide }: { title: string; subtitle?: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className="grid min-h-screen min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="bg-sidebar relative hidden overflow-hidden p-10 text-white lg:flex lg:flex-col">
        <div className="flex items-center gap-2.5">
          <div className="bg-primary flex size-10 items-center justify-center rounded-lg">
            <ParkingSquare className="size-5" />
          </div>
          <div>
            <p className="font-semibold">CampusPark</p>
            <p className="text-xs text-white/60">Real-Time Parking Space Monitoring</p>
          </div>
        </div>
        <div className="mt-auto max-w-md">
          <h2 className="text-3xl leading-tight font-semibold">Know where to park before you reach the gate.</h2>
          <p className="mt-3 text-white/70">
            Live availability for student and faculty parking, updated the moment security records a vehicle entry or exit.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-white/80">
            <li className="flex items-center gap-3">
              <Radio className="text-sidebar-primary size-4" /> Real-time slot status, no refresh needed
            </li>
            <li className="flex items-center gap-3">
              <ShieldCheck className="text-sidebar-primary size-4" /> Entries and exits verified by campus security
            </li>
            <li className="flex items-center gap-3">
              <CircleCheck className="text-sidebar-primary size-4" /> Separate dashboards for student assistants and faculty
            </li>
          </ul>
        </div>
        {/* decorative parking grid */}
        <div className="pointer-events-none absolute -top-10 -right-16 grid rotate-12 grid-cols-6 gap-2 opacity-[0.08]">
          {Array.from({ length: 36 }).map((_, i) => (
            <div key={i} className="h-14 w-9 rounded border-2 border-white" />
          ))}
        </div>
      </div>
      <div className="flex min-w-0 items-center justify-center px-4 py-8 sm:px-8 sm:py-10">
        <div className={wide ? 'w-full max-w-2xl' : 'w-full max-w-sm'}>
          <div className="mb-6 flex items-center gap-2 lg:hidden">
            <div className="bg-primary flex size-9 items-center justify-center rounded-lg text-white">
              <ParkingSquare className="size-5" />
            </div>
            <p className="font-semibold">CampusPark</p>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  )
}
