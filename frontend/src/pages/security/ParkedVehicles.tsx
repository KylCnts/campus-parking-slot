import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { CategoryBadge, EmptyState, LoadingRow, PageHeader, Pagination, SearchInput } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select } from '@/components/ui/form-controls'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useLiveRefresh } from '@/context/RealtimeContext'
import { useDebounced, useFetch, useTick } from '@/lib/hooks'
import type { Paginated, Transaction } from '@/lib/types'
import { fmtDateTime, fmtDuration } from '@/lib/utils'

export default function ParkedVehicles() {
  useTick(30000)
  const nav = useNavigate()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [ordering, setOrdering] = useState('entry_time')
  const q = useDebounced(search)
  const list = useFetch<Paginated<Transaction>>('/transactions/active/', { page, search: q, category, ordering, page_size: 15 })
  useLiveRefresh(() => list.reload())

  return (
    <div>
      <PageHeader title="Currently Parked Vehicles" description={`${list.data?.count ?? 0} vehicles on campus right now.`} />
      <Card className="gap-0 py-0">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search plate, owner or slot…" />
          <Select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1) }} className="sm:w-44">
            <option value="">All categories</option>
            <option value="STUDENT">Student Assistant</option>
            <option value="FACULTY">Faculty</option>
          </Select>
          <Select value={ordering} onChange={(e) => setOrdering(e.target.value)} className="sm:w-48">
            <option value="entry_time">Longest parked first</option>
            <option value="-entry_time">Most recent first</option>
            <option value="space__slot_number">By slot</option>
          </Select>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Plate</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Vehicle</TableHead>
              <TableHead>Space</TableHead>
              <TableHead>Entry time</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.loading && !list.data ? (
              <LoadingRow cols={8} />
            ) : (
              list.data?.results.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono font-semibold">{t.plate_number}</TableCell>
                  <TableCell>{t.owner}</TableCell>
                  <TableCell>
                    <CategoryBadge category={t.category} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {t.vehicle_color} {t.vehicle_type}
                  </TableCell>
                  <TableCell>
                    <span className="font-semibold">{t.slot_number}</span> <span className="text-muted-foreground text-xs">{t.area_name}</span>
                  </TableCell>
                  <TableCell className="text-xs">{fmtDateTime(t.entry_time)}</TableCell>
                  <TableCell className="tabular-nums">{fmtDuration((Date.now() - new Date(t.entry_time).getTime()) / 60000)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => nav(`/exit?plate=${encodeURIComponent(t.plate_number)}`)}>
                      <LogOut /> Exit
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {list.data && !list.data.results.length && <EmptyState title="No vehicles parked" />}
        <div className="pb-4">
          <Pagination page={page} count={list.data?.count ?? 0} pageSize={15} onPage={setPage} />
        </div>
      </Card>
    </div>
  )
}
