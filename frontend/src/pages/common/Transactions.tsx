import { useState } from 'react'
import { ArrowDown, ArrowUp, Ban, Download, Loader2, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { CategoryBadge, ConfirmDialog, EmptyState, LoadingRow, PageHeader, Pagination, SearchInput, StatusBadge } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/form-controls'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/context/AuthContext'
import { useLiveRefresh } from '@/context/RealtimeContext'
import { api } from '@/lib/api'
import { useDebounced, useFetch } from '@/lib/hooks'
import type { Paginated, Transaction } from '@/lib/types'
import { apiError, downloadCSV, fmtDateTime, fmtDuration } from '@/lib/utils'

const PAGE = 15

function ReleaseDialog({ txn, onClose, onDone }: { txn: Transaction; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    try {
      await api.post(`/transactions/${txn.id}/release/`, { reason, confirmed_left: confirmed })
      toast.success(`${txn.slot_number} was released.`)
      onDone()
    } catch (err) {
      toast.error(apiError(err))
      setBusy(false)
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Release {txn.slot_number}?</DialogTitle>
          <DialogDescription>Use this only after confirming with {txn.owner} that {txn.plate_number} has left and will not return.</DialogDescription>
        </DialogHeader>
        <Field label="Reason">
          <Textarea rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          I confirmed that the vehicle has left.
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Back</Button>
          <Button variant="destructive" disabled={busy || !confirmed || reason.trim().length < 5} onClick={submit}>{busy && <Loader2 className="animate-spin" />} Release space</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function Transactions() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [ordering, setOrdering] = useState('-entry_time')
  const [cancelling, setCancelling] = useState<Transaction | null>(null)
  const [releasing, setReleasing] = useState<Transaction | null>(null)
  const q = useDebounced(search)
  const params = { page, search: q, status, category, date_from: from, date_to: to, ordering, page_size: PAGE }
  const list = useFetch<Paginated<Transaction>>('/transactions/', params)
  useLiveRefresh(() => list.reload())

  const sortBy = (field: string) => {
    setOrdering((o) => (o === field ? `-${field}` : o === `-${field}` ? field : `-${field}`))
    setPage(1)
  }
  const SortHead = ({ field, children }: { field: string; children: React.ReactNode }) => (
    <TableHead>
      <button className="hover:text-foreground inline-flex cursor-pointer items-center gap-1 uppercase" onClick={() => sortBy(field)}>
        {children}
        {ordering === field ? <ArrowUp className="size-3" /> : ordering === `-${field}` ? <ArrowDown className="size-3" /> : null}
      </button>
    </TableHead>
  )
  const reset = (fn: (v: string) => void) => (v: string) => {
    fn(v)
    setPage(1)
  }

  const exportAll = async () => {
    try {
      const { data } = await api.get<Paginated<Transaction>>('/transactions/', { params: { ...params, page: 1, page_size: 500 } })
      downloadCSV(
        'parking-transactions.csv',
        data.results.map((t) => ({
          'Transaction ID': `TXN-${String(t.id).padStart(6, '0')}`,
          'Plate Number': t.plate_number,
          Owner: t.owner,
          Category: t.category_display,
          'Parking Space': t.slot_number,
          Area: t.area_name,
          'Entry Time': fmtDateTime(t.entry_time),
          'Exit Time': t.exit_time ? fmtDateTime(t.exit_time) : '',
          Status: t.status,
          'Entry Recorded By': t.entry_recorded_by_name ?? '',
          'Exit Recorded By': t.exit_recorded_by_name ?? '',
        })),
      )
    } catch (err) {
      toast.error(apiError(err))
    }
  }

  return (
    <div>
      <PageHeader
        title="Parking Transactions"
        description="Every recorded vehicle entry and exit."
        actions={
          <Button variant="outline" onClick={exportAll} disabled={!list.data?.count}>
            <Download /> Export CSV
          </Button>
        }
      />
      <Card className="gap-0 py-0">
        <div className="flex flex-col gap-3 border-b p-4 xl:flex-row xl:items-center">
          <SearchInput value={search} onChange={reset(setSearch)} placeholder="Search plate, owner, slot…" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Select value={status} onChange={(e) => reset(setStatus)(e.target.value)}>
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </Select>
            <Select value={category} onChange={(e) => reset(setCategory)(e.target.value)}>
              <option value="">All categories</option>
              <option value="STUDENT">Student Assistant</option>
              <option value="FACULTY">Faculty</option>
            </Select>
            <Input type="date" value={from} onChange={(e) => reset(setFrom)(e.target.value)} aria-label="From date" title="Entry date from" />
            <Input type="date" value={to} onChange={(e) => reset(setTo)(e.target.value)} aria-label="To date" title="Entry date to" />
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <SortHead field="id">Txn ID</SortHead>
              <SortHead field="vehicle__plate_number">Plate</SortHead>
              <TableHead>Owner</TableHead>
              <TableHead>Category</TableHead>
              <SortHead field="space__slot_number">Space</SortHead>
              <SortHead field="entry_time">Entry</SortHead>
              <SortHead field="exit_time">Exit</SortHead>
              <TableHead>Est. departure</TableHead>
              <TableHead>Duration</TableHead>
              <SortHead field="status">Status</SortHead>
              <TableHead>Recorded by</TableHead>
              {isAdmin && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.loading && !list.data ? (
              <LoadingRow cols={12} />
            ) : (
              list.data?.results.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">TXN-{String(t.id).padStart(6, '0')}</TableCell>
                  <TableCell className="font-mono font-semibold">{t.plate_number}</TableCell>
                  <TableCell>{t.owner}</TableCell>
                  <TableCell>
                    <CategoryBadge category={t.category} />
                  </TableCell>
                  <TableCell>{t.slot_number}</TableCell>
                  <TableCell className="text-xs">{fmtDateTime(t.entry_time)}</TableCell>
                  <TableCell className="text-xs">{fmtDateTime(t.exit_time)}</TableCell>
                  <TableCell className="text-xs">{fmtDateTime(t.estimated_departure)}</TableCell>
                  <TableCell>{fmtDuration(t.duration_minutes)}</TableCell>
                  <TableCell>
                    <StatusBadge status={t.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {t.entry_recorded_by_name ?? '—'}
                    {t.exit_recorded_by_name && ` / ${t.exit_recorded_by_name}`}
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      {t.status === 'ACTIVE' && (
                        <Button variant="ghost" size="sm" onClick={() => setReleasing(t)} title="Release after confirming the vehicle left">
                          <LogOut /> Release
                        </Button>
                      )}
                      {t.status === 'ACTIVE' && (
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setCancelling(t)} title="Cancel an incorrect record">
                          <Ban /> Cancel
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {list.data && !list.data.results.length && <EmptyState title="No transactions found" description="Try changing the filters." />}
        <div className="pb-4">
          <Pagination page={page} count={list.data?.count ?? 0} pageSize={PAGE} onPage={setPage} />
        </div>
      </Card>
      {releasing && <ReleaseDialog txn={releasing} onClose={() => setReleasing(null)} onDone={() => { setReleasing(null); list.reload() }} />}
      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(o) => !o && setCancelling(null)}
        title={`Cancel TXN-${String(cancelling?.id ?? 0).padStart(6, '0')}?`}
        description="Use this to correct an incorrect record. The transaction will be marked CANCELLED and the space freed."
        destructive
        confirmLabel="Cancel transaction"
        onConfirm={async () => {
          try {
            await api.post(`/transactions/${cancelling!.id}/cancel/`, { remarks: 'Cancelled by administrator' })
            toast.success('Transaction cancelled.')
            list.reload()
          } catch (err) {
            toast.error(apiError(err))
          }
        }}
      />
    </div>
  )
}
