import { useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/form-controls'
import { Badge } from '@/components/ui/misc'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/lib/api'
import { useMeta } from '@/lib/hooks'
import { apiError, fieldErrors, fmtDate, fmtDateTime } from '@/lib/utils'

export default function Profile() {
  const { user, refreshUser } = useAuth()
  const meta = useMeta()
  const [f, setF] = useState({ full_name: user?.full_name ?? '', department: user?.department ?? '', contact_number: user?.contact_number ?? '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  if (!user) return null
  const isStudent = user.role === 'STUDENT'
  const courses = [...new Set([...(f.department ? [f.department] : []), ...(meta?.courses ?? [])])]

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!f.full_name.trim()) return setErrors({ full_name: 'Required.' })
    setBusy(true)
    try {
      await api.patch('/auth/me/', f)
      await refreshUser()
      setErrors({})
      toast.success('Profile updated.')
    } catch (err) {
      setErrors(fieldErrors(err))
      toast.error(apiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="My Profile" description="Your account information." />
      <Card>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="bg-primary/15 text-primary flex size-16 items-center justify-center rounded-full text-xl font-semibold">
            {user.full_name
              .split(' ')
              .map((p) => p[0])
              .slice(0, 2)
              .join('')
              .toUpperCase()}
          </div>
          <div className="flex-1">
            <p className="text-lg font-semibold">{user.full_name}</p>
            <p className="text-muted-foreground text-sm">{user.email}</p>
          </div>
          <div className="space-y-1 text-sm sm:text-right">
            <Badge>{user.role_display ?? user.role}</Badge>
            <p className="text-muted-foreground text-xs">Member since {fmtDate(user.created_at)}</p>
            <p className="text-muted-foreground text-xs">Last login {fmtDateTime(user.last_login)}</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personal information</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
            <Field label="Full name" error={errors.full_name} className="sm:col-span-2">
              <Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
            </Field>
            <Field label="Email address" hint="Contact the administrator to change your email.">
              <Input value={user.email} disabled />
            </Field>
            <Field label={isStudent ? 'Student ID' : 'Employee ID'}>
              <Input value={user.id_number ?? '—'} disabled />
            </Field>
            <Field label={isStudent ? 'Course' : 'Department'} error={errors.department}>
              {isStudent ? (
                <Select value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })}>
                  {!f.department && <option value="">Select your course</option>}
                  {courses.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} />
              )}
            </Field>
            <Field label="Contact number" error={errors.contact_number}>
              <Input value={f.contact_number} onChange={(e) => setF({ ...f, contact_number: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 className="animate-spin" />} Save changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      {user.vehicles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Registered vehicle</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {user.vehicles.map((v) => (
              <dl key={v.id} className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                {[
                  ['Plate number', v.plate_number],
                  ['Vehicle brand / model', v.brand_model || '—'],
                  ['Vehicle type', v.vehicle_type.charAt(0) + v.vehicle_type.slice(1).toLowerCase()],
                  ['Vehicle color', v.color || '—'],
                ].map(([k, val]) => (
                  <div key={k} className="flex justify-between gap-3 border-b pb-2">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="text-right font-medium">{val}</dd>
                  </div>
                ))}
              </dl>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
