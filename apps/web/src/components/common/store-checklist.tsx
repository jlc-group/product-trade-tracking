import type { Store } from '@flowtrade/shared'
import type { ReactNode } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { StoreLogo } from './badges'

/** Tick the stores of one proposal (several allowed). */
export function StoreChecklist({
  stores,
  value,
  onChange,
  labelledBy,
  invalid = false,
  disabledIds,
  hint,
  className,
}: {
  stores: Store[]
  value: string[]
  onChange: (ids: string[]) => void
  labelledBy: string
  invalid?: boolean
  /** Rows shown but not tickable (e.g. stores already in a presentation package). */
  disabledIds?: string[]
  /** Small muted line under a store's name. */
  hint?: (store: Store) => ReactNode
  className?: string
}) {
  const isDisabled = (id: string) => !!disabledIds?.includes(id)
  const toggle = (id: string, on: boolean) => {
    if (isDisabled(id)) return
    onChange(on ? [...value, id] : value.filter((x) => x !== id))
  }
  return (
    <div role="group" aria-labelledby={labelledBy} className={cn('grid gap-0.5 rounded-lg border p-1.5 sm:grid-cols-2', invalid && 'border-danger', className)}>
      {stores.map((s) => {
        const disabled = isDisabled(s.id)
        const checked = !disabled && value.includes(s.id)
        const note = hint?.(s)
        return (
          <label
            key={s.id}
            className={cn(
              'flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent/60',
              checked && 'bg-accent/40',
              disabled && 'cursor-not-allowed opacity-60 hover:bg-transparent',
            )}
          >
            <Checkbox checked={checked} disabled={disabled} onCheckedChange={(v) => toggle(s.id, v === true)} />
            <StoreLogo store={s} size="sm" />
            {note ? (
              <span className="min-w-0 flex-1">
                <span className="block truncate">{s.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{note}</span>
              </span>
            ) : (
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
            )}
            {!s.isActive && <span className="shrink-0 text-xs text-muted-foreground">(ปิดใช้งาน)</span>}
          </label>
        )
      })}
    </div>
  )
}
