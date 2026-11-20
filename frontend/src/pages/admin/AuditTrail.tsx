import { useState } from 'react'
import { ScrollText } from 'lucide-react'
import { EmptyState, LoadingRow, PageHeader, Pagination, SearchInput } from '@/components/shared'
import { Card } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/form-controls'
import { Badge } from '@/components/ui/misc'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useDebounced, useFetch } from '@/lib/hooks'
import type { AuditEntry, Paginated } from '@/lib/types'
import { fmtDateTime } from '@/lib/utils'

function Values({ value }: { value: Record<string, unknown> | null }) {
  if (!value || !Object.keys(value).length) return <span className="text-muted-foreground">—</span>
  return (
    <dl className="space-y-0.5">
      {Object.entries(value).map(([k, v]) => (
        <div key={k} className="flex gap-1.5">
          <dt className="text-muted-foreground shrink-0">{k.replace(/_/g, ' ')}:</dt>
          <dd className="break-words">{Array.isArray(v) ? v.join(', ') : String(v ?? '—')}</dd>
        </div>
      ))}
    </dl>
  )
}

export default function AuditTrail() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [action, setAction] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const q = useDebounced(search)
  const list = useFetch<Paginated<AuditEntry>>('/audit-trail/', { page, search: q, action, date_from: from, date_to: to, page_size: 15 })
  const actions = useFetch<string[]>('/audit-trail/actions/')

  return (
    <div>
      <PageHeader title="Audit Trail" description="A permanent record of administrative actions. Entries cannot be edited or deleted." />
      <Card className="gap-0 py-0">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search admin, record, reason…" />
          <Select value={action} onChange={(e) => { setAction(e.target.value); setPage(1) }} className="lg:w-64" aria-label="Action">
            <option value="">All actions</option>
            {actions.data?.map((a) => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
          </Select>
          <div className="flex items-center gap-2">
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1) }} aria-label="From date" />
            <span className="text-muted-foreground text-sm">to</span>
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1) }} aria-label="To date" />
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date and time</TableHead>
              <TableHead>Administrator</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Affected record</TableHead>
              <TableHead>Previous value</TableHead>
              <TableHead>New value</TableHead>
              <TableHead>Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.loading && !list.data ? <LoadingRow cols={7} /> : list.data?.results.map((e) => (
              <TableRow key={e.id} className="align-top">
                <TableCell className="text-muted-foreground align-top text-xs">{fmtDateTime(e.created_at)}</TableCell>
                <TableCell className="align-top text-xs">
                  <p className="font-medium">{e.actor_name}</p>
                  <p className="text-muted-foreground">{e.actor_email}</p>
                </TableCell>
                <TableCell className="align-top"><Badge variant="secondary">{e.action.replace(/_/g, ' ')}</Badge></TableCell>
                <TableCell className="max-w-52 align-top text-xs whitespace-normal">{e.target_label}</TableCell>
                <TableCell className="max-w-60 align-top text-xs whitespace-normal"><Values value={e.previous_value} /></TableCell>
                <TableCell className="max-w-60 align-top text-xs whitespace-normal"><Values value={e.new_value} /></TableCell>
                <TableCell className="max-w-52 align-top text-xs whitespace-normal">{e.reason || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {list.data && !list.data.results.length && <EmptyState icon={ScrollText} title="No audit records found" />}
        <div className="pb-4"><Pagination page={page} count={list.data?.count ?? 0} pageSize={15} onPage={setPage} /></div>
      </Card>
    </div>
  )
}
