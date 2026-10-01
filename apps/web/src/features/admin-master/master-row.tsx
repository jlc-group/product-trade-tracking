import type { ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { ActiveSwitch, DeleteButton, EditButton, InactiveBadge, UsageLabel, useActiveToggle, type ConfirmFn } from './row-controls'

export interface MasterRowProps {
  name: string
  noun: string
  description: string | null
  isActive: boolean
  usage: number | undefined
  leading: ReactNode
  /** Small chips next to the name (e.g. short name). */
  meta?: ReactNode
  /** Drag handle from <SortableList>. */
  handle?: ReactNode
  confirm: ConfirmFn
  onEdit: () => void
  /** Resolve after the list has refetched. */
  onSetActive: (active: boolean) => Promise<unknown>
  onDelete: () => Promise<unknown>
  deleteNote?: ReactNode
}

/** One store / shelf-type row: identity on the left, usage + active switch + actions on the right. */
export function MasterRow({ name, noun, description, isActive, usage, leading, meta, handle, confirm, onEdit, onSetActive, onDelete, deleteNote }: MasterRowProps) {
  const { checked, pending, toggle } = useActiveToggle({ name, isActive, setActive: onSetActive })
  const muted = !checked

  return (
    <div className="flex items-start gap-2 py-3 pr-3 pl-1.5 sm:items-center sm:gap-3 sm:pr-4 sm:pl-2">
      {handle && <div className="pt-1.5 sm:pt-0">{handle}</div>}
      <div className="flex min-w-0 flex-1 flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className={cn('shrink-0 transition', muted && 'opacity-45 grayscale-[60%]')}>{leading}</div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={cn('truncate font-medium', muted && 'text-muted-foreground')}>{name}</span>
              {meta}
              {muted && <InactiveBadge />}
            </div>
            <p className={cn('mt-0.5 line-clamp-2 text-sm text-muted-foreground sm:line-clamp-1', muted && 'opacity-80')}>{description || <span className="italic opacity-70">ไม่มีคำอธิบาย</span>}</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 sm:justify-end sm:gap-4">
          <UsageLabel count={usage} className="sm:w-32 sm:justify-start" />
          <div className="flex items-center gap-1">
            <ActiveSwitch name={name} checked={checked} pending={pending} onCheckedChange={toggle} />
            <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden />
            <EditButton name={name} onClick={onEdit} />
            <DeleteButton name={name} noun={noun} usage={usage} isActive={checked} confirm={confirm} onDelete={onDelete} onDeactivate={() => toggle(false)} deleteNote={deleteNote} />
          </div>
        </div>
      </div>
    </div>
  )
}

export function MasterListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y rounded-xl border bg-card" aria-busy="true" aria-label="กำลังโหลดรายการ">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3.5 sm:px-4">
          <Skeleton className="h-6 w-4" />
          <Skeleton className="size-11 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
          <Skeleton className="hidden h-4 w-24 sm:block" />
          <Skeleton className="h-5 w-9 rounded-full" />
          <Skeleton className="hidden size-7 sm:block" />
          <Skeleton className="hidden size-7 sm:block" />
        </div>
      ))}
    </div>
  )
}

/** "6 ห้าง · ใช้งาน 5 · ปิดใช้งาน 1" summary above a list. */
export function ListSummary({ total, active, unit, children }: { total: number; active: number; unit: string; children?: ReactNode }) {
  const inactive = total - active
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <p>
        ทั้งหมด <span className="tabular font-semibold text-foreground">{total}</span> {unit} · ใช้งาน <span className="tabular font-semibold text-success">{active}</span>
        {inactive > 0 && (
          <>
            {' '}
            · ปิดใช้งาน <span className="tabular font-semibold text-foreground">{inactive}</span>
          </>
        )}
      </p>
      {children}
    </div>
  )
}
