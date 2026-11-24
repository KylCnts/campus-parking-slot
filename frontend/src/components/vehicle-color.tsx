import { Check } from 'lucide-react'
import { useMeta } from '@/lib/hooks'
import type { ColorOption } from '@/lib/types'
import { cn } from '@/lib/utils'

function findColor(colors: ColorOption[] | undefined, name: string) {
  const wanted = name.trim().toLowerCase()
  return colors?.find((c) => c.value.toLowerCase() === wanted)
}

/** Small round color sample. Unknown (older free-text) colors get a neutral dashed outline. */
export function ColorSwatch({ swatch, className }: { swatch?: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-3.5 shrink-0 rounded-full border border-black/15 dark:border-white/25', !swatch && 'border-dashed', className)}
      style={swatch ? { background: swatch } : undefined}
    />
  )
}

/** A vehicle color shown as a swatch with its name, wherever vehicles are listed. */
export function VehicleColor({ color, className }: { color?: string | null; className?: string }) {
  const meta = useMeta()
  if (!color) return <span className={cn('text-muted-foreground', className)}>—</span>
  const match = findColor(meta?.vehicle_colors, color)
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <ColorSwatch swatch={match?.swatch} />
      <span>{match?.label ?? color}</span>
    </span>
  )
}

/**
 * Pick a vehicle color from the official list. Only listed colors can be chosen, so no free text is sent.
 * Built from native radio buttons, so it works with the keyboard (arrow keys) and screen readers.
 */
export function VehicleColorPicker({
  value,
  onChange,
  name = 'vehicle-color',
  invalid,
  describedBy,
}: {
  value: string
  onChange: (color: string) => void
  name?: string
  invalid?: boolean
  describedBy?: string
}) {
  const meta = useMeta()
  const colors = meta?.vehicle_colors
  if (!colors) return <div className="bg-muted h-24 animate-pulse rounded-md" aria-hidden />
  const selected = findColor(colors, value)
  return (
    <div
      role="radiogroup"
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      className={cn('grid grid-cols-2 gap-1.5 min-[420px]:grid-cols-3 sm:grid-cols-4', invalid && 'ring-destructive/30 rounded-md ring-2')}
    >
      {value && !selected && (
        <p className="text-muted-foreground col-span-full text-xs">
          Current color “{value}” is not on the list. Choose one of the colors below to change it.
        </p>
      )}
      {colors.map((c) => {
        const checked = selected?.value === c.value
        return (
          <label
            key={c.value}
            className={cn(
              'has-[:focus-visible]:ring-ring/50 flex min-h-9 cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-sm transition-colors has-[:focus-visible]:ring-[3px]',
              checked ? 'border-primary bg-primary/10 font-medium' : 'hover:bg-accent',
            )}
          >
            <input type="radio" name={name} value={c.value} checked={checked} onChange={() => onChange(c.value)} className="sr-only" />
            <ColorSwatch swatch={c.swatch} className="size-4" />
            <span className="min-w-0 flex-1 truncate">{c.label}</span>
            {checked && <Check className="text-primary size-3.5 shrink-0" />}
          </label>
        )
      })}
    </div>
  )
}
