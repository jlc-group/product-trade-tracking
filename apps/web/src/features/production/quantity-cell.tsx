import { canEditQuantity, formatQty } from '@flowtrade/shared'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { cn } from '@/lib/utils'
import { savedQty } from './model'
import { qtyInputId } from './utils'
import type { DraftsModel, ProductionModel, ProductionRow } from './types'

/** Inline quantity (§5.9.1): an input for whoever may edit this row's status, text otherwise. Enter saves. */
export function QuantityCell({ row, model, drafts, onSave }: { row: ProductionRow; model: ProductionModel; drafts: DraftsModel; onSave: () => void }) {
  const saved = savedQty(row)
  const editable = canEditQuantity(row.status, { canWork: model.canWork, canDecide: model.canDecide })

  if (!editable)
    return saved != null ? (
      <span className="tabular text-sm">
        <span className="text-muted-foreground @3xl:hidden">จำนวนผลิต </span>
        {formatQty(saved)} ชิ้น
      </span>
    ) : (
      <span className="text-sm text-muted-foreground">
        <span className="@3xl:hidden">จำนวนผลิต </span>ยังไม่ระบุ
      </span>
    )

  const id = qtyInputId(row.productId)
  const error = drafts.errorOf(row)
  const dirty = drafts.isDirty(row.productId)
  const missing = drafts.attempted && row.status === 'PENDING' && !error && drafts.confirmQty(row) == null

  return (
    <div className="min-w-0 space-y-1">
      <InputGroup className={cn('h-8 w-full bg-card @3xl:w-28', dirty && 'bg-warning-soft/40', missing && 'ring-2 ring-warning')}>
        <InputGroupInput
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label={`จำนวนผลิต ${row.product.sku}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          placeholder="ใส่จำนวน"
          value={drafts.textOf(row)}
          onChange={(e) => drafts.setText(row, e.target.value)}
          onBlur={() => drafts.settle(row)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            onSave()
          }}
          className="tabular"
        />
        <InputGroupAddon align="inline-end">ชิ้น</InputGroupAddon>
      </InputGroup>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
