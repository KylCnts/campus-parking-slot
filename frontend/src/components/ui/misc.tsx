import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '@/lib/utils'

// eslint-disable-next-line react-refresh/only-export-components
export const badgeVariants = cva(
  'inline-flex items-center justify-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'text-foreground',
        available: 'border-transparent bg-available/15 text-available',
        occupied: 'border-transparent bg-occupied/15 text-occupied',
        reserved: 'border-transparent bg-reserved/20 text-[oklch(0.5_0.12_70)] dark:text-reserved',
        inactive: 'border-transparent bg-inactive/15 text-inactive',
        event: 'border-transparent bg-event/15 text-event',
        destructive: 'border-transparent bg-destructive/15 text-destructive',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export function Badge({ className, variant, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('bg-muted animate-pulse rounded-md', className)} {...props} />
}

export function Separator({ className }: { className?: string }) {
  return <div className={cn('bg-border h-px w-full', className)} />
}

export function Progress({ value, className, barClassName }: { value: number; className?: string; barClassName?: string }) {
  return (
    <div className={cn('bg-muted relative h-2 w-full overflow-hidden rounded-full', className)}>
      <div className={cn('bg-primary h-full transition-all duration-500', barClassName)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  )
}

export const Tabs = TabsPrimitive.Root

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn('bg-muted text-muted-foreground tabs-scroll inline-flex h-9 w-fit items-center justify-start rounded-lg p-[3px]', className)} {...props} />
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'data-[state=active]:bg-card data-[state=active]:text-foreground focus-visible:ring-ring/50 inline-flex h-full flex-1 shrink-0 cursor-pointer items-center outline-none focus-visible:ring-[3px] justify-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap transition-all data-[state=active]:shadow-sm [&_svg]:size-4',
        className,
      )}
      {...props}
    />
  )
}

export function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('flex-1 outline-none', className)} {...props} />
}
