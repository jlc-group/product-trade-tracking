import { addDays, todayBangkok, type EntityType, type ISODate } from '@flowtrade/shared'
import { ArrowUpRightIcon, Building2Icon, LayersIcon, ListChecksIcon, ListTreeIcon, PackageIcon, ShoppingBagIcon, StoreIcon, UsersIcon, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import type { ActivityWithActor, ProposalListItem } from '@/api'
import { StoreLogo } from '@/components/common/badges'
import { UserAvatar } from '@/components/common/user-avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { dayjs, formatDate, formatDateTime, today } from '@/lib/format'
import { cn } from '@/lib/utils'

export const ENTITY_META: Record<EntityType, { label: string; icon: LucideIcon }> = {
  PROPOSAL: { label: 'โปรเจกต์', icon: ShoppingBagIcon },
  TASK: { label: 'งาน', icon: ListChecksIcon },
  STORE: { label: 'ห้าง', icon: StoreIcon },
  SHELF_TYPE: { label: 'Shelf', icon: LayersIcon },
  DEPARTMENT: { label: 'แผนก', icon: Building2Icon },
  PRODUCT: { label: 'สินค้า', icon: PackageIcon },
  USER: { label: 'ผู้ใช้', icon: UsersIcon },
  TEMPLATE: { label: 'แม่แบบ', icon: ListTreeIcon },
}

export const ENTITY_ORDER: EntityType[] = ['PROPOSAL', 'TASK', 'STORE', 'SHELF_TYPE', 'PRODUCT', 'USER', 'DEPARTMENT', 'TEMPLATE']

/** Business date (Asia/Bangkok) of a timestamp. */
export const activityDay = (createdAt: string): ISODate => todayBangkok(new Date(createdAt))

function dayLabel(day: ISODate) {
  const t = today()
  const full = `วัน${dayjs(day).format('dddd')}ที่ ${formatDate(day, { long: true })}`
  if (day === t) return { title: 'วันนี้', sub: full }
  if (day === addDays(t, -1)) return { title: 'เมื่อวาน', sub: full }
  return { title: full, sub: null }
}

type Tone = 'create' | 'delete' | 'done' | 'neutral'

function toneOf(action: string): Tone {
  if (/\.(create|duplicate|activate)$/.test(action)) return 'create'
  if (/\.(delete|deactivate)$/.test(action)) return 'delete'
  if (/\.(complete|toggle|done)$/.test(action)) return 'done'
  return 'neutral'
}

const TONE_CLASS: Record<Tone, string> = {
  create: 'bg-success-soft text-success',
  delete: 'bg-danger-soft text-danger',
  done: 'bg-brand-soft text-brand',
  neutral: 'bg-muted text-muted-foreground',
}

function ActivityRow({ item, proposal, proposalsReady }: { item: ActivityWithActor; proposal: ProposalListItem | undefined; proposalsReady: boolean }) {
  const meta = ENTITY_META[item.entityType]
  const tone = toneOf(item.action)
  const taskLink = item.entityType === 'TASK' && !item.action.endsWith('.delete') ? `?task=${item.entityId}` : ''
  return (
    <li className="flex gap-3 border-b py-3 last:border-0">
      <UserAvatar user={item.actor} size="md" />
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-relaxed">
          <span className="font-medium">{item.actor.name}</span> <span className="text-foreground/85">{item.summary}</span>
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className={cn('inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium', TONE_CLASS[tone])}>
            <meta.icon className="size-3" aria-hidden />
            {meta.label}
          </span>
          {item.proposalId &&
            (proposal ? (
              <Link
                to={`/proposals/${proposal.id}${taskLink}`}
                className="inline-flex min-w-0 items-center gap-1.5 rounded-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <StoreLogo store={proposal.store} size="sm" className="h-4 min-w-4 rounded px-0.5 text-[8px]" />
                <span className="truncate">
                  {proposal.code} · {proposal.title}
                </span>
                <ArrowUpRightIcon className="size-3 shrink-0" aria-hidden />
              </Link>
            ) : proposalsReady ? (
              <span className="italic">โปรเจกต์นี้ถูกลบแล้ว</span>
            ) : (
              <Link to={`/proposals/${item.proposalId}${taskLink}`} className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline">
                ดูโปรเจกต์ <ArrowUpRightIcon className="size-3" aria-hidden />
              </Link>
            ))}
        </div>
      </div>
      <time dateTime={item.createdAt} title={formatDateTime(item.createdAt)} className="tabular shrink-0 pt-0.5 text-xs text-muted-foreground">
        {dayjs(item.createdAt).format('HH:mm')}
      </time>
    </li>
  )
}

export interface DayGroup {
  day: ISODate
  items: ActivityWithActor[]
}

export function groupByDay(items: ActivityWithActor[]): DayGroup[] {
  const groups: DayGroup[] = []
  for (const item of items) {
    const day = activityDay(item.createdAt)
    const last = groups[groups.length - 1]
    if (last && last.day === day) last.items.push(item)
    else groups.push({ day, items: [item] })
  }
  return groups
}

export function ActivityFeed({ groups, proposalsById, proposalsReady }: { groups: DayGroup[]; proposalsById: Map<string, ProposalListItem>; proposalsReady: boolean }) {
  return (
    <div className="space-y-6">
      {groups.map((g) => {
        const label = dayLabel(g.day)
        return (
          <section key={g.day} aria-labelledby={`day-${g.day}`}>
            <header className="sticky top-14 z-[2] -mx-1 flex items-baseline gap-2 bg-background/95 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
              <h2 id={`day-${g.day}`} className="text-sm font-semibold">
                {label.title}
              </h2>
              {label.sub && <span className="text-xs text-muted-foreground">{label.sub}</span>}
              <span className="tabular ml-auto text-xs text-muted-foreground">{g.items.length} รายการ</span>
            </header>
            <ol className="rounded-xl border bg-card px-3 sm:px-4">
              {g.items.map((item) => (
                <ActivityRow key={item.id} item={item} proposal={item.proposalId ? proposalsById.get(item.proposalId) : undefined} proposalsReady={proposalsReady} />
              ))}
            </ol>
          </section>
        )
      })}
    </div>
  )
}

export function ActivitySkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      {[5, 3].map((n, k) => (
        <div key={k} className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <div className="rounded-xl border bg-card px-4">
            {Array.from({ length: n }, (_, i) => (
              <div key={i} className="flex gap-3 border-b py-3 last:border-0">
                <Skeleton className="size-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-4/5" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
                <Skeleton className="h-3 w-10" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
