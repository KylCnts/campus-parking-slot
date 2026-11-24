import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { CategoryBadge, EmptyState, LoadingRow, Pagination, SearchInput } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/form-controls'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { VehicleColor } from '@/components/vehicle-color'
import { useLiveRefresh } from '@/context/RealtimeContext'
import { useDebounced, useFetch, useTick } from '@/lib/hooks'
import type { Paginated, Transaction } from '@/lib/types'
import { fmtDateTime, fmtDuration } from '@/lib/utils'

/** Vehicles currently on campus. "Exit" opens the plate search of the parking map for that vehicle. */
export default function ParkedVehiclesList({ onExit }: { onExit: (plate: string) => void }) {
  useTick(30000)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [ordering, setOrdering] = useState('entry_time')
  const q = useDebounced(search)
  const list = useFetch<Paginated<Transaction>>('/transactions/active/', { page, search: q, category, ordering, page_size: 15 })
  useLiveRefresh(() => list.reload())

  return (
    <div>
      <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:flex-wrap">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search plate, owner or slot…" />
        <Select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1) }} className="sm:w-44" aria-label="Category">
          <option value="">All categories</option>
          <option value="STUDENT">Student Assistant</option>
          <option value="FACULTY">Faculty</option>
        </Select>
        <Select value={ordering} onChange={(e) => setOrdering(e.target.value)} className="sm:w-48" aria-label="Sort">
          <option value="entry_time">Longest parked first</option>
          <option value="-entry_time">Most recent first</option>
          <option value="space__slot_number">By slot</option>
        </Select>
      </div>
      <Table stack>
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
                <TableCell label="Plate" className="font-mono font-semibold">{t.plate_number}</TableCell>
                <TableCell label="Owner">{t.owner}</TableCell>
                <TableCell label="Category"><CategoryBadge category={t.category} /></TableCell>
                <TableCell label="Vehicle" className="text-muted-foreground">
                  <span className="inline-flex flex-wrap items-center justify-end gap-x-1.5"><VehicleColor color={t.vehicle_color} /> {t.vehicle_type}</span>
                </TableCell>
                <TableCell label="Space">
                  <span className="font-semibold">{t.slot_number}</span> <span className="text-muted-foreground text-xs">{t.area_name}</span>
                </TableCell>
                <TableCell label="Entry time" className="text-xs">{fmtDateTime(t.entry_time)}</TableCell>
                <TableCell label="Duration" className="tabular-nums">{fmtDuration((Date.now() - new Date(t.entry_time).getTime()) / 60000)}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" className="max-md:w-full" onClick={() => onExit(t.plate_number)}>
                    <LogOut /> Record exit
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
    </div>
  )
}
