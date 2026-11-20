import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, Loader2 } from 'lucide-react'
import { PasswordInput } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form-controls'
import { useAuth } from '@/context/AuthContext'
import { apiError } from '@/lib/utils'
import AuthShell from './AuthShell'

export default function Login() {
  const { login } = useAuth()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Enter a valid email address.')
    if (!password) return setError('Enter your password.')
    setBusy(true)
    try {
      await login(email.trim(), password)
      nav('/dashboard', { replace: true })
    } catch (err) {
      setError(apiError(err, 'Unable to sign in.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Sign in" subtitle="Use your campus account to access the parking dashboard.">
      <form onSubmit={submit} className="grid gap-4" noValidate>
        {error && (
          <div className="border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2 rounded-md border px-3 py-2 text-sm">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {error}
          </div>
        )}
        <Field label="Email address" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@campus.edu" autoFocus />
        </Field>
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <Link to="/forgot-password" className="text-primary text-xs hover:underline">
              Forgot password?
            </Link>
          </div>
          <PasswordInput id="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" disabled={busy} className="mt-1">
          {busy && <Loader2 className="animate-spin" />} Sign in
        </Button>
      </form>
      <div className="text-muted-foreground mt-6 space-y-1 text-center text-sm">
        <p>Don't have an account?</p>
        <p>
          <Link to="/register/student" className="text-primary font-medium hover:underline">
            Register as Student Assistant
          </Link>
          <span className="mx-2">·</span>
          <Link to="/register/faculty" className="text-primary font-medium hover:underline">
            Register as Faculty
          </Link>
        </p>
        <p className="pt-3 text-xs">Admin / Security Guard accounts are created by an existing administrator.</p>
      </div>
    </AuthShell>
  )
}
