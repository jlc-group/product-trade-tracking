import { diffDays, earliestPassedOn, formatQty, startedOnError, type ISODate } from '@flowtrade/shared'
import { TriangleAlertIcon } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { StoreLogos } from '@/components/common/badges'
import { DateField } from '@/components/common/date-field'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field } from '@/features/presentation/dialog-parts'
import { Callout } from '@/features/wizard/choice-card'
import { formatDate } from '@/lib/format'
import { ProdDialogActions } from './dialog-parts'
import { useConfirmProduction } from './hooks'
import { PROD_ERR, relativeTo, savedQty } from './model'
import { isStale, proposalLine } from './utils'
import type { DraftsModel, ProductionModel } from './types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  model: ProductionModel
  drafts: DraftsModel
}

/** "ยืนยันเริ่มผลิต n SKU" (owner / manager): the whole pending set in one press, with the quantities shown (§5.10, K7, K8). */
export function ConfirmDialog({ open, onOpenChange, model, drafts }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <ConfirmForm model={model} drafts={drafts} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function ConfirmForm({ model, drafts, onDone }: { model: ProductionModel; drafts: DraftsModel; onDone: () => void }) {
  const id = useId()
  const confirm = useConfirmProduction(model.proposal)
  const word = model.storeWord
  const today = model.today
  // The set, quantities and summary as shown when the dialog opened: exactly what goes up (the server answers 409 if
  // it moved), and the closing dialog doesn't re-render with the post-confirm numbers.
  const [s] = useState(() => model.summary)
  const [lines] = useState(() =>
    (model.view?.pendingIds ?? []).flatMap((pid) => {
      const row = model.rowById.get(pid)
      return row ? [{ row, quantity: drafts.confirmQty(row), saved: savedQty(row) }] : []
    }),
  )
  const firstPass = earliestPassedOn(lines.map((l) => l.row))
  const [startedOn, setStartedOn] = useState<ISODate | null>(today)
  const [submitted, setSubmitted] = useState(false)
  const startErr = startedOnError(startedOn, firstPass, today, PROD_ERR)
  const missing = lines.filter((l) => l.quantity == null).length
  const total = lines.reduce((sum, l) => sum + (l.quantity ?? 0), 0)
  const late = today > s.deadline ? diffDays(s.deadline, today) : 0

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (startErr || missing > 0 || lines.length === 0 || !startedOn) return
    try {
      await confirm.mutateAsync({ items: lines.map((l) => ({ productId: l.row.productId, quantity: l.quantity!, saved: l.saved })), startedOn })
      drafts.clear(lines.map((l) => l.row.productId))
      drafts.setAttempted(false)
      toast.success(`ยืนยันเริ่มผลิต ${lines.length} SKU แล้ว`, { description: `ส่งภายใน ${formatDate(s.deadline)}` })
      onDone()
    } catch (error) {
      // already toasted by the hook; a 409 means the pending set moved — the refetched tab shows the new one
      if (isStale(error)) onDone()
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle className="pr-6 leading-snug">ยืนยันเริ่มผลิต {lines.length} SKU</DialogTitle>
        <DialogDescription>
          {proposalLine(model.proposal)} — เมื่อยืนยันแล้ว SKU เหล่านี้จะเปลี่ยนเป็น “กำลังผลิต” และนับถอยหลังถึงกำหนดส่ง
        </DialogDescription>
      </DialogHeader>

      <div className="overflow-hidden rounded-lg border">
        <ul className="max-h-64 divide-y overflow-y-auto">
          {lines.map(({ row, quantity }) => (
            <li key={row.productId} className="flex items-center gap-3 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="tabular font-medium break-all">{row.product.sku}</p>
                <p className="truncate text-xs text-muted-foreground">{row.product.name}</p>
              </div>
              <StoreLogos stores={row.passedStores.map((p) => p.store)} size="sm" max={3} logoClassName="h-5 min-w-5 rounded px-0.5 text-[8px]" />
              <span className="tabular w-24 shrink-0 text-right font-medium">{quantity != null ? `${formatQty(quantity)} ชิ้น` : <span className="text-danger">ยังไม่ระบุ</span>}</span>
            </li>
          ))}
        </ul>
        <p className="tabular flex justify-between border-t bg-muted/40 px-3 py-2 text-sm font-medium">
          <span>รวม</span>
          <span>{formatQty(total)} ชิ้น</span>
        </p>
      </div>
      {missing > 0 && <p className="text-xs text-danger">{PROD_ERR.missingQty(missing)}</p>}

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">ต้องส่งเข้าคลัง/{word}ภายใน</dt>
        <dd className="tabular">
          {formatDate(s.deadline)} <span className="text-muted-foreground">({relativeTo(s.deadline, today)})</span>
        </dd>
        <dt className="text-muted-foreground">วันวางขาย</dt>
        <dd className="tabular">{formatDate(model.targetDate)}</dd>
        <dt className="text-muted-foreground">ผู้ยืนยัน</dt>
        <dd className="min-w-0 truncate">
          {model.me.nickname || model.me.name} · <span className="tabular">{formatDate(today)}</span>
        </dd>
      </dl>

      <Field id={`${id}-start`} label="วันที่เริ่มผลิต" required error={submitted ? (startErr ?? undefined) : undefined} hint="เลือกวันก่อนหน้าได้ ถ้าโรงงานเริ่มผลิตไปแล้ว">
        <DateField id={`${id}-start`} value={startedOn} onChange={setStartedOn} min={firstPass} max={today} clearable={false} className="w-full sm:w-60" />
      </Field>

      {late > 0 && (
        <Callout tone="warning" icon={<TriangleAlertIcon />}>
          เลยกำหนดส่งมาแล้ว {late} วัน — ยืนยันได้ แต่ควรแจ้งทีมผลิตให้เร่ง
        </Callout>
      )}
      {s.confirmed > 0 && (
        <p className="text-xs text-muted-foreground">
          ยืนยันไปแล้ว {s.confirmed} SKU ก่อนหน้านี้ — ครั้งนี้ยืนยันเฉพาะ {lines.length} SKU ใหม่
        </p>
      )}

      <ProdDialogActions label={confirm.isPending ? 'กำลังยืนยัน…' : 'ยืนยันเริ่มผลิต'} pending={confirm.isPending} disabled={lines.length === 0 || missing > 0} />
    </form>
  )
}
