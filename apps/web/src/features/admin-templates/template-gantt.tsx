import { addDays, templateLeadDays, type ISODate } from '@flowtrade/shared'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { childrenMap, offsetLabel, type Items } from './tree-ops'

const STEPS = [7, 14, 15, 30, 60, 90, 180]

function ticksFor(min: number, max: number) {
  const step = STEPS.find((s) => (max - min) / s <= 6) ?? 365
  const ticks: number[] = []
  for (let t = Math.ceil(min / step) * step; t <= max; t += step) ticks.push(t)
  if (!ticks.includes(0)) ticks.push(0)
  return ticks.sort((a, b) => a - b)
}

/** Mini Gantt of the top-level items on a D-day axis, with the launch day (D0) marked. */
export function TemplateGantt({ items, exampleLaunch }: { items: Items; /** Shows offsets as real dates for this launch. */ exampleLaunch?: ISODate }) {
  const map = childrenMap(items)
  const roots = map.get(null) ?? []
  if (roots.length === 0) {
    return <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">เพิ่ม Task แล้วไทม์ไลน์จะแสดงที่นี่</p>
  }

  const valid = items.filter((i) => Number.isFinite(i.startOffsetDays) && Number.isFinite(i.dueOffsetDays))
  const min = Math.min(0, ...valid.map((i) => i.startOffsetDays))
  const max = Math.max(0, ...valid.map((i) => Math.max(i.dueOffsetDays, i.startOffsetDays)))
  const span = max - min + 1
  const pos = (d: number) => ((d - min) / span) * 100
  const zero = pos(0) + 50 / span
  const ticks = ticksFor(min, max)
  const lead = templateLeadDays(items)
  const after = Math.max(0, max)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="tabular rounded-md bg-brand-soft px-2 py-1 text-brand">
          เริ่มงานล่วงหน้า <strong className="font-semibold">{lead}</strong> วันก่อนวางขาย
        </span>
        {exampleLaunch && (
          <span className="tabular rounded-md bg-muted px-2 py-1 text-muted-foreground">
            เช่น วางขาย {formatDate(exampleLaunch)} → เริ่มงานแรก <strong className="font-semibold text-foreground">{formatDate(addDays(exampleLaunch, -lead))}</strong>
          </span>
        )}
        {after > 0 && (
          <span className="tabular rounded-md bg-success-soft px-2 py-1 text-success">
            ติดตามต่อหลังวางขาย <strong className="font-semibold">{after}</strong> วัน
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]" role="img" aria-label={`ไทม์ไลน์แม่แบบ ${roots.length} Task ตั้งแต่ ${offsetLabel(min)} ถึง ${offsetLabel(max)}`}>
        {/* axis */}
        <div className="hidden sm:block" />
        <div className="relative mb-1 h-6 text-[10px] text-muted-foreground">
          {ticks.map((t) => {
            const left = pos(t) + 50 / span
            const align = left < 6 ? 'translate-x-0' : left > 94 ? '-translate-x-full' : '-translate-x-1/2'
            return t === 0 ? (
              <span key={t} className={cn('tabular absolute top-0 rounded bg-danger-soft px-1.5 py-0.5 font-semibold whitespace-nowrap text-danger', align)} style={{ left: `${left}%` }}>
                วันวางขาย (D0)
              </span>
            ) : (
              <span key={t} className={cn('tabular absolute top-1 whitespace-nowrap', align)} style={{ left: `${left}%` }}>
                {offsetLabel(t)}
              </span>
            )
          })}
        </div>

        {roots.map((r) => {
          const start = Math.min(r.startOffsetDays, r.dueOffsetDays)
          const due = Math.max(r.startOffsetDays, r.dueOffsetDays)
          const days = due - start + 1
          const subCount = map.get(r.id)?.length ?? 0
          const afterLaunch = start >= 0
          return (
            <div key={r.id} className="contents">
              <div className="min-w-0 pt-2 text-xs sm:py-1.5">
                <span className="block truncate font-medium" title={r.title}>
                  {r.title || 'ยังไม่มีชื่อ'}
                </span>
                <span className="tabular block text-[11px] text-muted-foreground sm:hidden">
                  {offsetLabel(start)} → {offsetLabel(due)} · {days} วัน
                  {exampleLaunch && ` · ${formatDate(addDays(exampleLaunch, start), { withYear: false })} – ${formatDate(addDays(exampleLaunch, due), { withYear: false })}`}
                </span>
              </div>
              <div className="relative h-7 bg-muted/40">
                {ticks.map((t) =>
                  t === 0 ? null : <div key={t} className="absolute inset-y-0 w-px bg-border" style={{ left: `${pos(t) + 50 / span}%` }} aria-hidden />,
                )}
                <div className="absolute inset-y-0 w-px bg-danger/70" style={{ left: `${zero}%` }} aria-hidden />
                <div
                  className={cn('absolute top-1.5 bottom-1.5 min-w-1.5 rounded', afterLaunch ? 'bg-success' : 'bg-primary')}
                  style={{ left: `${pos(start)}%`, width: `${(days / span) * 100}%` }}
                  title={`${r.title || 'ยังไม่มีชื่อ'}: ${offsetLabel(start)} → ${offsetLabel(due)} (${days} วัน${subCount ? ` · ${subCount} งานย่อย` : ''})${exampleLaunch ? ` — เช่น ${formatDate(addDays(exampleLaunch, start))} ถึง ${formatDate(addDays(exampleLaunch, due))}` : ''}`}
                />
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-sm bg-primary" /> ก่อนวางขาย
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-sm bg-success" /> หลังวางขาย
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-px bg-danger" /> วันวางขาย
        </span>
        <span>แสดงเฉพาะ Task หลัก — วางเมาส์บนแถบเพื่อดูช่วงวัน</span>
      </div>
    </div>
  )
}
