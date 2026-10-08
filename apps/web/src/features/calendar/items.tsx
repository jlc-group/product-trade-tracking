// Calendar entries in two densities: tiny cell items (month grid) and full rows (day panel / agenda).
import { autoCompletionHint, canToggleTask, storeNamesLabel, type ISODate } from '@flowtrade/shared'
import { CheckIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { useToggleAnyTask } from '@/api/hooks'
import type { ProposalListItem, TaskWithContext } from '@/api/types'
import { useCurrentUser } from '@/auth/auth'
import { ShelfTypeBadge, StatusBadge, StoreLogos } from '@/components/common/badges'
import { DueChip, ProgressBar } from '@/components/common/misc'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { shortTitle, TASK_DOT, taskTone } from './model'

export const proposalHref = (p: { id: string }) => `/proposals/${p.id}`
export const taskHref = (t: TaskWithContext) => `/proposals/${t.proposal.id}?task=${t.task.id}`

/** Store-tinted background derived from the store's own color (data color, not a theme color). */
const storeTint = (color: string, percent = 14) => ({ backgroundColor: `color-mix(in oklch, ${color} ${percent}%, transparent)` })

// ---------- month-grid cell items ----------

/** Launch chip: store logo + short title. The title hides when cells get narrow (container query on the grid). */
export function LaunchChip({ p }: { p: ProposalListItem }) {
  const ended = p.status === 'CANCELLED'
  return (
    <span
      className={cn('flex h-6 min-w-0 items-center gap-1.5 rounded-md pr-1.5 text-xs font-medium text-foreground', ended && 'opacity-55')}
      style={storeTint(p.stores[0].color)}
      title={`${p.title} · ${p.stores.map((s) => s.name).join(', ')}`}
    >
      <StoreLogos stores={p.stores} size="sm" max={2} />
      <span className={cn('hidden min-w-0 flex-1 truncate @2xl/cal:block', ended && 'line-through')}>{shortTitle(p)}</span>
      {p.status === 'COMPLETED' && <CheckIcon className="hidden size-3 shrink-0 text-success @2xl/cal:block" />}
    </span>
  )
}

/** Task line: colored dot + title. Overdue in danger, done struck through. */
export function TaskLine({ item, today }: { item: TaskWithContext; today: ISODate }) {
  const tone = taskTone(item.task, today)
  return (
    <span
      className={cn(
        'flex h-5 min-w-0 items-center gap-1.5 rounded px-1 text-[11px] leading-none',
        tone === 'overdue' && 'bg-danger-soft font-medium text-danger',
        tone === 'done' && 'text-muted-foreground line-through',
        tone === 'open' && 'text-foreground/85',
      )}
      title={item.task.title}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', TASK_DOT[tone])} />
      <span className="truncate">{item.task.title}</span>
    </span>
  )
}

// ---------- full rows ----------

export function LaunchRow({ p, className }: { p: ProposalListItem; className?: string }) {
  return (
    <Link
      to={proposalHref(p)}
      className={cn('group flex gap-3 rounded-lg p-3 transition-colors outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50', className)}
    >
      <StoreLogos stores={p.stores} size="md" />
      <span className="min-w-0 flex-1 space-y-1.5">
        <span className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
          <span className={cn('line-clamp-2 min-w-0 text-sm font-medium group-hover:text-primary', p.status === 'CANCELLED' && 'text-muted-foreground line-through')}>{p.title}</span>
          <StatusBadge status={p.status} className="shrink-0" />
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="tabular">{p.code}</span>
          <span aria-hidden>·</span>
          <span>{storeNamesLabel(p.stores.map((s) => s.name))}</span>
          <ShelfTypeBadge shelfType={p.shelfType} className="h-5" />
          {p.overdueCount > 0 && <span className="tabular font-medium text-danger">เลยกำหนด {p.overdueCount} งาน</span>}
        </span>
        {p.progress.total > 0 && <ProgressBar progress={p.progress} />}
      </span>
    </Link>
  )
}

/** Task row with a tick box. The tick shows immediately and settles when the server answers. */
export function TaskRow({ item, className }: { item: TaskWithContext; className?: string }) {
  const user = useCurrentUser()
  const toggle = useToggleAnyTask()
  const checkboxId = useId()
  const { task, proposal, stores, path } = item
  // Optimistic value, valid only while the server copy is still the one we clicked on.
  const [pending, setPending] = useState<{ value: boolean; base: boolean } | null>(null)
  const checked = pending && pending.base === task.isDone ? pending.value : task.isDone
  // A table (or sub tasks) decides this box: the system ticks it, never a click.
  const auto = item.completion !== 'manual'
  const allowed = canToggleTask(user, proposal, task) && !auto

  const onCheckedChange = (value: boolean) => {
    setPending({ value, base: task.isDone })
    toggle.mutate(
      { id: task.id, isDone: value, proposalId: proposal.id },
      {
        onSuccess: (res) => {
          if (!value) toast.success(`เปิดงานอีกครั้ง: ${task.title}`)
          else if (res.allDone) toast.success(`ทำเครื่องหมายเสร็จ: ${task.title}`, { description: `งานทุกข้อของ ${proposal.code} เสร็จครบแล้ว` })
          else toast.success(`ทำเครื่องหมายเสร็จ: ${task.title}`)
        },
        onError: () => setPending(null),
      },
    )
  }

  return (
    <div className={cn('flex gap-3 p-3', className)}>
      <div className="pt-0.5">
        <Checkbox
          id={checkboxId}
          checked={checked}
          disabled={!allowed || toggle.isPending}
          title={item.completion !== 'manual' ? autoCompletionHint(item.completion) : undefined}
          onCheckedChange={(v) => onCheckedChange(v === true)}
          className="size-[18px] data-checked:border-success data-checked:bg-success"
        />
        <Label htmlFor={checkboxId} className="sr-only">
          {checked ? `เปิดงานอีกครั้ง: ${task.title}` : `ทำเครื่องหมายว่าเสร็จ: ${task.title}`}
        </Label>
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <Link
          to={taskHref(item)}
          className={cn(
            'line-clamp-2 rounded-sm text-sm font-medium outline-none hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/50',
            checked && 'text-muted-foreground line-through',
          )}
        >
          {task.title}
        </Link>
        {path.length > 0 && <p className="truncate text-xs text-muted-foreground">{path.join(' › ')}</p>}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <StoreLogos stores={stores} size="sm" max={2} logoClassName="h-5 min-w-5 rounded text-[8px] shadow-none" />
            <span className="tabular shrink-0">{proposal.code}</span>
            <span className="truncate">{shortTitle({ title: proposal.title, stores })}</span>
          </span>
          <DueChip startDate={task.startDate} dueDate={task.dueDate} isDone={checked} />
        </div>
        {!allowed && <p className="text-xs text-muted-foreground">ทำเครื่องหมายได้เฉพาะผู้รับผิดชอบงานหรือทีมของโปรเจกต์</p>}
      </div>
    </div>
  )
}
