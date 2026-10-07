import { datesErrors, type ISODate, type ProductionDatesInput } from '@flowtrade/shared'
import { useId, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { DateField } from '@/components/common/date-field'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field } from '@/features/presentation/dialog-parts'
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

/** "แก้วันที่ {sku}": the produced (and delivered) date of a SKU already past that step. */
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
  if (!row?.item || (row.status !== 'PRODUCED' && row.status !== 'DELIVERED')) return <GoneContent />
  return <DatesForm model={model} row={row} onDone={onDone} />
}

function DatesForm({ model, row, onDone }: { model: ProductionModel; row: ProductionRow; onDone: () => void }) {
  const id = useId()
  const edit = useEditProductionDates(model.proposal)
  const item = row.item!
  const today = model.today
  const delivered = row.status === 'DELIVERED'
  const [producedOn, setProducedOn] = useState<ISODate | null>(item.producedOn)
  const [deliveredOn, setDeliveredOn] = useState<ISODate | null>(item.deliveredOn)
  const [submitted, setSubmitted] = useState(false)

  const patch: ProductionDatesInput = {}
  if (producedOn && producedOn !== item.producedOn) patch.producedOn = producedOn
  if (delivered && deliveredOn && deliveredOn !== item.deliveredOn) patch.deliveredOn = deliveredOn
  const unchanged = Object.keys(patch).length === 0
  const errors = datesErrors(item, patch, today, PROD_ERR)
  const shown = submitted ? errors : {}

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (unchanged || errors.producedOn || errors.deliveredOn) return
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
      <Field id={`${id}-produced`} label="วันที่ผลิตเสร็จ" required error={shown.producedOn}>
        <DateField id={`${id}-produced`} value={producedOn} onChange={setProducedOn} min={item.startedOn} max={delivered ? (deliveredOn ?? today) : today} clearable={false} className="w-full sm:w-60" />
      </Field>
      {delivered && (
        <Field id={`${id}-delivered`} label="วันที่ส่ง" required error={shown.deliveredOn}>
          <DateField id={`${id}-delivered`} value={deliveredOn} onChange={setDeliveredOn} min={producedOn} max={today} clearable={false} className="w-full sm:w-60" />
        </Field>
      )}
      <ProdDialogActions label="บันทึก" pending={edit.isPending} disabled={unchanged} />
    </form>
  )
}
