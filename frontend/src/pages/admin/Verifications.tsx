import { useEffect, useState, type FormEvent } from 'react'
import { BadgeCheck, Eye, ImageOff, Loader2, ShieldCheck, X } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog, EmptyState, LoadingRow, PageHeader, Pagination, SearchInput, StatusBadge } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, Textarea } from '@/components/ui/form-controls'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/misc'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'
import { useDebounced, useFetch } from '@/lib/hooks'
import type { Paginated, Verification } from '@/lib/types'
import { apiError, fmtDateTime } from '@/lib/utils'

function IdPreview({ item, onClose }: { item: Verification; onClose: () => void }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let objectUrl = ''
    let cancelled = false
    api
      .get(`/verifications/${item.id}/image/`, { responseType: 'blob' })
      .then((r) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(r.data)
        setUrl(objectUrl)
      })
      .catch(() => setError('The school ID image could not be loaded.'))
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [item.id])
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>School ID of {item.applicant_name}</DialogTitle>
          <DialogDescription>Compare the ID with the registration details before deciding.</DialogDescription>
        </DialogHeader>
        {error ? <p role="alert" className="text-destructive text-sm">{error}</p> : url ? <img src={url} alt={`School ID submitted by ${item.applicant_name}`} className="max-h-[65vh] w-full rounded-md border object-contain" /> : <Loader2 className="text-muted-foreground mx-auto my-16 size-6 animate-spin" />}
      </DialogContent>
    </Dialog>
  )
}

function RejectDialog({ item, onClose, onDone }: { item: Verification; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (reason.trim().length < 5) return setError('Enter the reason for rejecting this registration.')
    setBusy(true)
    try {
      await api.post(`/verifications/${item.id}/reject/`, { reason })
      toast.success('Registration rejected. The school ID image was deleted.')
      onDone()
    } catch (err) {
      setError(apiError(err))
      setBusy(false)
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject {item.applicant_name}?</DialogTitle>
          <DialogDescription>The applicant receives this reason by email. The school ID image is then deleted.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <Field label="Reason for rejection" error={error}>
            <Textarea rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Back</Button>
            <Button type="submit" variant="destructive" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Reject registration</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function Verifications() {
  const [status, setStatus] = useState('PENDING')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const q = useDebounced(search)
  const list = useFetch<Paginated<Verification>>('/verifications/', { status, page, search: q, page_size: 10 })
  const [viewing, setViewing] = useState<Verification | null>(null)
  const [approving, setApproving] = useState<Verification | null>(null)
  const [rejecting, setRejecting] = useState<Verification | null>(null)

  return (
    <div>
      <PageHeader title="School ID Verification" description="Review each registration and its DLL School ID before granting access." />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={status} onValueChange={(v) => { setStatus(v); setPage(1) }}>
          <TabsList>
            <TabsTrigger value="PENDING">Pending</TabsTrigger>
            <TabsTrigger value="APPROVED">Approved</TabsTrigger>
            <TabsTrigger value="REJECTED">Rejected</TabsTrigger>
          </TabsList>
        </Tabs>
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search name, email, ID, plate…" />
      </div>
      <Card className="gap-0 py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Applicant</TableHead>
              <TableHead>User type</TableHead>
              <TableHead>ID number</TableHead>
              <TableHead>Course / department</TableHead>
              <TableHead>Vehicle</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>School ID and decision</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.loading && !list.data ? <LoadingRow cols={7} /> : list.data?.results.map((v) => (
              <TableRow key={v.id}>
                <TableCell>
                  <p className="font-medium">{v.applicant_name}</p>
                  <p className="text-muted-foreground text-xs">{v.applicant_email}</p>
                  <p className="text-muted-foreground text-xs">Registered {fmtDateTime(v.submitted_at)}</p>
                </TableCell>
                <TableCell>{v.user_type}</TableCell>
                <TableCell className="font-mono text-xs">{v.id_number ?? '—'}</TableCell>
                <TableCell className="max-w-56 whitespace-normal text-xs">{v.department || '—'}{v.year_level ? ` · ${v.year_level}` : ''}</TableCell>
                <TableCell className="text-xs">
                  <p className="font-mono font-semibold">{v.vehicle?.plate_number ?? '—'}</p>
                  <p className="text-muted-foreground">{[v.vehicle?.vehicle_type, v.vehicle?.brand_model].filter(Boolean).join(' · ')}</p>
                </TableCell>
                <TableCell>
                  <StatusBadge status={v.status} />
                  {v.decided_by_name && <p className="text-muted-foreground mt-1 text-xs">{v.decided_by_name} · {fmtDateTime(v.decided_at)}</p>}
                  {v.rejection_reason && <p className="text-muted-foreground mt-1 max-w-52 text-xs whitespace-normal">{v.rejection_reason}</p>}
                </TableCell>
                <TableCell>
                  <div className="flex w-28 flex-col gap-1">
                    {v.has_image ? <Button size="sm" variant="outline" onClick={() => setViewing(v)}><Eye /> View ID</Button> : <span className="text-muted-foreground flex items-center gap-1.5 text-xs"><ImageOff className="size-3.5" /> Deleted</span>}
                    {v.status === 'PENDING' && <Button size="sm" variant="success" onClick={() => setApproving(v)}><BadgeCheck /> Approve</Button>}
                    {v.status === 'PENDING' && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setRejecting(v)}><X /> Reject</Button>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {list.data && !list.data.results.length && <EmptyState icon={ShieldCheck} title={status === 'PENDING' ? 'No registrations are waiting' : 'No records found'} />}
        <div className="pb-4"><Pagination page={page} count={list.data?.count ?? 0} pageSize={10} onPage={setPage} /></div>
      </Card>
      {viewing && <IdPreview item={viewing} onClose={() => setViewing(null)} />}
      {rejecting && <RejectDialog item={rejecting} onClose={() => setRejecting(null)} onDone={() => { setRejecting(null); list.reload() }} />}
      <ConfirmDialog
        open={!!approving}
        onOpenChange={(o) => !o && setApproving(null)}
        title={`Approve ${approving?.applicant_name}?`}
        description="Confirm that you inspected the school ID. The account gains access and the image is deleted."
        confirmLabel="Approve registration"
        onConfirm={async () => {
          try {
            await api.post(`/verifications/${approving!.id}/approve/`)
            toast.success('Registration approved. The school ID image was deleted.')
            list.reload()
          } catch (err) {
            toast.error(apiError(err))
          }
        }}
      />
    </div>
  )
}
