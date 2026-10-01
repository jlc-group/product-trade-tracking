import { Link } from 'react-router'
import type { ProposalListItem } from '@/api/types'
import { ShelfTypeBadge, StatusBadge, StoreLogo } from '@/components/common/badges'
import { ProgressBar, ProgressRing } from '@/components/common/misc'
import { AvatarStack } from '@/components/common/user-avatar'
import { cn } from '@/lib/utils'
import { OverduePill, ProductChips, TargetDate, proposalHref, useTeamResolver } from './bits'

const cardLink =
  'group relative block rounded-xl border bg-card text-card-foreground transition-colors outline-none hover:border-primary/40 hover:bg-accent/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

/** Full card — used for the phone list and the grouped grid view. */
export function ProposalCard({ p, hideStore = false, className }: { p: ProposalListItem; hideStore?: boolean; className?: string }) {
  const team = useTeamResolver()(p)
  return (
    <Link to={proposalHref(p)} className={cn(cardLink, 'space-y-3 p-4', p.status === 'CANCELLED' && 'opacity-70', className)}>
      <div className="flex items-center gap-2.5">
        {!hideStore && <StoreLogo store={p.store} size="md" />}
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted-foreground">
          <span className="tabular shrink-0 font-medium whitespace-nowrap">{p.code}</span>
          {!hideStore && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{p.store.name}</span>
            </>
          )}
        </div>
        <StatusBadge status={p.status} className="shrink-0" />
      </div>

      <p className="line-clamp-2 leading-snug font-medium group-hover:text-primary">{p.title}</p>

      <ProductChips products={p.products} max={3} />

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <ShelfTypeBadge shelfType={p.shelfType} />
        <TargetDate p={p} inline className="text-right" />
      </div>

      <div className="flex items-center gap-3 border-t pt-3">
        <ProgressBar progress={p.progress} className="flex-1" />
        <OverduePill count={p.overdueCount} showZero={false} />
        <AvatarStack users={team} max={3} size="xs" />
      </div>
    </Link>
  )
}

/** Compact card for kanban columns. */
export function KanbanCard({ p }: { p: ProposalListItem }) {
  const team = useTeamResolver()(p)
  return (
    <Link to={proposalHref(p)} className={cn(cardLink, 'space-y-2.5 p-3', p.status === 'CANCELLED' && 'opacity-70')}>
      <div className="flex items-center gap-2">
        <StoreLogo store={p.store} size="sm" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">{p.store.name}</span>
        <span className="tabular text-[11px] text-muted-foreground">{p.code}</span>
      </div>
      <p className="line-clamp-2 text-sm leading-snug font-medium group-hover:text-primary">{p.title}</p>
      <div className="flex items-end justify-between gap-2">
        <TargetDate p={p} />
        <ProgressRing progress={p.progress} size={38} stroke={4} className="[&>span]:text-[10px]" />
      </div>
      <div className="flex items-center justify-between gap-2">
        <AvatarStack users={team} max={4} size="xs" />
        <OverduePill count={p.overdueCount} showZero={false} />
      </div>
    </Link>
  )
}
