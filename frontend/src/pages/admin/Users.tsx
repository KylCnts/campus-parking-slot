import { useState, type FormEvent } from 'react'
import { Archive, Ban, CircleCheck, Eye, Loader2, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog, EmptyState, LoadingRow, Pagination, PasswordInput, SearchInput, SectionHeader, StatusBadge } from '@/components/shared'
import { VehicleColor, VehicleColorPicker } from '@/components/vehicle-color'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/form-controls'
import { Badge } from '@/components/ui/misc'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/lib/api'
import { useDebounced, useFetch, useMeta } from '@/lib/hooks'
import type { Paginated, Role, User } from '@/lib/types'
import { apiError, fieldErrors, fmtDate, fmtDateTime } from '@/lib/utils'

const ROLES: { value: Role; label: string }[] = [
  { value: 'STUDENT', label: 'Student Assistant' },
  { value: 'FACULTY', label: 'Faculty' },
  { value: 'ADMIN', label: 'Admin / Security Guard' },
]
const roleLabel = (r: Role) => ROLES.find((x) => x.value === r)?.label ?? r

function UserForm({ user, onDone }: { user: User | null; onDone: () => void }) {
  const meta = useMeta()
  const [f, setF] = useState({
    full_name: user?.full_name ?? '',
    email: user?.email ?? '',
    role: user?.role ?? ('ADMIN' as Role),
    id_number: user?.id_number ?? '',
    department: user?.department ?? '',
    contact_number: user?.contact_number ?? '',
    password: '',
    vehicle_plate: '',
    vehicle_color: '',
    vehicle_brand_model: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!f.full_name.trim()) errs.full_name = 'Required.'
    if (!/^\S+@\S+\.\S+$/.test(f.email)) errs.email = 'Enter a valid email.'
    if (!user && f.password.length < 8) errs.password = 'At least 8 characters.'
    if (!user && f.role === 'STUDENT' && !f.vehicle_color) errs.vehicle_color = 'Select the vehicle color.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      const body: Record<string, unknown> = { ...f }
      if (!f.password) delete body.password
      if (user || f.role !== 'STUDENT') {
        delete body.vehicle_plate
        delete body.vehicle_color
        delete body.vehicle_brand_model
      }
      if (user) await api.patch(`/users/${user.id}/`, body)
      else await api.post('/users/', body)
      toast.success(user ? 'Account updated.' : 'Account created.')
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
        <Field label="Full name" error={errors.full_name} className="sm:col-span-2">
          <Input value={f.full_name} onChange={set('full_name')} />
        </Field>
        <Field label="Email" error={errors.email}>
          <Input type="email" value={f.email} onChange={set('email')} />
        </Field>
        <Field label="Role" error={errors.role}>
          <Select value={f.role} onChange={set('role')} disabled={!!user && (user.role === 'STUDENT')}>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Student / Employee ID" error={errors.id_number}>
          <Input value={f.id_number} onChange={set('id_number')} />
        </Field>
        <Field label="Department / Course" error={errors.department}>
          {f.role === 'STUDENT' ? (
            <Select value={f.department} onChange={set('department')}>
              <option value="">Select a course</option>
              {[...new Set([...(user?.department ? [user.department] : []), ...(meta?.courses ?? [])])].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          ) : (
            <Input value={f.department} onChange={set('department')} />
          )}
        </Field>
        <Field label="Contact number" error={errors.contact_number}>
          <Input value={f.contact_number} onChange={set('contact_number')} />
        </Field>
        <Field label={user ? 'New password (optional)' : 'Password'} error={errors.password}>
          <PasswordInput value={f.password} onChange={set('password')} autoComplete="new-password" />
        </Field>
        {!user && f.role === 'STUDENT' && (
          <>
            <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase sm:col-span-2">Registered motorcycle</p>
            <Field label="Plate number" error={errors.vehicle_plate}>
              <Input value={f.vehicle_plate} onChange={set('vehicle_plate')} className="uppercase" />
            </Field>
            <Field label="Vehicle Brand / Model" error={errors.vehicle_brand_model}>
              <Input value={f.vehicle_brand_model} onChange={set('vehicle_brand_model')} placeholder="Honda Click 125i" />
            </Field>
            <Field label="Vehicle color" error={errors.vehicle_color} className="sm:col-span-2">
              <VehicleColorPicker name="user-vehicle-color" value={f.vehicle_color} invalid={!!errors.vehicle_color} onChange={(color) => setF({ ...f, vehicle_color: color })} />
            </Field>
          </>
        )}
      </div>
      <DialogFooter>
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} {user ? 'Save changes' : 'Create account'}
        </Button>
      </DialogFooter>
    </form>
  )
}

const STATUS_ACTIONS = {
  suspend: { title: 'Suspend', needsReason: true, note: 'The user is signed out and cannot access the system until reinstated.' },
  reinstate: { title: 'Reinstate', needsReason: false, note: 'The user can sign in again.' },
  archive: { title: 'Archive', needsReason: true, note: 'The account can no longer sign in. Parking history stays available to administrators.' },
  restore: { title: 'Restore', needsReason: false, note: 'The account can sign in again.' },
}
type StatusAction = keyof typeof STATUS_ACTIONS

function StatusDialog({ user, action, onClose, onDone }: { user: User; action: StatusAction; onClose: () => void; onDone: () => void }) {
  const meta = STATUS_ACTIONS[action]
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (meta.needsReason && reason.trim().length < 5) return setError('Enter the reason for this action.')
    setBusy(true)
    try {
      await api.post(`/users/${user.id}/${action}/`, { reason })
      toast.success('Account status updated.')
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
          <DialogTitle>{meta.title} {user.full_name}?</DialogTitle>
          <DialogDescription>{meta.note}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <Field label={meta.needsReason ? 'Reason' : 'Reason (optional)'} error={error}>
            <Textarea rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Back</Button>
            <Button type="submit" variant={meta.needsReason ? 'destructive' : 'default'} disabled={busy}>{busy && <Loader2 className="animate-spin" />} {meta.title} account</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function UsersPage() {
  const { user: me } = useAuth()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [active, setActive] = useState('')
  const q = useDebounced(search)
  const users = useFetch<Paginated<User>>('/users/', { page, search: q, role, account_status: active, page_size: 12 })
  const stats = useFetch<Record<string, number>>('/users/stats/')
  const [editing, setEditing] = useState<User | null | undefined>(undefined)
  const [viewing, setViewing] = useState<User | null>(null)
  const [statusChange, setStatusChange] = useState<{ user: User; action: StatusAction } | null>(null)
  const [deleting, setDeleting] = useState<User | null>(null)
  const refresh = () => {
    users.reload()
    stats.reload()
  }

  return (
    <div>
      <SectionHeader
        description="Student assistant, faculty and Admin / Security Guard accounts."
        actions={
          <Button onClick={() => setEditing(null)}>
            <Plus /> Add account
          </Button>
        }
      />
      {stats.data && (
        <div className="mb-4 flex flex-wrap gap-2 text-sm">
          {[
            ['Students', stats.data.students],
            ['Faculty', stats.data.faculty],
            ['Admins', stats.data.admins],
            ['Pending', stats.data.pending],
            ['Suspended', stats.data.suspended],
            ['Archived', stats.data.archived],
          ].map(([l, v]) => (
            <span key={l} className="bg-card rounded-md border px-3 py-1.5">
              <span className="text-muted-foreground">{l}</span> <strong className="tabular-nums">{v}</strong>
            </span>
          ))}
        </div>
      )}
      <Card className="gap-0 py-0">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:flex-wrap">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search name, email, ID, plate…" />
          <Select value={role} onChange={(e) => { setRole(e.target.value); setPage(1) }} className="sm:w-44" aria-label="Role">
            <option value="">All roles</option>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
          <Select value={active} onChange={(e) => { setActive(e.target.value); setPage(1) }} className="sm:w-40" aria-label="Account status">
            <option value="">Any status</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="ARCHIVED">Archived</option>
          </Select>
        </div>
        <Table stack>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Full name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Student / Emp. ID</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Plate no.</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Registered</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.loading && !users.data ? (
              <LoadingRow cols={10} />
            ) : (
              users.data?.results.map((u) => (
                <TableRow key={u.id}>
                  <TableCell label="ID" className="text-muted-foreground">#{u.id}</TableCell>
                  <TableCell label="Full name" className="font-medium">{u.full_name}</TableCell>
                  <TableCell label="Email">{u.email}</TableCell>
                  <TableCell label="Role">
                    <Badge variant="secondary">{roleLabel(u.role)}</Badge>
                  </TableCell>
                  <TableCell label="Student / Emp. ID">{u.id_number ?? '—'}</TableCell>
                  <TableCell label="Department" className="max-w-48 truncate">{u.department || '—'}</TableCell>
                  <TableCell label="Plate no." className="font-mono text-xs">{u.plate_number ?? '—'}</TableCell>
                  <TableCell label="Status">
                    <StatusBadge status={u.account_status} />
                  </TableCell>
                  <TableCell label="Registered" className="text-muted-foreground text-xs">{fmtDate(u.created_at)}</TableCell>
                  <TableCell className="text-right max-md:justify-end max-md:border-t max-md:pt-2">
                    <Button variant="ghost" size="icon" className="size-8" onClick={() => setViewing(u)} aria-label="View">
                      <Eye />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-8" onClick={() => setEditing(u)} aria-label="Edit">
                      <Pencil />
                    </Button>
                    {u.account_status === 'APPROVED' && (
                      <Button variant="ghost" size="icon" className="size-8" disabled={u.id === me?.id} title="Suspend" aria-label="Suspend" onClick={() => setStatusChange({ user: u, action: 'suspend' })}>
                        <Ban className="text-occupied" />
                      </Button>
                    )}
                    {u.account_status === 'SUSPENDED' && (
                      <Button variant="ghost" size="icon" className="size-8" title="Reinstate" aria-label="Reinstate" onClick={() => setStatusChange({ user: u, action: 'reinstate' })}>
                        <CircleCheck className="text-available" />
                      </Button>
                    )}
                    {['APPROVED', 'SUSPENDED', 'REJECTED'].includes(u.account_status) && (
                      <Button variant="ghost" size="icon" className="size-8" disabled={u.id === me?.id} title="Archive" aria-label="Archive" onClick={() => setStatusChange({ user: u, action: 'archive' })}>
                        <Archive />
                      </Button>
                    )}
                    {u.account_status === 'ARCHIVED' && (
                      <Button variant="ghost" size="icon" className="size-8" title="Restore" aria-label="Restore" onClick={() => setStatusChange({ user: u, action: 'restore' })}>
                        <RotateCcw className="text-available" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="text-destructive size-8" disabled={u.id === me?.id} onClick={() => setDeleting(u)} aria-label="Delete">
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {users.data && !users.data.results.length && <EmptyState title="No users found" />}
        <div className="pb-4">
          <Pagination page={page} count={users.data?.count ?? 0} pageSize={12} onPage={setPage} />
        </div>
      </Card>

      <Dialog open={editing !== undefined} onOpenChange={(o) => !o && setEditing(undefined)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit account' : 'Add account'}</DialogTitle>
            <DialogDescription>Admin / Security Guard accounts can only be created here.</DialogDescription>
          </DialogHeader>
          {editing !== undefined && (
            <UserForm
              user={editing}
              onDone={() => {
                setEditing(undefined)
                refresh()
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{viewing?.full_name}</DialogTitle>
            <DialogDescription>{viewing && roleLabel(viewing.role)} account details</DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-4 text-sm">
              <dl className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-x-3 gap-y-2 break-words sm:grid-cols-[9rem_minmax(0,1fr)]">
                <dt className="text-muted-foreground">Email</dt>
                <dd>{viewing.email}</dd>
                <dt className="text-muted-foreground">ID number</dt>
                <dd>{viewing.id_number ?? '—'}</dd>
                <dt className="text-muted-foreground">Department</dt>
                <dd>{viewing.department || '—'}</dd>
                <dt className="text-muted-foreground">Contact</dt>
                <dd>{viewing.contact_number || '—'}</dd>
                <dt className="text-muted-foreground">Status</dt>
                <dd>{viewing.account_status}{viewing.status_reason ? ` · ${viewing.status_reason}` : ''}</dd>
                <dt className="text-muted-foreground">Registered</dt>
                <dd>{fmtDateTime(viewing.created_at)}</dd>
                <dt className="text-muted-foreground">Last login</dt>
                <dd>{fmtDateTime(viewing.last_login)}</dd>
              </dl>
              <div>
                <p className="mb-2 font-medium">Registered vehicles</p>
                {viewing.vehicles.length ? (
                  <ul className="space-y-2">
                    {viewing.vehicles.map((v) => (
                      <li key={v.id} className="bg-muted/50 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md px-3 py-2">
                        <span className="font-mono font-semibold">{v.plate_number}</span>
                        <span className="text-muted-foreground flex flex-wrap items-center gap-x-1.5">
                          {v.brand_model && <span>{v.brand_model} ·</span>}
                          <VehicleColor color={v.color} />
                          <span>· {v.vehicle_type.toLowerCase()}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">No vehicles registered.</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {statusChange && <StatusDialog user={statusChange.user} action={statusChange.action} onClose={() => setStatusChange(null)} onDone={() => { setStatusChange(null); refresh() }} />}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.full_name}?`}
        description="This permanently removes the account. Users with parking history should be deactivated instead."
        destructive
        confirmLabel="Delete"
        onConfirm={async () => {
          try {
            await api.delete(`/users/${deleting!.id}/`)
            toast.success('Account deleted.')
            refresh()
          } catch (err) {
            toast.error(apiError(err))
          }
        }}
      />
    </div>
  )
}
