import {
  BadgeCheckIcon,
  CalendarClockIcon,
  FactoryIcon,
  FileTextIcon,
  PackageCheckIcon,
  PackageXIcon,
  PencilIcon,
  RotateCcwIcon,
  TruckIcon,
  Undo2Icon,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { TONE_SOFT } from '@/features/presentation/model'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { eventTitle } from './model'
import type { ProductionEvent, ProductionModel, ProductionRow, Tone } from './types'

function eventLook(e: ProductionEvent): { icon: LucideIcon; tone: Tone } {
  switch (e.kind) {
    case 'QUANTITY':
      return { icon: PencilIcon, tone: 'muted' }
    case 'CONFIRM':
      return { icon: FactoryIcon, tone: 'info' }
    case 'ADVANCE':
      return e.toStatus === 'DELIVERED' ? { icon: TruckIcon, tone: 'success' } : { icon: PackageCheckIcon, tone: 'brand' }
    case 'BACK':
      return { icon: Undo2Icon, tone: 'muted' }
    case 'CANCEL':
      return { icon: PackageXIcon, tone: e.fromStatus === 'PENDING' ? 'muted' : 'danger' }
    case 'RESTORE':
      return { icon: RotateCcwIcon, tone: 'muted' }
    case 'KEEP':
      return { icon: BadgeCheckIcon, tone: 'warning' }
    case 'ORDER':
      return { icon: FileTextIcon, tone: 'muted' }
    default:
      return { icon: CalendarClockIcon, tone: 'muted' }
  }
}

function EventList({ row, model }: { row: ProductionRow; model: ProductionModel }) {
  const events = model.eventsOf(row.productId)
  if (events.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">ยังไม่มีประวัติ</p>
  return (
    <ol className="space-y-3">
      {events.map((e) => {
        const { icon: Icon, tone } = eventLook(e)
        return (
          <li key={e.id} className="flex gap-2.5">
            <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full', TONE_SOFT[tone])} aria-hidden>
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-sm break-words">{eventTitle(e, model.storeWord, model.userName)}</p>
              <p className="text-xs text-muted-foreground">
                {model.userName(e.actorId)} · <span className="tabular">{formatDateTime(e.recordedAt)}</span>
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * "ประวัติ SKU นี้": a popover anchored at the row's ⋯ button (`children`) on wide screens, a bottom sheet on phones.
 * Controlled — the row menu opens it.
 */
export function ItemHistory({
  row,
  model,
  open,
  onOpenChange,
  mobile,
  children,
}: {
  row: ProductionRow
  model: ProductionModel
  open: boolean
  onOpenChange: (open: boolean) => void
  mobile: boolean
  children: ReactNode
}) {
  const title = `ประวัติ ${row.product.sku}`
  if (mobile)
    return (
      <>
        {children}
        <Sheet open={open} onOpenChange={onOpenChange}>
          <SheetContent side="bottom" className="max-h-[85dvh] gap-0 rounded-t-xl">
            <SheetHeader className="border-b">
              <SheetTitle>{title}</SheetTitle>
              <SheetDescription className="truncate">{row.product.name}</SheetDescription>
            </SheetHeader>
            <div className="overflow-y-auto p-4">
              <EventList row={row} model={model} />
            </div>
          </SheetContent>
        </Sheet>
      </>
    )
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <span className="inline-flex">{children}</span>
      </PopoverAnchor>
      <PopoverContent align="end" className="w-80 p-0" aria-label={title}>
        <div className="border-b px-4 py-3">
          <p className="text-sm font-semibold">{title}</p>
          <p className="truncate text-xs text-muted-foreground">{row.product.name}</p>
        </div>
        <div className="max-h-80 overflow-y-auto p-4">
          <EventList row={row} model={model} />
        </div>
      </PopoverContent>
    </Popover>
  )
}
