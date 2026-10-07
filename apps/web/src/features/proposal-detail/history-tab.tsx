import {
  ArrowUpDownIcon,
  CalendarClockIcon,
  CheckIcon,
  CopyIcon,
  FactoryIcon,
  FlagIcon,
  HistoryIcon,
  PackageCheckIcon,
  PackageXIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  RotateCwIcon,
  SparklesIcon,
  Trash2Icon,
  TruckIcon,
  Undo2Icon,
  type LucideIcon,
} from 'lucide-react'
import type { ActivityWithActor } from '@/api'
import { useActivity } from '@/api/hooks'
import { EmptyState } from '@/components/common/misc'
import { UserAvatar } from '@/components/common/user-avatar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { dayjs, formatDate, formatDateTime, fromNow } from '@/lib/format'
import { cn } from '@/lib/utils'

const LIMIT = 100

const ACTION_STYLE: Record<string, { icon: LucideIcon; tone: string }> = {
  'proposal.create': { icon: SparklesIcon, tone: 'bg-brand-soft text-brand' },
  'proposal.duplicate': { icon: CopyIcon, tone: 'bg-brand-soft text-brand' },
  'proposal.status': { icon: FlagIcon, tone: 'bg-info-soft text-info' },
  'proposal.targetDate': { icon: CalendarClockIcon, tone: 'bg-warning-soft text-warning-foreground' },
  'proposal.update': { icon: PencilIcon, tone: 'bg-muted text-muted-foreground' },
  'task.complete': { icon: CheckIcon, tone: 'bg-success-soft text-success' },
  'task.reopen': { icon: RotateCcwIcon, tone: 'bg-muted text-muted-foreground' },
  'task.create': { icon: PlusIcon, tone: 'bg-muted text-foreground' },
  'task.duplicate': { icon: CopyIcon, tone: 'bg-muted text-foreground' },
  'task.move': { icon: ArrowUpDownIcon, tone: 'bg-muted text-muted-foreground' },
  'task.update': { icon: PencilIcon, tone: 'bg-muted text-muted-foreground' },
  'task.delete': { icon: Trash2Icon, tone: 'bg-danger-soft text-danger' },
  'production.confirm': { icon: FactoryIcon, tone: 'bg-brand-soft text-brand' },
  'production.produced': { icon: PackageCheckIcon, tone: 'bg-success-soft text-success' },
  'production.delivered': { icon: TruckIcon, tone: 'bg-success-soft text-success' },
  'production.quantity': { icon: PencilIcon, tone: 'bg-muted text-muted-foreground' },
  'production.plan': { icon: CalendarClockIcon, tone: 'bg-warning-soft text-warning-foreground' },
  'production.back': { icon: Undo2Icon, tone: 'bg-muted text-muted-foreground' },
  'production.dates': { icon: CalendarClockIcon, tone: 'bg-muted text-muted-foreground' },
  'production.cancel': { icon: PackageXIcon, tone: 'bg-danger-soft text-danger' },
  'production.skip': { icon: PackageXIcon, tone: 'bg-muted text-muted-foreground' },
  'production.restore': { icon: RotateCcwIcon, tone: 'bg-muted text-muted-foreground' },
  'production.keep': { icon: FactoryIcon, tone: 'bg-warning-soft text-warning-foreground' },
}
const FALLBACK_STYLE = { icon: PencilIcon, tone: 'bg-muted text-muted-foreground' }

/** Summaries may embed raw YYYY-MM-DD dates — show them the way the rest of the app does. */
function prettify(summary: string) {
  return summary.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (d) => formatDate(d))
}

function dayLabel(key: string) {
  const now = dayjs()
  if (key === now.format('YYYY-MM-DD')) return 'วันนี้'
  if (key === now.subtract(1, 'day').format('YYYY-MM-DD')) return 'เมื่อวาน'
  return formatDate(key, { long: true })
}

function groupByDay(items: ActivityWithActor[]) {
  const groups: { key: string; items: ActivityWithActor[] }[] = []
  for (const item of items) {
    const key = dayjs(item.createdAt).format('YYYY-MM-DD')
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.items.push(item)
    else groups.push({ key, items: [item] })
  }
  return groups
}

export function HistoryTab({ proposalId }: { proposalId: string }) {
  const { data, isPending, isError, refetch } = useActivity(proposalId, LIMIT)

  if (isPending) return <HistorySkeleton />
  if (isError)
    return (
      <EmptyState
        title="โหลดประวัติไม่สำเร็จ"
        description="ตรวจการเชื่อมต่อแล้วลองอีกครั้ง"
        action={
          <Button variant="outline" onClick={() => refetch()}>
            <RotateCwIcon /> ลองอีกครั้ง
          </Button>
        }
      />
    )
  if (data.length === 0)
    return <EmptyState icon={<HistoryIcon className="size-5" />} title="ยังไม่มีประวัติ" description="ทุกการเปลี่ยนแปลง เช่น ติ๊กงานเสร็จ เลื่อนวัน หรือเปลี่ยนสถานะ จะถูกบันทึกไว้ที่นี่" />

  const groups = groupByDay(data)

  return (
    <div className="space-y-6 rounded-xl border bg-card p-4 sm:p-6">
      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`history-${group.key}`}>
          <h3 id={`history-${group.key}`} className="mb-3 text-xs font-medium text-muted-foreground">
            {dayLabel(group.key)}
          </h3>
          <ol>
            {group.items.map((item, i) => {
              const style = ACTION_STYLE[item.action] ?? FALLBACK_STYLE
              const Icon = style.icon
              const isLast = i === group.items.length - 1
              return (
                <li key={item.id} className={cn('relative flex gap-3', !isLast && 'pb-5')}>
                  {!isLast && <span className="absolute top-9 bottom-1 left-4 w-px -translate-x-1/2 bg-border" aria-hidden />}
                  <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', style.tone)} aria-hidden>
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <UserAvatar user={item.actor} size="xs" />
                      <span className="text-sm font-medium">{item.actor.name}</span>
                      <time dateTime={item.createdAt} title={formatDateTime(item.createdAt)} className="text-xs text-muted-foreground">
                        {fromNow(item.createdAt)} · <span className="tabular">{dayjs(item.createdAt).format('HH:mm')}</span>
                      </time>
                    </div>
                    <p className="mt-1 text-sm break-words text-muted-foreground">{prettify(item.summary)}</p>
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      ))}
      {data.length >= LIMIT && <p className="text-center text-xs text-muted-foreground">แสดง {LIMIT} รายการล่าสุด</p>}
    </div>
  )
}

function HistorySkeleton() {
  return (
    <div className="space-y-5 rounded-xl border bg-card p-4 sm:p-6" aria-busy="true" aria-label="กำลังโหลดประวัติ">
      <Skeleton className="h-3 w-20" />
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2 pt-1">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  )
}
