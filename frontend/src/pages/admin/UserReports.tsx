import { useState, type FormEvent } from 'react'
import { CheckCircle2, Clock, Inbox, Loader2, MessageSquareWarning, Search, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { EmptyState, LoadingRow, PageHeader, Pagination, SearchInput, StatusBadge } from '@/components/shared'
import { REPORT_STATUSES, ReportBody, ReportProgress } from '@/components/user-reports'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, Select, Textarea } from '@/components/ui/form-controls'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/misc'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useLiveRefresh } from '@/context/RealtimeContext'
import { api } from '@/lib/api'
import { useDebounced, useFetch, useMeta } from '@/lib/hooks'
import type { Paginated, UserReport, UserReportStatus, UserReportSummary } from '@/lib/types'
import { apiError, cn, fieldErrors, fmtDateTime } from '@/lib/utils'

const TRACKING = [
  { key: 'pending', label: 'Pending', hint: 'Submitted, not yet reviewed', icon: Inbox, tone: 'text-occupied bg-occupied/10' },
  { key: 'ongoing', label: 'Ongoing', hint: 'Under review or in progress', icon: Clock, tone: 'text-[oklch(0.55_0.13_70)] bg-reserved/20' },
  { key: 'resolved', label: 'Resolved', hint: 'Concern addressed', icon: CheckCircle2, tone: 'text-available bg-available/10' },
  { key: 'rejected', label: 'Rejected', hint: 'Closed without action', icon: XCircle, tone: 'text-muted-foreground bg-muted' },
] as const

function ReviewDialog({ report, onClose, onSaved }: { report: UserReport; onClose: () => void; onSaved: (r: UserReport) => void }) {
  const [status, setStatus] = useState<UserReportStatus>(report.status)
  const [response, setResponse] = useState(report.admin_response)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const closing = status === 'RESOLVED' || status === 'REJECTED'
  const unchanged = status === report.status && response.trim() === report.admin_response.trim()
  const d = report.reporter_details

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (closing && response.trim().length < 5) return setErrors({ admin_response: 'Enter a response or resolution note before closing the report.' })
    setBusy(true)
    try {
      const { data } = await api.patch<UserReport>(`/user-reports/${report.id}/`, { status, admin_response: response })
      toast.success(`${report.reference} saved. The user has been notified.`)
      onSaved(data)
    } catch (err) {
      setErrors(fieldErrors(err))
      toast.error(apiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="break-words">{report.title}</DialogTitle>
          <DialogDescription>
            <span className="font-mono">{report.reference}</span> · {report.category_display}
          </DialogDescription>
        </DialogHeader>
        <ReportProgress status={report.status} />

        <section aria-label="Reported by" className="rounded-md border p-3 text-sm">
          <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">Reported by</p>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
            <dt className="text-muted-foreground">Name</dt>
            <dd className="font-medium break-words">{report.reporter_name}</dd>
            <dt className="text-muted-foreground">Email</dt>
            <dd className="break-all">{report.reporter_email}</dd>
            {d ? (
              <>
                <dt className="text-muted-foreground">Account</dt>
                <dd>
                  {d.role_display} · {d.account_status.toLowerCase()}
                </dd>
                <dt className="text-muted-foreground">ID number</dt>
                <dd>{d.id_number ?? '—'}</dd>
                <dt className="text-muted-foreground">Department</dt>
                <dd className="break-words">{d.department || '—'}</dd>
                <dt className="text-muted-foreground">Contact</dt>
                <dd>{d.contact_number || '—'}</dd>
                <dt className="text-muted-foreground">Plate number</dt>
                <dd className="font-mono">{d.plate_number ?? '—'}</dd>
              </>
            ) : (
              <>
                <dt className="text-muted-foreground">Account</dt>
                <dd className="text-muted-foreground">The account no longer exists.</dd>
              </>
            )}
          </dl>
        </section>

        <ReportBody report={report} />

        <form onSubmit={save} className="grid gap-4 border-t pt-4" noValidate>
          <Field label="Status" htmlFor="review-status" hint={REPORT_STATUSES.find((s) => s.value === status)?.hint}>
            <Select id="review-status" value={status} onChange={(e) => { setStatus(e.target.value as UserReportStatus); setErrors({}) }}>
              {REPORT_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={closing ? 'Response / resolution note' : 'Response to the user (optional)'}
            htmlFor="review-response"
            error={errors.admin_response}
            hint="The user sees this response in My Reports."
          >
            <Textarea id="review-response" rows={4} maxLength={3000} value={response} onChange={(e) => { setResponse(e.target.value); setErrors({}) }} aria-invalid={!!errors.admin_response} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button type="submit" disabled={busy || unchanged}>
              {busy && <Loader2 className="animate-spin" />} Save and notify user
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function UserReports() {
  const meta = useMeta()
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')
  const q = useDebounced(search)
  const list = useFetch<Paginated<UserReport>>('/user-reports/', { page, status, category, search: q, page_size: 15 })
  const summary = useFetch<UserReportSummary>('/user-reports/summary/')
  const [reviewing, setReviewing] = useState<UserReport | null>(null)
  const refresh = () => {
    list.reload()
    summary.reload()
  }
  // New reports arrive as notifications; the first page also refreshes with every live update.
  useLiveRefresh(() => page === 1 && refresh())
  const filterBy = (apply: () => void) => {
    apply()
    setPage(1)
  }

  const s = summary.data
  return (
    <div>
      <PageHeader title="User Reports" description="Reports and concerns sent by student assistants and faculty members." />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {TRACKING.map((t) => (
          <Card key={t.key} className="gap-0 py-3">
            <div className="flex items-center gap-3 px-3 sm:px-4">
              <div className={cn('shrink-0 rounded-lg p-2', t.tone)}>
                <t.icon className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{t.label}</p>
                <p className="text-2xl font-semibold tabular-nums">{s ? s[t.key] : '—'}</p>
                <p className="text-muted-foreground hidden text-xs sm:block">{t.hint}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Tabs value={status} onValueChange={(v) => filterBy(() => setStatus(v))} className="mb-4">
        <TabsList aria-label="Filter by status" className="w-full sm:w-fit">
          <TabsTrigger value="">
            All {s && <span className="text-muted-foreground tabular-nums">{s.total}</span>}
          </TabsTrigger>
          {REPORT_STATUSES.map((st) => (
            <TabsTrigger key={st.value} value={st.value}>
              {st.label} {s && <span className="text-muted-foreground tabular-nums">{s[st.value.toLowerCase() as keyof UserReportSummary]}</span>}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card className="gap-0 py-0">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:flex-wrap">
          <SearchInput value={search} onChange={(v) => filterBy(() => setSearch(v))} placeholder="Search title, description, sender…" />
          <Select value={category} onChange={(e) => filterBy(() => setCategory(e.target.value))} className="sm:w-56" aria-label="Category">
            <option value="">All categories</option>
            {meta?.user_report_categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
        <Table stack>
          <TableHeader>
            <TableRow>
              <TableHead>Report</TableHead>
              <TableHead>Reported by</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Last update</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.loading && !list.data ? (
              <LoadingRow cols={7} />
            ) : (
              list.data?.results.map((r) => (
                <TableRow key={r.id}>
                  <TableCell label="Report" className="max-w-72 whitespace-normal">
                    <div>
                      <p className="text-muted-foreground font-mono text-xs">{r.reference}</p>
                      <p className="font-medium break-words">{r.title}</p>
                    </div>
                  </TableCell>
                  <TableCell label="Reported by">
                    <div>
                      <p>{r.reporter_name}</p>
                      <p className="text-muted-foreground text-xs">{r.reporter_details?.role_display ?? r.reporter_email}</p>
                    </div>
                  </TableCell>
                  <TableCell label="Category" className="text-xs">{r.category_display}</TableCell>
                  <TableCell label="Status"><StatusBadge status={r.status} /></TableCell>
                  <TableCell label="Submitted" className="text-muted-foreground text-xs">{fmtDateTime(r.created_at)}</TableCell>
                  <TableCell label="Last update" className="text-muted-foreground text-xs">{fmtDateTime(r.updated_at)}</TableCell>
                  <TableCell className="text-right max-md:border-t max-md:pt-2">
                    <Button size="sm" variant="outline" className="max-md:w-full" onClick={() => setReviewing(r)}>
                      <Search /> Review
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {list.data && !list.data.results.length && <EmptyState icon={MessageSquareWarning} title="No reports found" />}
        <div className="pb-4">
          <Pagination page={page} count={list.data?.count ?? 0} pageSize={15} onPage={setPage} />
        </div>
      </Card>

      {reviewing && (
        <ReviewDialog
          report={reviewing}
          onClose={() => setReviewing(null)}
          onSaved={(r) => {
            setReviewing(r)
            refresh()
          }}
        />
      )}
    </div>
  )
}
