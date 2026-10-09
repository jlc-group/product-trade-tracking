import { cancelReasonError, NOTE_MAX } from '@flowtrade/shared'
import { useId, useState, type FormEvent } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/features/presentation/dialog-parts'
import { fieldAria } from '@/features/presentation/dialog-utils'
import { GoneContent, ProdDialogActions } from './dialog-parts'
import { useCancelProduction } from './hooks'
import { PROD_ERR } from './model'
import { isStale, proposalLine } from './utils'
import type { ProductionModel, ProductionRow } from './types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  model: ProductionModel
  productId: string
}

/** "ยกเลิกการผลิต {sku}?" for a confirmed SKU, or "ไม่ผลิต {sku}?" for a pending one (K1). Restorable later. */
export function CancelDialog({ open, onOpenChange, model, productId }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <CancelRoute model={model} productId={productId} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function CancelRoute({ model, productId, onDone }: { model: ProductionModel; productId: string; onDone: () => void }) {
  const [row] = useState(() => model.rowById.get(productId))
  if (!row || (row.status !== 'PENDING' && row.status !== 'IN_PRODUCTION' && row.status !== 'PRODUCED')) return <GoneContent />
  return <CancelForm model={model} row={row} from={row.status} onDone={onDone} />
}

function CancelForm({ model, row, from, onDone }: { model: ProductionModel; row: ProductionRow; from: 'PENDING' | 'IN_PRODUCTION' | 'PRODUCED'; onDone: () => void }) {
  const id = useId()
  const cancel = useCancelProduction(model.proposal)
  const skip = from === 'PENDING'
  const sku = row.product.sku
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const error = cancelReasonError(reason, PROD_ERR, skip)
  const shown = submitted ? (error ?? undefined) : undefined

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (error) return
    try {
      await cancel.mutateAsync({ productId: row.productId, reason: reason.trim(), from })
      onDone()
    } catch (err) {
      // already toasted by the hook
      if (isStale(err)) onDone()
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle className="pr-6 leading-snug">{skip ? `ไม่ผลิต ${sku}?` : `ยกเลิกการผลิต ${sku}?`}</DialogTitle>
        <DialogDescription>
          {proposalLine(model.proposal)} —{' '}
          {skip ? 'SKU นี้จะไม่ต้องยืนยันเริ่มผลิต และไม่นับในความคืบหน้าการผลิต กู้คืนได้ภายหลัง' : 'SKU นี้จะไม่นับในความคืบหน้าการผลิต และกู้คืนได้ภายหลัง'}
        </DialogDescription>
      </DialogHeader>
      <Field id={`${id}-reason`} label="เหตุผล" required error={shown} hint={`${reason.trim().length}/${NOTE_MAX}`}>
        <Textarea
          {...fieldAria(`${id}-reason`, shown, true)}
          rows={3}
          value={reason}
          maxLength={NOTE_MAX}
          onChange={(e) => setReason(e.target.value)}
          placeholder={skip ? 'เช่น มีสต็อกอยู่แล้ว / เลิกจำหน่าย' : 'เช่น ห้างลดจำนวนสั่ง / วัตถุดิบไม่พอ'}
        />
      </Field>
      <ProdDialogActions label={skip ? 'ไม่ผลิต SKU นี้' : 'ยกเลิกการผลิต'} pending={cancel.isPending} destructive />
    </form>
  )
}
