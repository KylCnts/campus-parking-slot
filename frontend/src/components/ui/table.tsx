import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * `stack` turns each row into a labelled card on phones (below 768px) instead of a wide scrolling table.
 * Give each cell a `label` so the value keeps its column name in the stacked layout.
 */
export function Table({ className, stack, ...props }: React.ComponentProps<'table'> & { stack?: boolean }) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table className={cn('w-full caption-bottom text-sm', stack && 'table-stack', className)} {...props} />
    </div>
  )
}
export function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return <thead className={cn('[&_tr]:border-b bg-muted/40', className)} {...props} />
}
export function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />
}
export function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return <tr className={cn('hover:bg-muted/40 border-b transition-colors', className)} {...props} />
}
export function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      className={cn('text-muted-foreground h-10 px-3 text-left align-middle text-xs font-semibold tracking-wide whitespace-nowrap uppercase', className)}
      {...props}
    />
  )
}
export function TableCell({ className, label, ...props }: React.ComponentProps<'td'> & { label?: string }) {
  return <td data-label={label ?? ''} className={cn('px-3 py-2.5 align-middle whitespace-nowrap', className)} {...props} />
}
