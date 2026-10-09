import { orderLabel } from '@flowtrade/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useId, useMemo, useState, type FormEvent } from 'react'
import { ApiError } from '@/api'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { GoneContent, ProdDialogActions } from './dialog-parts'
import { useEditProductionOrder } from './hooks'
import { earliestDueOf, openRowsOf, orderDraftOf, orderErrors, orderPatch, scheduleEdits, shortName, startRange } from './model'
import { OrderFields } from './order-fields'
import { isStale, orderFieldId, proposalLine, serverOrderErrors } from './utils'
import type { OrderDraft, OrderErrors, OrderField, ProductionModel, ProductionOrder, ProductionRow } from './types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  model: ProductionModel
  orderId: string
}

/**
 * "แก้ข้อมูลใบสั่งผลิตที่ n" (owner / manager): บริษัทรับผลิต, the document number, the schedule (start, days) and the
 * contacts of one confirm press — whatever its SKUs' status (fixing a document number is always allowed); the change
 * applies to every SKU of the order (a new start becomes the production start of each).
 */
export function OrderDialog({ open, onOpenChange, model, orderId }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <OrderRoute model={model} orderId={orderId} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function OrderRoute({ model, orderId, onDone }: { model: ProductionModel; orderId: string; onDone: () => void }) {
  // Frozen at open: its `updatedAt` is the stale guard, so a teammate's edit meanwhile answers 409 instead of being overwritten.
  const [order] = useState(() => model.orderById.get(orderId))
  if (!order || !model.canDecide) return <GoneContent description="ไม่พบใบสั่งผลิตนี้แล้ว — ปิดหน้าต่างนี้แล้วเลือกใหม่จากตาราง" />
  return <OrderForm model={model} order={order} onDone={onDone} />
}

function OrderForm({ model, order, onDone }: { model: ProductionModel; order: ProductionOrder; onDone: () => void }) {
  const id = useId()
  const qc = useQueryClient()
  const edit = useEditProductionOrder(model.proposal)
  const [form, setFormState] = useState<OrderDraft>(() => orderDraftOf(order))
  // A 422 naming a field, shown under it until the form changes.
  const [serverErrors, setServerErrors] = useState<OrderErrors>({})
  const [submitted, setSubmitted] = useState(false)
  const rows = order.productIds.map((pid) => model.rowById.get(pid)).filter((r): r is ProductionRow => !!r)
  // A new start: within its SKUs' passes … the launch, and not after one of them was produced (the API's rule).
  const range = startRange(rows, model.today, model.targetDate, true)
  // The arrival is compared with the SKUs still on their way (none: no warning).
  const open = openRowsOf(order, model.rowById)
  const errors = orderErrors(form, range.rules, order)
  const shown: OrderErrors = submitted ? { ...serverErrors, ...errors } : serverErrors
  const patch = orderPatch(order, form)
  const edits = scheduleEdits(order, form)
  const unchanged = Object.keys(patch).length === 0 && !edits.start && !edits.days
  // The contacts as saved may stay in their role even if they left the team since (the API's per-role rule).
  const keep = useMemo(() => ({ mainContactId: order.mainContact.id, coContactIds: order.coContacts.map((p) => p.id) }), [order])

  const setForm = (next: OrderDraft) => {
    setFormState(next)
    setServerErrors({})
  }
  const focusFirst = (errs: OrderErrors) => {
    const first = Object.keys(errs)[0] as OrderField | undefined
    if (first) document.getElementById(orderFieldId(id, first))?.focus()
    return !!first
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (focusFirst(errors) || unchanged) return
    try {
      await edit.mutateAsync({ orderId: order.id, input: { ...patch, updatedAt: order.updatedAt } })
      onDone()
    } catch (error) {
      // already toasted and refetched by the hook: 409 = edited by someone else meanwhile, 404 = the order is gone
      if (isStale(error) || (error instanceof ApiError && error.status === 404)) return onDone()
      const fields = serverOrderErrors(error)
      // A manufacturer deactivated or deleted meanwhile: the picker's list catches up.
      if (fields.manufacturerId) void qc.invalidateQueries({ queryKey: ['manufacturers'] })
      setServerErrors(fields)
      focusFirst(fields)
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle className="pr-6 leading-snug">แก้ข้อมูล{orderLabel(order)}</DialogTitle>
        <DialogDescription>
          {proposalLine(model.proposal)} — ยืนยันโดย {shortName(order.confirmedBy)} <span className="tabular">{formatDate(order.confirmedAt)}</span>
        </DialogDescription>
      </DialogHeader>

      {rows.length > 0 && (
        <div className="grid gap-2">
          <p id={`${id}-skus`} className="text-sm font-medium">
            SKU ในใบสั่งผลิตนี้ <span className="tabular font-normal text-muted-foreground">({rows.length})</span>
          </p>
          <ul className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto" aria-labelledby={`${id}-skus`}>
            {rows.map((r) => {
              const cancelled = r.status === 'CANCELLED'
              return (
                <li
                  key={r.productId}
                  title={`${r.product.name}${cancelled ? ' · ยกเลิกแล้ว' : ''}`}
                  className={cn('tabular inline-flex h-6 max-w-full items-center rounded-md border bg-muted/40 px-2 text-xs', cancelled && 'text-muted-foreground line-through')}
                >
                  <span className="truncate">{r.product.sku}</span>
                  {cancelled && <span className="sr-only"> (ยกเลิกแล้ว)</span>}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <OrderFields
        formId={id}
        model={model}
        value={form}
        onChange={setForm}
        errors={shown}
        schedule={{ range, neededOn: earliestDueOf(open), warn: open.length > 0, clearable: order.startedOn === null }}
        known={[order.manufacturer]}
        keep={keep}
      />

      <p className="text-xs text-muted-foreground">
        การแก้ไขมีผลกับทุก SKU ในใบสั่งผลิตนี้ (วันที่เริ่มผลิตใหม่เป็นวันเริ่มผลิตของทุก SKU) และบันทึกไว้ในประวัติของแต่ละ SKU
      </p>

      <ProdDialogActions label="บันทึก" pending={edit.isPending} disabled={unchanged} />
    </form>
  )
}
