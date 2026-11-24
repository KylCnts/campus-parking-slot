import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { GraduationCap, Hourglass, ImageUp, Loader2, Presentation } from 'lucide-react'
import { toast } from 'sonner'
import { PasswordInput } from '@/components/shared'
import { VehicleColorPicker } from '@/components/vehicle-color'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/form-controls'
import { api } from '@/lib/api'
import { useMeta } from '@/lib/hooks'
import { apiError, cn, fieldErrors } from '@/lib/utils'
import AuthShell from './AuthShell'

const empty = {
  full_name: '',
  id_number: '',
  email: '',
  password: '',
  confirm_password: '',
  department: '',
  year_level: '',
  contact_number: '',
  vehicle_type: 'CAR',
  vehicle_color: '',
  vehicle_brand_model: '',
  plate_number: '',
}

function validate(f: typeof empty, isStudent: boolean) {
  const e: Record<string, string> = {}
  if (f.full_name.trim().length < 3) e.full_name = 'Enter your full name.'
  if (!f.id_number.trim()) e.id_number = `${isStudent ? 'Student' : 'Employee'} ID is required.`
  if (!/^\S+@\S+\.\S+$/.test(f.email)) e.email = 'Enter a valid email address.'
  if (f.password.length < 8) e.password = 'Password must be at least 8 characters.'
  else if (/^\d+$/.test(f.password)) e.password = 'Password cannot be entirely numeric.'
  if (f.confirm_password !== f.password) e.confirm_password = 'Passwords do not match.'
  if (!f.department.trim()) e.department = `${isStudent ? 'Course' : 'Department'} is required.`
  if (isStudent && !f.year_level) e.year_level = 'Year level is required.'
  if (!/^\+?[0-9][0-9 -]{6,18}$/.test(f.contact_number.trim())) e.contact_number = 'Enter a valid contact number.'
  if (!f.vehicle_color) e.vehicle_color = 'Select your vehicle color.'
  if (!f.vehicle_brand_model.trim()) e.vehicle_brand_model = 'Vehicle brand / model is required.'
  else if (!/^[A-Za-z0-9][A-Za-z0-9 .\-/+]{1,99}$/.test(f.vehicle_brand_model.trim())) e.vehicle_brand_model = 'Enter a valid vehicle brand or model.'
  if (!/^[A-Za-z0-9][A-Za-z0-9 -]{1,18}[A-Za-z0-9]$/.test(f.plate_number.trim())) e.plate_number = 'Enter a valid plate number.'
  return e
}

export default function Register() {
  const { type } = useParams()
  const nav = useNavigate()
  const meta = useMeta()
  const [form, setForm] = useState(empty)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [schoolId, setSchoolId] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!schoolId) return setPreview('')
    const url = URL.createObjectURL(schoolId)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [schoolId])

  const pickSchoolId = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    setSchoolId(null)
    if (!file) return
    let problem = ''
    if (!/\.(jpe?g|png)$/i.test(file.name) || !['image/jpeg', 'image/png'].includes(file.type)) problem = 'Upload a JPG, JPEG, or PNG image.'
    else if (file.size > 5 * 1024 * 1024) problem = 'The image must be 5 MB or smaller.'
    setErrors((prev) => ({ ...prev, school_id: problem }))
    if (problem) e.target.value = ''
    else setSchoolId(file)
  }

  if (type !== 'student' && type !== 'faculty') return <Navigate to="/register/student" replace />
  const isStudent = type === 'student'
  const passwordMismatch = form.confirm_password && form.confirm_password !== form.password ? 'Passwords do not match.' : ''
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    setErrors((prev) => ({ ...prev, [k]: '' }))
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errs = validate(form, isStudent)
    if (!schoolId) errs.school_id = 'Upload a photo of your official DLL School ID.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      const body = new FormData()
      Object.entries({ ...form, vehicle_type: isStudent ? 'MOTORCYCLE' : form.vehicle_type, role: isStudent ? 'STUDENT' : 'FACULTY' }).forEach(([k, v]) => body.append(k, v))
      body.append('school_id', schoolId!)
      await api.post('/auth/register/', body, { timeout: 60000 })
      setSubmitted(true)
    } catch (err) {
      const fe = fieldErrors(err)
      setErrors(fe)
      toast.error(apiError(err, 'Registration failed.'))
    } finally {
      setBusy(false)
    }
  }

  const tab = (t: 'student' | 'faculty', label: string, Icon: typeof GraduationCap) => (
    <Link
      to={`/register/${t}`}
      onClick={() => {
        setErrors({})
        if (t !== type) setForm((f) => ({ ...f, department: '' }))
      }}
      className={cn(
        'flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors',
        type === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="size-4" /> {label}
    </Link>
  )

  if (submitted) {
    return (
      <AuthShell title="Registration submitted" subtitle="Your account is pending verification.">
        <div className="space-y-4">
          <div className="bg-reserved/20 flex size-12 items-center justify-center rounded-full"><Hourglass className="size-6" /></div>
          <p className="text-sm">An administrator will review your details and DLL School ID. You will receive an email at <strong>{form.email}</strong> once a decision is made.</p>
          <Button className="w-full" onClick={() => nav('/login')}>Back to sign in</Button>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell wide title={isStudent ? 'Student assistant registration' : 'Faculty registration'} subtitle="Create your account and register the vehicle you bring to campus.">
      <div className="bg-muted mb-6 flex gap-1 rounded-lg p-1">
        {tab('student', 'Student Assistant', GraduationCap)}
        {tab('faculty', 'Faculty', Presentation)}
      </div>
      <form onSubmit={submit} noValidate className="space-y-6">
        <section>
          <h3 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">Personal information</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" error={errors.full_name}>
              <Input value={form.full_name} onChange={set('full_name')} placeholder="Juan Dela Cruz" aria-invalid={!!errors.full_name} />
            </Field>
            <Field label={isStudent ? 'Student ID' : 'Employee ID'} error={errors.id_number}>
              <Input value={form.id_number} onChange={set('id_number')} placeholder={isStudent ? '2024-00123' : 'EMP-0456'} aria-invalid={!!errors.id_number} />
            </Field>
            <Field label={isStudent ? 'Course' : 'Department'} error={errors.department} className="sm:col-span-2">
              {isStudent ? (
                <Select value={form.department} onChange={set('department')} required aria-invalid={!!errors.department}>
                  <option value="" disabled>
                    Select your course
                  </option>
                  {meta?.courses.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input value={form.department} onChange={set('department')} placeholder="College of Engineering" aria-invalid={!!errors.department} />
              )}
            </Field>
            {isStudent && (
              <Field label="Year level" error={errors.year_level} className="sm:col-span-2">
                <Select value={form.year_level} onChange={set('year_level')} required aria-invalid={!!errors.year_level}>
                  <option value="" disabled>Select your year level</option>
                  <option value="1ST">1st Year</option>
                  <option value="2ND">2nd Year</option>
                  <option value="3RD">3rd Year</option>
                  <option value="4TH">4th Year</option>
                </Select>
              </Field>
            )}
            <Field label="Email address" error={errors.email}>
              <Input type="email" value={form.email} onChange={set('email')} placeholder="you@campus.edu" aria-invalid={!!errors.email} />
            </Field>
            <Field label="Contact number" error={errors.contact_number}>
              <Input value={form.contact_number} onChange={set('contact_number')} placeholder="09171234567" aria-invalid={!!errors.contact_number} />
            </Field>
            <Field label="Password" error={errors.password} hint="At least 8 characters, not too common.">
              <PasswordInput value={form.password} onChange={set('password')} autoComplete="new-password" aria-invalid={!!errors.password} />
            </Field>
            <Field label="Confirm password" error={errors.confirm_password || passwordMismatch} hint="Enter the same password again.">
              <PasswordInput value={form.confirm_password} onChange={set('confirm_password')} autoComplete="new-password" aria-invalid={!!(errors.confirm_password || passwordMismatch)} />
            </Field>
          </div>
        </section>
        <section>
          <h3 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">Vehicle information</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Plate number" error={errors.plate_number}>
              <Input value={form.plate_number} onChange={set('plate_number')} placeholder="ABC 1234" className="uppercase" aria-invalid={!!errors.plate_number} />
            </Field>
            <Field label="Vehicle type" error={errors.vehicle_type} hint={isStudent ? 'Student assistants may only bring motorcycles inside the campus.' : undefined}>
              <Select value={isStudent ? 'MOTORCYCLE' : form.vehicle_type} onChange={set('vehicle_type')} disabled={isStudent}>
                {(isStudent ? [{ value: 'MOTORCYCLE', label: 'Motorcycle' }] : (meta?.vehicle_types ?? [{ value: 'CAR', label: 'Car' }])).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Vehicle Brand / Model" error={errors.vehicle_brand_model} className="sm:col-span-2">
              <Input value={form.vehicle_brand_model} onChange={set('vehicle_brand_model')} maxLength={100} placeholder="Honda Click 125i" aria-invalid={!!errors.vehicle_brand_model} />
            </Field>
            <Field label="Vehicle color" error={errors.vehicle_color} className="sm:col-span-2">
              <VehicleColorPicker
                name="register-vehicle-color"
                value={form.vehicle_color}
                invalid={!!errors.vehicle_color}
                onChange={(color) => {
                  setForm((f) => ({ ...f, vehicle_color: color }))
                  setErrors((prev) => ({ ...prev, vehicle_color: '' }))
                }}
              />
            </Field>
          </div>
        </section>
        <section>
          <h3 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">School ID verification</h3>
          <Field label="Upload School ID" htmlFor="school-id" error={errors.school_id} hint="Official DLL School ID. JPG, JPEG, or PNG, up to 5 MB.">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label htmlFor="school-id" className="hover:bg-accent flex h-28 flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed text-sm">
                <ImageUp className="text-muted-foreground size-5" />
                <span className="px-2 text-center">{schoolId ? schoolId.name : 'Choose an image'}</span>
              </label>
              <input id="school-id" type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" className="sr-only" onChange={pickSchoolId} aria-invalid={!!errors.school_id} />
              {preview && <img src={preview} alt="Preview of your School ID" className="h-28 rounded-md border object-contain sm:w-44" />}
            </div>
          </Field>
        </section>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} Create account
        </Button>
        <p className="text-muted-foreground text-center text-sm">
          Already registered?{' '}
          <Link to="/login" className="text-primary font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  )
}
