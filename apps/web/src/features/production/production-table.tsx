import type { ProductionStatus } from '@flowtrade/shared'
import { PackageCheckIcon, TruckIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { MoreToggle } from '@/features/home/panel'
import { cn } from '@/lib/utils'
import { COLS, ProductionRowView, ROW } from './production-row'
import { StatusChip } from './status-chip'
import type { ProductionModel, ProductionTabAction } from './types'

const COUNTED: ProductionStatus[] = ['PENDING', 'IN_PRODUCTION', 'PRODUCED', 'DELIVERED']

/** "สินค้าที่ผ่าน Buyer": toolbar with counts and bulk steps, one row per SKU (nothing typed in the table) and the cancelled fold (§5.9). */
export function ProductionTable({ model, onAction }: { model: ProductionModel; onAction: (a: ProductionTabAction) => void }) {
  const s = model.summary
  const word = model.storeWord
  const [showCancelled, setShowCancelled] = useState(false)
  const counts: Record<ProductionStatus, number> = { PENDING: s.pending, IN_PRODUCTION: s.inProduction, PRODUCED: s.produced, DELIVERED: s.delivered, CANCELLED: s.cancelled }
  const cancelled = model.cancelledRows
  const skippedAll = cancelled.every((r) => r.skipped)
  const skippedNone = cancelled.every((r) => !r.skipped)

  return (
    <section aria-labelledby="production-table-title" className="@container overflow-clip rounded-xl border bg-card">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 px-4 py-3">
        <h2 id="production-table-title" className="mr-1 text-base font-semibold">
          สินค้าที่ผ่าน Buyer
        </h2>
        {COUNTED.filter((st) => counts[st] > 0).map((st) => (
          <StatusChip key={st} status={st} word={word} size="sm" count={counts[st]} />
        ))}
        {model.canWork && (s.inProduction > 0 || s.produced > 0) && (
          <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
            {s.inProduction > 0 && (
              <Button size="sm" variant="outline" className="flex-1 sm:flex-none" onClick={() => onAction({ kind: 'advance', to: 'PRODUCED' })}>
                <PackageCheckIcon /> บันทึกผลิตเสร็จ ({s.inProduction})
              </Button>
            )}
            {s.produced > 0 && (
              <Button size="sm" variant="outline" className="flex-1 sm:flex-none" onClick={() => onAction({ kind: 'advance', to: 'DELIVERED' })}>
                <TruckIcon /> บันทึกส่งแล้ว ({s.produced})
              </Button>
            )}
          </div>
        )}
      </div>
      {!model.canWork && model.proposal.status !== 'CANCELLED' && (
        <p className="border-t bg-muted/30 px-4 py-2 text-xs text-muted-foreground">บันทึกการผลิตได้เฉพาะเจ้าของและทีมงาน — ขอให้เจ้าของเพิ่มคุณเป็นทีมงาน</p>
      )}

      {model.rows.length > 0 ? (
        <div className={COLS}>
          <div aria-hidden className={cn(ROW, 'hidden border-y bg-muted/40 py-2 text-xs text-muted-foreground @3xl:grid')}>
            <span>สินค้า</span>
            <span>{word}ที่ผ่าน</span>
            <span>จำนวนผลิต</span>
            <span>สถานะ</span>
            <span />
            <span />
          </div>
          <ul className="divide-y border-t @3xl:col-span-6 @3xl:grid @3xl:grid-cols-subgrid @3xl:border-t-0">
            {model.rows.map((r) => (
              <ProductionRowView key={r.productId} row={r} model={model} onAction={onAction} />
            ))}
          </ul>
        </div>
      ) : (
        <p className="border-t px-4 py-6 text-center text-sm text-muted-foreground">ไม่มี SKU ที่ต้องผลิตอยู่ตอนนี้</p>
      )}

      {cancelled.length > 0 && (
        <div className="border-t">
          <MoreToggle
            expanded={showCancelled}
            label={`${skippedAll ? 'ไม่ผลิต' : skippedNone ? 'ยกเลิกการผลิต' : 'ยกเลิก/ไม่ผลิต'} ${cancelled.length} SKU`}
            onToggle={() => setShowCancelled((v) => !v)}
          />
          {showCancelled && (
            <div className={COLS}>
              <ul className="divide-y border-t @3xl:col-span-6 @3xl:grid @3xl:grid-cols-subgrid">
                {cancelled.map((r) => (
                  <ProductionRowView key={r.productId} row={r} model={model} onAction={onAction} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
