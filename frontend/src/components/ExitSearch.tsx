import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, CheckCircle2, Loader2, LogOut, Search } from 'lucide-react'
import { toast } from 'sonner'
import { CategoryBadge } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/form-controls'
import { VehicleColor } from '@/components/vehicle-color'
import { api } from '@/lib/api'
import { useTick } from '@/lib/hooks'
import type { Transaction, Vehicle } from '@/lib/types'
import { apiError, fmtDateTime, fmtDuration } from '@/lib/utils'

type LookupResult = { vehicle: Vehicle; active_transaction: Transaction | null }
const txnRef = (id: number) => `TXN-${String(id).padStart(6, '0')}`

/**
 * Vehicle exit by plate number. Sits in the top-right corner of the parking map:
 * search a plate, check the active parking record, and record the exit.
 * `request` opens a search from elsewhere on the page (e.g. the parked-vehicles list).
 */
export default function ExitSearch({ request, onExited }: { request?: { plate: string; nonce: number } | null; onExited?: (txn: Transaction) => void }) {
  useTick(30000)
  const [plate, setPlate] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<LookupResult[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState<Transaction | null>(null)
  const [exiting, setExiting] = useState(false)
  const [done, setDone] = useState<Transaction | null>(null)
  const seq = useRef(0)

  const open = results !== null || done !== null
  const close = () => {
    setResults(null)
    setConfirming(null)
    setDone(null)
  }

  const search = async (value: string) => {
    const wanted = value.trim()
    if (!wanted) return
    const id = ++seq.current
    setBusy(true)
    setDone(null)
    setConfirming(null)
    try {
      const { data } = await api.get<{ query: string; results: LookupResult[] }>('/vehicles/lookup/', { params: { plate: wanted } })
      if (id !== seq.current) return
      setQuery(data.query)
      setResults(data.results)
    } catch (err) {
      if (id === seq.current) toast.error(apiError(err))
    } finally {
      if (id === seq.current) setBusy(false)
    }
  }

  useEffect(() => {
    if (!request?.plate) return
    setPlate(request.plate)
    search(request.plate)
  }, [request?.nonce]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (e: FormEvent) => {
    e.preventDefault()
    search(plate)
  }

  const recordExit = async () => {
    if (!confirming) return
    setExiting(true)
    try {
      const { data } = await api.post<Transaction>(`/transactions/${confirming.id}/exit/`)
      toast.success(`${data.plate_number} exited. ${data.slot_number} is now available.`)
      setDone(data)
      setResults(null)
      setConfirming(null)
      setPlate('')
      onExited?.(data)
    } catch (err) {
      toast.error(apiError(err))
      search(query || plate)
    } finally {
      setExiting(false)
    }
  }

  const active = results?.filter((r) => r.active_transaction) ?? []
  const inactive = results?.filter((r) => !r.active_transaction) ?? []

  return (
    <>
      <form onSubmit={submit} role="search" aria-label="Vehicle exit by plate number" className="flex w-full min-w-0 gap-2 sm:w-auto">
        <Input
          value={plate}
          onChange={(e) => setPlate(e.target.value)}
          placeholder="Plate number for exit"
          aria-label="Plate number of the vehicle leaving"
          className="min-w-0 font-mono uppercase sm:w-52"
          autoComplete="off"
          enterKeyHint="search"
        />
        <Button type="submit" disabled={busy || !plate.trim()} className="shrink-0">
          {busy ? <Loader2 className="animate-spin" /> : <Search />} <span className="max-[380px]:sr-only">Search</span>
        </Button>
      </form>

      <Dialog open={open} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-w-xl">
          {done ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle2 className="text-available size-5 shrink-0" /> Exit recorded
                </DialogTitle>
                <DialogDescription>{done.slot_number} is now available on the map.</DialogDescription>
              </DialogHeader>
              <dl className="bg-muted/50 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-md p-3 text-sm">
                {(
                  [
                    ['Plate', <span key="plate" className="font-mono font-semibold">{done.plate_number}</span>],
                    ['Space freed', `${done.slot_number} · ${done.area_name}`],
                    ['Entry', fmtDateTime(done.entry_time)],
                    ['Exit', fmtDateTime(done.exit_time)],
                    ['Duration', fmtDuration(done.duration_minutes)],
                    ['Transaction', <span key="txn" className="font-mono">{txnRef(done.id)}</span>],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="text-right break-words">{v}</dd>
                  </div>
                ))}
              </dl>
              <DialogFooter>
                <Button onClick={close}>Done</Button>
              </DialogFooter>
            </>
          ) : confirming ? (
            <>
              <DialogHeader>
                <DialogTitle>Record exit for {confirming.plate_number}?</DialogTitle>
                <DialogDescription>
                  Space <strong>{confirming.slot_number}</strong> will be set to AVAILABLE and the exit time saved as now. Record the exit only after the vehicle has left.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirming(null)} disabled={exiting}>
                  <ArrowLeft /> Back
                </Button>
                <Button variant="destructive" onClick={recordExit} disabled={exiting}>
                  {exiting ? <Loader2 className="animate-spin" /> : <LogOut />} Record exit
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Vehicle exit</DialogTitle>
                <DialogDescription>
                  Results for <span className="font-mono font-semibold">{query}</span>
                </DialogDescription>
              </DialogHeader>
              {results && !results.length && <p className="text-sm">No registered vehicle matches this plate number. Check the plate and try again.</p>}
              {active.map(({ vehicle: v, active_transaction: t }) => (
                <div key={v.id} className="space-y-3 rounded-lg border p-3 sm:p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-xl font-bold break-all">{v.plate_number}</p>
                      <p className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-sm">
                        <span>{v.owner_display}</span>·<VehicleColor color={v.color} />
                        <span>{v.vehicle_type_display}</span>
                      </p>
                    </div>
                    <CategoryBadge category={v.category} />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="bg-muted/50 rounded-md p-2.5">
                      <p className="text-muted-foreground text-xs">Parked at</p>
                      <p className="text-lg font-semibold">{t!.slot_number}</p>
                      <p className="text-muted-foreground text-xs">{t!.area_name}</p>
                    </div>
                    <div className="bg-muted/50 rounded-md p-2.5">
                      <p className="text-muted-foreground text-xs">Entry time</p>
                      <p className="text-sm font-semibold">{fmtDateTime(t!.entry_time)}</p>
                      <p className="text-muted-foreground text-xs">by {t!.entry_recorded_by_name ?? '—'}</p>
                    </div>
                    <div className="bg-muted/50 rounded-md p-2.5">
                      <p className="text-muted-foreground text-xs">Parked for</p>
                      <p className="text-lg font-semibold">{fmtDuration((Date.now() - new Date(t!.entry_time).getTime()) / 60000)}</p>
                      <p className="text-muted-foreground font-mono text-xs">{txnRef(t!.id)}</p>
                    </div>
                  </div>
                  <Button variant="destructive" className="w-full" onClick={() => setConfirming(t!)}>
                    <LogOut /> Record exit
                  </Button>
                </div>
              ))}
              {inactive.length > 0 && (
                <div>
                  <p className="mb-1 text-sm font-medium">Not currently parked</p>
                  <ul className="divide-y rounded-lg border text-sm">
                    {inactive.map(({ vehicle: v }) => (
                      <li key={v.id} className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 px-3 py-2">
                        <span className="font-mono font-semibold">{v.plate_number}</span>
                        <span className="text-muted-foreground">{v.owner_display} has no active parking record</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
