import { PREV_PRODUCTION, productionStatusLabel, restoreTarget } from '@flowtrade/shared'
import { FactoryIcon, InfoIcon, RotateCwIcon, TriangleAlertIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import type { ProposalDetail } from '@/api'
import { EmptyState, useConfirm } from '@/components/common/misc'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Callout } from '@/features/wizard/choice-card'
import { formatDate } from '@/lib/format'
import { AdvanceDialog } from './advance-dialog'
import { CancelDialog } from './cancel-dialog'
import { ConfirmDialog, type ConfirmDraft } from './confirm-dialog'
import { DatesDialog } from './dates-dialog'
import { DeadlineTimeline } from './deadline-timeline'
import { useBackProduction, useKeepProduction, useProductionModel, useRestoreProduction } from './hooks'
import { flagCalloutText, keepCopy, nextCard, PROD_ERR } from './model'
import { NextCard } from './next-card'
import { OrderDialog } from './order-dialog'
import { OrdersCard } from './orders-card'
import { ProductionTable } from './production-table'
import { QuantityDialog } from './quantity-dialog'
import type { OrderDraft, ProductionModel, ProductionTabAction } from './types'

type DialogTarget =
  | { kind: 'confirm' }
  | { kind: 'advance'; to: 'PRODUCED' | 'DELIVERED'; ids?: string[] }
  | { kind: 'dates' | 'cancel' | 'qty'; productId: string }
  | { kind: 'order'; orderId: string }

/** The open dialog; kept (with open: false) while it animates out. `key` remounts it fresh on every open. */
type DialogState = DialogTarget & { key: number; open: boolean }

/** What "ยืนยันเริ่มผลิต" leads to now (button and the home ?do=confirm link): the dialog (quantities are entered there), or a toast. */
type ConfirmCheck = { open: true } | { open: false; text: string }

function confirmCheck(model: ProductionModel): ConfirmCheck {
  if (!model.canDecide) return { open: false, text: PROD_ERR.confirmOnly }
  if (model.summary.pending === 0) return { open: false, text: 'ไม่มี SKU ที่รอยืนยันแล้ว' }
  return { open: true }
}

interface Props {
  proposal: ProposalDetail
  onGoToPresentation: () => void
}

/** "รอผลิต" tab: SKUs that passed a buyer, the confirmation (quantities, "วันที่ต้องการสินค้า", ใบสั่งผลิต) and the production steps. */
export function ProductionTab({ proposal, onGoToPresentation }: Props) {
  const model = useProductionModel(proposal)
  const [draftTexts, setDraftTexts] = useState<Record<string, string>>({})
  const [draftOrder, setDraftOrder] = useState<OrderDraft | null>(null)
  const draft = useMemo<ConfirmDraft>(
    () => ({
      texts: draftTexts,
      order: draftOrder,
      setText: (productId, text) => setDraftTexts((prev) => ({ ...prev, [productId]: text })),
      setOrder: setDraftOrder,
      clear: () => {
        setDraftTexts({})
        setDraftOrder(null)
      },
    }),
    [draftTexts, draftOrder],
  )
  const [params, setParams] = useSearchParams()
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [confirm, confirmDialog] = useConfirm()
  const back = useBackProduction(proposal)
  const restore = useRestoreProduction(proposal)
  const keep = useKeepProduction(proposal)
  const cancelled = proposal.status === 'CANCELLED'
  const word = model.storeWord

  const openDialog = (target: DialogTarget) => setDialog((prev) => ({ ...target, key: (prev?.key ?? 0) + 1, open: true }))
  const closeDialog = () => setDialog((prev) => (prev ? { ...prev, open: false } : prev))

  function runConfirm(check: ConfirmCheck) {
    if (!check.open) return void toast.info(check.text)
    // The button waits (spinner) until the dialog's contact defaults can be computed.
    if (model.peopleReady) openDialog({ kind: 'confirm' })
  }

  // Home deep link ?do=confirm: once the view and the people the dialog's defaults depend on have loaded, the same check
  // as the button; `do` then leaves the URL.
  const deepKey = params.get('do') === 'confirm' && !model.isLoading && model.peopleReady ? 'confirm' : null
  const deepCheck = deepKey && !model.isError ? confirmCheck(model) : null
  const [deepSeen, setDeepSeen] = useState<string | null>(null)
  if (deepKey !== deepSeen) {
    setDeepSeen(deepKey)
    if (deepCheck?.open) setDialog((prev) => ({ kind: 'confirm', key: (prev?.key ?? 0) + 1, open: true }))
  }
  const noticeText = deepCheck && !deepCheck.open ? deepCheck.text : null
  useEffect(() => {
    if (!deepKey) return
    if (noticeText) toast.info(noticeText, { id: 'production-deep-link' })
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        p.delete('do')
        p.set('tab', 'production')
        return p
      },
      { replace: true },
    )
  }, [deepKey, noticeText, setParams])

  async function onBack(productId: string) {
    const row = model.rowById.get(productId)
    if (!row || back.isPending || (row.status !== 'IN_PRODUCTION' && row.status !== 'PRODUCED' && row.status !== 'DELIVERED')) return
    const from = row.status
    const to = PREV_PRODUCTION[from]
    if (!to) return
    const sku = row.product.sku
    const toPending = to === 'PENDING'
    const cleared = from === 'DELIVERED' ? row.item?.deliveredOn : row.item?.producedOn
    const ok = await confirm({
      title: toPending ? `ย้อน ${sku} กลับเป็น “รอยืนยัน”?` : `ย้อน ${sku} กลับเป็น “${productionStatusLabel(to)}”?`,
      description: toPending
        ? row.passed
          ? 'SKU นี้จะกลับไปเป็น “รอยืนยัน” และต้องกดยืนยันเริ่มผลิตอีกครั้ง'
          : `SKU นี้ไม่มี${word}ที่ผ่านแล้ว จะหายไปจากรายการ (จำนวนที่กรอกไว้ยังเก็บไว้)`
        : `วันที่${from === 'DELIVERED' ? 'ส่ง' : 'ผลิตเสร็จ'}ที่บันทึกไว้ (${formatDate(cleared)}) จะถูกล้าง`,
      confirmLabel: 'ย้อนกลับ',
      cancelLabel: 'ปิด',
    })
    if (!ok) return
    try {
      await back.mutateAsync({ productId, from })
      toast.success(`ย้อน ${sku} กลับเป็น “${productionStatusLabel(to)}” แล้ว`)
    } catch {
      // error already toasted by the hook
    }
  }

  async function onRestore(productId: string) {
    const row = model.rowById.get(productId)
    if (!row?.item || row.status !== 'CANCELLED' || restore.isPending) return
    const sku = row.product.sku
    const ok = await confirm({
      title: row.skipped ? `กู้คืน ${sku}?` : `กู้คืนการผลิต ${sku}?`,
      description: `SKU นี้จะกลับไปเป็น “${productionStatusLabel(restoreTarget(row.item))}”`,
      confirmLabel: 'กู้คืน',
      cancelLabel: 'ปิด',
    })
    if (!ok) return
    try {
      await restore.mutateAsync({ productId })
      toast.success(`กู้คืน ${sku} แล้ว`)
    } catch {
      // error already toasted by the hook
    }
  }

  async function onKeep(productId: string) {
    const row = model.rowById.get(productId)
    if (!row?.needsReview || keep.isPending) return
    const copy = keepCopy(row, word)
    const ok = await confirm({ title: copy.title, description: copy.description, confirmLabel: copy.button, cancelLabel: 'ปิด' })
    if (!ok) return
    try {
      await keep.mutateAsync({ productId, storeIds: row.passedStores.map((s) => s.store.id) })
      toast.success(`บันทึก “${copy.button}” ของ ${row.product.sku} แล้ว`)
    } catch {
      // error already toasted by the hook
    }
  }

  function onAction(a: ProductionTabAction) {
    switch (a.kind) {
      case 'confirm':
        return runConfirm(confirmCheck(model))
      case 'advance':
        return openDialog({ kind: 'advance', to: a.to, ids: a.ids })
      case 'dates':
      case 'cancel':
        return openDialog({ kind: a.kind, productId: a.productId })
      case 'back':
        return void onBack(a.productId)
      case 'restore':
        return void onRestore(a.productId)
      case 'keep':
        return void onKeep(a.productId)
      case 'editQty':
        return openDialog({ kind: 'qty', productId: a.productId })
      case 'editOrder':
        return openDialog({ kind: 'order', orderId: a.orderId })
      case 'goPresentation':
        return onGoToPresentation()
    }
  }

  const state = model.summary.state
  let body
  if (model.isLoading) body = <ProductionSkeleton />
  else if (model.isError)
    body = (
      <EmptyState
        icon={<TriangleAlertIcon className="size-5" />}
        title="โหลดข้อมูลการผลิตไม่สำเร็จ"
        description="ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง"
        action={
          <Button variant="outline" onClick={() => model.refetch()}>
            <RotateCwIcon /> ลองอีกครั้ง
          </Button>
        }
      />
    )
  else if (state === 'NONE')
    body = cancelled ? null : (
      <EmptyState
        icon={<FactoryIcon className="size-5" />}
        title="ยังไม่มี SKU ที่ผ่าน Buyer"
        description={`เมื่อ Buyer ของ${word}ใดให้ผ่าน SKU ที่ผ่านจะขึ้นที่นี่อัตโนมัติ แล้วจึงกรอกจำนวนผลิตและยืนยันเริ่มผลิต`}
        action={
          <Button variant="outline" onClick={onGoToPresentation}>
            ไปที่นำเสนอ Buyer
          </Button>
        }
      />
    )
  else {
    const card = nextCard({ summary: model.summary, rows: model.rows, canWork: model.canWork, canDecide: model.canDecide, word, today: model.today })
    body = (
      <>
        {!cancelled && <NextCard card={card} onAction={onAction} busy={card.primary?.action.kind === 'confirm' && !model.peopleReady} />}
        {model.summary.flagged > 0 && card.kind !== 'review' && (
          <Callout tone="warning" icon={<TriangleAlertIcon />} title={flagCalloutText(model.rows)}>
            {model.canDecide ? 'ตรวจสอบและเลือกการดำเนินการที่แถวของ SKU นั้นด้านล่าง' : 'รอเจ้าของโปรเจกต์หรือผู้จัดการตัดสินใจ'}
          </Callout>
        )}
        <DeadlineTimeline model={model} />
        <ProductionTable model={model} onAction={onAction} />
        {model.orders.length > 0 && <OrdersCard model={model} onAction={onAction} />}
      </>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {cancelled && (
        <Callout tone="info" icon={<InfoIcon />}>
          โปรเจกต์ถูกยกเลิก — ดูข้อมูลการผลิตได้อย่างเดียว
        </Callout>
      )}
      {body}
      {dialog && <DialogHost dialog={dialog} model={model} draft={draft} onClose={closeDialog} />}
      {confirmDialog}
    </div>
  )
}

function DialogHost({ dialog, model, draft, onClose }: { dialog: DialogState; model: ProductionModel; draft: ConfirmDraft; onClose: () => void }) {
  const onOpenChange = (open: boolean) => {
    if (!open) onClose()
  }
  switch (dialog.kind) {
    case 'confirm':
      return <ConfirmDialog key={dialog.key} open={dialog.open} onOpenChange={onOpenChange} model={model} draft={draft} />
    case 'advance':
      return <AdvanceDialog key={dialog.key} open={dialog.open} onOpenChange={onOpenChange} model={model} to={dialog.to} initialIds={dialog.ids} />
    case 'dates':
      return <DatesDialog key={dialog.key} open={dialog.open} onOpenChange={onOpenChange} model={model} productId={dialog.productId} />
    case 'cancel':
      return <CancelDialog key={dialog.key} open={dialog.open} onOpenChange={onOpenChange} model={model} productId={dialog.productId} />
    case 'qty':
      return <QuantityDialog key={dialog.key} open={dialog.open} onOpenChange={onOpenChange} model={model} productId={dialog.productId} />
    case 'order':
      return <OrderDialog key={dialog.key} open={dialog.open} onOpenChange={onOpenChange} model={model} orderId={dialog.orderId} />
  }
}

function ProductionSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="กำลังโหลดข้อมูลการผลิต">
      <Skeleton className="h-28 rounded-xl" />
      <Skeleton className="h-24 rounded-xl" />
      <div className="space-y-2 rounded-xl border bg-card p-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    </div>
  )
}
