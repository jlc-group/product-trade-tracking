import { CheckIcon } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A whole-card toggle. `mode="radio"` shows a round marker (single choice),
 * `mode="checkbox"` a square one (multi choice). One tab stop per card; Space/Enter toggles.
 */
export function ChoiceCard({
  selected,
  onSelect,
  mode,
  children,
  className,
  style,
  disabled,
  hideMarker,
  ariaLabel,
}: {
  selected: boolean
  onSelect: () => void
  mode: 'radio' | 'checkbox'
  children: ReactNode
  className?: string
  style?: CSSProperties
  disabled?: boolean
  hideMarker?: boolean
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      role={mode}
      aria-checked={selected}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onSelect}
      style={style}
      className={cn(
        'group/choice relative flex w-full min-w-0 items-start gap-3 rounded-xl border bg-card p-4 text-left transition outline-none',
        'hover:border-primary/40 hover:bg-accent/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
        'disabled:cursor-not-allowed disabled:opacity-60',
        selected && 'border-primary bg-brand-soft/60 ring-1 ring-primary hover:border-primary hover:bg-brand-soft/60',
        className,
      )}
    >
      {!hideMarker && <ChoiceMarker selected={selected} mode={mode} className="mt-0.5" />}
      {children}
    </button>
  )
}

export function ChoiceMarker({ selected, mode, className }: { selected: boolean; mode: 'radio' | 'checkbox'; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-[18px] shrink-0 items-center justify-center border transition-colors',
        mode === 'radio' ? 'rounded-full' : 'rounded-[5px]',
        selected ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background group-hover/choice:border-primary/50',
        className,
      )}
    >
      {selected && (mode === 'radio' ? <span className="size-2 rounded-full bg-primary-foreground" /> : <CheckIcon className="size-3.5" strokeWidth={3} />)}
    </span>
  )
}

/** Inline callout used for hints and warnings inside steps. */
export function Callout({
  tone = 'info',
  icon,
  title,
  children,
  className,
}: {
  tone?: 'info' | 'warning' | 'success' | 'brand'
  icon?: ReactNode
  title?: ReactNode
  children?: ReactNode
  className?: string
}) {
  const tones = {
    info: 'bg-info-soft text-info border-info/20',
    warning: 'bg-warning-soft text-warning-foreground border-warning/40',
    success: 'bg-success-soft text-success border-success/25',
    brand: 'bg-brand-soft text-brand border-brand/20',
  }
  return (
    <div role={tone === 'warning' ? 'alert' : 'note'} className={cn('flex gap-3 rounded-xl border px-4 py-3 text-sm', tones[tone], className)}>
      {icon && <span className="mt-0.5 shrink-0 [&_svg]:size-4">{icon}</span>}
      <div className="min-w-0 space-y-0.5">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn(title && 'opacity-90')}>{children}</div>}
      </div>
    </div>
  )
}
