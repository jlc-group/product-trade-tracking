import { productionStatusLong, type ProductionStatus } from '@flowtrade/shared'
import { cn } from '@/lib/utils'
import { statusMeta } from './model'

/** Production status chip (§5.12); "ไม่ผลิต" for a skipped SKU. `count` turns it into a toolbar counter. */
export function StatusChip({
  status,
  skipped = false,
  word = 'ห้าง',
  size = 'default',
  count,
  className,
}: {
  status: ProductionStatus
  skipped?: boolean
  word?: string
  size?: 'default' | 'sm'
  count?: number
  className?: string
}) {
  const meta = statusMeta(status, skipped)
  return (
    <span
      title={productionStatusLong(status, word, skipped)}
      className={cn(
        'inline-flex w-fit shrink-0 items-center gap-1 rounded-full border font-medium whitespace-nowrap',
        size === 'sm' ? 'h-5 px-2 text-[11px]' : 'h-6 px-2.5 text-xs',
        meta.chip,
        className,
      )}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', meta.dot)} aria-hidden />
      {meta.label}
      {count !== undefined && <span className="tabular">{count}</span>}
    </span>
  )
}
