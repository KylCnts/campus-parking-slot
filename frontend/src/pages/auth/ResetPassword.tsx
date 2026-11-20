import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { PasswordInput } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/form-controls'
import { api } from '@/lib/api'
import { apiError, fieldErrors } from '@/lib/utils'
import AuthShell from './AuthShell'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const uid = params.get('uid')
  const token = params.get('token')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (pw.length < 8) return setErrors({ new_password: 'Password must be at least 8 characters.' })
    if (pw !== pw2) return setErrors({ confirm_password: 'Passwords do not match.' })
    setBusy(true)
    try {
      await api.post('/auth/password-reset/confirm/', { uid, token, new_password: pw, confirm_password: pw2 })
      toast.success('Password reset. Please sign in.')
      nav('/login')
    } catch (err) {
      setErrors(fieldErrors(err))
      toast.error(apiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Set a new password">
      {!uid || !token ? (
        <p className="text-sm">
          This reset link is incomplete.{' '}
          <Link to="/forgot-password" className="text-primary hover:underline">
            Request a new one
          </Link>
          .
        </p>
      ) : (
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <Field label="New password" error={errors.new_password}>
            <PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="Confirm new password" error={errors.confirm_password}>
            <PasswordInput value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
          </Field>
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />} Reset password
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
