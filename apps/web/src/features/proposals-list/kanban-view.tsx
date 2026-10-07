import { STATUS_LABEL, STATUS_ORDER, type ProposalStatus } from '@flowtrade/shared'
import type { ProposalListItem } from '@/api/types'
import { statusDotClass } from '@/components/common/badges'
import { cn } from '@/lib/utils'
import type { StatusFilter } from './params'
import { KanbanCard } from './proposal-card'

const ACTIVE: ProposalStatus[] = ['DRAFT', 'IN_PROGRESS', 'ON_HOLD']

/** Columns that can contain results under the current status filter. */
export function kanbanColumns(status: StatusFilter): ProposalStatus[] {
  if (status === 'ALL') return STATUS_ORDER
  if (status === 'ACTIVE') return ACTIVE
  return [status]
}

const EMPTY_HINT: Record<ProposalStatus, string> = {
  DRAFT: 'ไม่มีฉบับร่าง',
  IN_PROGRESS: 'ไม่มีงานที่กำลังดำเนินการ',
  ON_HOLD: 'ไม่มีงานที่พักไว้',
  COMPLETED: 'ยังไม่มีงานที่เสร็จสิ้น',
  CANCELLED: 'ไม่มีงานที่ยกเลิก',
}

export function KanbanView({ items, status }: { items: ProposalListItem[]; status: StatusFilter }) {
  const columns = kanbanColumns(status)
  return (
    // Columns scroll sideways inside their own container; on phones it bleeds to the screen edge.
    <div className="scrollbar-thin relative -mx-4 overflow-x-auto rounded-xl px-4 pb-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:mx-0 md:px-0" role="region" aria-label="บอร์ดสถานะการเสนอสินค้า" tabIndex={0}>
      {/* From xl the columns share the free width (no empty band on wide screens); below it they keep 18rem and scroll. */}
      <div className="flex w-max min-w-full items-start gap-3">
        {columns.map((s) => {
          const cards = items.filter((p) => p.status === s)
          return (
            <section key={s} aria-labelledby={`kanban-${s}`} className="flex w-[17.5rem] shrink-0 flex-col rounded-xl bg-muted/60 sm:w-72 xl:grow">
              <header className="flex items-center gap-2 px-3 pt-3 pb-2">
                <span className={cn('size-2 rounded-full', statusDotClass(s))} aria-hidden />
                <h2 id={`kanban-${s}`} className="text-sm font-semibold">
                  {STATUS_LABEL[s]}
                </h2>
                <span className="tabular ml-auto rounded-full bg-card px-2 text-xs leading-5 font-medium text-muted-foreground ring-1 ring-border">{cards.length}</span>
              </header>
              <ul className="flex flex-1 flex-col gap-2 px-2 pb-2">
                {cards.length === 0 ? (
                  <li className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">{EMPTY_HINT[s]}</li>
                ) : (
                  cards.map((p) => (
                    <li key={p.id}>
                      <KanbanCard p={p} />
                    </li>
                  ))
                )}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
