import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CarFront, LogIn, LogOut, Map as MapIcon, Search } from 'lucide-react'
import ExitSearch from '@/components/ExitSearch'
import ParkedVehiclesList from '@/components/ParkedVehiclesList'
import { AvailabilityCard } from '@/components/parking'
import ParkingMapPanel from '@/components/ParkingMapPanel'
import { LiveIndicator, PageHeader } from '@/components/shared'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/misc'
import { useAuth } from '@/context/AuthContext'
import { useLiveRefresh, useRealtime } from '@/context/RealtimeContext'
import { useFetch } from '@/lib/hooks'
import type { AvailabilitySummary, CategoryStats } from '@/lib/types'

type View = 'map' | 'parked'

/**
 * One page for the live parking map and gate work.
 * Admin / Security Guard: green box = vehicle entry, red box = vehicle exit, plate search (top right) = vehicle exit,
 * and a list of every vehicle currently parked. Students and faculty see the live map read-only.
 */
export default function ParkingMap() {
  const { user } = useAuth()
  const staff = user?.role === 'ADMIN'
  return staff ? <GateParkingMap /> : <MemberParkingMap />
}

function GateParkingMap() {
  const { summary: live } = useRealtime()
  const initial = useFetch<AvailabilitySummary>('/dashboard/summary/')
  const summary = live ?? initial.data
  const [params, setParams] = useSearchParams()
  const view: View = params.get('view') === 'parked' ? 'parked' : 'map'
  // A plate passed in the address (old /exit?plate= links) opens the exit search straight away.
  const [exitRequest, setExitRequest] = useState<{ plate: string; nonce: number } | null>(() => {
    const plate = params.get('plate')
    return plate ? { plate, nonce: 1 } : null
  })
  const [changed, setChanged] = useState<{ slot: string; nonce: number } | null>(null)

  const setView = (v: string) => {
    const next = new URLSearchParams(params)
    next.delete('plate')
    if (v === 'parked') next.set('view', 'parked')
    else next.delete('view')
    setParams(next, { replace: true })
  }
  const requestExit = (plate: string) => setExitRequest({ plate, nonce: Date.now() })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Parking Map & Gate"
        description="Record vehicle entries and exits on the live map. Every change appears for everyone instantly."
        actions={<LiveIndicator />}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <AvailabilityCard title="Car parking" stats={summary?.car} />
        <AvailabilityCard title="Motorcycle parking" stats={summary?.motorcycle} />
      </div>

      <Card className="gap-0 py-0">
        {/* Toolbar: views on the left, vehicle exit plate search in the upper-right corner. */}
        <div className="flex flex-col gap-3 border-b p-3 sm:p-4 md:flex-row md:items-center md:justify-between">
          <Tabs value={view} onValueChange={setView}>
            <TabsList aria-label="Parking views">
              <TabsTrigger value="map">
                <MapIcon /> Live map
              </TabsTrigger>
              <TabsTrigger value="parked">
                <CarFront /> Parked vehicles
                {summary && <span className="bg-muted-foreground/15 rounded px-1.5 text-xs tabular-nums">{summary.currently_parked}</span>}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <ExitSearch request={exitRequest} onExited={(t) => setChanged({ slot: t.slot_number, nonce: Date.now() })} />
        </div>

        {view === 'map' ? (
          <CardContent className="space-y-3 p-3 sm:p-5">
            <ul className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-1.5 text-xs" aria-label="How to record vehicles">
              <li className="flex items-center gap-1.5">
                <LogIn className="text-available size-3.5" /> Green box: record a vehicle entry
              </li>
              <li className="flex items-center gap-1.5">
                <LogOut className="text-occupied size-3.5" /> Red box: record a vehicle exit
              </li>
              <li className="flex items-center gap-1.5">
                <Search className="size-3.5" /> Plate search (top right): find a vehicle and record its exit
              </li>
            </ul>
            <ParkingMapPanel changed={changed} />
          </CardContent>
        ) : (
          <ParkedVehiclesList onExit={requestExit} />
        )}
      </Card>
    </div>
  )
}

function MemberParkingMap() {
  const { user } = useAuth()
  const own = useFetch<{ stats: CategoryStats }>('/dashboard/summary/')
  useLiveRefresh(() => own.reload())
  return (
    <div className="space-y-6">
      <PageHeader title="Parking Spaces" description="Live parking availability. The Admin / Security Guard records every vehicle entry and exit." actions={<LiveIndicator />} />
      <AvailabilityCard title={`${user?.role === 'FACULTY' ? 'Faculty' : 'Student assistant'} parking`} stats={own.data?.stats} />
      <Card>
        <CardContent className="px-3 sm:px-5">
          <ParkingMapPanel />
        </CardContent>
      </Card>
    </div>
  )
}
