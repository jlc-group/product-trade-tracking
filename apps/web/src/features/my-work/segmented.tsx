import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

export interface SegmentOption<T extends string> {
  value: T
  label: ReactNode
  icon?: LucideIcon
  /** Small count shown after the label (hidden when 0 / undefined). */
  count?: number
  countTone?: 'danger' | 'default'
}

/** Single-choice segmented control (radio semantics) built on ToggleGroup. Never deselects. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  disabled,
  className,
}: {
  value: T
  onChange: (value: T) => void
  options: SegmentOption<T>[]
  /** Accessible name of the group. */
  label: string
  disabled?: boolean
  className?: string
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => {
        const next = options.find((o) => o.value === v)
        if (next) onChange(next.value)
      }}
      aria-label={label}
      disabled={disabled}
      spacing={0.5}
      size="sm"
      className={cn('rounded-lg bg-muted p-0.5', disabled && 'opacity-60', className)}
    >
      {options.map((o) => (
        <ToggleGroupItem
          key={o.value}
          value={o.value}
          className="h-7 flex-1 gap-1.5 px-2.5 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm sm:flex-none sm:text-[0.8rem]"
        >
          {o.icon && <o.icon className="size-3.5" />}
          {o.label}
          {!!o.count && (
            <span
              className={cn(
                'tabular rounded-full px-1.5 text-[10px] leading-4 font-semibold',
                o.countTone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-background text-muted-foreground',
              )}
            >
              {o.count}
            </span>
          )}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
