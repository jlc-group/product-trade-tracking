import { FilterXIcon, PlusIcon, RefreshCwIcon, SearchXIcon, ShoppingBagIcon, UsersIcon } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { errorMessage, useProposals } from '@/api/hooks'
import { useAuth } from '@/auth/auth'
import { EmptyState, PageHeader } from '@/components/common/misc'
import { Button } from '@/components/ui/button'
import { FilterBar } from '@/features/proposals-list/filter-bar'
import { GridView } from '@/features/proposals-list/grid-view'
import { KanbanView } from '@/features/proposals-list/kanban-view'
import { sortProposals, useListParams } from '@/features/proposals-list/params'
import { ResultsBar } from '@/features/proposals-list/results-bar'
import { ListSkeleton } from '@/features/proposals-list/skeletons'
import { TableView } from '@/features/proposals-list/table-view'
import { cn } from '@/lib/utils'

export default function ProposalsListPage() {
  const list = useListParams()
  const { params, filters, update, clearFilters, activeFilterCount, canReadAll } = list
  const { can } = useAuth()
  const canCreate = can('proposal.create')

  const query = useProposals(filters, { keepPrevious: true })
  const data = query.data
  const items = useMemo(() => (data ? sortProposals(data, params.sort, params.dir) : undefined), [data, params.sort, params.dir])
  // Previous results stay on screen (dimmed) while a new filter combination loads.
  const isStale = query.isPlaceholderData

  const newButton = canCreate && (
    <Button asChild size="lg">
      <Link to="/proposals/new">
        <PlusIcon />
        เสนอสินค้าใหม่
      </Link>
    </Button>
  )

  let content
  if (query.isError) {
    content = (
      <EmptyState
        title="โหลดรายการไม่สำเร็จ"
        description={`${errorMessage(query.error)} — ลองโหลดใหม่อีกครั้ง`}
        action={
          <Button variant="outline" onClick={() => query.refetch()}>
            <RefreshCwIcon />
            โหลดใหม่
          </Button>
        }
      />
    )
  } else if (!items) {
    content = <ListSkeleton view={params.view} />
  } else if (items.length === 0 && activeFilterCount === 1 && canReadAll && params.scope === 'mine') {
    content = (
      <EmptyState
        icon={<ShoppingBagIcon className="size-5" />}
        title="ยังไม่มีการเสนอสินค้าของคุณ"
        description="รายการที่คุณเป็นเจ้าของ เป็นทีมงาน หรือได้รับมอบหมาย Task จะแสดงในมุมมอง “ของฉัน”"
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" size="lg" onClick={() => update({ scope: 'all' })}>
              <UsersIcon />
              ดูของทุกคน
            </Button>
            {newButton}
          </div>
        }
      />
    )
  } else if (items.length === 0 && activeFilterCount > 0) {
    content = (
      <EmptyState
        icon={<SearchXIcon className="size-5" />}
        title="ไม่พบการเสนอสินค้าที่ตรงกับตัวกรอง"
        description={params.q ? `ไม่มีรายการที่ตรงกับ “${params.q}” ภายใต้เงื่อนไขที่เลือก ลองใช้คำค้นที่สั้นลงหรือล้างตัวกรองบางส่วน` : 'ลองเปลี่ยนสถานะ ห้าง หรือประเภท Shelf หรือล้างตัวกรองเพื่อดูทุกรายการ'}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={clearFilters}>
              <FilterXIcon />
              ล้างตัวกรอง
            </Button>
            {canReadAll && params.scope === 'mine' && (
              <Button variant="ghost" onClick={() => update({ scope: 'all' })}>
                <UsersIcon />
                ดูของทุกคน
              </Button>
            )}
          </div>
        }
      />
    )
  } else if (items.length === 0) {
    content = (
      <EmptyState
        icon={<ShoppingBagIcon className="size-5" />}
        title="ยังไม่มีการเสนอสินค้า"
        description={
          canCreate
            ? 'เริ่มเสนอสินค้าเข้าห้างหรือแพลตฟอร์มออนไลน์ ระบบจะสร้าง Task ตามแม่แบบและนับถอยหลังถึงวันวางขายให้อัตโนมัติ'
            : 'เมื่อมีคนเพิ่มคุณเป็นทีมงาน หรือมอบหมาย Task ให้คุณ รายการจะแสดงที่นี่'
        }
        action={newButton || undefined}
      />
    )
  } else {
    content = (
      <div className={cn('transition-opacity', isStale && 'pointer-events-none opacity-60')} aria-busy={isStale}>
        {params.view === 'kanban' ? <KanbanView items={items} status={params.status} /> : params.view === 'grid' ? <GridView items={items} /> : <TableView items={items} list={list} />}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="การเสนอสินค้า"
        description="ทุกโปรเจกต์นำสินค้าเข้าห้างและแพลตฟอร์มออนไลน์ — ดูสถานะ ความคืบหน้า งานที่เลยกำหนด และวันวางขายได้ในหน้าเดียว"
        actions={newButton}
      />
      <FilterBar list={list} />
      <ResultsBar items={items} list={list} fetching={query.isFetching} />
      {content}
    </div>
  )
}
