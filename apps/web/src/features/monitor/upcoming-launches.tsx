import { CalendarRangeIcon, RocketIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import type { ProposalListItem } from '@/api/types'
import { StatusBadge, StoreLogo } from '@/components/common/badges'
import { EmptyState, LaunchCountdown, ProgressRing } from '@/components/common/misc'
import { Button } from '@/components/ui/button'
import { dayjs, formatDate } from '@/lib/format'
import { usePrefs } from '@/lib/prefs'
import { cn } from '@/lib/utils'
import { MonitorSection, ShowMoreButton } from './parts'
import { fmt } from './utils'

const LIMIT = 8

function LaunchRow({ item }: { item: ProposalListItem }) {
  const d = dayjs(item.targetDate)
  return (
    <li>
      <Link
        to={`/proposals/${item.id}`}
        className="group flex items-center gap-3 rounded-lg px-2 py-2 outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="sr-only">{formatDate(item.targetDate, { long: true })}</span>
        <span className="flex w-10 shrink-0 flex-col items-center rounded-lg border bg-background py-1 leading-none" aria-hidden>
          <span className="text-[10px] text-muted-foreground">{d.format('dd')}</span>
          <span className="tabular mt-0.5 text-base font-semibold">{d.format('D')}</span>
        </span>
        <StoreLogo store={item.store} size="sm" className="hidden @sm:inline-flex" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium group-hover:text-primary">{item.title}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span className="truncate">
              {item.store.name} · <span className="tabular">{item.code}</span>
            </span>
            {item.overdueCount > 0 && <span className="shrink-0 font-medium text-danger">· เลยกำหนด {fmt(item.overdueCount)}</span>}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <LaunchCountdown targetDate={item.targetDate} />
          {item.status !== 'IN_PROGRESS' && <StatusBadge status={item.status} className="h-5 px-2 text-[11px]" />}
        </span>
        <ProgressRing progress={item.progress} size={34} stroke={4} className="shrink-0 [&>span]:text-[9px]" />
      </Link>
    </li>
  )
}

export function UpcomingLaunches({ items, className }: { items: ProposalListItem[]; className?: string }) {
  const { buddhistEra } = usePrefs()
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? items : items.slice(0, LIMIT)

  // Group by month so the list reads like a timeline.
  const groups = useMemo(() => {
    const out: { key: string; label: string; items: ProposalListItem[] }[] = []
    for (const item of shown) {
      const key = item.targetDate.slice(0, 7)
      let g = out[out.length - 1]
      if (!g || g.key !== key) {
        g = { key, label: dayjs(item.targetDate).format(buddhistEra ? 'MMMM BBBB' : 'MMMM YYYY'), items: [] }
        out.push(g)
      }
      g.items.push(item)
    }
    return out
  }, [shown, buddhistEra])

  return (
    <MonitorSection
      id="upcoming-launches"
      className={className}
      icon={<CalendarRangeIcon />}
      title="วางขายใน 45 วันข้างหน้า"
      description={items.length > 0 ? `${fmt(items.length)} โปรเจกต์ เรียงตามวันที่วางขาย — วงกลมคือความคืบหน้าของงาน` : 'โปรเจกต์ที่กำลังดำเนินการและมีวันวางขายภายใน 45 วัน'}
    >
      {items.length === 0 ? (
        <EmptyState
          icon={<RocketIcon className="size-5" />}
          title="ยังไม่มีโปรเจกต์ที่จะวางขายเร็ว ๆ นี้"
          description="เมื่อมีโปรเจกต์ที่วันวางขายอยู่ภายใน 45 วัน จะแสดงที่นี่ให้เตรียมตัวล่วงหน้า"
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/proposals">ดูการเสนอสินค้าทั้งหมด</Link>
            </Button>
          }
          className="py-10"
        />
      ) : (
        <div className="@container">
          {groups.map((g, i) => (
            <div key={g.key} className={cn(i > 0 && 'mt-2')}>
              <p className="pb-1 text-xs font-medium text-muted-foreground">{g.label}</p>
              <ul className="-mx-2 space-y-0.5">
                {g.items.map((item) => (
                  <LaunchRow key={item.id} item={item} />
                ))}
              </ul>
            </div>
          ))}
          <ShowMoreButton expanded={expanded} hiddenCount={items.length - shown.length} total={items.length} onToggle={() => setExpanded((v) => !v)} noun="โปรเจกต์" />
        </div>
      )}
    </MonitorSection>
  )
}
