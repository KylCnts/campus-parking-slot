import { useState } from 'react'
import { Clock, Download, LogIn, LogOut, Printer, Timer, Car } from 'lucide-react'
import { ChartCard, EntriesExitsChart, shortDate } from '@/components/charts'
import { CategoryBadge, EmptyState, PageHeader, StatCard, StatusBadge } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/form-controls'
import { Progress, Skeleton } from '@/components/ui/misc'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useFetch } from '@/lib/hooks'
import type { Transaction } from '@/lib/types'
import { downloadCSV, fmtDate, fmtDateTime, fmtDuration, todayISO } from '@/lib/utils'

interface ReportData {
  period: string
  category: string | null
  start: string
  end: string
  generated_at: string
  totals: {
    entries: number
    exits: number
    unique_vehicles: number
    still_parked: number
    avg_duration_minutes: number
    peak_hour: string | null
    peak_hour_entries: number
  }
  per_day: { date: string; entries: number; exits: number }[]
  by_category: { category: string; label: string; spaces: number; entries: number; utilization_pct: number }[]
  by_area: { area: string; spaces: number; entries: number; utilization_pct: number }[]
  transactions: Transaction[]
}

const REPORTS = [
  { value: 'daily', label: 'Daily Parking Report', period: 'daily', category: '' },
  { value: 'weekly', label: 'Weekly Parking Report', period: 'weekly', category: '' },
  { value: 'monthly', label: 'Monthly Parking Report', period: 'monthly', category: '' },
  { value: 'student', label: 'Student Parking Utilization', period: 'monthly', category: 'STUDENT' },
  { value: 'faculty', label: 'Faculty Parking Utilization', period: 'monthly', category: 'FACULTY' },
]

export default function Reports() {
  const [type, setType] = useState('daily')
  const [date, setDate] = useState(todayISO())
  const preset = REPORTS.find((r) => r.value === type)!
  const [period, setPeriod] = useState(preset.period)
  const { data, loading } = useFetch<ReportData>('/reports/', { period, date, category: preset.category })

  const exportCSV = () => {
    if (!data) return
    downloadCSV(
      `${type}-report-${data.start}_to_${data.end}.csv`,
      data.transactions.map((t) => ({
        'Transaction ID': `TXN-${String(t.id).padStart(6, '0')}`,
        'Plate Number': t.plate_number,
        Owner: t.owner,
        Category: t.category_display,
        'Parking Space': t.slot_number,
        Area: t.area_name,
        'Entry Time': fmtDateTime(t.entry_time),
        'Exit Time': t.exit_time ? fmtDateTime(t.exit_time) : '',
        'Duration (min)': t.duration_minutes,
        Status: t.status,
      })),
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Generate parking activity and utilization reports."
        actions={
          <>
            <Button variant="outline" onClick={exportCSV} disabled={!data?.transactions.length}>
              <Download /> Export CSV
            </Button>
            <Button variant="outline" onClick={() => window.print()} disabled={!data}>
              <Printer /> Print / PDF
            </Button>
          </>
        }
      />

      <Card className="no-print py-4">
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="Report type">
            <Select
              value={type}
              onChange={(e) => {
                setType(e.target.value)
                setPeriod(REPORTS.find((r) => r.value === e.target.value)!.period)
              }}
            >
              {REPORTS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Period">
            <Select value={period} onChange={(e) => setPeriod(e.target.value)} disabled={!preset.category}>
              <option value="daily">Day</option>
              <option value="weekly">Week (Mon–Sun)</option>
              <option value="monthly">Month</option>
            </Select>
          </Field>
          <Field label="Reference date">
            <Input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value || todayISO())} />
          </Field>
        </CardContent>
      </Card>

      {!data || loading ? (
        <div className="space-y-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-72" />
        </div>
      ) : (
        <>
          <div className="border-b pb-3">
            <h2 className="text-lg font-semibold">{preset.label}</h2>
            <p className="text-muted-foreground text-sm">
              {data.start === data.end ? fmtDate(data.start + 'T00:00') : `${fmtDate(data.start + 'T00:00')} – ${fmtDate(data.end + 'T00:00')}`} · Generated {fmtDateTime(data.generated_at)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <StatCard label="Entries" value={data.totals.entries} icon={LogIn} />
            <StatCard label="Exits" value={data.totals.exits} icon={LogOut} />
            <StatCard label="Unique vehicles" value={data.totals.unique_vehicles} icon={Car} tone="muted" />
            <StatCard label="Avg. duration" value={fmtDuration(data.totals.avg_duration_minutes)} icon={Timer} tone="muted" />
            <StatCard label="Peak hour" value={data.totals.peak_hour ?? '—'} icon={Clock} tone="muted" sub={data.totals.peak_hour ? `${data.totals.peak_hour_entries} entries` : undefined} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Utilization by category</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {data.by_category.map((c) => (
                  <div key={c.category}>
                    <div className="mb-1.5 flex justify-between text-sm">
                      <span className="font-medium">{c.label}</span>
                      <span className="tabular-nums">
                        {c.utilization_pct}% <span className="text-muted-foreground">· {c.entries} entries · {c.spaces} spaces</span>
                      </span>
                    </div>
                    <Progress value={c.utilization_pct} />
                  </div>
                ))}
                <p className="text-muted-foreground text-xs">Utilization = occupied space-time ÷ total space-time available in the period.</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Utilization by area</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {data.by_area.map((a) => (
                  <div key={a.area}>
                    <div className="mb-1.5 flex justify-between text-sm">
                      <span className="font-medium">{a.area}</span>
                      <span className="tabular-nums">
                        {a.utilization_pct}% <span className="text-muted-foreground">· {a.entries} entries</span>
                      </span>
                    </div>
                    <Progress value={a.utilization_pct} />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {data.per_day.length > 1 && (
            <ChartCard title="Entries and exits per day">
              <EntriesExitsChart data={data.per_day} xKey="date" tickFormat={shortDate} />
            </ChartCard>
          )}

          <Card className="gap-0 py-0">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h3 className="font-semibold">Transactions ({data.transactions.length})</h3>
            </div>
            {data.transactions.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Txn ID</TableHead>
                    <TableHead>Plate</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Space</TableHead>
                    <TableHead>Entry</TableHead>
                    <TableHead>Exit</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.transactions.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono text-xs">TXN-{String(t.id).padStart(6, '0')}</TableCell>
                      <TableCell className="font-mono font-semibold">{t.plate_number}</TableCell>
                      <TableCell>{t.owner}</TableCell>
                      <TableCell>
                        <CategoryBadge category={t.category} />
                      </TableCell>
                      <TableCell>{t.slot_number}</TableCell>
                      <TableCell className="text-xs">{fmtDateTime(t.entry_time)}</TableCell>
                      <TableCell className="text-xs">{fmtDateTime(t.exit_time)}</TableCell>
                      <TableCell>{fmtDuration(t.duration_minutes)}</TableCell>
                      <TableCell>
                        <StatusBadge status={t.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState title="No transactions in this period" />
            )}
          </Card>
        </>
      )}
    </div>
  )
}
