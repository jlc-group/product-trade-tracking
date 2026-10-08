import { CircleAlertIcon, TriangleAlertIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { TONE_SOFT } from '@/features/presentation/model'
import { Callout } from '@/features/wizard/choice-card'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { deadlineChip, LAUNCH_RISK_DAYS, orderArrivalAlerts, timelineAlerts, timelinePoints, type TimelineBand } from './model'
import { PlanPopover } from './plan-popover'
import type { ProductionModel } from './types'

const FLAG_TEXT = { danger: 'text-danger', warning: 'text-warning-foreground' } as const
// Opaque, so the today fill under them doesn't blend in.
const RISK_BAND = 'bg-[color-mix(in_oklab,var(--warning)_45%,var(--card))]'
const LATE_BAND = 'bg-[color-mix(in_oklab,var(--danger)_70%,var(--card))]'

/** A band on the bar with its label above: ending at the band's end, or starting at its start near the left edge. */
function Band({ band, label, fill, text }: { band: TimelineBand; label: ReactNode; fill: string; text: string }) {
  return (
    <>
      <div className={cn('absolute inset-y-0 min-w-1.5 rounded-full', fill)} style={{ left: `${band.from * 100}%`, width: `${(band.to - band.from) * 100}%` }} />
      <span
        className={cn('absolute bottom-full mb-1.5 text-[11px] font-medium whitespace-nowrap', text)}
        style={band.to > 0.5 ? { right: `${(1 - band.to) * 100}%` } : { left: `${band.from * 100}%` }}
      >
        {label}
      </span>
    </>
  )
}

/** ผ่าน Buyer → วันนี้ → Deadline ผลิต/ส่งคลัง → วางขาย, with the lead-days footer (§5.7) and the orders arriving late. */
export function DeadlineTimeline({ model }: { model: ProductionModel }) {
  const view = model.view
  if (!view) return null
  const s = view.summary
  const { points, todayPos, riskBand, lateBand } = timelinePoints(view, model.storeWord)
  const alerts = timelineAlerts(points)
  // One small line per order whose "ของถึงประมาณ" is after its need date (yellow) or the launch (red).
  const arrivals = orderArrivalAlerts(model.orders, model.rowById, model.targetDate)
  // Bands are drawn only when they mean something, labelled on the bar: red = past the deadline (wins), yellow = the
  // risk window while something sits in it.
  const band = !lateBand && alerts.warning.length > 0 ? riskBand : null
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

      {(alerts.danger.length > 0 || alerts.warning.length > 0 || arrivals.length > 0) && (
        <div className="mt-4 space-y-2">
          {alerts.danger.length > 0 && <TimelineAlert tone="danger" title="Timeline เกินกำหนด" lines={alerts.danger} />}
          {alerts.warning.length > 0 && <TimelineAlert tone="warning" title="Timeline ใกล้วันวางขายเกินไป — มีความเสี่ยง" lines={alerts.warning} />}
          {arrivals.length > 0 && (
            <ul className="space-y-1" aria-label="ใบสั่งผลิตที่ของถึงช้า">
              {arrivals.map((a) => (
                <li key={a.text} className={cn('flex items-start gap-1.5 text-xs font-medium', FLAG_TEXT[a.tone])}>
                  {a.tone === 'danger' ? <CircleAlertIcon className="mt-px size-3.5 shrink-0" aria-hidden /> : <TriangleAlertIcon className="mt-px size-3.5 shrink-0" aria-hidden />}
                  <span className="tabular min-w-0 break-words">{a.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className={cn('relative mx-1.5 h-2 rounded-full bg-muted', band || lateBand ? 'mt-8' : 'mt-5')} aria-hidden>
        <div className="absolute inset-y-0 left-0 rounded-full bg-primary/25" style={{ width: `${todayPos * 100}%` }} />
        {lateBand && <Band band={lateBand} label={lateBand.text} fill={LATE_BAND} text="tabular text-danger" />}
        {band && (
          <Band
            band={band}
            label={
              <>
                ช่วงเสี่ยง · <span className="tabular">{LAUNCH_RISK_DAYS}</span> วันก่อนวางขาย
              </>
            }
            fill={RISK_BAND}
            text="text-warning-foreground"
          />
        )}
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
              {p.flag && <span className={cn('tabular block text-xs font-medium', FLAG_TEXT[p.flag.tone])}>{p.flag.text}</span>}
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-3 space-y-1 border-t pt-3 text-xs text-muted-foreground">
        <p className="flex flex-wrap items-center gap-x-1">
          <span>
            ตั้ง deadline ไว้ <span className="tabular">{plan.leadDays}</span> วันก่อนวางขาย{plan.isDefault && ' (ค่าเริ่มต้น)'}
            {s.deadline !== s.planDeadline && <> ({formatDate(s.planDeadline)}) · SKU ที่ยืนยันแล้วนับตามวันที่ต้องการสินค้าที่เลือกตอนยืนยัน</>}
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

function TimelineAlert({ tone, title, lines }: { tone: 'danger' | 'warning'; title: string; lines: string[] }) {
  return (
    <Callout tone={tone} icon={tone === 'danger' ? <CircleAlertIcon /> : <TriangleAlertIcon />} title={title}>
      {lines.length === 1 ? (
        lines[0]
      ) : (
        <ul className="list-disc space-y-0.5 pl-4">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </Callout>
  )
}
