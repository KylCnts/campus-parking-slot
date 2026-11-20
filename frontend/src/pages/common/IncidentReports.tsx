import { useState, type FormEvent } from 'react'
import { Loader2, MessageSquareReply, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { EmptyState, PageHeader, Pagination, StatusBadge } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/form-controls'
import { Badge, Skeleton } from '@/components/ui/misc'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/lib/api'
import { useFetch, useMeta } from '@/lib/hooks'
import type { IncidentReport, Paginated, ParkingSpace } from '@/lib/types'
import { apiError, fieldErrors, fmtDateTime } from '@/lib/utils'

function NewReport({ onDone }: { onDone: () => void }) {
  const meta = useMeta()
  const spaces = useFetch<Paginated<ParkingSpace>>('/spaces/', { page_size: 500, ordering: 'slot_number' })
  const [f, setF] = useState({ kind: 'WRONG_RECORD', subject: '', description: '', plate_number: '', space: '', transaction: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!f.subject.trim()) errs.subject = 'Required.'
    if (f.description.trim().length < 10) errs.description = 'Describe the problem (at least 10 characters).'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      await api.post('/incident-reports/', {
        ...f,
        space: f.space ? Number(f.space) : null,
        transaction: f.transaction ? Number(f.transaction.replace(/\D/g, '')) : null,
        plate_number: f.plate_number.toUpperCase(),
      })
      toast.success('Report sent to the administrator.')
      onDone()
    } catch (err) {
      setErrors(fieldErrors(err))
      toast.error(apiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type of issue">
          <Select value={f.kind} onChange={set('kind')}>
            {meta?.report_kinds.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Plate number (optional)">
          <Input value={f.plate_number} onChange={set('plate_number')} className="uppercase" />
        </Field>
        <Field label="Parking space (optional)">
          <Select value={f.space} onChange={set('space')}>
            <option value="">— None —</option>
            {spaces.data?.results.map((s) => (
              <option key={s.id} value={s.id}>
                {s.slot_number} ({s.status.toLowerCase()})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Transaction ID (optional)" error={errors.transaction}>
          <Input value={f.transaction} onChange={set('transaction')} placeholder="TXN-000123" />
        </Field>
      </div>
      <Field label="Subject" error={errors.subject}>
        <Input value={f.subject} onChange={set('subject')} />
      </Field>
      <Field label="Description" error={errors.description}>
        <Textarea rows={4} value={f.description} onChange={set('description')} placeholder="What is wrong with the record, and what did you observe?" />
      </Field>
      <DialogFooter>
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} Submit report
        </Button>
      </DialogFooter>
    </form>
  )
}

function Respond({ report, onDone }: { report: IncidentReport; onDone: () => void }) {
  const [status, setStatus] = useState(report.status)
  const [response, setResponse] = useState(report.admin_response)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.patch(`/incident-reports/${report.id}/`, { status, admin_response: response })
      toast.success('Report updated. The reporter has been notified.')
      onDone()
    } catch (err) {
      toast.error(apiError(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="bg-muted/50 space-y-1 rounded-md p-3 text-sm">
        <p className="font-medium">{report.subject}</p>
        <p className="text-muted-foreground whitespace-pre-wrap">{report.description}</p>
      </div>
      <Field label="Status">
        <Select value={status} onChange={(e) => setStatus(e.target.value as IncidentReport['status'])}>
          <option value="OPEN">Open</option>
          <option value="IN_REVIEW">In review</option>
          <option value="RESOLVED">Resolved</option>
          <option value="DISMISSED">Dismissed</option>
        </Select>
      </Field>
      <Field label="Response" hint="To fix a wrong active record, cancel it under Transactions.">
        <Textarea rows={3} value={response} onChange={(e) => setResponse(e.target.value)} />
      </Field>
      <DialogFooter>
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} Save
        </Button>
      </DialogFooter>
    </form>
  )
}

export default function IncidentReports() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const list = useFetch<Paginated<IncidentReport>>('/incident-reports/', { page, status, page_size: 10 })
  const [creating, setCreating] = useState(false)
  const [responding, setResponding] = useState<IncidentReport | null>(null)

  return (
    <div>
      <PageHeader
        title="Parking Record Reports"
        description="Wrong or missing parking records found during gate operations."
        actions={
          <>
            <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className="w-40">
              <option value="">All statuses</option>
              <option value="OPEN">Open</option>
              <option value="IN_REVIEW">In review</option>
              <option value="RESOLVED">Resolved</option>
              <option value="DISMISSED">Dismissed</option>
            </Select>
            {isAdmin && (
              <Button onClick={() => setCreating(true)}>
                <Plus /> New report
              </Button>
            )}
          </>
        }
      />
      {!list.data ? (
        <Skeleton className="h-48" />
      ) : !list.data.results.length ? (
        <Card>
          <EmptyState title="No reports" description="No parking record issues have been reported." />
        </Card>
      ) : (
        <div className="space-y-3">
          {list.data.results.map((r) => (
            <Card key={r.id} className="gap-3 px-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-muted-foreground font-mono text-xs">#{r.id}</span>
                    <p className="font-semibold">{r.subject}</p>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {r.reported_by_name} · {fmtDateTime(r.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{r.kind_display}</Badge>
                  <StatusBadge status={r.status} />
                </div>
              </div>
              <p className="text-sm whitespace-pre-wrap">{r.description}</p>
              <div className="text-muted-foreground flex flex-wrap gap-x-4 text-xs">
                {r.plate_number && <span>Plate: <span className="text-foreground font-mono">{r.plate_number}</span></span>}
                {r.slot_number && <span>Space: <span className="text-foreground">{r.slot_number}</span></span>}
                {r.transaction && <span>Transaction: <span className="text-foreground font-mono">TXN-{String(r.transaction).padStart(6, '0')}</span></span>}
              </div>
              {r.admin_response && (
                <div className="border-primary/40 bg-primary/5 rounded-md border-l-2 px-3 py-2 text-sm">
                  <p className="text-muted-foreground mb-0.5 text-xs">
                    Admin response{r.resolved_by_name ? ` · ${r.resolved_by_name}` : ''}
                    {r.resolved_at ? ` · ${fmtDateTime(r.resolved_at)}` : ''}
                  </p>
                  {r.admin_response}
                </div>
              )}
              {isAdmin && (
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => setResponding(r)}>
                    <MessageSquareReply /> Respond / update status
                  </Button>
                </div>
              )}
            </Card>
          ))}
          <Pagination page={page} count={list.data.count} pageSize={10} onPage={setPage} />
        </div>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Report an incorrect parking record</DialogTitle>
            <DialogDescription>The report is added to the Parking Record Reports list.</DialogDescription>
          </DialogHeader>
          {creating && (
            <NewReport
              onDone={() => {
                setCreating(false)
                list.reload()
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!responding} onOpenChange={(o) => !o && setResponding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report #{responding?.id}</DialogTitle>
          </DialogHeader>
          {responding && (
            <Respond
              report={responding}
              onDone={() => {
                setResponding(null)
                list.reload()
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
