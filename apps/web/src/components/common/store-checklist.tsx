import type { Store } from '@flowtrade/shared'
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
  className,
}: {
  stores: Store[]
  value: string[]
  onChange: (ids: string[]) => void
  labelledBy: string
  invalid?: boolean
  className?: string
}) {
  const toggle = (id: string, on: boolean) => onChange(on ? [...value, id] : value.filter((x) => x !== id))
  return (
    <div role="group" aria-labelledby={labelledBy} className={cn('grid gap-0.5 rounded-lg border p-1.5 sm:grid-cols-2', invalid && 'border-danger', className)}>
      {stores.map((s) => {
        const checked = value.includes(s.id)
        return (
          <label key={s.id} className={cn('flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent/60', checked && 'bg-accent/40')}>
            <Checkbox checked={checked} onCheckedChange={(v) => toggle(s.id, v === true)} />
            <StoreLogo store={s} size="sm" />
            <span className="min-w-0 flex-1 truncate">{s.name}</span>
            {!s.isActive && <span className="shrink-0 text-xs text-muted-foreground">(ปิดใช้งาน)</span>}
          </label>
        )
      })}
    </div>
  )
}
