import type { ReactNode } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const axis = { stroke: 'var(--muted-foreground)', fontSize: 11, tickLine: false, axisLine: false } as const
const grid = <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
const tooltipStyle = {
  contentStyle: {
    background: 'var(--popover)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    fontSize: 12,
    color: 'var(--popover-foreground)',
    boxShadow: '0 4px 12px rgb(0 0 0 / 0.08)',
  },
  labelStyle: { color: 'var(--foreground)', fontWeight: 600, marginBottom: 4 },
  itemStyle: { color: 'var(--foreground)', padding: 0 },
  cursor: { fill: 'var(--muted)', opacity: 0.6 },
}
const legend = <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: 'var(--muted-foreground)', paddingTop: 8 }} />

export function ChartCard({ title, description, children, action, className }: { title: string; description?: string; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div className="space-y-1">
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

/** Entries vs exits per period - grouped thin bars, two categorical series. */
export function EntriesExitsChart({ data, xKey, height = 260, tickFormat }: { data: Record<string, unknown>[]; xKey: string; height?: number; tickFormat?: (v: string) => string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} barGap={2} barCategoryGap="25%" margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
        {grid}
        <XAxis dataKey={xKey} {...axis} tickFormatter={tickFormat} interval="preserveStartEnd" minTickGap={8} />
        <YAxis {...axis} allowDecimals={false} />
        <Tooltip {...tooltipStyle} labelFormatter={(l) => (tickFormat ? tickFormat(String(l)) : l)} />
        {legend}
        <Bar dataKey="entries" name="Entries" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={22} />
        <Bar dataKey="exits" name="Exits" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Trend line (area) for entries/exits over time. */
export function TrendChart({ data, xKey, height = 260 }: { data: Record<string, unknown>[]; xKey: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        {grid}
        <XAxis dataKey={xKey} {...axis} interval="preserveStartEnd" minTickGap={12} />
        <YAxis {...axis} allowDecimals={false} />
        <Tooltip {...tooltipStyle} cursor={{ stroke: 'var(--muted-foreground)', strokeDasharray: '3 3' }} />
        {legend}
        <Area type="monotone" dataKey="entries" name="Entries" stroke="var(--series-1)" strokeWidth={2} fill="var(--series-1)" fillOpacity={0.12} dot={false} activeDot={{ r: 4 }} />
        <Area type="monotone" dataKey="exits" name="Exits" stroke="var(--series-2)" strokeWidth={2} fill="var(--series-2)" fillOpacity={0.08} dot={false} activeDot={{ r: 4 }} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/** Horizontal stacked bars of space status per group (status colors = state, not series). */
export function OccupancyBars({ data, height }: { data: { name: string; occupied: number; available: number; other?: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height ?? Math.max(120, data.length * 44 + 40)}>
      <BarChart data={data} layout="vertical" barCategoryGap="30%" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid stroke="var(--chart-grid)" horizontal={false} />
        <XAxis type="number" {...axis} allowDecimals={false} />
        <YAxis type="category" dataKey="name" {...axis} width={120} />
        <Tooltip {...tooltipStyle} />
        {legend}
        <Bar dataKey="occupied" name="Occupied" stackId="a" fill="var(--occupied)" stroke="var(--card)" strokeWidth={2} radius={[4, 0, 0, 4]} />
        <Bar dataKey="available" name="Available" stackId="a" fill="var(--available)" stroke="var(--card)" strokeWidth={2} />
        <Bar dataKey="other" name="Reserved for Event" stackId="a" fill="var(--inactive)" stroke="var(--card)" strokeWidth={2} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Single-series bars (e.g. entries per hour). */
export function SingleBarChart({ data, xKey, yKey, name, height = 220 }: { data: Record<string, unknown>[]; xKey: string; yKey: string; name: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
        {grid}
        <XAxis dataKey={xKey} {...axis} interval="preserveStartEnd" minTickGap={6} />
        <YAxis {...axis} allowDecimals={false} />
        <Tooltip {...tooltipStyle} />
        <Bar dataKey={yKey} name={name} fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function shortDate(v: string) {
  const d = new Date(v + 'T00:00:00')
  return isNaN(d.getTime()) ? v : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
