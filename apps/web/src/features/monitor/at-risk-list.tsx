import { healthRank, storeNamesLabel } from '@flowtrade/shared'
import { AlertTriangleIcon, ShieldCheckIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import type { DashboardSummary } from '@/api/types'
import { EmptyState, LaunchCountdown, ProgressBar } from '@/components/common/misc'
import { StatusBadge, StoreLogos } from '@/components/common/badges'
import { UserAvatar } from '@/components/common/user-avatar'
import { HealthChip } from '@/features/home/health-chip'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { MonitorSection, ShowMoreButton } from './parts'
import { fmt } from './utils'

const LIMIT = 6

type AtRiskItem = DashboardSummary['atRisk'][number]

function AtRiskRow({ item }: { item: AtRiskItem }) {
  const { health } = item
  return (
    <li>
      <Link
        to={`/proposals/${item.id}`}
        className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-lg px-2 py-3 outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 @lg:grid-cols-[minmax(0,1fr)_7rem_8.5rem_auto] @lg:gap-x-4"
      >
        {/* identity + reason */}
        <div className="col-span-2 flex min-w-0 items-start gap-3 @lg:col-span-1">
          <StoreLogos stores={item.stores} size="md" max={2} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-sm font-medium group-hover:text-primary">{item.title}</p>
              <HealthChip health={health} />
              {item.status === 'COMPLETED' && <StatusBadge status={item.status} className="h-5 shrink-0 px-2 text-[11px]" />}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              <span className="tabular">{item.code}</span> · {storeNamesLabel(item.stores.map((s) => s.name))}
            </p>
            <p className={cn('mt-0.5 text-xs font-medium', health.level === 'LATE' ? 'text-danger' : 'text-warning-foreground')}>{health.reason}</p>
          </div>
          <UserAvatar user={item.owner} size="sm" className="@lg:hidden" />
        </div>

        {/* target date */}
        <div className="flex items-baseline gap-2 pl-11 @lg:block @lg:pl-0">
          <p className="tabular text-xs text-muted-foreground">{formatDate(item.targetDate)}</p>
          <LaunchCountdown targetDate={item.targetDate} open={health.level === 'LATE'} />
        </div>

        {/* prep progress */}
        <ProgressBar progress={item.progress} className="w-32 @lg:w-auto" />

        <UserAvatar user={item.owner} size="sm" className="hidden @lg:inline-flex" />
      </Link>
    </li>
  )
}

/** IN_PROGRESS proposals (and COMPLETED ones with a production alarm) with a proposalHealth() chip: LATE first, then by launch date. */
export function AtRiskList({ items, className }: { items: AtRiskItem[]; className?: string }) {
  const [expanded, setExpanded] = useState(false)
  const sorted = useMemo(() => [...items].sort((a, b) => healthRank(a.health) - healthRank(b.health) || a.targetDate.localeCompare(b.targetDate)), [items])
  const shown = expanded ? sorted : sorted.slice(0, LIMIT)
  const late = items.filter((i) => i.health.level === 'LATE').length
  const atRisk = items.filter((i) => i.health.level === 'AT_RISK').length

  return (
    <MonitorSection
      id="at-risk"
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
          ? [late > 0 && `ล่าช้า ${fmt(late)} โปรเจกต์ (เลยวันวางขายแล้วยังไม่ได้ผลจาก Buyer)`, atRisk > 0 && `เสี่ยง ${fmt(atRisk)} โปรเจกต์`].filter(Boolean).join(' · ')
          : 'โปรเจกต์ที่กำลังดำเนินการซึ่งเลยวันวางขายแล้วยังไม่ได้ผล หรือมีเรื่องเลยกำหนด หรือใกล้วันวางขายแต่ยังไม่ได้นำเสนอ/ยังรอผล'
      }
    >
      {items.length === 0 ? (
        <EmptyState
          icon={<ShieldCheckIcon className="size-5 text-success" />}
          title="ไม่มีโปรเจกต์ที่น่ากังวล"
          description="ทุกโปรเจกต์ที่กำลังดำเนินการไม่มีงานหรือเรื่อง Buyer เลยกำหนด และได้นำเสนอทันวันวางขาย"
          className="py-10"
        />
      ) : (
        <>
          <ul className="@container -mx-2 divide-y">
            {shown.map((item) => (
              <AtRiskRow key={item.id} item={item} />
            ))}
          </ul>
          <ShowMoreButton expanded={expanded} hiddenCount={sorted.length - shown.length} total={sorted.length} onToggle={() => setExpanded((v) => !v)} noun="โปรเจกต์" />
        </>
      )}
    </MonitorSection>
  )
}
