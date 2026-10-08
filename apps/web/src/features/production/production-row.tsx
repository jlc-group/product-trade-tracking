import { productionFlagLabel, productionRowActions, productionStatusLabel } from '@flowtrade/shared'
import {
  CalendarClockIcon,
  EllipsisIcon,
  FileTextIcon,
  HashIcon,
  HistoryIcon,
  PackageCheckIcon,
  PackageXIcon,
  RotateCcwIcon,
  TriangleAlertIcon,
  TruckIcon,
  Undo2Icon,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { StoreLogos } from '@/components/common/badges'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useIsMobile } from '@/hooks/use-mobile'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ItemHistory } from './item-history'
import { arrivalLine, flagStripText, keepCopy, keptNote, orderLine, relativeTo, rowMeta, statusSubLine, type SubLine } from './model'
import { QuantityCell } from './quantity-cell'
import { StatusChip } from './status-chip'
import type { ProductionModel, ProductionRow, ProductionTabAction } from './types'

type OnAction = (a: ProductionTabAction) => void

// Rows are subgrids of this template from @3xl, so the column header lines up with every row. Below it a row is a
// card: SKU + chip/⋯, stores, quantity, status line, forward button, then the flag strip.
export const COLS = '@3xl:grid @3xl:grid-cols-[minmax(0,1fr)_7rem_8.5rem_10rem_auto_2rem] @3xl:gap-x-3'
export const ROW = 'grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 px-4 @3xl:col-span-6 @3xl:grid-cols-subgrid'

const SUB_TONE: Record<SubLine['tone'], string> = {
  danger: 'font-medium text-danger',
  warning: 'font-medium text-warning-foreground',
  success: 'text-success',
  info: 'font-medium text-info',
  muted: 'text-muted-foreground',
}

/** Under the status chip: the step's line (statusSubLine), "ของถึงประมาณ …" (arrivalLine) and the review flag. */
function StatusLines({ row, word, lines }: { row: ProductionRow; word: string; lines: SubLine[] }) {
  if (lines.length === 0 && !row.needsReview) return null
  return (
    <>
      {lines.map((l) => (
        <span key={l.text} className={cn('tabular block text-xs', SUB_TONE[l.tone])}>
          {l.text}
        </span>
      ))}
      {row.needsReview && row.flag && (
        <span className="inline-flex h-5 w-fit items-center gap-1 rounded-full bg-danger-soft px-2 text-[11px] font-medium text-danger">
          <TriangleAlertIcon className="size-3 shrink-0" aria-hidden />
          {productionFlagLabel(row.flag, word)}
        </span>
      )}
    </>
  )
}

function PassedStores({ row, word }: { row: ProductionRow; word: string }) {
  const stores = row.passedStores
  if (stores.length === 0) return <span className="text-sm text-muted-foreground">—</span>
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <StoreLogos stores={stores.map((s) => s.store)} size="sm" max={4} />
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {stores.map((s) => (
            <span key={s.store.id} className="block">
              {s.store.name} · ผ่าน {formatDate(s.passedOn)}
            </span>
          ))}
        </TooltipContent>
      </Tooltip>
      <span className="text-xs text-muted-foreground @3xl:sr-only">
        ผ่าน {stores.length} {word}
        <span className="sr-only">: {stores.map((s) => s.store.name).join(', ')}</span>
      </span>
    </span>
  )
}

function RowMenu({ row, model, onAction }: { row: ProductionRow; model: ProductionModel; onAction: OnAction }) {
  const isMobile = useIsMobile()
  const [historyOpen, setHistoryOpen] = useState(false)
  // The menu would hand focus back to ⋯ as it closes, which closes the history popover it just opened.
  const toHistory = useRef(false)
  const a = productionRowActions(row, { canWork: model.canWork, canDecide: model.canDecide }, model.today)
  const id = row.productId
  const backToPending = a.backTo === 'PENDING'
  const decide = !!(a.backTo || a.cancel || a.skip || a.restoreTo)
  const edit = a.editDates || a.editQuantity || a.editOrder
  const orderId = row.item?.orderId

  return (
    <ItemHistory row={row} model={model} open={historyOpen} onOpenChange={setHistoryOpen} mobile={isMobile}>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`ตัวเลือก ${row.product.sku}`}>
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-56"
          onCloseAutoFocus={(e) => {
            if (!toHistory.current) return
            e.preventDefault()
            toHistory.current = false
          }}
        >
          {a.editQuantity && (
            <DropdownMenuItem onSelect={() => onAction({ kind: 'editQty', productId: id })}>
              <HashIcon /> แก้จำนวนผลิต…
            </DropdownMenuItem>
          )}
          {a.editDates && (
            <DropdownMenuItem onSelect={() => onAction({ kind: 'dates', productId: id })}>
              <CalendarClockIcon /> {row.status === 'IN_PRODUCTION' ? 'แก้วันที่ต้องการสินค้า…' : 'แก้วันที่…'}
            </DropdownMenuItem>
          )}
          {a.editOrder && orderId && (
            <DropdownMenuItem onSelect={() => onAction({ kind: 'editOrder', orderId })}>
              <FileTextIcon /> แก้ข้อมูลใบสั่งผลิต…
            </DropdownMenuItem>
          )}
          {a.backTo && (
            <DropdownMenuItem onSelect={() => onAction({ kind: 'back', productId: id })}>
              <Undo2Icon /> {backToPending ? 'ย้อนกลับเป็น “รอยืนยัน”' : `ย้อนเป็น “${productionStatusLabel(a.backTo)}”`}
            </DropdownMenuItem>
          )}
          {a.skip && (
            <DropdownMenuItem onSelect={() => onAction({ kind: 'cancel', productId: id })}>
              <PackageXIcon /> ไม่ผลิต SKU นี้…
            </DropdownMenuItem>
          )}
          {a.cancel && (
            <DropdownMenuItem variant="destructive" onSelect={() => onAction({ kind: 'cancel', productId: id })}>
              <PackageXIcon /> ยกเลิกการผลิต…
            </DropdownMenuItem>
          )}
          {a.restoreTo && (
            <DropdownMenuItem onSelect={() => onAction({ kind: 'restore', productId: id })}>
              <RotateCcwIcon /> กู้คืน
            </DropdownMenuItem>
          )}
          {(edit || decide) && <DropdownMenuSeparator />}
          <DropdownMenuItem
            onSelect={() => {
              toHistory.current = true
              setHistoryOpen(true)
            }}
          >
            <HistoryIcon /> ประวัติ SKU นี้
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ItemHistory>
  )
}

/** Warning strip of a confirmed SKU whose passing stores moved (K2, K9), or the muted note once it was kept. */
function FlagStrip({ row, model, onAction }: { row: ProductionRow; model: ProductionModel; onAction: OnAction }) {
  const word = model.storeWord
  const kept = keptNote(row, word, model.userName)
  if (kept) return <p className="col-span-2 text-xs text-muted-foreground @3xl:col-span-6">{kept}</p>
  if (!row.needsReview) return null
  const keep = keepCopy(row, word)
  const id = row.productId
  const canCancel = model.canDecide && (row.status === 'IN_PRODUCTION' || row.status === 'PRODUCED')
  return (
    <div className="col-span-2 -mx-4 -mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 bg-warning-soft/50 px-4 py-2 text-xs @3xl:col-span-6">
      <p className="flex min-w-0 flex-1 basis-60 items-start gap-1.5 text-warning-foreground">
        <TriangleAlertIcon className="mt-px size-3.5 shrink-0" aria-hidden />
        <span className="break-words">{flagStripText(row, word)}</span>
      </p>
      {model.canDecide ? (
        <span className="flex flex-wrap items-center gap-2">
          {row.flag === 'STORES_CHANGED' && (
            <Button size="sm" variant="outline" onClick={() => onAction({ kind: 'editQty', productId: id })}>
              แก้จำนวน
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => onAction({ kind: 'keep', productId: id })}>
            {keep.button}
          </Button>
          {row.flag !== 'STORES_CHANGED' && canCancel && (
            <Button size="sm" variant="ghost" className="text-danger hover:text-danger" onClick={() => onAction({ kind: 'cancel', productId: id })}>
              ยกเลิกการผลิต…
            </Button>
          )}
        </span>
      ) : (
        model.proposal.status !== 'CANCELLED' && <span className="text-muted-foreground">รอเจ้าของโปรเจกต์หรือผู้จัดการตรวจสอบ</span>
      )}
    </div>
  )
}

/** One SKU (§5.9): product, passing stores, quantity (read only), status, the forward step and the ⋯ menu. */
export function ProductionRowView({ row, model, onAction }: { row: ProductionRow; model: ProductionModel; onAction: OnAction }) {
  const { product, item } = row
  const word = model.storeWord
  const meta = rowMeta(row, model.userName)
  const order = item?.orderId ? model.orderById.get(item.orderId) : undefined
  const orderText = order ? orderLine(order) : null
  const a = productionRowActions(row, { canWork: model.canWork, canDecide: model.canDecide }, model.today)
  const forward = a.advanceTo === 'PRODUCED' || a.advanceTo === 'DELIVERED' ? a.advanceTo : null
  const muted = row.status === 'CANCELLED'
  const lines = [statusSubLine(row, model.today), arrivalLine(row, order, model.targetDate)].filter((l): l is SubLine => !!l)
  const statusLines = <StatusLines row={row} word={word} lines={lines} />
  const hasLines = lines.length > 0 || row.needsReview

  return (
    <li className={cn(ROW, 'py-3 @3xl:items-center')}>
      <div className={cn('min-w-0 space-y-0.5', muted && 'opacity-70')}>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="tabular text-sm font-medium break-all">{product.sku}</span>
          {!product.isActive && <span className="rounded bg-muted px-1 text-[11px] leading-4 text-muted-foreground">ปิดใช้งาน</span>}
          {!row.inProposal && <span className="rounded bg-muted px-1 text-[11px] leading-4 text-muted-foreground">ไม่อยู่ในโปรเจกต์แล้ว</span>}
        </p>
        <p className="text-sm break-words @3xl:truncate" title={[product.brand, product.name, product.size].filter(Boolean).join(' · ')}>
          {product.name}
          {product.size && <span className="text-muted-foreground"> · {product.size}</span>}
        </p>
        {meta && <p className="text-xs text-muted-foreground">{meta}</p>}
        {orderText && (
          <p className="truncate text-xs text-muted-foreground" title={orderText}>
            {orderText}
          </p>
        )}
        {row.status === 'CANCELLED' && item?.cancelReason && (
          <p className="line-clamp-1 text-xs break-words text-muted-foreground" title={item.cancelReason}>
            “{item.cancelReason}”
          </p>
        )}
      </div>

      <div className="col-start-2 row-start-1 flex items-start justify-end gap-1 @3xl:col-start-6 @3xl:items-center">
        <StatusChip status={row.status} skipped={row.skipped} word={word} className="mt-1 @3xl:hidden" />
        <RowMenu row={row} model={model} onAction={onAction} />
      </div>

      <div className="col-span-2 min-w-0 @3xl:col-span-1">
        <PassedStores row={row} word={word} />
      </div>

      <div className="col-span-2 min-w-0 @3xl:col-span-1">
        <QuantityCell row={row} />
      </div>

      <div className="hidden min-w-0 space-y-1 @3xl:block">
        <StatusChip status={row.status} skipped={row.skipped} word={word} />
        {statusLines}
      </div>
      {hasLines && <div className="col-span-2 flex flex-wrap items-center gap-x-2 gap-y-1 @3xl:hidden">{statusLines}</div>}

      {/* A confirmed SKU whose production start is still ahead: when it starts, in place of "ผลิตเสร็จ". */}
      {!forward && a.startsOn && (
        <p className="tabular col-span-2 flex items-center gap-1.5 text-xs @3xl:col-span-1 @3xl:col-start-5 @3xl:block @3xl:text-right">
          <CalendarClockIcon className="size-3.5 shrink-0 text-info @3xl:hidden" aria-hidden />
          <span className="font-medium whitespace-nowrap text-info">เริ่มผลิต {formatDate(a.startsOn, { withYear: false })}</span>
          <span className="text-muted-foreground @3xl:hidden" aria-hidden>
            ·
          </span>
          <span className="whitespace-nowrap text-muted-foreground @3xl:block">{relativeTo(a.startsOn, model.today)}</span>
        </p>
      )}

      {forward && (
        <div className="col-span-2 @3xl:col-span-1 @3xl:col-start-5">
          <Button
            size="sm"
            variant="outline"
            className="w-full @3xl:w-auto"
            aria-label={forward === 'PRODUCED' ? `บันทึกผลิตเสร็จ ${product.sku}` : `บันทึกส่งเข้าคลัง/${word}แล้ว ${product.sku}`}
            onClick={() => onAction({ kind: 'advance', to: forward, ids: [row.productId] })}
          >
            {forward === 'PRODUCED' ? <PackageCheckIcon /> : <TruckIcon />}
            {forward === 'PRODUCED' ? 'ผลิตเสร็จ' : 'ส่งแล้ว'}
          </Button>
        </div>
      )}

      <FlagStrip row={row} model={model} onAction={onAction} />
    </li>
  )
}
