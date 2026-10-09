import { timelineTone, type ISODate, type Progress } from '@flowtrade/shared'
import { CalendarClockIcon, InboxIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { daysUntil, formatDateRange, relativeDay, today } from '@/lib/format'
import { cn } from '@/lib/utils'

export function PageHeader({ title, description, actions, eyebrow, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-x-6 gap-y-3', className)}>
      <div className="min-w-0 space-y-1">
        {eyebrow && <div className="text-xs font-medium tracking-wide text-muted-foreground">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card/50 px-6 py-12 text-center', className)}>
      <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">{icon ?? <InboxIcon className="size-5" />}</div>
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        {description && <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function ProgressRing({ progress, size = 44, stroke = 5, className, showLabel = true }: { progress: Pick<Progress, 'percent'>; size?: number; stroke?: number; className?: string; showLabel?: boolean }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, progress.percent))
  const color = pct === 100 ? 'var(--success)' : 'var(--primary)'
  return (
    <span className={cn('relative inline-flex shrink-0 items-center justify-center', className)} style={{ width: size, height: size }} role="img" aria-label={`ความคืบหน้า ${pct}%`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c} className="transition-[stroke-dashoffset] duration-500" />
      </svg>
      {showLabel && <span className="tabular absolute text-[11px] font-semibold">{pct}%</span>}
    </span>
  )
}

export function ProgressBar({ progress, className }: { progress: Pick<Progress, 'percent' | 'done' | 'total'>; className?: string }) {
  const pct = Math.max(0, Math.min(100, progress.percent))
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full transition-[width] duration-500', pct === 100 ? 'bg-success' : 'bg-primary')} style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular w-16 text-right text-xs text-muted-foreground">
        {progress.done}/{progress.total}
      </span>
    </div>
  )
}

/** Date range with overdue / due-soon coloring. */
export function DueChip({ startDate, dueDate, isDone, className, compact }: { startDate: ISODate | null; dueDate: ISODate | null; isDone: boolean; className?: string; compact?: boolean }) {
  // Yellow while inside the task's window, red from 2 days before due and once overdue (shared timelineTone).
  const tone = timelineTone({ isDone, startDate, dueDate }, today())
  const overdue = tone === 'late'
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-xs whitespace-nowrap tabular',
        tone === 'late' || tone === 'due-soon' ? 'bg-danger-soft font-medium text-danger' : tone === 'active' ? 'bg-warning-soft text-warning-foreground' : 'text-muted-foreground',
        className,
      )}
      title={dueDate ? relativeDay(dueDate) : undefined}
    >
      <CalendarClockIcon className="size-3.5" />
      {compact && dueDate ? (overdue ? relativeDay(dueDate) : formatDateRange(null, dueDate)) : formatDateRange(startDate, dueDate)}
      {!compact && overdue && dueDate && <span className="font-semibold">· {relativeDay(dueDate)}</span>}
    </span>
  )
}

/** Countdown to the target on-shelf date. `open`: results still missing, so a past date reads "เลยวันวางขาย n วัน" (danger). */
export function LaunchCountdown({ targetDate, open, className }: { targetDate: ISODate; open?: boolean; className?: string }) {
  const n = daysUntil(targetDate)
  const label = n === 0 ? 'วางขายวันนี้' : n > 0 ? `อีก ${n} วัน` : open ? `เลยวันวางขาย ${-n} วัน` : `วางขายแล้ว ${-n} วัน`
  const tone = n < 0 ? (open ? 'text-danger' : 'text-muted-foreground') : n <= 14 ? 'text-warning-foreground' : 'text-foreground'
  return <span className={cn('tabular text-xs font-medium', tone, className)}>{label}</span>
}

interface ConfirmOptions {
  title: string
  description?: ReactNode
  confirmLabel?: string
  /** Label of the dismiss button (default "ยกเลิก"). */
  cancelLabel?: string
  destructive?: boolean
}

/** Promise-based confirm dialog: const [confirm, dialog] = useConfirm(); if (await confirm({...})) ... */
export function useConfirm(): [(opts: ConfirmOptions) => Promise<boolean>, ReactNode] {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null)
  const confirm = (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...opts, resolve }))
  const close = (value: boolean) => {
    state?.resolve(value)
    setState(null)
  }
  const dialog = (
    <AlertDialog open={!!state} onOpenChange={(open) => !open && close(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{state?.title}</AlertDialogTitle>
          {state?.description && <AlertDialogDescription>{state.description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => close(false)}>{state?.cancelLabel ?? 'ยกเลิก'}</AlertDialogCancel>
          <AlertDialogAction
            className={cn(state?.destructive && 'bg-destructive text-white hover:bg-destructive/90 focus-visible:border-destructive/40 focus-visible:ring-destructive/30')}
            onClick={() => close(true)}
          >
            {state?.confirmLabel ?? 'ยืนยัน'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
  return [confirm, dialog]
}
