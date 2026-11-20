import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, Loader2, LogOut, Search } from 'lucide-react'
import { toast } from 'sonner'
import { CategoryBadge, ConfirmDialog, EmptyState, PageHeader } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/form-controls'
import { api } from '@/lib/api'
import { useTick } from '@/lib/hooks'
import type { Transaction, Vehicle } from '@/lib/types'
import { apiError, fmtDateTime, fmtDuration } from '@/lib/utils'

type LookupResult = { vehicle: Vehicle; active_transaction: Transaction | null }

export default function VehicleExit() {
  useTick(30000)
  const [params] = useSearchParams()
  const [plate, setPlate] = useState(params.get('plate') ?? '')
  const [results, setResults] = useState<LookupResult[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<Transaction | null>(null)
  const [done, setDone] = useState<Transaction | null>(null)

  const search = async (e?: FormEvent, p = plate) => {
    e?.preventDefault()
    if (!p.trim()) return
    setBusy(true)
    try {
      const { data } = await api.get<{ results: LookupResult[] }>('/vehicles/lookup/', { params: { plate: p } })
      setResults(data.results)
    } catch (err) {
      toast.error(apiError(err))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    const p = params.get('plate')
    if (p) search(undefined, p)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const recordExit = async () => {
    try {
      const { data } = await api.post<Transaction>(`/transactions/${confirm!.id}/exit/`)
      toast.success(`${data.plate_number} exited. ${data.slot_number} is now available.`)
      setDone(data)
      setResults(null)
      setPlate('')
    } catch (err) {
      toast.error(apiError(err))
      throw err
    }
  }

  const active = results?.filter((r) => r.active_transaction) ?? []
  const inactive = results?.filter((r) => !r.active_transaction) ?? []

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Vehicle Exit" description="Find the vehicle's active parking record and record its departure." />

      {done && (
        <Card className="border-available/40 bg-available/5 gap-3">
          <CardHeader className="flex-row items-center gap-2">
            <CheckCircle2 className="text-available size-5" />
            <CardTitle className="text-base">Exit recorded</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-y-1.5 text-sm sm:grid-cols-4">
              <dt className="text-muted-foreground">Plate</dt>
              <dd className="font-mono font-semibold">{done.plate_number}</dd>
              <dt className="text-muted-foreground">Space freed</dt>
              <dd className="font-semibold">{done.slot_number}</dd>
              <dt className="text-muted-foreground">Entry</dt>
              <dd>{fmtDateTime(done.entry_time)}</dd>
              <dt className="text-muted-foreground">Exit</dt>
              <dd>{fmtDateTime(done.exit_time)}</dd>
              <dt className="text-muted-foreground">Duration</dt>
              <dd>{fmtDuration(done.duration_minutes)}</dd>
              <dt className="text-muted-foreground">Transaction</dt>
              <dd className="font-mono">TXN-{String(done.id).padStart(6, '0')}</dd>
            </dl>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <form onSubmit={search} className="flex gap-2">
            <Input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="Enter plate number" className="h-11 font-mono text-lg uppercase" autoFocus />
            <Button type="submit" className="h-11" disabled={busy || !plate.trim()}>
              {busy ? <Loader2 className="animate-spin" /> : <Search />} Search
            </Button>
          </form>
        </CardContent>
      </Card>

      {results && !results.length && <EmptyState title="No vehicle found" description="Check the plate number and try again." />}

      {active.map(({ vehicle: v, active_transaction: t }) => (
        <Card key={v.id}>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <p className="font-mono text-2xl font-bold">{v.plate_number}</p>
              <p className="text-muted-foreground text-sm">
                {v.owner_display} · {v.color} {v.vehicle_type_display}
              </p>
            </div>
            <CategoryBadge category={v.category} />
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-muted-foreground text-xs">Assigned space</p>
                <p className="text-xl font-semibold">{t!.slot_number}</p>
                <p className="text-muted-foreground text-xs">{t!.area_name}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-muted-foreground text-xs">Entry time</p>
                <p className="font-semibold">{fmtDateTime(t!.entry_time)}</p>
                <p className="text-muted-foreground text-xs">by {t!.entry_recorded_by_name ?? '—'}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-muted-foreground text-xs">Parked for</p>
                <p className="text-xl font-semibold">{fmtDuration((Date.now() - new Date(t!.entry_time).getTime()) / 60000)}</p>
                <p className="text-muted-foreground text-xs font-mono">TXN-{String(t!.id).padStart(6, '0')}</p>
              </div>
            </div>
            <Button size="lg" variant="destructive" className="w-full" onClick={() => setConfirm(t!)}>
              <LogOut /> Record exit
            </Button>
          </CardContent>
        </Card>
      ))}

      {inactive.length > 0 && (
        <Card className="gap-2">
          <CardHeader>
            <CardTitle className="text-sm">Not currently parked</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {inactive.map(({ vehicle: v }) => (
                <li key={v.id} className="flex justify-between py-2">
                  <span className="font-mono font-semibold">{v.plate_number}</span>
                  <span className="text-muted-foreground">{v.owner_display} has no active parking record</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Record exit for ${confirm?.plate_number}?`}
        description={
          <span>
            Space <strong>{confirm?.slot_number}</strong> will be set to AVAILABLE and the exit time saved as now.
          </span>
        }
        confirmLabel="Record exit"
        destructive
        onConfirm={recordExit}
      />
    </div>
  )
}
