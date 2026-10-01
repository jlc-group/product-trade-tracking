import { CHANNEL_TERMS, diffDays, earliestOnTimeLaunch, LAUNCH_DAY_OF_MONTH, PREP_DAYS, prepStartOf, type Channel, type ISODate, type Store, type TaskTemplate } from '@flowtrade/shared'
import { AlertTriangleIcon, CircleCheckIcon, FlagIcon, ListTreeIcon, PlayIcon, UsersRoundIcon } from 'lucide-react'
import type { Dispatch } from 'react'
import { LaunchMonthPicker } from '@/components/common/launch-month-picker'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate, relativeDay, today } from '@/lib/format'
import { Callout } from './choice-card'
import { departmentCounts } from './department'
import type { PlanAction, PlanRow } from './plan-state'
import { TimelineEditor } from './timeline-editor'

export function StepDate({
  channel,
  value,
  onChange,
  template,
  templateLoading,
  stores,
  rows,
  planEdited,
  dispatchPlan,
  onResetPlan,
}: {
  channel: Channel
  value: ISODate | null
  onChange: (date: ISODate | null) => void
  /** The template that will be used (suggested or picked); null = none. */
  template: TaskTemplate | null
  templateLoading: boolean
  stores: Store[]
  /** The editable plan resolved against `value` (empty until a month is picked). */
  rows: PlanRow[]
  planEdited: boolean
  dispatchPlan: Dispatch<PlanAction>
  onResetPlan: (() => void) | null
}) {
  const now = today()
  const terms = CHANNEL_TERMS[channel]

  return (
    <div className="space-y-5">
      <div className="grid items-start gap-5 @4xl:grid-cols-[minmax(0,1fr)_17rem]">
        <LaunchMonthPicker value={value} onChange={onChange} today={now} storeIds={stores.map((s) => s.id)} />

        <div className="space-y-4">
          <LaunchSummary value={value} today={now} label={terms.date} />
          <PlanNote value={value} template={template} loading={templateLoading} rows={rows} />
        </div>
      </div>

      {value ? (
        <TimelineEditor
          rows={rows}
          targetDate={value}
          today={now}
          dispatch={dispatchPlan}
          templateName={template?.name ?? null}
          edited={planEdited}
          onReset={onResetPlan}
          dateLabel={terms.date}
        />
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-dashed bg-card/60 px-4 py-6 text-sm text-muted-foreground">
          <ListTreeIcon className="size-5 shrink-0" />
          เลือกเดือนวางขายก่อน แล้วไทม์ไลน์งานทุกข้อพร้อมแผนกที่รับผิดชอบจะแสดงที่นี่ — ปรับวัน แผนก หรือพิมพ์เพิ่มงานของคุณเองได้
        </div>
      )}
    </div>
  )
}

/** Launch date + the preparation start back-tracked PREP_DAYS from it. */
function LaunchSummary({ value, today, label }: { value: ISODate | null; today: ISODate; label: string }) {
  if (!value) {
    return (
      <div className="rounded-xl border border-dashed bg-card/60 p-4" aria-live="polite">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          ยังไม่ได้เลือกเดือน — แตะเดือนในตาราง ระบบจะตั้งเป็นวันที่ {LAUNCH_DAY_OF_MONTH} และนับย้อนหลัง {PREP_DAYS} วันให้ว่าต้องเริ่มเตรียมงานวันไหน
        </p>
      </div>
    )
  }

  const prep = prepStartOf(value)
  const untilPrep = diffDays(today, prep)
  const left = diffDays(today, value)
  const short = untilPrep < 0

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4" aria-live="polite">
      <ol className="relative">
        {/* connector */}
        <span className="absolute top-4 bottom-4 left-[0.6875rem] w-0.5 rounded bg-linear-to-b from-brand/50 to-success/60" aria-hidden />
        <li className="relative flex gap-3">
          <span className="z-[1] mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand ring-4 ring-card">
            <PlayIcon className="size-3" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">เริ่มเตรียมงาน</p>
            <p className="font-semibold">{formatDate(prep, { long: true })}</p>
            <p className="tabular text-xs text-muted-foreground">
              {short ? `เลยมาแล้ว ${-untilPrep} วัน` : untilPrep === 0 ? 'วันนี้' : `อีก ${untilPrep} วัน`}
            </p>
          </div>
        </li>
        <li className="relative flex gap-3 py-2.5" aria-hidden>
          <span className="size-6 shrink-0" />
          <span className="tabular rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">นับย้อนหลัง {PREP_DAYS} วันจากวันวางขาย</span>
        </li>
        <li className="relative flex gap-3">
          <span className="z-[1] mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground ring-4 ring-card">
            <FlagIcon className="size-3" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="text-lg leading-tight font-semibold">{formatDate(value, { long: true })}</p>
            <p className="tabular text-xs text-muted-foreground">{relativeDay(value)}</p>
          </div>
        </li>
      </ol>

      {short ? (
        <Callout tone="warning" icon={<AlertTriangleIcon />} title={`เหลือเวลาเตรียม ${left} วัน`}>
          งานที่ควรเริ่มก่อนหน้าจะเริ่มวันนี้ — ถ้าต้องการเวลาเตรียมครบ {PREP_DAYS} วัน เลือกเดือนที่วางขาย {formatDate(earliestOnTimeLaunch(today), { long: true })} หรือหลังจากนั้น
        </Callout>
      ) : (
        <p className="flex items-start gap-1.5 text-xs text-success">
          <CircleCheckIcon className="mt-px size-3.5 shrink-0" />
          <span className="tabular">{untilPrep === 0 ? `เริ่มเตรียมวันนี้ — มีเวลาเตรียมครบ ${PREP_DAYS} วันพอดี` : `มีเวลาเตรียมครบ ${PREP_DAYS} วัน · อีก ${untilPrep} วันถึงวันเริ่มเตรียม`}</span>
        </p>
      )}
    </div>
  )
}

/** Which plan the system filled in automatically, and how many tasks / departments it has. */
function PlanNote({ value, template, loading, rows }: { value: ISODate | null; template: TaskTemplate | null; loading: boolean; rows: PlanRow[] }) {
  if (loading) return <Skeleton className="h-20 rounded-xl" />
  const included = rows.filter((r) => !r.excluded)
  if (!template && included.length === 0) {
    return (
      <Callout tone="info" icon={<ListTreeIcon />} title="ยังไม่มีแม่แบบงานที่ตรงกับตัวเลือกนี้">
        พิมพ์เพิ่มงานเองในไทม์ไลน์ด้านล่าง หรือเลือกแม่แบบอื่นในขั้นสุดท้าย
      </Callout>
    )
  }

  const source = value ? included.map((r) => r.responsible) : (template?.items ?? []).map((i) => i.responsible)
  const taskCount = value ? included.length : (template?.items.length ?? 0)
  const depts = departmentCounts(source)
  const firstStart = included.map((r) => r.startDate).sort()[0]
  const startsEarly = !!value && !!firstStart && firstStart < prepStartOf(value)

  return (
    <div className="space-y-1.5 rounded-xl border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">งานที่ระบบวางให้อัตโนมัติ</p>
      {template && <p className="line-clamp-2 text-sm font-medium">{template.name}</p>}
      <p className="tabular text-xs text-muted-foreground">
        {taskCount} งาน · {depts.list.length} แผนกรับผิดชอบ
      </p>
      {depts.list.length > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <UsersRoundIcon className="mt-px size-3.5 shrink-0" />
          <span className="tabular">{depts.list.map((d) => `${d.name} ${d.count}`).join(' · ')}</span>
        </p>
      )}
      {startsEarly && (
        <p className="tabular text-xs text-info">
          บางงานในแผนนี้เริ่มก่อนช่วงเตรียม {PREP_DAYS} วัน (งานแรกเริ่ม {formatDate(firstStart, { long: true })})
        </p>
      )}
    </div>
  )
}
