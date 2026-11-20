import { useState, type FormEvent } from 'react'
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { CategoryBadge, ConfirmDialog, EmptyState, LoadingRow, PageHeader, Pagination, SearchInput } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, Input, Label, Select, Switch } from '@/components/ui/form-controls'
import { Badge } from '@/components/ui/misc'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useLiveRefresh } from '@/context/RealtimeContext'
import { api } from '@/lib/api'
import { useDebounced, useFetch, useMeta } from '@/lib/hooks'
import type { Paginated, User, Vehicle } from '@/lib/types'
import { apiError, fieldErrors, fmtDate } from '@/lib/utils'

function VehicleForm({ vehicle, onDone }: { vehicle: Vehicle | null; onDone: () => void }) {
  const meta = useMeta()
  const owners = useFetch<Paginated<User>>('/users/', { page_size: 500, role: '', ordering: 'full_name' })
  const [f, setF] = useState({
    plate_number: vehicle?.plate_number ?? '',
    owner: vehicle?.owner ? String(vehicle.owner) : '',
    owner_name: vehicle?.owner_name ?? '',
    category: vehicle?.category ?? 'STUDENT',
    vehicle_type: vehicle?.vehicle_type ?? 'CAR',
    color: vehicle?.color ?? '',
    brand_model: vehicle?.brand_model ?? '',
    is_active: vehicle?.is_active ?? true,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  const memberOwners = owners.data?.results.filter((u) => u.role === 'STUDENT' || u.role === 'FACULTY') ?? []

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const body = { ...f, owner: f.owner ? Number(f.owner) : null }
      if (vehicle) await api.patch(`/vehicles/${vehicle.id}/`, body)
      else await api.post('/vehicles/', body)
      toast.success('Vehicle saved.')
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
        <Field label="Plate number" error={errors.plate_number}>
          <Input value={f.plate_number} onChange={set('plate_number')} className="uppercase" />
        </Field>
        <Field label="Linked account" error={errors.owner} hint="Leave empty for an unregistered owner.">
          <Select
            value={f.owner}
            onChange={(e) => {
              const u = memberOwners.find((x) => String(x.id) === e.target.value)
              setF({ ...f, owner: e.target.value, category: u ? (u.role as 'STUDENT' | 'FACULTY') : f.category })
            }}
          >
            <option value="">— None —</option>
            {memberOwners.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name} ({u.role.toLowerCase()})
              </option>
            ))}
          </Select>
        </Field>
        {!f.owner && (
          <Field label="Owner name" error={errors.owner_name}>
            <Input value={f.owner_name} onChange={set('owner_name')} />
          </Field>
        )}
        <Field label="User category" error={errors.category}>
          <Select value={f.category} onChange={set('category')} disabled={!!f.owner}>
            <option value="STUDENT">Student Assistant</option>
            <option value="FACULTY">Faculty</option>
          </Select>
        </Field>
        <Field label="Vehicle type">
          <Select value={f.vehicle_type} onChange={set('vehicle_type')}>
            {meta?.vehicle_types.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Color" error={errors.color}>
          <Input value={f.color} onChange={set('color')} />
        </Field>
        <Field label="Vehicle Brand / Model" error={errors.brand_model}>
          <Input value={f.brand_model} onChange={set('brand_model')} maxLength={100} placeholder="Honda Click 125i" />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <Switch id="vactive" checked={f.is_active} onCheckedChange={(v) => setF({ ...f, is_active: v })} />
        <Label htmlFor="vactive">Allowed to park (active)</Label>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} Save vehicle
        </Button>
      </DialogFooter>
    </form>
  )
}

export default function VehiclesPage() {
  const meta = useMeta()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [vtype, setVtype] = useState('')
  const q = useDebounced(search)
  const vehicles = useFetch<Paginated<Vehicle>>('/vehicles/', { page, search: q, category, vehicle_type: vtype, page_size: 12 })
  const [editing, setEditing] = useState<Vehicle | null | undefined>(undefined)
  const [deleting, setDeleting] = useState<Vehicle | null>(null)
  useLiveRefresh(() => vehicles.reload())

  return (
    <div>
      <PageHeader
        title="Vehicle Management"
        description="All vehicles registered for campus parking."
        actions={
          <Button onClick={() => setEditing(null)}>
            <Plus /> Add vehicle
          </Button>
        }
      />
      <Card className="gap-0 py-0">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search plate, owner, ID, color…" />
          <Select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1) }} className="sm:w-44">
            <option value="">All categories</option>
            <option value="STUDENT">Student Assistant</option>
            <option value="FACULTY">Faculty</option>
          </Select>
          <Select value={vtype} onChange={(e) => { setVtype(e.target.value); setPage(1) }} className="sm:w-44">
            <option value="">All types</option>
            {meta?.vehicle_types.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Plate number</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Brand / model</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Color</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Registered</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vehicles.loading && !vehicles.data ? (
              <LoadingRow cols={10} />
            ) : (
              vehicles.data?.results.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="text-muted-foreground">#{v.id}</TableCell>
                  <TableCell className="font-mono font-semibold">{v.plate_number}</TableCell>
                  <TableCell>
                    <p>{v.owner_display}</p>
                    <p className="text-muted-foreground text-xs">{v.owner_id_number ?? (v.owner ? '' : 'Gate-registered')}</p>
                  </TableCell>
                  <TableCell>{v.brand_model || '—'}</TableCell>
                  <TableCell>{v.vehicle_type_display}</TableCell>
                  <TableCell>{v.color || '—'}</TableCell>
                  <TableCell>
                    <CategoryBadge category={v.category} />
                  </TableCell>
                  <TableCell>
                    {v.is_parked ? <Badge variant="occupied">Parked</Badge> : v.is_active ? <Badge variant="secondary">Off campus</Badge> : <Badge variant="inactive">Inactive</Badge>}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">{fmtDate(v.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="size-8" onClick={() => setEditing(v)} aria-label="Edit">
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive size-8" onClick={() => setDeleting(v)} aria-label="Delete">
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {vehicles.data && !vehicles.data.results.length && <EmptyState title="No vehicles found" />}
        <div className="pb-4">
          <Pagination page={page} count={vehicles.data?.count ?? 0} pageSize={12} onPage={setPage} />
        </div>
      </Card>

      <Dialog open={editing !== undefined} onOpenChange={(o) => !o && setEditing(undefined)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.plate_number}` : 'Register vehicle'}</DialogTitle>
          </DialogHeader>
          {editing !== undefined && (
            <VehicleForm
              vehicle={editing}
              onDone={() => {
                setEditing(undefined)
                vehicles.reload()
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete vehicle ${deleting?.plate_number}?`}
        description="Vehicles with parking history cannot be deleted; mark them inactive instead."
        destructive
        confirmLabel="Delete"
        onConfirm={async () => {
          try {
            await api.delete(`/vehicles/${deleting!.id}/`)
            toast.success('Vehicle deleted.')
            vehicles.reload()
          } catch (err) {
            toast.error(apiError(err))
          }
        }}
      />
    </div>
  )
}
