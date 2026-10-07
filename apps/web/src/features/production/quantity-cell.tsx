import { formatQty } from '@flowtrade/shared'
import { savedQty } from './model'
import type { ProductionRow } from './types'

/** Quantity (§5.9.1), read only: it is entered in the confirm dialog and changed through "แก้จำนวนผลิต…" in the row menu. */
export function QuantityCell({ row }: { row: ProductionRow }) {
  const saved = savedQty(row)
  const label = <span className="text-muted-foreground @3xl:hidden">จำนวนผลิต </span>
  if (saved != null)
    return (
      <span className="tabular text-sm">
        {label}
        {formatQty(saved)} ชิ้น
      </span>
    )
  return (
    <span className="text-sm text-muted-foreground">
      {label}
      {row.status === 'PENDING' ? 'กรอกตอนยืนยัน' : '—'}
    </span>
  )
}
