import { canEditQuantity, formatQty } from '@flowtrade/shared'
import { TriangleAlertIcon } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Field } from '@/features/presentation/dialog-parts'
import { fieldAria } from '@/features/presentation/dialog-utils'
import { Callout } from '@/features/wizard/choice-card'
import { GoneContent, ProdDialogActions } from './dialog-parts'
import { useSaveQuantities } from './hooks'
import { flagStripText, qtyText, readQty, savedQty } from './model'
import { isStale, proposalLine } from './utils'
import type { ProductionModel, ProductionRow } from './types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  model: ProductionModel
  productId: string
}

/** "แก้จำนวนผลิต {sku}" (owner / manager): the quantity of a confirmed SKU, in a dialog rather than the table. */
export function QuantityDialog({ open, onOpenChange, model, productId }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <QuantityRoute model={model} productId={productId} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function QuantityRoute({ model, productId, onDone }: { model: ProductionModel; productId: string; onDone: () => void }) {
  const [row] = useState(() => model.rowById.get(productId))
  if (!row?.item || !canEditQuantity(row.status, { canWork: model.canWork, canDecide: model.canDecide })) return <GoneContent />
  return <QuantityForm model={model} row={row} onDone={onDone} />
}

function QuantityForm({ model, row, onDone }: { model: ProductionModel; row: ProductionRow; onDone: () => void }) {
  const id = useId()
  const save = useSaveQuantities(model.proposal)
  const saved = savedQty(row)
  const [text, setText] = useState(() => qtyText(saved))
  const [submitted, setSubmitted] = useState(false)
  const { value, error } = readQty(text)
  const unchanged = value != null && value === saved
  const storesChanged = row.needsReview && row.flag === 'STORES_CHANGED'
  const note =
    row.status !== 'IN_PRODUCTION' ? 'SKU นี้ผลิตเสร็จแล้ว — แก้เพื่อให้ตรงกับจำนวนที่ผลิตจริง' : 'ทีมผลิตอาจเริ่มผลิตตามจำนวนเดิมไปแล้ว — แจ้งทีมผลิตเมื่อเปลี่ยนจำนวน'

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (value == null) {
      document.getElementById(`${id}-qty`)?.focus()
      return
    }
    if (unchanged) return
    try {
      await save.mutateAsync({ items: [{ productId: row.productId, quantity: value, before: saved }] })
      onDone()
    } catch (error) {
      // already toasted by the hook
      if (isStale(error)) onDone()
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle className="pr-6 leading-snug">แก้จำนวนผลิต {row.product.sku}</DialogTitle>
        <DialogDescription>
          {proposalLine(model.proposal)} — {row.product.name}
        </DialogDescription>
      </DialogHeader>

      {storesChanged && (
        <Callout tone="warning" icon={<TriangleAlertIcon />}>
          {flagStripText(row, model.storeWord)} บันทึกจำนวนแล้วคำเตือนจะหายไป
        </Callout>
      )}

      <Field id={`${id}-qty`} label="จำนวนผลิต" required error={submitted ? (error ?? undefined) : undefined} hint={saved != null ? `เดิม ${formatQty(saved)} ชิ้น` : undefined}>
        <InputGroup className="h-9 w-full sm:w-60">
          <InputGroupInput
            {...fieldAria(`${id}-qty`, submitted ? (error ?? undefined) : undefined, saved != null)}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="ใส่จำนวน"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => value != null && setText(formatQty(value))}
            className="tabular text-right"
          />
          <InputGroupAddon align="inline-end">ชิ้น</InputGroupAddon>
        </InputGroup>
      </Field>

      <p className="text-xs text-muted-foreground">{note}</p>

      <ProdDialogActions label="บันทึก" pending={save.isPending} disabled={unchanged} />
    </form>
  )
}
