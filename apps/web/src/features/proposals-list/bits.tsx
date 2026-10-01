// Small presentational pieces shared by the table, kanban and card views.
import type { Product, User } from '@flowtrade/shared'
import { AlertTriangleIcon } from 'lucide-react'
import { useMemo } from 'react'
import { useUserLookup } from '@/api/hooks'
import type { ProposalListItem } from '@/api/types'
import { LaunchCountdown } from '@/components/common/misc'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

export const proposalHref = (p: Pick<ProposalListItem, 'id'>) => `/proposals/${p.id}`

/** Product names as compact chips; overflow collapses into "+n". */
export function ProductChips({ products, max = 2, className, chipClassName }: { products: Pick<Product, 'id' | 'name' | 'sku'>[]; max?: number; className?: string; chipClassName?: string }) {
  if (products.length === 0) return <span className={cn('text-xs text-muted-foreground', className)}>ยังไม่ได้เลือกสินค้า</span>
  const shown = products.slice(0, max)
  const rest = products.length - shown.length
  return (
    <span className={cn('flex min-w-0 flex-wrap items-center gap-1', className)}>
      {shown.map((p) => (
        <span key={p.id} className={cn('inline-flex h-5 max-w-[11rem] items-center rounded bg-muted px-1.5 text-[11px] text-muted-foreground', chipClassName)} title={`${p.name} · SKU ${p.sku}`}>
          <span className="truncate">{p.name}</span>
        </span>
      ))}
      {rest > 0 && (
        <span className="tabular inline-flex h-5 items-center rounded bg-muted px-1.5 text-[11px] font-medium text-muted-foreground" title={products.slice(max).map((p) => p.name).join(', ')}>
          +{rest}
        </span>
      )}
    </span>
  )
}

/** Red pill with the number of overdue tasks; renders a quiet dash when there are none. */
export function OverduePill({ count, showZero = true, className }: { count: number; showZero?: boolean; className?: string }) {
  if (count <= 0) return showZero ? <span className="text-xs text-muted-foreground/60" aria-label="ไม่มีงานเลยกำหนด">—</span> : null
  return (
    <span
      className={cn('tabular inline-flex h-5 items-center gap-1 rounded-full bg-danger-soft px-2 text-[11px] font-semibold whitespace-nowrap text-danger', className)}
      title={`มีงานเลยกำหนด ${count} งาน`}
    >
      <AlertTriangleIcon className="size-3" aria-hidden />
      {count}
      <span className="sr-only">งานเลยกำหนด</span>
    </span>
  )
}

/** Target on-shelf date with its countdown underneath (or inline). */
export function TargetDate({ p, inline = false, className }: { p: Pick<ProposalListItem, 'targetDate' | 'status'>; inline?: boolean; className?: string }) {
  const finished = p.status === 'COMPLETED' || p.status === 'CANCELLED'
  return (
    <span className={cn(inline ? 'inline-flex flex-wrap items-baseline gap-x-1.5' : 'flex flex-col leading-tight', className)}>
      <span className="tabular text-sm">{formatDate(p.targetDate)}</span>
      {finished ? <span className="text-xs text-muted-foreground">{p.status === 'COMPLETED' ? 'ปิดงานแล้ว' : 'ยกเลิกแล้ว'}</span> : <LaunchCountdown targetDate={p.targetDate} />}
    </span>
  )
}

/** Owner first, then members — resolved from the user lookup (inactive members are skipped). */
export function useTeamResolver() {
  const { data: users } = useUserLookup()
  return useMemo(() => {
    const byId = new Map((users ?? []).map((u) => [u.id, u]))
    return (p: Pick<ProposalListItem, 'owner' | 'memberIds'>): User[] => [p.owner, ...p.memberIds.filter((id) => id !== p.owner.id).map((id) => byId.get(id)).filter((u): u is User => !!u)]
  }, [users])
}
