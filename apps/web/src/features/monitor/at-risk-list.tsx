import { diffDays, storeNamesLabel } from '@flowtrade/shared'
import { AlertTriangleIcon, ShieldCheckIcon, TimerIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import type { ProposalListItem } from '@/api/types'
import { EmptyState, LaunchCountdown, ProgressBar } from '@/components/common/misc'
import { StoreLogos } from '@/components/common/badges'
import { UserAvatar } from '@/components/common/user-avatar'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { MonitorSection, ShowMoreButton } from './parts'
import { fmt } from './utils'

const LIMIT = 6

function RiskPill({ item, today }: { item: ProposalListItem; today: string }) {
  if (item.overdueCount > 0) {
    return (
      <span className="inline-flex h-6 items-center gap-1 rounded-full bg-danger-soft px-2 text-xs font-medium whitespace-nowrap text-danger">
        <AlertTriangleIcon className="size-3.5" />
        เลยกำหนด {fmt(item.overdueCount)} งาน
      </span>
    )
  }
  const days = diffDays(today, item.targetDate)
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-full bg-warning-soft px-2 text-xs font-medium whitespace-nowrap text-warning-foreground">
      <TimerIcon className="size-3.5" />
      {days <= 0 ? 'ถึงวันวางขายแล้ว' : `อีก ${fmt(days)} วัน`} · เสร็จ {item.progress.percent}%
    </span>
  )
}

function AtRiskRow({ item, today }: { item: ProposalListItem; today: string }) {
  return (
    <li>
      <Link
        to={`/proposals/${item.id}`}
        className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-lg px-2 py-3 outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 @lg:grid-cols-[minmax(0,1fr)_7rem_8.5rem] @lg:gap-x-4 @3xl:grid-cols-[minmax(0,1fr)_7.5rem_9rem_auto]"
      >
        {/* identity */}
        <div className="col-span-2 flex min-w-0 items-center gap-3 @lg:col-span-1">
          <StoreLogos stores={item.stores} size="md" max={2} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium group-hover:text-primary">{item.title}</p>
            <p className="truncate text-xs text-muted-foreground">
              <span className="tabular">{item.code}</span> · {storeNamesLabel(item.stores.map((s) => s.name))}
            </p>
          </div>
          <UserAvatar user={item.owner} size="sm" className="@lg:hidden" />
        </div>

        {/* target date */}
        <div className="flex items-baseline gap-2 pl-11 @lg:block @lg:pl-0">
          <p className="tabular text-xs text-muted-foreground">{formatDate(item.targetDate)}</p>
          <LaunchCountdown targetDate={item.targetDate} />
        </div>

        {/* progress */}
        <div className="col-span-2 row-start-3 pl-11 @lg:col-span-1 @lg:row-start-auto @lg:pl-0">
          <ProgressBar progress={item.progress} />
        </div>

        {/* reason + owner */}
        <div className="col-start-2 row-start-2 flex items-center justify-end gap-2 @lg:col-span-3 @lg:col-start-1 @lg:row-start-auto @lg:justify-start @3xl:col-span-1 @3xl:col-start-auto @3xl:justify-end">
          <RiskPill item={item} today={today} />
          <UserAvatar user={item.owner} size="sm" className="hidden @lg:inline-flex" />
        </div>
      </Link>
    </li>
  )
}

export function AtRiskList({ items, today, className }: { items: ProposalListItem[]; today: string; className?: string }) {
  const [expanded, setExpanded] = useState(false)
  const sorted = useMemo(
    () => [...items].sort((a, b) => b.overdueCount - a.overdueCount || a.targetDate.localeCompare(b.targetDate)),
    [items],
  )
  const shown = expanded ? sorted : sorted.slice(0, LIMIT)
  const withOverdue = items.filter((i) => i.overdueCount > 0).length

  return (
    <MonitorSection
      className={className}
      icon={<AlertTriangleIcon className={cn(items.length > 0 && 'text-danger')} />}
      title={
        <>
          ต้องติดตามด่วน
          {items.length > 0 && <span className="tabular rounded-full bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger">{fmt(items.length)}</span>}
        </>
      }
      description={
        items.length > 0
          ? [
              withOverdue > 0 && `${fmt(withOverdue)} โปรเจกต์มีงานเลยกำหนด`,
              items.length - withOverdue > 0 && `${fmt(items.length - withOverdue)} โปรเจกต์ใกล้วันวางขาย (≤ 14 วัน) แต่คืบหน้าไม่ถึง 70%`,
            ]
              .filter(Boolean)
              .join(' · ')
          : 'โปรเจกต์ที่มีงานเลยกำหนด หรือใกล้วันวางขายแต่ยังคืบหน้าน้อย'
      }
    >
      {items.length === 0 ? (
        <EmptyState
          icon={<ShieldCheckIcon className="size-5 text-success" />}
          title="ไม่มีโปรเจกต์ที่น่ากังวล"
          description="ทุกโปรเจกต์ไม่มีงานเลยกำหนด และโปรเจกต์ที่ใกล้วางขายคืบหน้าตามแผน"
          className="py-10"
        />
      ) : (
        <>
          <ul className="@container -mx-2 divide-y">
            {shown.map((item) => (
              <AtRiskRow key={item.id} item={item} today={today} />
            ))}
          </ul>
          <ShowMoreButton expanded={expanded} hiddenCount={sorted.length - shown.length} total={sorted.length} onToggle={() => setExpanded((v) => !v)} noun="โปรเจกต์" />
        </>
      )}
    </MonitorSection>
  )
}
