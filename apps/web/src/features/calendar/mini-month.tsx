// Compact month overview for phones: day numbers with colored dots; tapping a day opens the bottom sheet.
import type { ISODate } from '@flowtrade/shared'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { bucketSize, monthKey, monthWeeks, TASK_DOT, taskTone, WEEKDAYS, WEEKDAYS_FULL, type DayBucket } from './model'

const MAX_DOTS = 4

function Dots({ bucket, today }: { bucket: DayBucket; today: ISODate }) {
  const dots = [
    ...bucket.launches.map((p) => ({ key: p.id, style: { backgroundColor: p.store.color }, className: 'rounded-[2px]' })),
    ...bucket.tasks.map((t) => ({ key: t.task.id, style: undefined, className: cn('rounded-full', TASK_DOT[taskTone(t.task, today)]) })),
  ]
  const shown = dots.slice(0, MAX_DOTS)
  return (
    <span className="flex h-1.5 items-center justify-center gap-0.5">
      {shown.map((d) => (
        <span key={d.key} className={cn('size-1.5', d.className)} style={d.style} />
      ))}
    </span>
  )
}

export function MiniMonth({
  month,
  label,
  buckets,
  today,
  selected,
  onSelect,
}: {
  month: string
  label: string
  buckets: Map<ISODate, DayBucket>
  today: ISODate
  selected: ISODate | null
  onSelect: (date: ISODate) => void
}) {
  const weeks = monthWeeks(month)
  return (
    <div className="rounded-xl border bg-card p-2" role="group" aria-label={`ภาพรวมเดือน${label}`}>
      <div className="grid grid-cols-7 pb-1" aria-hidden>
        {WEEKDAYS.map((w) => (
          <span key={w} className="py-1 text-center text-[11px] font-medium text-muted-foreground">
            {w}
          </span>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={week[0]} className="grid grid-cols-7">
          {week.map((date, i) => {
            const bucket = buckets.get(date)
            const n = bucketSize(bucket)
            const inMonth = monthKey(date) === month
            const isToday = date === today
            return (
              <button
                key={date}
                type="button"
                onClick={() => onSelect(date)}
                aria-label={`${WEEKDAYS_FULL[i]} ${formatDate(date, { long: true })}${isToday ? ' (วันนี้)' : ''} · ${n ? `${n} รายการ` : 'ไม่มีรายการ'}`}
                className={cn(
                  'flex h-12 flex-col items-center justify-center gap-1 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  selected === date && 'bg-brand-soft',
                  !inMonth && 'opacity-45',
                )}
              >
                <span
                  className={cn(
                    'tabular flex size-7 items-center justify-center rounded-full text-sm',
                    isToday ? 'bg-primary font-semibold text-primary-foreground' : 'text-foreground',
                  )}
                >
                  {Number(date.slice(8))}
                </span>
                {bucket && n > 0 ? <Dots bucket={bucket} today={today} /> : <span className="h-1.5" />}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
