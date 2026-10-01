import { addDays, type ISODate } from '@flowtrade/shared'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { dayjs, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { LaunchChip, TaskLine } from './items'
import { CELL_MAX_ITEMS, monthKey, monthWeeks, TASK_DOT, taskTone, WEEKDAYS, WEEKDAYS_FULL, type DayBucket } from './model'

const STEP: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }

function dayAriaLabel(date: ISODate, bucket: DayBucket | undefined, today: ISODate) {
  const parts = [`${formatDate(date, { long: true })}${date === today ? ' (วันนี้)' : ''}`]
  if (!bucket || bucket.launches.length + bucket.tasks.length === 0) parts.push('ไม่มีรายการ')
  else {
    if (bucket.launches.length) parts.push(`วางขาย ${bucket.launches.length} รายการ`)
    if (bucket.tasks.length) parts.push(`งานครบกำหนด ${bucket.tasks.length} งาน`)
    const overdue = bucket.tasks.filter((t) => taskTone(t.task, today) === 'overdue').length
    if (overdue) parts.push(`เลยกำหนด ${overdue} งาน`)
  }
  return parts.join(' · ')
}

function DayCell({
  date,
  month,
  bucket,
  today,
  selected,
  focusable,
  onSelect,
}: {
  date: ISODate
  month: string
  bucket: DayBucket | undefined
  today: ISODate
  selected: boolean
  focusable: boolean
  onSelect: (date: ISODate) => void
}) {
  const inMonth = monthKey(date) === month
  const isToday = date === today
  const dayNum = Number(date.slice(8))
  const launches = bucket?.launches ?? []
  const tasks = bucket?.tasks ?? []
  const total = launches.length + tasks.length
  const shownLaunches = launches.slice(0, CELL_MAX_ITEMS)
  const shownTasks = tasks.slice(0, CELL_MAX_ITEMS - shownLaunches.length)
  const rest = total - shownLaunches.length - shownTasks.length

  return (
    <div role="gridcell" aria-selected={selected} className="min-w-0 border-r last:border-r-0">
      <button
        type="button"
        data-date={date}
        tabIndex={focusable ? 0 : -1}
        onClick={() => onSelect(date)}
        aria-label={dayAriaLabel(date, bucket, today)}
        className={cn(
          'flex h-full min-h-28 w-full flex-col gap-1 p-1.5 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
          !inMonth && 'bg-muted/40',
          selected && 'bg-brand-soft/70 hover:bg-brand-soft',
        )}
      >
        <span className="flex items-center gap-1" aria-hidden>
          <span
            className={cn(
              'tabular flex size-6 items-center justify-center rounded-full text-xs font-medium',
              isToday ? 'bg-primary font-semibold text-primary-foreground' : inMonth ? 'text-foreground' : 'text-muted-foreground/60',
            )}
          >
            {dayNum}
          </span>
          {dayNum === 1 && !isToday && <span className={cn('text-[11px]', inMonth ? 'text-muted-foreground' : 'text-muted-foreground/60')}>{dayjs(date).format('MMM')}</span>}
          {isToday && <span className="hidden text-[11px] font-medium text-primary @3xl/cal:inline">วันนี้</span>}
        </span>
        {total > 0 && (
          <span className={cn('flex min-w-0 flex-col gap-0.5', !inMonth && 'opacity-60')} aria-hidden>
            {shownLaunches.map((p) => (
              <LaunchChip key={p.id} p={p} />
            ))}
            {shownTasks.map((t) => (
              <TaskLine key={t.task.id} item={t} today={today} />
            ))}
            {rest > 0 && <span className="tabular px-1 text-[11px] font-medium text-muted-foreground">+{rest} รายการ</span>}
          </span>
        )}
      </button>
    </div>
  )
}

export function MonthGrid({
  month,
  label,
  buckets,
  today,
  selected,
  onSelect,
  onMonthChange,
}: {
  month: string
  label: string
  buckets: Map<ISODate, DayBucket>
  today: ISODate
  selected: ISODate | null
  onSelect: (date: ISODate) => void
  onMonthChange: (month: string) => void
}) {
  const weeks = monthWeeks(month)
  const all = weeks.flat()
  const gridRef = useRef<HTMLDivElement>(null)
  const [focusDate, setFocusDate] = useState<ISODate | null>(null)
  const pendingFocus = useRef<ISODate | null>(null)

  // Roving tabindex: one tab stop for the whole grid, arrow keys move between days.
  const rovingDate =
    focusDate && all.includes(focusDate)
      ? focusDate
      : selected && monthKey(selected) === month
        ? selected
        : monthKey(today) === month
          ? today
          : `${month}-01`

  // Arrowing past the visible weeks flips the month; focus the target day once it renders.
  useEffect(() => {
    const target = pendingFocus.current
    if (!target) return
    pendingFocus.current = null
    gridRef.current?.querySelector<HTMLElement>(`[data-date="${target}"]`)?.focus()
  }, [month])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const from = (e.target as HTMLElement).closest<HTMLElement>('[data-date]')?.dataset.date
    if (!from) return
    let next: ISODate | null = null
    if (Object.hasOwn(STEP, e.key)) next = addDays(from, STEP[e.key])
    else if (e.key === 'Home') next = addDays(from, -((dayjs(from).day() + 6) % 7))
    else if (e.key === 'End') next = addDays(from, 6 - ((dayjs(from).day() + 6) % 7))
    else if (e.key === 'PageUp' || e.key === 'PageDown') next = dayjs(from).add(e.key === 'PageUp' ? -1 : 1, 'month').format('YYYY-MM-DD')
    if (!next) return
    e.preventDefault()
    setFocusDate(next)
    const flipsMonth = e.key === 'PageUp' || e.key === 'PageDown'
    const el = flipsMonth ? null : gridRef.current?.querySelector<HTMLElement>(`[data-date="${next}"]`)
    if (el) el.focus()
    else {
      pendingFocus.current = next
      onMonthChange(monthKey(next))
    }
  }

  return (
    <div ref={gridRef} role="grid" aria-label={`ปฏิทินเดือน${label}`} onKeyDown={onKeyDown} className="@container/cal overflow-hidden rounded-xl border bg-card">
      <div role="row" className="grid grid-cols-7 border-b bg-muted/50">
        {WEEKDAYS.map((w, i) => (
          <div key={w} role="columnheader" aria-label={WEEKDAYS_FULL[i]} className={cn('py-2 text-center text-xs font-medium text-muted-foreground', i >= 5 && 'text-muted-foreground/70')}>
            {w}
          </div>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={week[0]} role="row" className="grid grid-cols-7 border-b last:border-b-0">
          {week.map((date) => (
            <DayCell
              key={date}
              date={date}
              month={month}
              bucket={buckets.get(date)}
              today={today}
              selected={selected === date}
              focusable={date === rovingDate}
              onSelect={(d) => {
                setFocusDate(d)
                onSelect(d)
              }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

export function CalendarLegend({ showLaunches, showTasks }: { showLaunches: boolean; showTasks: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {showLaunches && (
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm bg-muted-foreground/30" aria-hidden />
          วันวางขาย (สีตามห้าง / แพลตฟอร์ม)
        </span>
      )}
      {showTasks &&
        (
          [
            ['open', 'งานที่ยังไม่เสร็จ'],
            ['overdue', 'เลยกำหนด'],
            ['done', 'เสร็จแล้ว'],
          ] as const
        ).map(([tone, text]) => (
          <span key={tone} className="inline-flex items-center gap-1.5">
            <span className={cn('size-2 rounded-full', TASK_DOT[tone])} aria-hidden />
            {text}
          </span>
        ))}
      <span className="ml-auto hidden lg:inline">ใช้ปุ่มลูกศรเลื่อนวัน · Page Up / Down เปลี่ยนเดือน</span>
    </div>
  )
}

export function MonthGridSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border bg-card" aria-hidden>
      <div className="grid grid-cols-7 border-b bg-muted/50">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-2 text-center text-xs font-medium text-muted-foreground">
            {w}
          </div>
        ))}
      </div>
      {Array.from({ length: 5 }, (_, w) => (
        <div key={w} className="grid grid-cols-7 border-b last:border-b-0">
          {Array.from({ length: 7 }, (_, d) => (
            <div key={d} className="flex min-h-28 flex-col gap-1.5 border-r p-1.5 last:border-r-0">
              <Skeleton className="size-6 rounded-full" />
              {(w * 7 + d) % 3 === 0 && <Skeleton className="h-6 w-full" />}
              {(w * 7 + d) % 4 === 1 && <Skeleton className="h-4 w-4/5" />}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
