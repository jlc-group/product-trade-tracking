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

type LogoSize = 'sm' | 'md' | 'lg' | 'xl'
type StoreLook = Pick<Store, 'id' | 'shortName' | 'color' | 'name'>

const LOGO_SIZE: Record<LogoSize, string> = {
  sm: 'h-6 min-w-6 px-1 text-[9px] rounded-md',
  md: 'h-8 min-w-8 px-1.5 text-[10px] rounded-lg',
  lg: 'h-11 min-w-11 px-2 text-xs rounded-xl',
  xl: 'h-14 min-w-14 px-2 text-sm rounded-2xl',
}

/** Colored tile with the store's short name — stands in for a logo. */
export function StoreLogo({ store, size = 'md', className }: { store: Pick<Store, 'shortName' | 'color' | 'name'>; size?: LogoSize; className?: string }) {
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center font-bold tracking-tight text-white shadow-sm', LOGO_SIZE[size], className)}
      style={{ backgroundColor: store.color }}
      title={store.name}
      aria-hidden
    >
      {store.shortName}
    </span>
  )
}

/** A proposal's stores as overlapping logo tiles: up to `max` tiles, the last one "+N" when there are more. */
export function StoreLogos({
  stores,
  size = 'md',
  max = 3,
  className,
  logoClassName,
}: {
  stores: StoreLook[]
  size?: LogoSize
  max?: number
  className?: string
  /** Applied to every tile (e.g. to shrink them below the `sm` size). */
  logoClassName?: string
}) {
  const shown = stores.length > max ? stores.slice(0, max - 1) : stores
  const rest = stores.length - shown.length
  return (
    <span className={cn('inline-flex shrink-0 items-center -space-x-1.5', className)} title={stores.map((s) => s.name).join(', ')} aria-hidden>
      {shown.map((s) => (
        <StoreLogo key={s.id} store={s} size={size} className={cn('ring-2 ring-background', logoClassName)} />
      ))}
      {rest > 0 && (
        <span className={cn('inline-flex shrink-0 items-center justify-center bg-muted font-bold tabular text-muted-foreground ring-2 ring-background', LOGO_SIZE[size], logoClassName)}>
          +{rest}
        </span>
      )}
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

/** One store: logo + name. Several: every store's logo tile (names on hover / for screen readers). */
export function StoresChip({ stores, className }: { stores: StoreLook[]; className?: string }) {
  if (stores.length === 1) return <StoreChip store={stores[0]} className={className} />
  return (
    <span className={cn('flex min-w-0 flex-wrap items-center gap-1', className)}>
      {stores.map((s) => (
        <StoreLogo key={s.id} store={s} size="sm" />
      ))}
      <span className="sr-only">{stores.map((s) => s.name).join(', ')}</span>
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
