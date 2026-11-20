import { useState } from 'react'
import { Download } from 'lucide-react'
import { EmptyState, LoadingRow, PageHeader, Pagination, SearchInput } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/form-controls'
import { Badge } from '@/components/ui/misc'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useLiveRefresh } from '@/context/RealtimeContext'
import { useDebounced, useFetch } from '@/lib/hooks'
import type { ActivityLog, Paginated } from '@/lib/types'
import { downloadCSV, fmtDateTime } from '@/lib/utils'

export default function ActivityLogs() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [action, setAction] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const q = useDebounced(search)
  const params = { page, search: q, action, date_from: from, date_to: to, page_size: 20 }
  const logs = useFetch<Paginated<ActivityLog>>('/activity-logs/', params)
  const actions = useFetch<string[]>('/activity-logs/actions/')
  useLiveRefresh(() => page === 1 && logs.reload())

  return (
    <div>
      <PageHeader
        title="System Activity Logs"
        description="Audit trail of sign-ins, account changes, vehicle movements and configuration updates."
        actions={
          <Button
            variant="outline"
            disabled={!logs.data?.results.length}
            onClick={() =>
              downloadCSV(
                'activity-logs.csv',
                (logs.data?.results ?? []).map((l) => ({ Time: fmtDateTime(l.created_at), User: l.user_name, Role: l.user_role ?? '', Action: l.action, Description: l.description, IP: l.ip_address ?? '' })),
              )
            }
          >
            <Download /> Export page
          </Button>
        }
      />
      <Card className="gap-0 py-0">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search user or description…" />
          <Select value={action} onChange={(e) => { setAction(e.target.value); setPage(1) }} className="lg:w-56">
            <option value="">All actions</option>
            {actions.data?.map((a) => (
              <option key={a}>{a}</option>
            ))}
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
              <TableHead>Time</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>IP address</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.loading && !logs.data ? (
              <LoadingRow cols={5} />
            ) : (
              logs.data?.results.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-muted-foreground text-xs">{fmtDateTime(l.created_at)}</TableCell>
                  <TableCell>
                    <p className="font-medium">{l.user_name}</p>
                    {l.user_role && <p className="text-muted-foreground text-xs">{l.user_role}</p>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-mono">
                      {l.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-md whitespace-normal">{l.description}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">{l.ip_address ?? '—'}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {logs.data && !logs.data.results.length && <EmptyState title="No activity found" />}
        <div className="pb-4">
          <Pagination page={page} count={logs.data?.count ?? 0} pageSize={20} onPage={setPage} />
        </div>
      </Card>
    </div>
  )
}
