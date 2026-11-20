import { useState } from 'react'
import { RotateCw, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { EmptyState, LoadingRow, PageHeader, Pagination, SearchInput, StatusBadge } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select } from '@/components/ui/form-controls'
import { Badge } from '@/components/ui/misc'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'
import { useDebounced, useFetch } from '@/lib/hooks'
import type { EventNotification, Paginated } from '@/lib/types'
import { apiError, fmtDateTime } from '@/lib/utils'

const KIND = { PUBLISHED: 'Published', UPDATED: 'Updated', CANCELLED: 'Cancelled' }

export default function EmailHistory() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [kind, setKind] = useState('')
  const q = useDebounced(search)
  const list = useFetch<Paginated<EventNotification> & { email_delivery_enabled: boolean }>('/event-notifications/', { page, search: q, status, kind, page_size: 20 })

  const retry = async (id: number) => {
    try {
      await api.post(`/event-notifications/${id}/retry/`)
      toast.success('Email queued again.')
      setTimeout(list.reload, 1500)
    } catch (err) {
      toast.error(apiError(err))
    }
  }

  return (
    <div>
      <PageHeader title="Email Notification History" description="Every event notice sent to registered users." />
      {list.data && !list.data.email_delivery_enabled && (
        <div role="status" className="border-reserved/60 bg-reserved/15 mb-4 flex gap-3 rounded-lg border px-4 py-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>No email server is configured, so notices are only printed in the backend window and do not reach inboxes. Add your SMTP details to <code className="font-mono">backend/.env</code> to deliver them.</span>
        </div>
      )}
      <Card className="gap-0 py-0">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search recipient or event…" />
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className="sm:w-44">
            <option value="">All statuses</option>
            <option value="SENT">Sent</option>
            <option value="LOGGED">Console only</option>
            <option value="PENDING">Pending</option>
            <option value="FAILED">Failed</option>
          </Select>
          <Select value={kind} onChange={(e) => { setKind(e.target.value); setPage(1) }} className="sm:w-44">
            <option value="">All notice types</option>
            <option value="PUBLISHED">Published</option>
            <option value="UPDATED">Updated</option>
            <option value="CANCELLED">Cancelled</option>
          </Select>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Notice</TableHead>
              <TableHead>Recipient</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.loading && !list.data ? <LoadingRow cols={6} /> : list.data?.results.map((n) => (
              <TableRow key={n.id}>
                <TableCell className="text-muted-foreground text-xs">{fmtDateTime(n.sent_at ?? n.created_at)}</TableCell>
                <TableCell className="font-medium">{n.event_name}</TableCell>
                <TableCell><Badge variant="secondary">{KIND[n.kind]}</Badge></TableCell>
                <TableCell>
                  <p>{n.recipient_name ?? '—'}</p>
                  <p className="text-muted-foreground text-xs">{n.recipient_email}</p>
                </TableCell>
                <TableCell>
                  <StatusBadge status={n.status} />
                  {n.error && <p className="text-destructive mt-1 max-w-56 truncate text-xs" title={n.error}>{n.error}</p>}
                </TableCell>
                <TableCell className="text-right">
                  {n.status === 'FAILED' && <Button size="sm" variant="outline" onClick={() => retry(n.id)}><RotateCw /> Retry</Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {list.data && !list.data.results.length && <EmptyState title="No email notices yet" description="Notices appear here when you publish, change or cancel an event." />}
        <div className="pb-4">
          <Pagination page={page} count={list.data?.count ?? 0} pageSize={20} onPage={setPage} />
        </div>
      </Card>
    </div>
  )
}
