import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { ChevronRight, ImageUp, Loader2, MessageSquareWarning, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { EmptyState, PageHeader, Pagination, StatusBadge } from '@/components/shared'
import { ReportBody, ReportProgress } from '@/components/user-reports'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/form-controls'
import { Skeleton, Tabs, TabsList, TabsTrigger } from '@/components/ui/misc'
import { api } from '@/lib/api'
import { useFetch, useMeta } from '@/lib/hooks'
import type { Paginated, UserReport, UserReportSummary } from '@/lib/types'
import { apiError, fieldErrors, fmtDate } from '@/lib/utils'

const MAX_IMAGE = 5 * 1024 * 1024
const empty = { category: '', title: '', description: '' }

function NewReportDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const meta = useMeta()
  const [form, setForm] = useState(empty)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!file) return setPreview('')
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const set = (k: keyof typeof empty) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    setErrors((p) => ({ ...p, [k]: '' }))
  }

  const pickFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    let problem = ''
    if (f && (!/\.(jpe?g|png)$/i.test(f.name) || !['image/jpeg', 'image/png'].includes(f.type))) problem = 'Attach a JPG, JPEG, or PNG image.'
    else if (f && f.size > MAX_IMAGE) problem = 'The image must be 5 MB or smaller.'
    setErrors((p) => ({ ...p, attachment: problem }))
    if (problem) {
      e.target.value = ''
      setFile(null)
    } else setFile(f)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!form.category) errs.category = 'Choose a category.'
    if (form.title.trim().length < 5) errs.title = 'Enter a short title of at least 5 characters.'
    if (form.description.trim().length < 10) errs.description = 'Describe the concern in at least 10 characters.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      const body = new FormData()
      Object.entries(form).forEach(([k, v]) => body.append(k, v))
      if (file) body.append('attachment', file)
      await api.post('/user-reports/', body, { timeout: 60000 })
      toast.success('Report submitted. You can follow its status here.')
      onCreated()
    } catch (err) {
      setErrors(fieldErrors(err))
      toast.error(apiError(err, 'The report could not be submitted.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Send a report or concern</DialogTitle>
          <DialogDescription>The administrator reviews every report. You will be notified when its status changes.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <Field label="Category" htmlFor="report-category" error={errors.category}>
            <Select id="report-category" value={form.category} onChange={set('category')} aria-invalid={!!errors.category}>
              <option value="" disabled>
                Choose a category
              </option>
              {meta?.user_report_categories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Title" htmlFor="report-title" error={errors.title}>
            <Input id="report-title" value={form.title} onChange={set('title')} maxLength={150} placeholder="e.g. Car parked in a motorcycle slot" aria-invalid={!!errors.title} />
          </Field>
          <Field label="Description" htmlFor="report-description" error={errors.description} hint="Include the slot, time, and plate number if they apply.">
            <Textarea id="report-description" rows={5} value={form.description} onChange={set('description')} maxLength={3000} aria-invalid={!!errors.description} />
          </Field>
          <Field label="Photo (optional)" htmlFor="report-attachment" error={errors.attachment} hint="JPG, JPEG, or PNG, up to 5 MB.">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label htmlFor="report-attachment" className="hover:bg-accent has-[:focus-visible]:ring-ring/50 flex min-h-20 flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed px-2 text-center text-sm has-[:focus-visible]:ring-[3px]">
                <ImageUp className="text-muted-foreground size-5" />
                <span className="break-all">{file ? file.name : 'Choose an image'}</span>
                <input id="report-attachment" type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" className="sr-only" onChange={pickFile} />
              </label>
              {preview && (
                <div className="relative">
                  <img src={preview} alt="Preview of the attached photo" className="h-20 rounded-md border object-contain sm:w-32" />
                  <button type="button" onClick={() => setFile(null)} className="bg-card absolute -top-2 -right-2 flex size-6 cursor-pointer items-center justify-center rounded-full border shadow" aria-label="Remove photo">
                    <X className="size-3.5" />
                  </button>
                </div>
              )}
            </div>
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} Submit report
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const FILTERS = [
  { value: '', label: 'All', count: (s: UserReportSummary) => s.total },
  { value: 'open', label: 'Open', count: (s: UserReportSummary) => s.pending + s.ongoing },
  { value: 'closed', label: 'Closed', count: (s: UserReportSummary) => s.closed },
]
const PAGE_SIZE = 10

export default function MyReports() {
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState('')
  const [creating, setCreating] = useState(false)
  const [viewing, setViewing] = useState<UserReport | null>(null)
  const list = useFetch<Paginated<UserReport>>('/user-reports/', { page, page_size: PAGE_SIZE, ordering: '-created_at', state: filter })
  const summary = useFetch<UserReportSummary>('/user-reports/summary/')
  const refresh = () => {
    list.reload()
    summary.reload()
  }
  const rows = list.data?.results ?? []

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="My Reports"
        description="Send concerns to the administrator and follow their status and response."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> New report
          </Button>
        }
      />
      <Tabs value={filter} onValueChange={(v) => { setFilter(v); setPage(1) }} className="mb-4">
        <TabsList aria-label="Filter reports">
          {FILTERS.map((f) => (
            <TabsTrigger key={f.value || 'all'} value={f.value}>
              {f.label}
              {summary.data && <span className="text-muted-foreground tabular-nums">{f.count(summary.data)}</span>}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {!list.data ? (
        <div className="space-y-3">
          {[0, 1].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : !rows.length ? (
        <Card>
          <EmptyState
            icon={MessageSquareWarning}
            title={filter ? 'No reports here' : 'No reports yet'}
            description={filter ? undefined : 'Use “New report” to tell the administrator about a parking concern.'}
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setViewing(r)}
                className="bg-card hover:bg-accent/50 focus-visible:ring-ring/50 w-full cursor-pointer rounded-xl border p-4 text-left shadow-sm transition-colors outline-none focus-visible:ring-[3px]"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-muted-foreground text-xs">
                      <span className="font-mono">{r.reference}</span> · {r.category_display} · {fmtDate(r.created_at)}
                    </p>
                    <p className="mt-0.5 font-medium break-words">{r.title}</p>
                  </div>
                  <span className="flex items-center gap-1">
                    <StatusBadge status={r.status} />
                    <ChevronRight className="text-muted-foreground size-4" />
                  </span>
                </div>
                <div className="mt-3">
                  <ReportProgress status={r.status} />
                </div>
                {r.admin_response && (
                  <p className="bg-muted/50 mt-3 line-clamp-2 rounded-md px-3 py-2 text-sm">
                    <span className="font-medium">Response: </span>
                    {r.admin_response}
                  </p>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {(list.data?.count ?? 0) > PAGE_SIZE && (
        <div className="mt-4">
          <Pagination page={page} count={list.data?.count ?? 0} pageSize={PAGE_SIZE} onPage={setPage} />
        </div>
      )}

      {/* Mounted only while open, so every new report starts with an empty form. */}
      {creating && (
        <NewReportDialog
          open
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false)
            refresh()
          }}
        />
      )}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-xl">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle className="break-words">{viewing.title}</DialogTitle>
                <DialogDescription>
                  <span className="font-mono">{viewing.reference}</span> · {viewing.category_display}
                </DialogDescription>
              </DialogHeader>
              <ReportProgress status={viewing.status} />
              <ReportBody report={viewing} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
