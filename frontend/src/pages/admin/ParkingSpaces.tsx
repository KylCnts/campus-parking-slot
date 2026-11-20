import { useState, type FormEvent } from 'react'
import { Layers, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { CategoryBadge, ConfirmDialog, EmptyState, LoadingRow, PageHeader, Pagination, SearchInput, StatusBadge } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/form-controls'
import { Badge, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useLiveRefresh } from '@/context/RealtimeContext'
import { api } from '@/lib/api'
import { useDebounced, useFetch } from '@/lib/hooks'
import type { Paginated, ParkingArea, ParkingSpace } from '@/lib/types'
import { apiError, fieldErrors, fmtDateTime } from '@/lib/utils'

const STATUSES = ['AVAILABLE', 'OCCUPIED', 'EVENT_RESERVED']

function SpaceForm({ space, areas, onDone }: { space: Partial<ParkingSpace> | null; areas: ParkingArea[]; onDone: () => void }) {
  const editing = !!space?.id
  const [f, setF] = useState({
    slot_number: space?.slot_number ?? '',
    area: String(space?.area ?? areas[0]?.id ?? ''),
    category: space?.category ?? 'STUDENT',
    slot_type: space?.slot_type ?? 'CAR',
    notes: space?.notes ?? '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!f.slot_number.trim()) return setErrors({ slot_number: 'Slot number is required.' })
    setBusy(true)
    try {
      const body = { ...f, area: Number(f.area) }
      if (editing) await api.patch(`/spaces/${space!.id}/`, body)
      else await api.post('/spaces/', body)
      toast.success(editing ? 'Parking space updated.' : 'Parking space added.')
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
        <Field label="Slot number" error={errors.slot_number}>
          <Input value={f.slot_number} onChange={set('slot_number')} placeholder="EN-21" className="uppercase" />
        </Field>
        <Field label="Parking area" error={errors.area}>
          <Select value={f.area} onChange={set('area')}>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Category" error={errors.category}>
          <Select value={f.category} onChange={set('category')} disabled={space?.status === 'OCCUPIED'}>
            <option value="STUDENT">Student Assistant Parking</option>
            <option value="FACULTY">Faculty Parking</option>
          </Select>
        </Field>
        <Field label="Slot type" error={errors.slot_type}>
          <Select value={f.slot_type} onChange={set('slot_type')} disabled={space?.status === 'OCCUPIED'}>
            <option value="CAR">Car</option>
            <option value="MOTORCYCLE">Motorcycle</option>
          </Select>
        </Field>
      </div>
      <Field label="Notes" error={errors.notes}>
        <Textarea value={f.notes} onChange={set('notes')} placeholder="Optional, e.g. near the entrance, PWD slot" rows={2} />
      </Field>
      <DialogFooter>
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} {editing ? 'Save changes' : 'Add space'}
        </Button>
      </DialogFooter>
    </form>
  )
}

function BulkForm({ areas, onDone }: { areas: ParkingArea[]; onDone: () => void }) {
  const [f, setF] = useState({ area: String(areas[0]?.id ?? ''), category: 'STUDENT', slot_type: 'CAR', prefix: areas[0]?.code ?? '', start: '1', count: '10' })
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const { data } = await api.post('/spaces/bulk-create/', { ...f, start: Number(f.start), count: Number(f.count) })
      toast.success(`Added ${data.created.length} spaces${data.skipped.length ? `, skipped ${data.skipped.length} existing` : ''}.`)
      onDone()
    } catch (err) {
      toast.error(apiError(err))
    } finally {
      setBusy(false)
    }
  }
  const n = Number(f.start) || 1
  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Parking area">
          <Select
            value={f.area}
            onChange={(e) => setF({ ...f, area: e.target.value, prefix: areas.find((a) => String(a.id) === e.target.value)?.code ?? f.prefix })}
          >
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Category">
          <Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            <option value="STUDENT">Student Assistant Parking</option>
            <option value="FACULTY">Faculty Parking</option>
          </Select>
        </Field>
        <Field label="Slot type">
          <Select value={f.slot_type} onChange={(e) => setF({ ...f, slot_type: e.target.value })}>
            <option value="CAR">Car</option>
            <option value="MOTORCYCLE">Motorcycle</option>
          </Select>
        </Field>
        <Field label="Slot prefix">
          <Input value={f.prefix} onChange={(e) => setF({ ...f, prefix: e.target.value })} className="uppercase" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start #">
            <Input type="number" min={1} value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
          </Field>
          <Field label="Count">
            <Input type="number" min={1} max={200} value={f.count} onChange={(e) => setF({ ...f, count: e.target.value })} />
          </Field>
        </div>
      </div>
      <p className="text-muted-foreground text-sm">
        Creates {f.prefix.toUpperCase()}-{String(n).padStart(2, '0')} to {f.prefix.toUpperCase()}-{String(n + (Number(f.count) || 1) - 1).padStart(2, '0')}.
      </p>
      <DialogFooter>
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} Create spaces
        </Button>
      </DialogFooter>
    </form>
  )
}

function AreaForm({ area, onDone }: { area: Partial<ParkingArea> | null; onDone: () => void }) {
  const [f, setF] = useState({ name: area?.name ?? '', code: area?.code ?? '', location: area?.location ?? '', description: area?.description ?? '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!f.name.trim() || !f.code.trim()) return setErrors({ name: !f.name.trim() ? 'Required.' : '', code: !f.code.trim() ? 'Required.' : '' })
    setBusy(true)
    try {
      if (area?.id) await api.patch(`/areas/${area.id}/`, f)
      else await api.post('/areas/', f)
      toast.success('Parking area saved.')
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
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Area name" error={errors.name} className="sm:col-span-2">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Engineering Lot" />
        </Field>
        <Field label="Code" error={errors.code}>
          <Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="EN" className="uppercase" />
        </Field>
      </div>
      <Field label="Location" error={errors.location}>
        <Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="Behind the College of Engineering" />
      </Field>
      <Field label="Description">
        <Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={2} />
      </Field>
      <DialogFooter>
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} Save area
        </Button>
      </DialogFooter>
    </form>
  )
}

export default function ParkingSpaces() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const [slotType, setSlotType] = useState('')
  const [area, setArea] = useState('')
  const [ordering, setOrdering] = useState('area__name')
  const q = useDebounced(search)
  const spaces = useFetch<Paginated<ParkingSpace>>('/spaces/', { page, search: q, status, category, slot_type: slotType, area, ordering, page_size: 15 })
  const areas = useFetch<ParkingArea[]>('/areas/')
  const [editing, setEditing] = useState<Partial<ParkingSpace> | null | undefined>(undefined)
  const [bulk, setBulk] = useState(false)
  const [deleting, setDeleting] = useState<ParkingSpace | null>(null)
  const [areaEdit, setAreaEdit] = useState<Partial<ParkingArea> | null | undefined>(undefined)
  const [areaDelete, setAreaDelete] = useState<ParkingArea | null>(null)

  useLiveRefresh(() => {
    spaces.reload()
    areas.reload()
  })
  const refreshAll = () => {
    spaces.reload()
    areas.reload()
  }
  const areaList = areas.data ?? []
  const filter = (fn: (v: string) => void) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    fn(e.target.value)
    setPage(1)
  }

  return (
    <div>
      <PageHeader title="Parking Space Management" description="Add, edit and organize parking spaces, areas and categories." />
      <Tabs defaultValue="spaces">
        <TabsList className="mb-4">
          <TabsTrigger value="spaces">Parking spaces</TabsTrigger>
          <TabsTrigger value="areas">Parking areas</TabsTrigger>
        </TabsList>

        <TabsContent value="spaces">
          <Card className="gap-0 py-0">
            <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center">
              <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search slot, area, notes…" />
              <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-5 lg:max-w-3xl">
                <Select value={area} onChange={filter(setArea)}>
                  <option value="">All areas</option>
                  {areaList.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
                <Select value={category} onChange={filter(setCategory)}>
                  <option value="">All categories</option>
                  <option value="STUDENT">Student Assistant</option>
                  <option value="FACULTY">Faculty</option>
                </Select>
                <Select value={slotType} onChange={filter(setSlotType)} aria-label="Slot type">
                  <option value="">All types</option>
                  <option value="CAR">Car</option>
                  <option value="MOTORCYCLE">Motorcycle</option>
                </Select>
                <Select value={status} onChange={filter(setStatus)}>
                  <option value="">All statuses</option>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s.replace('_', ' ')}</option>
                  ))}
                </Select>
                <Select value={ordering} onChange={filter(setOrdering)}>
                  <option value="area__name">Sort: Area</option>
                  <option value="slot_number">Sort: Slot</option>
                  <option value="status">Sort: Status</option>
                  <option value="-updated_at">Sort: Recently updated</option>
                </Select>
              </div>
              <div className="flex gap-2 lg:ml-auto">
                <Button variant="outline" onClick={() => setBulk(true)} disabled={!areaList.length}>
                  <Layers /> Bulk add
                </Button>
                <Button onClick={() => setEditing(null)} disabled={!areaList.length}>
                  <Plus /> Add space
                </Button>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Slot</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Parked vehicle</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {spaces.loading && !spaces.data ? (
                  <LoadingRow cols={10} />
                ) : (
                  spaces.data?.results.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-muted-foreground tabular-nums">#{s.id}</TableCell>
                      <TableCell className="font-semibold">{s.slot_number}</TableCell>
                      <TableCell>{s.area_name}</TableCell>
                      <TableCell>{s.slot_type === 'MOTORCYCLE' ? 'Motorcycle' : 'Car'}</TableCell>
                      <TableCell>
                        <CategoryBadge category={s.category} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={s.status} />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{s.current_transaction?.plate_number ?? '—'}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{fmtDateTime(s.created_at)}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{fmtDateTime(s.updated_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="size-8" onClick={() => setEditing(s)} aria-label="Edit">
                          <Pencil />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive size-8" onClick={() => setDeleting(s)} aria-label="Delete">
                          <Trash2 />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            {spaces.data && !spaces.data.results.length && <EmptyState title="No parking spaces found" description="Adjust the filters or add a new space." />}
            <div className="pb-4">
              <Pagination page={page} count={spaces.data?.count ?? 0} pageSize={15} onPage={setPage} />
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="areas">
          <div className="mb-4 flex justify-end">
            <Button onClick={() => setAreaEdit(null)}>
              <Plus /> Add area
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {areaList.map((a) => (
              <Card key={a.id} className="gap-3 px-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{a.name}</p>
                    <p className="text-muted-foreground text-xs">{a.location || 'No location set'}</p>
                  </div>
                  <Badge variant="secondary">{a.code}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-muted/50 rounded-md py-2">
                    <p className="text-base font-semibold">{a.total_spaces}</p>Total
                  </div>
                  <div className="bg-muted/50 rounded-md py-2">
                    <p className="text-available text-base font-semibold">{a.available_spaces}</p>Available
                  </div>
                  <div className="bg-muted/50 rounded-md py-2">
                    <p className="text-occupied text-base font-semibold">{a.occupied_spaces}</p>Occupied
                  </div>
                </div>
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setAreaEdit(a)}>
                    <Pencil /> Edit
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setAreaDelete(a)}>
                    <Trash2 /> Delete
                  </Button>
                </div>
              </Card>
            ))}
          </div>
          {areas.data && !areaList.length && <EmptyState title="No parking areas yet" description="Create an area before adding parking spaces." />}
        </TabsContent>
      </Tabs>

      <Dialog open={editing !== undefined} onOpenChange={(o) => !o && setEditing(undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? `Edit space ${editing.slot_number}` : 'Add parking space'}</DialogTitle>
            <DialogDescription>Assign the slot number, area and category.</DialogDescription>
          </DialogHeader>
          {editing !== undefined && (
            <SpaceForm
              space={editing}
              areas={areaList}
              onDone={() => {
                setEditing(undefined)
                refreshAll()
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={bulk} onOpenChange={setBulk}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk add parking spaces</DialogTitle>
            <DialogDescription>Create a numbered run of slots in one area.</DialogDescription>
          </DialogHeader>
          {bulk && (
            <BulkForm
              areas={areaList}
              onDone={() => {
                setBulk(false)
                refreshAll()
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={areaEdit !== undefined} onOpenChange={(o) => !o && setAreaEdit(undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{areaEdit?.id ? 'Edit parking area' : 'Add parking area'}</DialogTitle>
          </DialogHeader>
          {areaEdit !== undefined && (
            <AreaForm
              area={areaEdit}
              onDone={() => {
                setAreaEdit(undefined)
                refreshAll()
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete space ${deleting?.slot_number}?`}
        description="Spaces with parking or event history cannot be deleted."
        destructive
        confirmLabel="Delete"
        onConfirm={async () => {
          try {
            await api.delete(`/spaces/${deleting!.id}/`)
            toast.success('Parking space deleted.')
            refreshAll()
          } catch (err) {
            toast.error(apiError(err))
          }
        }}
      />
      <ConfirmDialog
        open={!!areaDelete}
        onOpenChange={(o) => !o && setAreaDelete(null)}
        title={`Delete area ${areaDelete?.name}?`}
        description="An area can only be deleted when it has no parking spaces."
        destructive
        confirmLabel="Delete"
        onConfirm={async () => {
          try {
            await api.delete(`/areas/${areaDelete!.id}/`)
            toast.success('Area deleted.')
            refreshAll()
          } catch (err) {
            toast.error(apiError(err))
          }
        }}
      />
    </div>
  )
}
