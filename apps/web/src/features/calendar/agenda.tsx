// Agenda: non-empty days in date order, each with its launches and tasks as full rows.
import type { ISODate } from '@flowtrade/shared'
import { Skeleton } from '@/components/ui/skeleton'
import { dayjs, relativeDay } from '@/lib/format'
import { cn } from '@/lib/utils'
import { LaunchRow, TaskRow } from './items'
import type { DayBucket } from './model'

function DateBadge({ date, today }: { date: ISODate; today: ISODate }) {
  const d = dayjs(date)
  const isToday = date === today
  return (
    <div className="flex w-14 shrink-0 flex-col items-center gap-1 pt-1">
      <div className={cn('flex w-12 flex-col items-center rounded-lg py-1.5 leading-none', isToday ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground')}>
        <span className={cn('text-[11px]', isToday ? 'text-primary-foreground/85' : 'text-muted-foreground')}>{d.format('dd')}</span>
        <span className="tabular mt-1 text-lg font-semibold">{d.format('D')}</span>
        <span className={cn('mt-0.5 text-[10px]', isToday ? 'text-primary-foreground/85' : 'text-muted-foreground')}>{d.format('MMM')}</span>
      </div>
      <span className={cn('text-center text-[11px] leading-tight', isToday ? 'font-medium text-primary' : date < today ? 'text-muted-foreground/70' : 'text-muted-foreground')}>
        {relativeDay(date)}
      </span>
    </div>
  )
}

export function AgendaDay({ bucket, today }: { bucket: DayBucket; today: ISODate }) {
  return (
    <li className="flex min-w-0 gap-3">
      <DateBadge date={bucket.date} today={today} />
      <div className="min-w-0 flex-1 divide-y overflow-hidden rounded-xl border bg-card">
        {bucket.launches.map((p) => (
          <LaunchRow key={p.id} p={p} className="rounded-none" />
        ))}
        {bucket.tasks.map((t) => (
          <TaskRow key={t.task.id} item={t} />
        ))}
      </div>
    </li>
  )
}

export function AgendaList({ days, today, className }: { days: DayBucket[]; today: ISODate; className?: string }) {
  return (
    <ol className={cn('grid gap-4', className)}>
      {days.map((b) => (
        <AgendaDay key={b.date} bucket={b} today={today} />
      ))}
    </ol>
  )
}

export function AgendaSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="grid gap-4" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="h-16 w-12 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-3 rounded-xl border bg-card p-3">
            <div className="flex gap-3">
              <Skeleton className="size-8 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
            {i % 2 === 0 && <Skeleton className="h-4 w-1/2" />}
          </div>
        </div>
      ))}
    </div>
  )
}
