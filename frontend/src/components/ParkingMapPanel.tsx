import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, CircleAlert, Loader2, LogOut, Search } from 'lucide-react'
import { toast } from 'sonner'
import ParkingMap2D, { STATUS_META } from '@/components/ParkingMap2D'
import { useFlash } from '@/components/parking'
import { VehicleColor } from '@/components/vehicle-color'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/form-controls'
import { Skeleton } from '@/components/ui/misc'
import { useAuth } from '@/context/AuthContext'
import { useLiveRefresh } from '@/context/RealtimeContext'
import { api } from '@/lib/api'
import { useFetch } from '@/lib/hooks'
import type { MapSpace, SpaceStatus, Transaction, Vehicle } from '@/lib/types'
import { apiError, fmtDateTime } from '@/lib/utils'

const UNAVAILABLE: Partial<Record<SpaceStatus, string>> = {
  OCCUPIED: 'Sorry! This parking space is already occupied and is currently unavailable.',
  EVENT_RESERVED: 'This parking space is temporarily unavailable because it has been reserved for an upcoming event.',
}
const NO_LONGER_AVAILABLE = 'Sorry! This parking space is no longer available. Please select another available parking space.'
const normalizePlate = (v: string) => v.toUpperCase().trim().replace(/\s+/g, ' ')

type Lookup = { vehicle: Vehicle; active_transaction: Transaction | null }

/** Why this registered vehicle cannot enter this box, checked again by the server on confirm. */
function blockReason(v: Vehicle, active: Transaction | null, space: MapSpace): string {
  if (!v.owner) return 'This vehicle is not linked to a registered account.'
  if (v.owner_account_status !== 'APPROVED' || v.owner_active === false) return `The account of ${v.owner_display} is not approved and active.`
  if (!v.is_active) return 'This vehicle is marked inactive.'
  if (active) return `${v.plate_number} is already parked at ${active.slot_number}.`
  const moto = v.vehicle_type === 'MOTORCYCLE'
  if (v.category === 'STUDENT' && !moto) return 'Student assistants may only bring motorcycles inside the campus.'
  if (moto !== (space.slot_type === 'MOTORCYCLE')) return `${space.slot_number} is a ${space.slot_type === 'MOTORCYCLE' ? 'motorcycle' : 'car'} space and does not fit this vehicle.`
  if (v.category === 'STUDENT' && space.category !== 'STUDENT') return 'Student assistants may only use the 3 motorcycle spaces marked S.'
  if (v.category === 'FACULTY' && space.category === 'STUDENT') return `${space.slot_number} is reserved for Student Assistants.`
  return ''
}

function VehicleEntryForm({ space, onDone, onRefresh, onClose }: { space: MapSpace; onDone: () => void; onRefresh: () => void; onClose: () => void }) {
  const [plate, setPlate] = useState('')
  const [state, setState] = useState<'idle' | 'searching' | 'found' | 'missing' | 'error'>('idle')
  const [match, setMatch] = useState<Lookup | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    const wanted = normalizePlate(plate)
    setMatch(null)
    setError('')
    if (wanted.length < 3) return setState('idle')
    setState('searching')
    const id = ++seq.current
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get<{ results: Lookup[] }>('/vehicles/lookup/', { params: { plate: wanted } })
        if (id !== seq.current) return
        const exact = data.results.find((r) => r.vehicle.plate_number === wanted)
        setMatch(exact ?? null)
        setState(exact ? 'found' : 'missing')
      } catch (err) {
        if (id !== seq.current) return
        setError(apiError(err))
        setState('error')
      }
    }, 450)
    return () => clearTimeout(timer)
  }, [plate])

  const reason = match ? blockReason(match.vehicle, match.active_transaction, space) : ''
  const v = match?.vehicle
  const isStudent = v?.category === 'STUDENT'

  const confirm = async () => {
    if (!v) return
    setBusy(true)
    setError('')
    try {
      const { data } = await api.post<Transaction>('/transactions/entry/', { plate_number: v.plate_number, space: space.id })
      toast.success(`Vehicle entry recorded. ${data.plate_number} is parked at ${data.slot_number}.`)
      onDone()
    } catch (err) {
      setError(apiError(err))
      onRefresh()
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4">
      <Field label="License Plate Number" htmlFor="entry-plate">
        <div className="relative">
          <Input id="entry-plate" value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="e.g. ABC 1234" className="pr-9 font-mono text-base uppercase" autoFocus autoComplete="off" />
          <span className="text-muted-foreground absolute inset-y-0 right-3 flex items-center">{state === 'searching' ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}</span>
        </div>
      </Field>
      {state === 'missing' && <p role="status" className="text-sm">No registered vehicle matches <span className="font-mono font-semibold">{normalizePlate(plate)}</span>. Only registered vehicles can be recorded.</p>}
      {v && (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">{isStudent ? 'Student Assistant' : 'Faculty'} Vehicle Information</p>
          <dl className="bg-muted/50 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-md p-3 text-sm">
            {(
              [
                ['Owner', v.owner_display],
                ['Email address', v.owner_email ?? '—'],
                ['Account type', v.owner_role_display ?? '—'],
                ['Vehicle type', v.vehicle_type_display],
                ['Color', <VehicleColor key="color" color={v.color} />],
                ['Brand / model', v.brand_model || '—'],
                ['Plate number', v.plate_number],
                ['Selected parking area', `${space.area_name} · ${space.slot_number}`],
              ] as const
            ).map(([k, val]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="text-right font-medium break-all">{val}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {(reason || error) && (
        <p role="alert" className="border-destructive/30 bg-destructive/10 text-destructive flex gap-2 rounded-md border px-3 py-2 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0" /> {error || reason}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="button" disabled={!v || !!reason || busy} onClick={confirm}>{busy && <Loader2 className="animate-spin" />} Confirm Vehicle Entry</Button>
      </DialogFooter>
    </div>
  )
}

/**
 * The live map. The Admin / Security Guard records entries and exits here; everyone else views it.
 * `changed` (slot number + counter) refreshes the map and highlights a slot changed elsewhere on the page.
 */
export default function ParkingMapPanel({ changed }: { changed?: { slot: string; nonce: number } | null }) {
  const { user } = useAuth()
  const admin = user?.role === 'ADMIN'
  const map = useFetch<MapSpace[]>('/spaces/map/')
  const [flash, trigger] = useFlash()
  const [selected, setSelected] = useState<{ id: number; wasAvailable: boolean } | null>(null)
  const [exiting, setExiting] = useState(false)

  useLiveRefresh((e) => {
    map.reload()
    trigger(e.detail?.slot)
  })

  useEffect(() => {
    if (!changed) return
    map.reload()
    trigger(changed.slot)
  }, [changed?.nonce]) // eslint-disable-line react-hooks/exhaustive-deps

  const spaces = useMemo(() => map.data ?? [], [map.data])
  const slot = spaces.find((s) => s.id === selected?.id) ?? null
  const mine = spaces.find((s) => s.is_mine)
  const close = () => setSelected(null)

  const recordExit = async (txn: number) => {
    setExiting(true)
    try {
      const { data } = await api.post<Transaction>(`/transactions/${txn}/exit/`)
      toast.success(`Exit recorded. ${data.slot_number} is now available.`)
      close()
      map.reload()
    } catch (err) {
      toast.error(apiError(err))
    } finally {
      setExiting(false)
    }
  }

  if (map.error && !map.data) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border p-4 text-sm">
        <p>The parking map could not be loaded.</p>
        <Button size="sm" variant="outline" onClick={() => map.reload()}>Try again</Button>
      </div>
    )
  }
  if (!map.data) return <Skeleton className="h-[32rem]" />

  const lostRace = admin && selected?.wasAvailable && slot && slot.status !== 'AVAILABLE'
  const entryTitle = slot?.category === 'STUDENT' ? 'Student Assistant Vehicle Entry' : 'Faculty Vehicle Entry'
  return (
    <div className="space-y-3">
      {mine && (
        <div className="border-occupied/40 bg-occupied/10 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm">
          <CalendarClock className="size-5 shrink-0" />
          <span className="min-w-0 flex-1">Your vehicle is recorded at <strong>{mine.slot_number}</strong> in {mine.area_name}.</span>
          <Button asChild size="sm" variant="outline"><Link to="/my-parking">View session</Link></Button>
        </div>
      )}

      <ParkingMap2D spaces={spaces} onSlotClick={(s) => setSelected({ id: s.id, wasAvailable: s.status === 'AVAILABLE' })} flashSlots={flash} />

      <Dialog open={!!slot} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          {slot && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  {admin && slot.status === 'AVAILABLE' ? entryTitle : `Parking space ${slot.slot_number}`}
                  {!(admin && slot.status === 'AVAILABLE') && <span className="rounded px-2 py-0.5 text-xs font-semibold" style={{ background: STATUS_META[slot.status].fill, color: STATUS_META[slot.status].ink }}>{STATUS_META[slot.status].label}</span>}
                </DialogTitle>
                <DialogDescription>{slot.slot_type === 'MOTORCYCLE' ? 'Motorcycle' : 'Car'} slot · {slot.area_name} · {slot.slot_number} · {slot.category_display}</DialogDescription>
              </DialogHeader>

              {lostRace ? (
                <p role="alert" className="text-sm font-medium">{NO_LONGER_AVAILABLE}</p>
              ) : admin && slot.status === 'AVAILABLE' ? (
                <VehicleEntryForm space={slot} onClose={close} onRefresh={map.reload} onDone={() => { close(); map.reload() }} />
              ) : admin && slot.status === 'OCCUPIED' && slot.current_transaction ? (
                <div className="space-y-3">
                  <dl className="bg-muted/50 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-md p-3 text-sm">
                    <dt className="text-muted-foreground">Plate number</dt><dd className="text-right font-mono font-semibold">{slot.current_transaction.plate_number}</dd>
                    <dt className="text-muted-foreground">Owner</dt><dd className="text-right">{slot.current_transaction.owner}</dd>
                    <dt className="text-muted-foreground">Entry time</dt><dd className="text-right">{fmtDateTime(slot.current_transaction.entry_time)}</dd>
                  </dl>
                  <p className="text-muted-foreground text-xs">Record the exit only after the vehicle has left.</p>
                  <DialogFooter>
                    <Button variant="outline" onClick={close}>Cancel</Button>
                    <Button variant="destructive" disabled={exiting} onClick={() => recordExit(slot.current_transaction!.id)}>{exiting ? <Loader2 className="animate-spin" /> : <LogOut />} Record vehicle exit</Button>
                  </DialogFooter>
                </div>
              ) : slot.is_mine ? (
                <p className="text-sm">Your vehicle is recorded here. The Admin / Security Guard records your exit when you leave.</p>
              ) : slot.status === 'AVAILABLE' ? (
                <p className="text-sm">This parking space is available. Please proceed to the Admin / Security Guard at the gate, who records every vehicle entry.</p>
              ) : (
                <div className="space-y-2">
                  <p role="alert" className="text-sm font-medium">{UNAVAILABLE[slot.status]}</p>
                  {slot.event_name && <p className="text-muted-foreground text-sm">Event: {slot.event_name}</p>}
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
