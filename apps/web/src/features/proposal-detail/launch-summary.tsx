import { diffDays, PREP_DAYS, prepStartOf, type ISODate } from '@flowtrade/shared'
import { TriangleAlertIcon } from 'lucide-react'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { shiftLabel } from './utils'

interface LaunchCompareProps {
  /** "วันวางขาย" / "วันเปิดขาย". */
  word: string
  from: ISODate
  to: ISODate | null
  today: ISODate
  fromLabel?: string
  toLabel?: string
}

/**
 * Old vs new launch date, each with its preparation start (launch − PREP_DAYS),
 * plus how far everything moves and a warning when the new window is already short.
 */
export function LaunchCompare({ word, from, to, today, fromLabel = 'เดิม', toLabel = 'ใหม่' }: LaunchCompareProps) {
  const delta = to ? diffDays(from, to) : 0
  const prepStart = to ? prepStartOf(to) : null
  const daysLeft = to ? diffDays(today, to) : 0
  const short = !!to && !!prepStart && prepStart < today && daysLeft >= 0

  return (
    <div className="space-y-2 rounded-lg bg-muted/50 p-3 text-xs">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5">
        <dt className="text-muted-foreground">{fromLabel}</dt>
        <dd className="min-w-0 text-muted-foreground">
          {word} {formatDate(from, { long: true })} · เริ่มเตรียม {formatDate(prepStartOf(from), { long: true })}
        </dd>
        <dt className="font-medium text-foreground">{toLabel}</dt>
        <dd className="min-w-0">
          {to && prepStart ? (
            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <span>
                {word} <span className="font-medium">{formatDate(to, { long: true })}</span> · เริ่มเตรียม{' '}
                <span className="font-medium">{formatDate(prepStart, { long: true })}</span>
              </span>
              {delta !== 0 && (
                <span className={cn('tabular rounded px-1.5 py-0.5 font-medium', delta > 0 ? 'bg-warning-soft text-warning-foreground' : 'bg-info-soft text-info')}>
                  {shiftLabel(delta)}
                </span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">ยังไม่ได้เลือกเดือน</span>
          )}
        </dd>
      </dl>
      {short && (
        <p className="flex items-start gap-1.5 text-warning-foreground">
          <TriangleAlertIcon className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>
            ควรเริ่มเตรียมตั้งแต่ {formatDate(prepStart, { long: true })} ซึ่งผ่านมาแล้ว — เหลือเวลาเตรียม <span className="tabular font-medium">{daysLeft}</span> วัน (ปกติ {PREP_DAYS} วัน)
          </span>
        </p>
      )}
    </div>
  )
}

/** "เริ่มเตรียม 17 ส.ค. 69 · อีก 5 วัน" — the back-tracked start of preparation for a launch. */
export function PrepStartText({ targetDate, today, className }: { targetDate: ISODate; today: ISODate; className?: string }) {
  const start = prepStartOf(targetDate)
  const untilStart = diffDays(today, start)
  return (
    <span className={cn('block text-xs text-muted-foreground', className)} title={`เตรียมทุกอย่างให้เสร็จภายใน ${PREP_DAYS} วันก่อนถึงวันขาย`}>
      เริ่มเตรียม <span className="tabular">{formatDate(start)}</span>
      {untilStart > 0 && (
        <>
          {' · '}
          <span className={cn(untilStart <= 7 && 'font-medium text-warning-foreground')}>อีก {untilStart} วัน</span>
        </>
      )}
    </span>
  )
}

interface PrepWindowProps {
  word: string
  targetDate: ISODate
  today: ISODate
  /** Leaf-task progress of the proposal. */
  progress: { done: number; total: number; percent: number }
  className?: string
}

/**
 * The PREP_DAYS preparation window (prep start → launch): how much of the time has passed
 * next to how much of the work is done, so a project falling behind is visible at a glance.
 */
export function PrepWindow({ word, targetDate, today, progress, className }: PrepWindowProps) {
  const start = prepStartOf(targetDate)
  const total = Math.max(1, diffDays(start, targetDate))
  const elapsed = Math.min(total, Math.max(0, diffDays(start, today)))
  const timePct = Math.round((elapsed / total) * 100)
  const untilStart = diffDays(today, start)
  const daysLeft = diffDays(today, targetDate)
  const allDone = progress.total > 0 && progress.done === progress.total
  const behind = !allDone && progress.total > 0 && untilStart <= 0 && daysLeft >= 0 && progress.percent + 10 < timePct

  const status =
    daysLeft < 0
      ? `ถึง${word}แล้ว`
      : untilStart > 0
        ? `เริ่มเตรียมอีก ${untilStart} วัน`
        : daysLeft === 0
          ? `${word}วันนี้`
          : `ผ่านไป ${elapsed} จาก ${total} วัน · เหลือ ${daysLeft} วัน`

  return (
    <section aria-label={`ช่วงเตรียมงาน ${PREP_DAYS} วัน`} className={cn('space-y-3 rounded-xl border bg-card p-3 sm:p-4', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold">ช่วงเตรียมงาน {PREP_DAYS} วัน</h3>
        <span className="tabular text-xs text-muted-foreground">{status}</span>
      </div>
      <div className="grid grid-cols-[3.5rem_minmax(0,1fr)_2.75rem] items-center gap-x-2 gap-y-1.5 text-xs">
        <span className="text-muted-foreground">เวลา</span>
        <div className="h-2 overflow-hidden rounded-full bg-muted" role="presentation">
          <div className="h-full rounded-full bg-foreground/30" style={{ width: `${timePct}%` }} />
        </div>
        <span className="tabular text-right text-muted-foreground">{timePct}%</span>
        <span className="text-muted-foreground">งานเสร็จ</span>
        <div className="h-2 overflow-hidden rounded-full bg-muted" role="presentation">
          <div className={cn('h-full rounded-full', allDone ? 'bg-success' : behind ? 'bg-warning' : 'bg-primary')} style={{ width: `${progress.percent}%` }} />
        </div>
        <span className={cn('tabular text-right', behind ? 'font-medium text-warning-foreground' : 'text-muted-foreground')}>{progress.percent}%</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>
          เริ่มเตรียม <span className="tabular font-medium text-foreground">{formatDate(start, { long: true })}</span>
        </span>
        <span>
          {word} <span className="tabular font-medium text-foreground">{formatDate(targetDate, { long: true })}</span>
        </span>
      </div>
      {behind && (
        <p className="flex items-start gap-1.5 text-xs text-warning-foreground">
          <TriangleAlertIcon className="mt-px size-3.5 shrink-0" aria-hidden />
          งานเสร็จช้ากว่าเวลาที่ผ่านไป — เร่งติดตามงานที่ยังค้าง เพื่อให้ทันวันขาย
        </p>
      )}
    </section>
  )
}
