import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, PasswordInput } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/form-controls'
import { useAuth } from '@/context/AuthContext'
import { api, tokens } from '@/lib/api'
import { apiError, fieldErrors } from '@/lib/utils'

export default function AccountSettings() {
  const { logout, user, refreshUser } = useAuth()
  const nav = useNavigate()
  const [f, setF] = useState({ current_password: '', new_password: '', confirm_password: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!f.current_password) errs.current_password = 'Required.'
    if (f.new_password.length < 8) errs.new_password = 'At least 8 characters.'
    if (f.new_password !== f.confirm_password) errs.confirm_password = 'Passwords do not match.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      const { data } = await api.post('/auth/change-password/', f)
      tokens.set(data.access, data.refresh)
      await refreshUser()
      toast.success('Password changed.')
      setF({ current_password: '', new_password: '', confirm_password: '' })
    } catch (err) {
      setErrors(fieldErrors(err))
      toast.error(apiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Account Settings" description="Manage your password and session." />
      {user?.must_change_password && (
        <p role="alert" className="border-reserved/60 bg-reserved/15 rounded-lg border px-4 py-3 text-sm font-medium">You are using a temporary password. Change it to continue.</p>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change password</CardTitle>
          <CardDescription>Use at least 8 characters. Avoid common or all-numeric passwords.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4" noValidate>
            <Field label="Current password" error={errors.current_password}>
              <PasswordInput value={f.current_password} onChange={(e) => setF({ ...f, current_password: e.target.value })} autoComplete="current-password" />
            </Field>
            <Field label="New password" error={errors.new_password}>
              <PasswordInput value={f.new_password} onChange={(e) => setF({ ...f, new_password: e.target.value })} autoComplete="new-password" />
            </Field>
            <Field label="Confirm new password" error={errors.confirm_password}>
              <PasswordInput value={f.confirm_password} onChange={(e) => setF({ ...f, confirm_password: e.target.value })} autoComplete="new-password" />
            </Field>
            <div>
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 className="animate-spin" />} Update password
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Session</CardTitle>
          <CardDescription>Your session refreshes automatically while active and expires after a period of inactivity.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={async () => {
              await logout()
              nav('/login')
            }}
          >
            <LogOut /> Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
