import { defaultNeededOn, diffDays, formatQty, latestNeededOn, neededOnError, type ISODate } from '@flowtrade/shared'
import { TriangleAlertIcon } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { StoreLogos } from '@/components/common/badges'
import { DateField } from '@/components/common/date-field'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Field } from '@/features/presentation/dialog-parts'
import { Callout } from '@/features/wizard/choice-card'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ProdDialogActions } from './dialog-parts'
import { useConfirmProduction } from './hooks'
import { LAUNCH_RISK_DAYS, PROD_ERR, qtyText, readQty, relativeTo, savedQty } from './model'
import { isStale, proposalLine } from './utils'
import type { ProductionModel } from './types'

/** What was typed in the dialog, per SKU, kept by the tab so closing or a 409 doesn't lose it; cleared after a confirm. */
export interface TypedQty {
  texts: Record<string, string>
  set(productId: string, text: string): void
  clear(): void
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  model: ProductionModel
  typed: TypedQty
}

/**
 * "ยืนยันเริ่มผลิต n SKU" (owner / manager): the whole pending set in one press. The quantities are typed here (never in
 * the table) with "วันที่ต้องการสินค้า" — these SKUs' delivery due date, starting at the plan deadline (§5.10, K7, K8).
 */
export function ConfirmDialog({ open, onOpenChange, model, typed }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <ConfirmForm model={model} typed={typed} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

const inputId = (formId: string, productId: string) => `${formId}-qty-${productId}`

function ConfirmForm({ model, typed, onDone }: { model: ProductionModel; typed: TypedQty; onDone: () => void }) {
  const id = useId()
  const confirm = useConfirmProduction(model.proposal)
  const word = model.storeWord
  const today = model.today
  // The set and summary as shown when the dialog opened: exactly what goes up (the server answers 409 if it moved,
  // `saved` included), and the closing dialog doesn't re-render with the post-confirm numbers.
  const [s] = useState(() => model.summary)
  const [lines] = useState(() =>
    (model.view?.pendingIds ?? []).flatMap((pid) => {
      const row = model.rowById.get(pid)
      return row ? [{ row, saved: savedQty(row) }] : []
    }),
  )
  // What was typed before (dialog closed, a 409) wins; else a quantity kept from a confirm that was stepped back.
  const [texts, setTexts] = useState<Record<string, string>>(() => Object.fromEntries(lines.map((l) => [l.row.productId, typed.texts[l.row.productId] ?? qtyText(l.saved)])))
  const latest = latestNeededOn(today, model.targetDate)
  const [neededOn, setNeededOn] = useState<ISODate | null>(() => defaultNeededOn(model.summary.planDeadline, today, model.targetDate))
  const [submitted, setSubmitted] = useState(false)

  const read = lines.map((l) => ({ ...l, ...readQty(texts[l.row.productId] ?? '') }))
  const invalid = read.filter((l) => l.error)
  const empty = invalid.filter((l) => !(texts[l.row.productId] ?? '').trim()).length
  const total = read.reduce((sum, l) => sum + (l.value ?? 0), 0)
  const needErr = neededOnError(neededOn, today, model.targetDate, PROD_ERR)
  const late = today > s.planDeadline ? diffDays(s.planDeadline, today) : 0
  // Same rule as the timeline's yellow: due closer to launch than LAUNCH_RISK_DAYS.
  const leftToLaunch = !needErr && neededOn ? diffDays(neededOn, model.targetDate) : null
  const risky = leftToLaunch != null && leftToLaunch < LAUNCH_RISK_DAYS

  const setText = (productId: string, text: string) => {
    setTexts((prev) => ({ ...prev, [productId]: text }))
    typed.set(productId, text)
  }
  // On blur a valid number is regrouped ("500000" → "500,000").
  const tidy = (productId: string) => {
    const r = readQty(texts[productId] ?? '')
    if (r.value != null) setText(productId, formatQty(r.value))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (invalid.length > 0) {
      document.getElementById(inputId(id, invalid[0].row.productId))?.focus()
      return
    }
    if (needErr || lines.length === 0 || !neededOn) return
    try {
      await confirm.mutateAsync({ items: read.map((l) => ({ productId: l.row.productId, quantity: l.value!, saved: l.saved })), neededOn })
      typed.clear()
      toast.success(`ยืนยันเริ่มผลิต ${lines.length} SKU แล้ว`, { description: `ต้องการสินค้า ${formatDate(neededOn)}` })
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
          {proposalLine(model.proposal)} — กรอกจำนวนผลิตของแต่ละ SKU และวันที่ต้องการสินค้า เมื่อยืนยันแล้ว SKU เหล่านี้จะเปลี่ยนเป็น “กำลังผลิต” และนับถอยหลังถึงวันที่ต้องการสินค้า
        </DialogDescription>
      </DialogHeader>

      <fieldset className="grid min-w-0 gap-2">
        <legend className="mb-2 text-sm font-medium">
          จำนวนผลิต{' '}
          <span className="text-danger" aria-hidden>
            *
          </span>
        </legend>
        <div className="overflow-hidden rounded-lg border">
          <ul className="max-h-72 divide-y overflow-y-auto">
            {read.map(({ row, error }) => {
              const qid = inputId(id, row.productId)
              const shownError = submitted ? error : null
              return (
                <li key={row.productId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto_9.5rem]">
                  <label htmlFor={qid} className="min-w-0 cursor-pointer">
                    <span className="tabular block font-medium break-all">{row.product.sku}</span>
                    <span className="block truncate text-xs text-muted-foreground">{row.product.name}</span>
                  </label>
                  <StoreLogos stores={row.passedStores.map((p) => p.store)} size="sm" max={3} logoClassName="h-5 min-w-5 rounded px-0.5 text-[8px]" />
                  <div className="col-span-2 min-w-0 space-y-1 sm:col-span-1">
                    <InputGroup className={cn('h-8 bg-card', shownError && 'ring-2 ring-danger/40')}>
                      <InputGroupInput
                        id={qid}
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        aria-label={`จำนวนผลิต ${row.product.sku}`}
                        aria-invalid={shownError ? true : undefined}
                        aria-describedby={shownError ? `${qid}-error` : undefined}
                        placeholder="ใส่จำนวน"
                        value={texts[row.productId] ?? ''}
                        onChange={(e) => setText(row.productId, e.target.value)}
                        onBlur={() => tidy(row.productId)}
                        className="tabular text-right"
                      />
                      <InputGroupAddon align="inline-end">ชิ้น</InputGroupAddon>
                    </InputGroup>
                    {shownError && (
                      <p id={`${qid}-error`} className="text-xs text-danger">
                        {shownError}
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
          <p className="tabular flex justify-between border-t bg-muted/40 px-3 py-2 text-sm font-medium">
            <span>รวม</span>
            <span>
              {formatQty(total)} ชิ้น
              {invalid.length > 0 && (
                <span className="ml-1 font-normal text-muted-foreground">
                  ({[empty > 0 && `ยังไม่กรอก ${empty} SKU`, invalid.length > empty && `ไม่ถูกต้อง ${invalid.length - empty} SKU`].filter(Boolean).join(' · ')})
                </span>
              )}
            </span>
          </p>
        </div>
      </fieldset>

      <Field
        id={`${id}-need`}
        label="วันที่ต้องการสินค้า"
        required
        error={submitted ? (needErr ?? undefined) : undefined}
        hint={
          latest > today
            ? `ใช้เป็นกำหนดส่งเข้าคลัง/${word}ของ SKU ชุดนี้ · ตั้งต้นที่ Deadline ส่งคลัง (${formatDate(s.planDeadline)}) เลือกได้ถึงวันวางขาย (${formatDate(latest)})`
            : 'เลยวันวางขายแล้ว — เลือกได้แค่วันนี้'
        }
      >
        <DateField id={`${id}-need`} value={neededOn} onChange={setNeededOn} min={today} max={latest} clearable={false} className="w-full sm:w-60" />
      </Field>

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Deadline ส่งคลัง (ตั้งต้น)</dt>
        <dd className="tabular">
          {formatDate(s.planDeadline)} <span className="text-muted-foreground">({relativeTo(s.planDeadline, today)})</span>
        </dd>
        <dt className="text-muted-foreground">วันวางขาย</dt>
        <dd className="tabular">{formatDate(model.targetDate)}</dd>
        <dt className="text-muted-foreground">ผู้ยืนยัน</dt>
        <dd className="min-w-0 truncate">
          {model.me.nickname || model.me.name} · <span className="tabular">{formatDate(today)}</span>
        </dd>
      </dl>

      {risky && (
        <Callout tone="warning" icon={<TriangleAlertIcon />}>
          วันที่ต้องการสินค้าห่างวันวางขายแค่ {leftToLaunch} วัน (น้อยกว่า {LAUNCH_RISK_DAYS} วัน) — ใกล้วันวางขายเกินไป มีความเสี่ยง
        </Callout>
      )}
      {late > 0 && (
        <Callout tone="warning" icon={<TriangleAlertIcon />}>
          เลย Deadline ส่งคลังมาแล้ว {late} วัน — ยืนยันได้ แต่ควรแจ้งทีมผลิตให้เร่ง
        </Callout>
      )}
      {s.confirmed > 0 && (
        <p className="text-xs text-muted-foreground">
          ยืนยันไปแล้ว {s.confirmed} SKU ก่อนหน้านี้ — ครั้งนี้ยืนยันเฉพาะ {lines.length} SKU ใหม่
        </p>
      )}

      <ProdDialogActions label={confirm.isPending ? 'กำลังยืนยัน…' : 'ยืนยันเริ่มผลิต'} pending={confirm.isPending} disabled={lines.length === 0} />
    </form>
  )
}
