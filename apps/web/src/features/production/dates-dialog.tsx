import { datesErrors, isConfirmedStatus, latestNeededOn, productionRowActions, type ISODate, type ProductionDatesInput } from '@flowtrade/shared'
import { useId, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { DateField } from '@/components/common/date-field'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field } from '@/features/presentation/dialog-parts'
import { formatDate } from '@/lib/format'
import { GoneContent, ProdDialogActions } from './dialog-parts'
import { useEditProductionDates } from './hooks'
import { PROD_ERR } from './model'
import { isStale, proposalLine } from './utils'
import type { ProductionModel, ProductionRow } from './types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  model: ProductionModel
  productId: string
}

/** "แก้วันที่ {sku}": "วันที่ต้องการสินค้า" of a SKU not yet delivered (owner / manager), and its produced / delivered dates once recorded (team). */
export function DatesDialog({ open, onOpenChange, model, productId }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DatesRoute model={model} productId={productId} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function DatesRoute({ model, productId, onDone }: { model: ProductionModel; productId: string; onDone: () => void }) {
  const [row] = useState(() => model.rowById.get(productId))
  if (!row?.item || !isConfirmedStatus(row.status)) return <GoneContent />
  return <DatesForm model={model} row={row} onDone={onDone} />
}

function DatesForm({ model, row, onDone }: { model: ProductionModel; row: ProductionRow; onDone: () => void }) {
  const id = useId()
  const edit = useEditProductionDates(model.proposal)
  const item = row.item!
  const today = model.today
  const produced = row.status === 'PRODUCED' || row.status === 'DELIVERED'
  const delivered = row.status === 'DELIVERED'
  // The due date is the owner's / a manager's call (like lead days), and frozen once delivered.
  const canNeed = productionRowActions(row, { canWork: model.canWork, canDecide: model.canDecide }, today).editNeededOn
  const [neededOn, setNeededOn] = useState<ISODate | null>(row.dueOn)
  const [producedOn, setProducedOn] = useState<ISODate | null>(item.producedOn)
  const [deliveredOn, setDeliveredOn] = useState<ISODate | null>(item.deliveredOn)
  const [submitted, setSubmitted] = useState(false)

  const patch: ProductionDatesInput = {}
  if (canNeed && neededOn && neededOn !== row.dueOn) patch.neededOn = neededOn
  if (produced && producedOn && producedOn !== item.producedOn) patch.producedOn = producedOn
  if (delivered && deliveredOn && deliveredOn !== item.deliveredOn) patch.deliveredOn = deliveredOn
  const unchanged = Object.keys(patch).length === 0
  const errors = datesErrors(item, patch, today, model.targetDate, PROD_ERR)
  const shown = submitted ? errors : {}

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (unchanged || errors.neededOn || errors.producedOn || errors.deliveredOn) return
    try {
      await edit.mutateAsync({ productId: row.productId, input: patch })
      toast.success('แก้วันที่แล้ว')
      onDone()
    } catch (error) {
      // already toasted by the hook
      if (isStale(error)) onDone()
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle className="pr-6 leading-snug">แก้วันที่ {row.product.sku}</DialogTitle>
        <DialogDescription>{proposalLine(model.proposal)}</DialogDescription>
      </DialogHeader>
      {canNeed && (
        <Field id={`${id}-need`} label="วันที่ต้องการสินค้า" required error={shown.neededOn} hint={`กำหนดส่งเข้าคลัง/${model.storeWord}ของ SKU นี้ — ส่งหลังวันนี้นับว่าส่งช้า`}>
          <DateField
            id={`${id}-need`}
            value={neededOn}
            onChange={setNeededOn}
            min={today}
            max={latestNeededOn(today, model.targetDate)}
            clearable={false}
            className="w-full sm:w-60"
          />
        </Field>
      )}
      {produced && (
        <Field
          id={`${id}-produced`}
          label="วันที่ผลิตเสร็จ"
          required
          error={shown.producedOn}
          hint={!canNeed && !delivered ? `กำหนดส่ง ${formatDate(row.dueOn)}` : undefined}
        >
          <DateField id={`${id}-produced`} value={producedOn} onChange={setProducedOn} min={item.startedOn} max={delivered ? (deliveredOn ?? today) : today} clearable={false} className="w-full sm:w-60" />
        </Field>
      )}
      {delivered && (
        <Field
          id={`${id}-delivered`}
          label="วันที่ส่ง"
          required
          error={shown.deliveredOn}
          hint={item.dueOn ? `กำหนดส่ง ${formatDate(item.dueOn)}` : undefined}
        >
          <DateField id={`${id}-delivered`} value={deliveredOn} onChange={setDeliveredOn} min={producedOn} max={today} clearable={false} className="w-full sm:w-60" />
        </Field>
      )}
      <ProdDialogActions label="บันทึก" pending={edit.isPending} disabled={unchanged} />
    </form>
  )
}
