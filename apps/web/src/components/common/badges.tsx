import {
  CHANNEL_SHORT,
  PRIORITY_LABEL,
  STATUS_LABEL,
  type Channel,
  type ProposalStatus,
  type ShelfType,
  type Store,
  type TaskPriority,
} from '@flowtrade/shared'
import { GlobeIcon, StoreIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Colored tile with the store's short name — stands in for a logo. */
export function StoreLogo({ store, size = 'md', className }: { store: Pick<Store, 'shortName' | 'color' | 'name'>; size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }) {
  const sizes = {
    sm: 'h-6 min-w-6 px-1 text-[9px] rounded-md',
    md: 'h-8 min-w-8 px-1.5 text-[10px] rounded-lg',
    lg: 'h-11 min-w-11 px-2 text-xs rounded-xl',
    xl: 'h-14 min-w-14 px-2 text-sm rounded-2xl',
  }
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center font-bold tracking-tight text-white shadow-sm', sizes[size], className)}
      style={{ backgroundColor: store.color }}
      title={store.name}
      aria-hidden
    >
      {store.shortName}
    </span>
  )
}

export function StoreChip({ store, className }: { store: Pick<Store, 'shortName' | 'color' | 'name'>; className?: string }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      <StoreLogo store={store} size="sm" />
      <span className="truncate font-medium">{store.name}</span>
    </span>
  )
}

const STATUS_STYLE: Record<ProposalStatus, string> = {
  DRAFT: 'bg-muted text-muted-foreground border-border',
  IN_PROGRESS: 'bg-brand-soft text-brand border-brand/20',
  ON_HOLD: 'bg-warning-soft text-warning-foreground border-warning/30',
  COMPLETED: 'bg-success-soft text-success border-success/25',
  CANCELLED: 'bg-danger-soft text-danger border-danger/20 line-through decoration-1',
}

const STATUS_DOT: Record<ProposalStatus, string> = {
  DRAFT: 'bg-muted-foreground/60',
  IN_PROGRESS: 'bg-brand',
  ON_HOLD: 'bg-warning',
  COMPLETED: 'bg-success',
  CANCELLED: 'bg-danger',
}

export function StatusBadge({ status, className }: { status: ProposalStatus; className?: string }) {
  return (
    <span className={cn('inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap', STATUS_STYLE[status], className)}>
      <span className={cn('size-1.5 rounded-full', STATUS_DOT[status])} />
      {STATUS_LABEL[status]}
    </span>
  )
}

export function statusDotClass(status: ProposalStatus) {
  return STATUS_DOT[status]
}

export function ShelfTypeBadge({ shelfType, className }: { shelfType: Pick<ShelfType, 'name' | 'color'>; className?: string }) {
  return (
    <span
      className={cn('inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-xs font-medium whitespace-nowrap', className)}
      style={{ color: shelfType.color, borderColor: `${shelfType.color}40`, backgroundColor: `${shelfType.color}12` }}
    >
      <span className="size-1.5 rounded-sm" style={{ backgroundColor: shelfType.color }} />
      {shelfType.name}
    </span>
  )
}

export function ChannelBadge({ channel, className }: { channel: Channel; className?: string }) {
  const Icon = channel === 'OFFLINE' ? StoreIcon : GlobeIcon
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs font-medium',
        channel === 'OFFLINE' ? 'bg-secondary text-secondary-foreground' : 'bg-info-soft text-info',
        className,
      )}
    >
      <Icon className="size-3.5" />
      {CHANNEL_SHORT[channel]}
    </span>
  )
}

const PRIORITY_STYLE: Record<TaskPriority, string> = {
  URGENT: 'text-danger bg-danger-soft',
  HIGH: 'text-warning-foreground bg-warning-soft',
  MEDIUM: 'text-muted-foreground bg-muted',
  LOW: 'text-muted-foreground/80 bg-muted/60',
}

export function PriorityBadge({ priority, className, hideMedium = false }: { priority: TaskPriority; className?: string; hideMedium?: boolean }) {
  if (hideMedium && (priority === 'MEDIUM' || priority === 'LOW')) return null
  return <span className={cn('inline-flex h-5 items-center rounded px-1.5 text-[11px] font-semibold', PRIORITY_STYLE[priority], className)}>{PRIORITY_LABEL[priority]}</span>
}
