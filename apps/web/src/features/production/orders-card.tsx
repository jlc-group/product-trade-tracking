import { formatQty, orderLabel, skuListLabel } from '@flowtrade/shared'
import { PencilIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { AvatarStack, UserAvatar } from '@/components/common/user-avatar'
import { Button } from '@/components/ui/button'
import { TONE_SOFT } from '@/features/presentation/model'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { arrivalChip, openRowsOf, orderArrivalLate, relativeTo, shortName } from './model'
import type { ProductionModel, ProductionOrder, ProductionRow, ProductionTabAction } from './types'

const none = <span className="text-muted-foreground">—</span>

/** One label / value pair: stacked on phones, side by side from `sm`. */
function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-0.5 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-3">
      <dt className="text-xs text-muted-foreground sm:pt-0.5">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  )
}

function OrderItem({ order, model, onAction }: { order: ProductionOrder; model: ProductionModel; onAction: (a: ProductionTabAction) => void }) {
  const rows = order.productIds.map((pid) => model.rowById.get(pid)).filter((r): r is ProductionRow => !!r)
  const live = rows.filter((r) => r.status !== 'CANCELLED')
  const pieces = live.reduce((sum, r) => sum + (r.item?.quantity ?? 0), 0)
  const cancelled = rows.length - live.length
  const skus = live.map((r) => r.product.sku)
  const label = orderLabel(order)
  const today = model.today
  // Relative dates and the late chip only while something is on its way.
  const open = openRowsOf(order, model.rowById).length > 0
  const late = orderArrivalLate(order, model.rowById, model.targetDate)
  const chip = late ? arrivalChip(late) : null
  return (
    <li className="min-w-0 rounded-lg border p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{label}</p>
          <p className="text-xs text-muted-foreground">
            ยืนยันโดย {shortName(order.confirmedBy)} · <span className="tabular">{formatDate(order.confirmedAt)}</span>
          </p>
        </div>
        {model.canDecide && (
          <Button size="sm" variant="outline" className="shrink-0" aria-label={`แก้ไข${label}`} onClick={() => onAction({ kind: 'editOrder', orderId: order.id })}>
            <PencilIcon /> แก้ไข
          </Button>
        )}
      </div>

      <dl className="mt-3 grid gap-2">
        <Item label="บริษัท">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="break-words">{order.manufacturer.name}</span>
            {!order.manufacturer.isActive && <span className="rounded bg-muted px-1 text-[11px] leading-4 text-muted-foreground">ปิดใช้งาน</span>}
          </span>
        </Item>
        <Item label="เอกสาร">{order.referenceNo ? <span className="tabular break-all">{order.referenceNo}</span> : none}</Item>
        <Item label="เริ่มผลิต">
          {order.startedOn ? (
            <span className="tabular">
              {formatDate(order.startedOn)}
              {order.startedOn > today && <span className="text-muted-foreground"> ({relativeTo(order.startedOn, today)})</span>}
            </span>
          ) : (
            none
          )}
        </Item>
        <Item label="ระยะเวลาผลิต">{order.productionDays != null ? <span className="tabular">~{order.productionDays} วัน</span> : none}</Item>
        <Item label="ของถึงประมาณ">
          {order.expectedOn ? (
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="tabular">
                {formatDate(order.expectedOn)}
                {open && !chip && <span className="text-muted-foreground"> ({relativeTo(order.expectedOn, today)})</span>}
              </span>
              {chip && <span className={cn('tabular inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium whitespace-nowrap', TONE_SOFT[chip.tone])}>{chip.text}</span>}
            </span>
          ) : (
            none
          )}
        </Item>
        <Item label="ผู้ติดต่อหลัก">
          <span className="flex min-w-0 items-center gap-2">
            <UserAvatar user={order.mainContact} size="xs" />
            <span className="truncate">{shortName(order.mainContact)}</span>
          </span>
        </Item>
        <Item label="ผู้ติดต่อร่วม">
          {order.coContacts.length ? (
            <span className="flex min-w-0 items-center gap-2">
              <AvatarStack users={order.coContacts} max={4} size="xs" />
              <span className="truncate" title={order.coContacts.map(shortName).join(', ')}>
                {order.coContacts.map(shortName).join(', ')}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </Item>
        <Item label="SKU">
          <span className="tabular">
            {live.length} SKU · {formatQty(pieces)} ชิ้น
          </span>
          {cancelled > 0 && <span className="text-muted-foreground"> (ยกเลิก {cancelled} SKU)</span>}
          {skus.length > 0 && (
            <span className="tabular block truncate text-xs text-muted-foreground" title={skus.join(', ')}>
              {skuListLabel(skus)}
            </span>
          )}
        </Item>
      </dl>
    </li>
  )
}

/** "ใบสั่งผลิต (n)" under the table: one block per confirm press — who makes it, the document, the contacts. */
export function OrdersCard({ model, onAction }: { model: ProductionModel; onAction: (a: ProductionTabAction) => void }) {
  const orders = model.orders
  return (
    <section className="@container rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="production-orders-title">
      <h2 id="production-orders-title" className="text-base font-semibold">
        ใบสั่งผลิต <span className="tabular font-normal text-muted-foreground">({orders.length})</span>
      </h2>
      <ul className="mt-3 grid gap-3 @3xl:grid-cols-2">
        {orders.map((o) => (
          <OrderItem key={o.id} order={o} model={model} onAction={onAction} />
        ))}
      </ul>
    </section>
  )
}
