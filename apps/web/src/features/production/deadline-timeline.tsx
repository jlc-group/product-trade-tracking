import { TONE_SOFT } from '@/features/presentation/model'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { deadlineChip, timelinePoints } from './model'
import { PlanPopover } from './plan-popover'
import type { ProductionModel } from './types'

/** ผ่าน Buyer → วันนี้ → Deadline ผลิต/ส่งคลัง → วางขาย, with the lead-days footer (§5.7). */
export function DeadlineTimeline({ model }: { model: ProductionModel }) {
  const view = model.view
  if (!view) return null
  const s = view.summary
  const { points, todayPos } = timelinePoints(view)
  const chip = deadlineChip(s)
  const plan = view.plan
  const editable = model.canWork

  return (
    <section aria-label="กำหนดการผลิต" className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 space-y-0.5">
          <p className="text-xs text-muted-foreground">กำหนดส่งเข้าคลัง/{model.storeWord}</p>
          <p className="flex flex-wrap items-center gap-2">
            <span className="tabular text-base font-semibold">{formatDate(s.deadline)}</span>
            <span className={cn('tabular inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium whitespace-nowrap', TONE_SOFT[chip.tone])}>{chip.text}</span>
          </p>
        </div>
        {s.confirmed > 0 && (
          <div className="w-full space-y-1 sm:w-44">
            <p className="text-xs text-muted-foreground">
              ส่งแล้ว <span className="tabular">{s.delivered}/{s.confirmed}</span> SKU
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className={cn('h-full rounded-full', s.delivered === s.confirmed ? 'bg-success' : 'bg-primary')} style={{ width: `${(s.delivered / s.confirmed) * 100}%` }} />
            </div>
          </div>
        )}
      </div>

      <div className="relative mx-1.5 mt-5 h-2 rounded-full bg-muted" aria-hidden>
        <div className="absolute inset-y-0 left-0 rounded-full bg-primary/25" style={{ width: `${todayPos * 100}%` }} />
        {points.map((p) => (
          <span
            key={p.key}
            className={cn('absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full', p.key === 'today' ? 'size-3.5 ring-4 ring-primary/25' : 'size-3 ring-2 ring-card', p.dot)}
            style={{ left: `${p.pos * 100}%` }}
          />
        ))}
      </div>

      <ol className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
        {points.map((p) => (
          <li key={p.key} className="flex min-w-0 items-start gap-2">
            <span className={cn('mt-1 size-2.5 shrink-0 rounded-full', p.dot)} aria-hidden />
            <span className="min-w-0">
              <span className="block text-xs text-muted-foreground">{p.label}</span>
              <span className="tabular block text-sm">{formatDate(p.date)}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-3 space-y-1 border-t pt-3 text-xs text-muted-foreground">
        <p className="flex flex-wrap items-center gap-x-1">
          <span>
            ตั้ง deadline ไว้ <span className="tabular">{plan.leadDays}</span> วันก่อนวางขาย{plan.isDefault && ' (ค่าเริ่มต้น)'}
          </span>
          {editable && (
            <>
              <span aria-hidden>·</span>
              <PlanPopover model={model} />
            </>
          )}
        </p>
        {plan.note && (
          <p className="line-clamp-2 break-words" title={plan.note}>
            หมายเหตุ: {plan.note}
          </p>
        )}
      </div>
    </section>
  )
}
