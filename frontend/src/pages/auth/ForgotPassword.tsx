import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Loader2, MailCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form-controls'
import { api } from '@/lib/api'
import { apiError } from '@/lib/utils'
import AuthShell from './AuthShell'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Enter a valid email address.')
    setBusy(true)
    setError('')
    try {
      await api.post('/auth/password-reset/', { email: email.trim() })
      setSent(true)
    } catch (err) {
      setError(apiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Forgot password" subtitle="We'll email you a link to reset your password.">
      {sent ? (
        <div className="space-y-4 text-center">
          <div className="bg-available/15 text-available mx-auto flex size-12 items-center justify-center rounded-full">
            <MailCheck className="size-6" />
          </div>
          <p className="text-sm">
            If <strong>{email}</strong> is registered, a password reset link has been sent. Check your inbox.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <Field label="Email address" error={error}>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@campus.edu" autoFocus />
          </Field>
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />} Send reset link
          </Button>
        </form>
      )}
      <Link to="/login" className="text-muted-foreground hover:text-foreground mt-6 flex items-center justify-center gap-1 text-sm">
        <ArrowLeft className="size-4" /> Back to sign in
      </Link>
    </AuthShell>
  )
}
