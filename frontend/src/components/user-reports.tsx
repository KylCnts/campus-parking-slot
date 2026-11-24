import { useEffect, useState } from 'react'
import { ImageOff, Loader2, Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import type { UserReport, UserReportStatus } from '@/lib/types'
import { cn, fmtDateTime } from '@/lib/utils'

export const REPORT_STATUSES: { value: UserReportStatus; label: string; hint: string }[] = [
  { value: 'SUBMITTED', label: 'Submitted', hint: 'Waiting for the administrator to look at it.' },
  { value: 'UNDER_REVIEW', label: 'Under Review', hint: 'The administrator is reviewing the report.' },
  { value: 'IN_PROGRESS', label: 'In Progress', hint: 'Action is being taken.' },
  { value: 'RESOLVED', label: 'Resolved', hint: 'The concern has been addressed.' },
  { value: 'REJECTED', label: 'Rejected', hint: 'The report was closed without action. See the response.' },
]

const FLOW: UserReportStatus[] = ['SUBMITTED', 'UNDER_REVIEW', 'IN_PROGRESS', 'RESOLVED']

/** Where the report stands: Submitted → Under Review → In Progress → Resolved (or Rejected). */
export function ReportProgress({ status }: { status: UserReportStatus }) {
  const rejected = status === 'REJECTED'
  const reached = rejected ? 0 : FLOW.indexOf(status)
  const steps = rejected ? (['SUBMITTED', 'REJECTED'] as UserReportStatus[]) : FLOW
  return (
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs" aria-label="Report progress">
      {steps.map((s, i) => {
        const done = rejected ? true : i <= reached
        const label = REPORT_STATUSES.find((x) => x.value === s)!.label
        return (
          <li key={s} className="flex items-center gap-1.5" aria-current={s === status ? 'step' : undefined}>
            {i > 0 && <span aria-hidden className={cn('h-px w-3 sm:w-5', done ? 'bg-primary' : 'bg-border')} />}
            <span
              className={cn(
                'rounded-full px-2 py-0.5 font-medium',
                s === status ? (rejected ? 'bg-occupied/15 text-occupied' : 'bg-primary text-primary-foreground') : done ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
              )}
            >
              {label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** The attached photo, loaded through the authenticated API (it is never publicly reachable). */
export function ReportAttachment({ report }: { report: UserReport }) {
  const [show, setShow] = useState(false)
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    if (!show) return
    let objectUrl = ''
    let cancelled = false
    api
      .get(`/user-reports/${report.id}/attachment/`, { responseType: 'blob' })
      .then((r) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(r.data)
        setUrl(objectUrl)
      })
      .catch(() => setError('The attachment could not be loaded.'))
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [show, report.id])

  if (!report.has_attachment) return null
  if (!show) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setShow(true)}>
        <Paperclip /> View attached photo
      </Button>
    )
  }
  if (error) {
    return (
      <p role="alert" className="text-destructive flex items-center gap-1.5 text-sm">
        <ImageOff className="size-4" /> {error}
      </p>
    )
  }
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className="block">
      <img src={url} alt={`Photo attached to ${report.reference}`} className="max-h-80 w-full rounded-md border object-contain" />
    </a>
  ) : (
    <Loader2 className="text-muted-foreground size-5 animate-spin" />
  )
}

/** Report text, the administrator's response and the key dates. Shared by the user and admin views. */
export function ReportBody({ report }: { report: UserReport }) {
  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="text-muted-foreground mb-1 text-xs font-semibold tracking-wider uppercase">Description</p>
        <p className="break-words whitespace-pre-wrap">{report.description}</p>
      </div>
      <ReportAttachment report={report} />
      <div className="bg-muted/50 rounded-md p-3">
        <p className="text-muted-foreground mb-1 text-xs font-semibold tracking-wider uppercase">Administrator response</p>
        {report.admin_response ? (
          <>
            <p className="break-words whitespace-pre-wrap">{report.admin_response}</p>
            <p className="text-muted-foreground mt-2 text-xs">
              {report.handled_by_name || 'Administrator'} · {fmtDateTime(report.responded_at)}
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">No response yet.</p>
        )}
      </div>
      <dl className="text-muted-foreground grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        <dt>Submitted</dt>
        <dd className="text-right">{fmtDateTime(report.created_at)}</dd>
        <dt>Last updated</dt>
        <dd className="text-right">{fmtDateTime(report.updated_at)}</dd>
        {report.resolved_at && (
          <>
            <dt>Closed</dt>
            <dd className="text-right">{fmtDateTime(report.resolved_at)}</dd>
          </>
        )}
      </dl>
    </div>
  )
}
