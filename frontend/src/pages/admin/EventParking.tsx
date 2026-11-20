import { useMemo, useState, type FormEvent } from 'react'
import { Ban, CalendarDays, CircleAlert, Clock, Loader2, Mail, Pencil, Plus, Send, Trash2, Unlock } from 'lucide-react'
import { toast } from 'sonner'
import ParkingMap2D from '@/components/ParkingMap2D'
import { ConfirmDialog, EmptyState, PageHeader, StatusBadge } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Textarea } from '@/components/ui/form-controls'
import { Badge, Skeleton, Tabs, TabsList, TabsTrigger } from '@/components/ui/misc'
import { useLiveRefresh } from '@/context/RealtimeContext'
import { api } from '@/lib/api'
import { useFetch } from '@/lib/hooks'
import type { MapSpace, Paginated, ParkingEvent } from '@/lib/types'
import { apiError, cn, fieldErrors, fmtDate, todayISO } from '@/lib/utils'

type Conflict = { slot: string; reason: string }

const fmtTime = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function EventForm({ event, onDone, onCancel }: { event: ParkingEvent | null; onDone: () => void; onCancel: () => void }) {
  const map = useFetch<MapSpace[]>('/spaces/map/')
  useLiveRefresh(() => map.reload())
  const [f, setF] = useState({
    name: event?.name ?? '',
    description: event?.description ?? '',
    event_date: event?.event_date ?? todayISO(),
    start_time: event?.start_time.slice(0, 5) ?? '08:00',
    end_time: event?.end_time.slice(0, 5) ?? '17:00',
  })
  const [selected, setSelected] = useState(() => new Set(event?.space_ids ?? []))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [conflicts, setConflicts] = useState<Conflict[]>([])
  const [busy, setBusy] = useState(false)
  const spaces = useMemo(() => map.data ?? [], [map.data])
  const areas = useMemo(() => [...new Set(spaces.map((s) => s.area_name))], [spaces])
  const published = event?.status === 'PUBLISHED'

  const toggle = (s: MapSpace) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(s.id)) next.delete(s.id)
      else next.add(s.id)
      return next
    })
  const toggleArea = (area: string) => {
    const ids = spaces.filter((s) => s.area_name === area).map((s) => s.id)
    setSelected((prev) => {
      const next = new Set(prev)
      const all = ids.every((id) => next.has(id))
      ids.forEach((id) => (all ? next.delete(id) : next.add(id)))
      return next
    })
  }

  const save = async (publish: boolean) => {
    const errs: Record<string, string> = {}
    if (!f.name.trim()) errs.name = 'Enter the event name.'
    if (!f.event_date) errs.event_date = 'Choose the event date.'
    if (f.end_time <= f.start_time) errs.end_time = 'End time must be later than the start time.'
    if ((publish || published) && !selected.size) errs.space_ids = 'Select at least one parking space on the map.'
    setErrors(errs)
    setConflicts([])
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      const body = { ...f, space_ids: [...selected] }
      if (event) {
        await api.patch(`/events/${event.id}/`, body)
        if (publish && event.status === 'DRAFT') await api.post(`/events/${event.id}/publish/`)
      } else {
        await api.post('/events/', { ...body, publish })
      }
      toast.success(publish ? 'Event published. Users are being notified by email.' : published ? 'Event updated.' : 'Draft saved.')
      onDone()
    } catch (err) {
      const data = (err as { response?: { data?: { conflicts?: Conflict[] } } }).response?.data
      if (data?.conflicts) setConflicts(data.conflicts)
      setErrors(fieldErrors(err))
      toast.error(apiError(err))
    } finally {
      setBusy(false)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    save(true)
  }
  const slotNames = spaces.filter((s) => selected.has(s.id)).map((s) => s.slot_number)

  return (
    <form onSubmit={submit} className="grid items-start gap-6 xl:grid-cols-[minmax(0,24rem)_1fr]" noValidate>
      <Card className="xl:sticky xl:top-20">
        <CardHeader>
          <CardTitle className="text-base">{event ? 'Edit event' : 'New event'}</CardTitle>
          <CardDescription>{published ? 'Changing the schedule or parking spaces emails users an update.' : 'Publishing emails approved student assistants and faculty. Slots turn blue on the event day.'}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field label="Event name" error={errors.name}>
            <Input value={f.name} maxLength={150} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="Description" error={errors.description}>
            <Textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </Field>
          <Field label="Event date" error={errors.event_date}>
            <Input type="date" min={todayISO()} value={f.event_date} onChange={(e) => setF({ ...f, event_date: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start time" error={errors.start_time}>
              <Input type="time" value={f.start_time} onChange={(e) => setF({ ...f, start_time: e.target.value })} />
            </Field>
            <Field label="End time" error={errors.end_time}>
              <Input type="time" value={f.end_time} onChange={(e) => setF({ ...f, end_time: e.target.value })} />
            </Field>
          </div>
          <div>
            <p className="text-sm font-medium">Selected parking spaces ({selected.size})</p>
            <p className={cn('mt-1 text-xs', errors.space_ids ? 'text-destructive' : 'text-muted-foreground')}>{errors.space_ids || slotNames.join(', ') || 'Click slots on the map to select them.'}</p>
          </div>
          {conflicts.length > 0 && (
            <div role="alert" className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm">
              <p className="mb-1 flex items-center gap-2 font-medium"><CircleAlert className="size-4" /> Conflicting parking spaces</p>
              <ul className="space-y-1 text-xs">{conflicts.map((c, i) => <li key={i}><strong>{c.slot}:</strong> {c.reason}</li>)}</ul>
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onCancel}>Back</Button>
            {published ? (
              <Button type="button" disabled={busy} onClick={() => save(false)}>{busy && <Loader2 className="animate-spin" />} Save changes</Button>
            ) : (
              <>
                <Button type="button" variant="outline" disabled={busy} onClick={() => save(false)}>Save draft</Button>
                <Button type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Send />} Save and publish</Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select parking spaces</CardTitle>
          <CardDescription>Click individual slots, or select a whole row.</CardDescription>
          <div className="flex flex-wrap gap-2 pt-2">
            {areas.map((a) => <Button key={a} type="button" size="sm" variant="outline" onClick={() => toggleArea(a)}>{a}</Button>)}
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        </CardHeader>
        <CardContent>
          {map.data ? <ParkingMap2D spaces={spaces} onSlotClick={toggle} selectedIds={selected} isDimmed={(s) => selected.size > 0 && !selected.has(s.id)} /> : <Skeleton className="h-96" />}
        </CardContent>
      </Card>
    </form>
  )
}

export default function EventParking() {
  const [tab, setTab] = useState('upcoming')
  const list = useFetch<Paginated<ParkingEvent>>('/events/', { page_size: 100, ordering: tab === 'upcoming' ? 'starts_at' : '-starts_at' })
  const [editing, setEditing] = useState<ParkingEvent | null | undefined>(undefined)
  const [action, setAction] = useState<{ type: 'cancel' | 'release' | 'delete' | 'publish'; event: ParkingEvent } | null>(null)
  useLiveRefresh(() => list.reload())

  const events = (list.data?.results ?? []).filter((e) => (tab === 'upcoming' ? ['DRAFT', 'PUBLISHED'].includes(e.status) : ['COMPLETED', 'CANCELLED'].includes(e.status)))

  const run = async () => {
    if (!action) return
    const { type, event } = action
    try {
      if (type === 'delete') await api.delete(`/events/${event.id}/`)
      else await api.post(`/events/${event.id}/${type}/`)
      toast.success({ cancel: 'Event cancelled. Users are being notified.', release: 'Parking spaces released.', delete: 'Draft deleted.', publish: 'Event published. Users are being notified by email.' }[type])
      list.reload()
    } catch (err) {
      toast.error(apiError(err))
    }
  }

  if (editing !== undefined) {
    return (
      <div>
        <PageHeader title="Event Parking Management" description="Reserve parking spaces for an upcoming event." />
        <EventForm event={editing} onCancel={() => setEditing(undefined)} onDone={() => { setEditing(undefined); list.reload() }} />
      </div>
    )
  }

  const dialog = action && {
    cancel: { title: `Cancel “${action.event.name}”?`, description: 'Its parking spaces return to AVAILABLE unless they are in use, and users are notified by email.', label: 'Cancel event' },
    release: { title: `Release spaces for “${action.event.name}”?`, description: 'This marks the event as finished and releases its parking spaces now.', label: 'Release spaces' },
    delete: { title: `Delete draft “${action.event.name}”?`, description: 'This draft has not been published and will be removed.', label: 'Delete draft' },
    publish: { title: `Publish “${action.event.name}”?`, description: 'Approved student assistants and faculty are notified by email now, and its parking spaces turn blue on the event day.', label: 'Publish' },
  }[action.type]

  return (
    <div>
      <PageHeader title="Event Parking Management" description="Reserve parking spaces for events and keep users informed." actions={<Button onClick={() => setEditing(null)}><Plus /> Create event</Button>} />
      <Tabs value={tab} onValueChange={setTab} className="mb-4">
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="past">Finished and cancelled</TabsTrigger>
        </TabsList>
      </Tabs>
      {!list.data ? (
        <Skeleton className="h-48" />
      ) : !events.length ? (
        <Card><EmptyState icon={CalendarDays} title={tab === 'upcoming' ? 'No upcoming events' : 'No past events'} description={tab === 'upcoming' ? 'Create an event to reserve parking spaces for it.' : undefined} /></Card>
      ) : (
        <div className="space-y-3">
          {events.map((e) => (
            <Card key={e.id} className="gap-3 px-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{e.name}</h2>
                    <StatusBadge status={e.status} />
                  </div>
                  <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className="flex items-center gap-1.5"><CalendarDays className="size-4" /> {fmtDate(e.event_date + 'T00:00')}</span>
                    <span className="flex items-center gap-1.5"><Clock className="size-4" /> {fmtTime(e.start_time)} – {fmtTime(e.end_time)}</span>
                    {e.notifications_total > 0 && <span className="flex items-center gap-1.5"><Mail className="size-4" /> {e.notifications_total} email records{e.notifications_failed ? `, ${e.notifications_failed} failed` : ''}</span>}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {['DRAFT', 'PUBLISHED'].includes(e.status) && <Button size="sm" variant="outline" onClick={() => setEditing(e)}><Pencil /> Edit</Button>}
                  {e.status === 'DRAFT' && <Button size="sm" onClick={() => setAction({ type: 'publish', event: e })}><Send /> Publish</Button>}
                  {e.status === 'PUBLISHED' && <Button size="sm" variant="outline" onClick={() => setAction({ type: 'release', event: e })}><Unlock /> Release now</Button>}
                  {e.status === 'PUBLISHED' && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setAction({ type: 'cancel', event: e })}><Ban /> Cancel</Button>}
                  {e.status === 'DRAFT' && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setAction({ type: 'delete', event: e })}><Trash2 /> Delete</Button>}
                </div>
              </div>
              {e.description && <p className="text-sm whitespace-pre-wrap">{e.description}</p>}
              <div className="flex flex-wrap gap-1.5">
                {e.slot_numbers.map((s) => <Badge key={s} variant={e.status === 'PUBLISHED' ? 'event' : 'secondary'}>{s}</Badge>)}
                {!e.slot_numbers.length && <span className="text-muted-foreground text-sm">No parking spaces selected yet.</span>}
              </div>
            </Card>
          ))}
        </div>
      )}
      <ConfirmDialog open={!!action} onOpenChange={(o) => !o && setAction(null)} title={dialog?.title ?? ''} description={dialog?.description} confirmLabel={dialog?.label} destructive={action?.type === 'cancel' || action?.type === 'delete'} onConfirm={run} />
    </div>
  )
}
