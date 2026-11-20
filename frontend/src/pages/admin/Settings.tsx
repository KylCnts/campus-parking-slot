import { useEffect, useState, type FormEvent } from 'react'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Label, Switch, Textarea } from '@/components/ui/form-controls'
import { Skeleton } from '@/components/ui/misc'
import { api } from '@/lib/api'
import { useFetch } from '@/lib/hooks'
import type { ParkingSettings } from '@/lib/types'
import { apiError, fieldErrors, fmtDateTime } from '@/lib/utils'

export default function SettingsPage() {
  const { data, setData } = useFetch<ParkingSettings>('/settings/')
  const [f, setF] = useState<ParkingSettings | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (data) setF(data)
  }, [data])

  if (!f) return <Skeleton className="h-96" />
  const set = (k: keyof ParkingSettings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const { data: saved } = await api.put<ParkingSettings>('/settings/', {
        ...f,
        low_availability_threshold: Number(f.low_availability_threshold),
        session_reminder_minutes: Number(f.session_reminder_minutes),
        session_grace_minutes: Number(f.session_grace_minutes),
      })
      setData(saved)
      setErrors({})
      toast.success('Parking settings saved.')
    } catch (err) {
      setErrors(fieldErrors(err))
      toast.error(apiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <PageHeader
        title="Parking Settings"
        description={`Last updated ${fmtDateTime(f.updated_at)}`}
        actions={
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Save />} Save settings
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">General</CardTitle>
            <CardDescription>Campus name and operating hours.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="Campus name" error={errors.campus_name}>
              <Input value={f.campus_name} onChange={set('campus_name')} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Opening time" error={errors.opening_time}>
                <Input type="time" value={f.opening_time.slice(0, 5)} onChange={set('opening_time')} />
              </Field>
              <Field label="Closing time" error={errors.closing_time}>
                <Input type="time" value={f.closing_time.slice(0, 5)} onChange={set('closing_time')} />
              </Field>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rules and alerts</CardTitle>
            <CardDescription>How the system assigns spaces and when it warns staff.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <Field
              label="Low availability alert threshold (%)"
              error={errors.low_availability_threshold}
              hint="Admins and security are notified when a category's availability drops below this."
            >
              <Input type="number" min={0} max={100} value={f.low_availability_threshold} onChange={set('low_availability_threshold')} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Departure reminder (minutes)" error={errors.session_reminder_minutes} hint="Sent before the departure time.">
                <Input type="number" min={1} max={120} value={f.session_reminder_minutes} onChange={set('session_reminder_minutes')} />
              </Field>
              <Field label="Session grace period (minutes)" error={errors.session_grace_minutes} hint="Then released automatically.">
                <Input type="number" min={0} max={240} value={f.session_grace_minutes} onChange={set('session_grace_minutes')} />
              </Field>
            </div>
            <div className="flex items-start gap-3">
              <Switch id="cross" checked={f.allow_cross_category_parking} onCheckedChange={(v) => setF({ ...f, allow_cross_category_parking: v })} />
              <div>
                <Label htmlFor="cross">Allow cross-category parking</Label>
                <p className="text-muted-foreground mt-1 text-xs">When on, security may assign a student vehicle to a faculty space (and vice versa).</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campus parking guidelines</CardTitle>
          <CardDescription>One guideline per line. Shown on the student and faculty dashboards.</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea value={f.guidelines} onChange={set('guidelines')} rows={9} />
        </CardContent>
      </Card>
    </form>
  )
}
