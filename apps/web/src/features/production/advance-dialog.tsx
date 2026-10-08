import { advanceDateError, diffDays, formatQty, type ISODate, type ProductionAdvanceInput } from '@flowtrade/shared'
import { TriangleAlertIcon } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { DateField } from '@/components/common/date-field'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Field, SelectAllButtons } from '@/features/presentation/dialog-parts'
import { ProdDialogActions } from './dialog-parts'
import { useAdvanceProduction } from './hooks'
import { producibleRows, PROD_ERR, savedQty } from './model'
import { isStale, proposalLine } from './utils'
import type { ProductionModel, ProductionRow } from './types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  model: ProductionModel
  to: 'PRODUCED' | 'DELIVERED'
  /** Ticked at first; default every row in the from-status. */
  initialIds?: string[]
}

/** "บันทึกผลิตเสร็จ" / "บันทึกส่งเข้าคลัง/ห้างแล้ว" for one or several SKUs on one date (§5.10, K30). */
export function AdvanceDialog({ open, onOpenChange, model, to, initialIds }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <AdvanceForm model={model} to={to} initialIds={initialIds} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

const latest = (dates: (ISODate | null | undefined)[]) => dates.reduce<ISODate | null>((max, d) => (d && (!max || d > max) ? d : max), null)

/** First error over the ticked rows, prefixed with the SKU when several are ticked. */
function firstError(rows: ProductionRow[], check: (r: ProductionRow) => string | null) {
  for (const r of rows) {
    const e = check(r)
    if (e) return rows.length > 1 ? `${r.product.sku}: ${e}` : e
  }
  return null
}

function AdvanceForm({ model, to, initialIds, onDone }: { model: ProductionModel; to: 'PRODUCED' | 'DELIVERED'; initialIds?: string[]; onDone: () => void }) {
  const id = useId()
  const advance = useAdvanceProduction(model.proposal)
  const word = model.storeWord
  const today = model.today
  const from = to === 'PRODUCED' ? 'IN_PRODUCTION' : 'PRODUCED'
  // Rows as they were when the dialog opened (the list doesn't empty itself while the dialog closes after saving); a SKU
  // whose production start is still ahead can't be produced yet.
  const [candidates] = useState(() => (to === 'PRODUCED' ? producibleRows(model.rows, today) : model.rows.filter((r) => r.status === from)))
  const [checked, setChecked] = useState<string[]>(() => {
    const ids = candidates.map((r) => r.productId)
    return initialIds ? ids.filter((x) => initialIds.includes(x)) : ids
  })
  const [date, setDate] = useState<ISODate | null>(today)
  const [alsoDeliver, setAlsoDeliver] = useState(false)
  const [deliveredOn, setDeliveredOn] = useState<ISODate | null>(today)
  const [submitted, setSubmitted] = useState(false)

  const rows = candidates.filter((r) => checked.includes(r.productId))
  const dateErr = firstError(rows, (r) => advanceDateError(to, date, { startedOn: r.item?.startedOn ?? null, producedOn: r.item?.producedOn ?? null }, today, PROD_ERR))
  const deliverErr =
    to === 'PRODUCED' && alsoDeliver ? firstError(rows, (r) => advanceDateError('DELIVERED', deliveredOn, { startedOn: r.item?.startedOn ?? null, producedOn: date }, today, PROD_ERR)) : null
  const minDate = to === 'PRODUCED' ? latest(rows.map((r) => r.item?.startedOn)) : latest(rows.map((r) => r.item?.producedOn))
  const deliveredDate = to === 'DELIVERED' ? date : alsoDeliver ? deliveredOn : null
  // Each SKU against its own due date ("วันที่ต้องการสินค้า", else the plan deadline).
  const lateDays = deliveredDate ? Math.max(0, ...rows.map((r) => diffDays(r.dueOn, deliveredDate))) : 0
  const title = to === 'PRODUCED' ? 'บันทึกผลิตเสร็จ' : `บันทึกส่งเข้าคลัง/${word}แล้ว`

  const toggle = (pid: string, on: boolean) => setChecked((prev) => (on ? [...prev, pid] : prev.filter((x) => x !== pid)))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (rows.length === 0 || dateErr || deliverErr || !date) return
    const both = to === 'PRODUCED' && alsoDeliver && deliveredOn ? { to: 'DELIVERED' as const, deliveredOn } : {}
    const input: ProductionAdvanceInput = { productIds: rows.map((r) => r.productId), from, date, ...both }
    try {
      await advance.mutateAsync(input)
      const n = rows.length
      toast.success(to === 'DELIVERED' ? `บันทึกส่งแล้ว ${n} SKU` : alsoDeliver ? `บันทึกผลิตเสร็จและส่งแล้ว ${n} SKU` : `บันทึกผลิตเสร็จ ${n} SKU แล้ว`)
      onDone()
    } catch (error) {
      // already toasted by the hook
      if (isStale(error)) onDone()
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle className="pr-6 leading-snug">{title}</DialogTitle>
        <DialogDescription>{proposalLine(model.proposal)}</DialogDescription>
      </DialogHeader>

      <Field
        id={`${id}-rows`}
        label="SKU"
        group
        error={submitted && rows.length === 0 ? 'เลือกอย่างน้อย 1 SKU' : undefined}
        aside={
          candidates.length > 1 ? (
            <SelectAllButtons total={candidates.length} selected={rows.length} onAll={() => setChecked(candidates.map((r) => r.productId))} onNone={() => setChecked([])} />
          ) : undefined
        }
      >
        <ul aria-labelledby={`${id}-rows-label`} className="max-h-56 divide-y overflow-y-auto rounded-lg border">
          {candidates.map((r) => {
            const cid = `${id}-row-${r.productId}`
            const qty = savedQty(r)
            return (
              <li key={r.productId} className="flex items-center gap-3 px-3 py-2">
                <Checkbox id={cid} checked={checked.includes(r.productId)} onCheckedChange={(v) => toggle(r.productId, v === true)} />
                <Label htmlFor={cid} className="min-w-0 flex-1 cursor-pointer font-normal">
                  <span className="tabular font-medium break-all">{r.product.sku}</span>
                  <span className="min-w-0 truncate text-muted-foreground">{r.product.name}</span>
                </Label>
                {qty != null && <span className="tabular shrink-0 text-xs text-muted-foreground">{formatQty(qty)} ชิ้น</span>}
              </li>
            )
          })}
        </ul>
      </Field>

      <Field id={`${id}-date`} label={to === 'PRODUCED' ? 'วันที่ผลิตเสร็จ' : 'วันที่ส่ง'} required error={submitted ? (dateErr ?? undefined) : undefined}>
        <DateField id={`${id}-date`} value={date} onChange={setDate} min={minDate} max={today} clearable={false} className="w-full sm:w-60" />
      </Field>

      {to === 'PRODUCED' && (
        <div className="grid gap-3 rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center gap-2">
            <Checkbox id={`${id}-also`} checked={alsoDeliver} onCheckedChange={(v) => setAlsoDeliver(v === true)} />
            <Label htmlFor={`${id}-also`} className="cursor-pointer font-normal">
              ส่งเข้าคลัง/{word}แล้วด้วย
            </Label>
          </div>
          {alsoDeliver && (
            <Field id={`${id}-delivered`} label="วันที่ส่ง" required error={submitted ? (deliverErr ?? undefined) : undefined}>
              <DateField id={`${id}-delivered`} value={deliveredOn} onChange={setDeliveredOn} min={date} max={today} clearable={false} className="w-full sm:w-60" />
            </Field>
          )}
        </div>
      )}

      {lateDays > 0 && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-warning-foreground">
          <TriangleAlertIcon className="size-3.5 shrink-0" aria-hidden />
          ช้ากว่ากำหนด {lateDays} วัน
        </p>
      )}

      <ProdDialogActions label={`บันทึก (${rows.length} SKU)`} pending={advance.isPending} disabled={rows.length === 0} />
    </form>
  )
}
