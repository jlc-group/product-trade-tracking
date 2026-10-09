import type { Manufacturer } from '@flowtrade/shared'
import { FactoryIcon, GripVerticalIcon, PlusIcon, RotateCwIcon, TriangleAlertIcon } from 'lucide-react'
import { useState } from 'react'
import { manufacturerMutations, useManufacturers, useManufacturerUsage, useReorderManufacturers } from '@/api/hooks'
import { EmptyState, PageHeader, useConfirm } from '@/components/common/misc'
import { Button } from '@/components/ui/button'
import { ManufacturerFormDialog } from '@/features/admin-master/manufacturer-form-dialog'
import { ListSummary, MasterListSkeleton, MasterRow } from '@/features/admin-master/master-row'
import type { UsedBy } from '@/features/admin-master/row-controls'
import { SortableList } from '@/features/admin-master/sortable-list'

const NOUN = 'บริษัทรับผลิต'
/** Usage = projects with a production order naming the manufacturer (GET /manufacturers/usage). */
const USED_BY: UsedBy = { count: (n) => `ใบสั่งผลิตของ ${n} โปรเจกต์`, hiddenFrom: 'ตัวเลือกตอนยืนยันเริ่มผลิต', kept: 'ใบสั่งผลิตเดิม', none: 'ใบสั่งผลิตใด' }

function ManufacturerIcon() {
  return (
    <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand" aria-hidden>
      <FactoryIcon className="size-5" />
    </span>
  )
}

export default function AdminManufacturersPage() {
  const { data: manufacturers, isLoading, isError, refetch, isFetching } = useManufacturers(true)
  const usageQuery = useManufacturerUsage()
  const reorder = useReorderManufacturers()
  const update = manufacturerMutations.useUpdate()
  const remove = manufacturerMutations.useRemove()
  const [confirm, confirmDialog] = useConfirm()
  const [dialog, setDialog] = useState<{ open: boolean; manufacturer: Manufacturer | null }>({ open: false, manufacturer: null })

  const list = manufacturers ?? []
  const usageOf = (id: string) => (usageQuery.data ? (usageQuery.data[id] ?? 0) : undefined)
  const openCreate = () => setDialog({ open: true, manufacturer: null })

  const renderList = () => {
    if (isLoading) return <MasterListSkeleton rows={4} />
    if (isError)
      return (
        <EmptyState
          icon={<TriangleAlertIcon className="size-5" />}
          title="โหลดรายชื่อบริษัทรับผลิตไม่สำเร็จ"
          description="ตรวจสอบการเชื่อมต่อแล้วลองใหม่อีกครั้ง"
          action={
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RotateCwIcon className={isFetching ? 'animate-spin' : undefined} /> ลองใหม่
            </Button>
          }
        />
      )
    if (list.length === 0)
      return (
        <EmptyState
          icon={<FactoryIcon className="size-5" />}
          title="ยังไม่มีบริษัทรับผลิต"
          description="เพิ่มบริษัทแรกที่นี่ หรือให้ทีมเพิ่มจากหน้าต่างยืนยันเริ่มผลิตได้เลย"
          action={
            <Button size="sm" onClick={openCreate}>
              <PlusIcon /> เพิ่มบริษัท
            </Button>
          }
        />
      )
    return (
      <div className="space-y-2.5">
        <ListSummary total={list.length} active={list.filter((m) => m.isActive).length} unit="บริษัท">
          {usageQuery.isError ? (
            <span className="inline-flex items-center gap-1.5 text-warning-foreground">
              <TriangleAlertIcon className="size-3.5 text-warning" /> โหลดจำนวนการใช้งานไม่สำเร็จ
              <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => usageQuery.refetch()} disabled={usageQuery.isFetching}>
                ลองใหม่
              </Button>
            </span>
          ) : (
            <span className="hidden items-center gap-1 sm:inline-flex">
              <GripVerticalIcon className="size-3.5" /> ลากเพื่อจัดลำดับ — ใช้เป็นลำดับในตัวเลือกตอนยืนยันเริ่มผลิต
            </span>
          )}
        </ListSummary>
        <section className="rounded-xl border bg-card" aria-label="รายชื่อบริษัทรับผลิต">
          <SortableList
            items={list}
            getLabel={(m) => m.name}
            onReorder={(ids) => reorder.mutateAsync(ids)}
            renderItem={(m, handle) => (
              <MasterRow
                name={m.name}
                noun={NOUN}
                description={m.note}
                emptyDescription="ไม่มีหมายเหตุ"
                isActive={m.isActive}
                usage={usageOf(m.id)}
                handle={handle}
                leading={<ManufacturerIcon />}
                confirm={confirm}
                onEdit={() => setDialog({ open: true, manufacturer: m })}
                onSetActive={(isActive) => update.mutateAsync({ id: m.id, patch: { isActive } })}
                onDelete={() => remove.mutateAsync(m.id)}
                usedBy={USED_BY}
              />
            )}
          />
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="ข้อมูลหลัก"
        title="บริษัทรับผลิต"
        description="รายชื่อบริษัทที่รับผลิตสินค้า ใช้เลือกตอนยืนยันเริ่มผลิต — ที่มีใบสั่งผลิตใช้แล้วลบไม่ได้ แต่ปิดการใช้งานเพื่อซ่อนจากตัวเลือกได้"
        actions={
          <Button onClick={openCreate} disabled={!manufacturers}>
            <PlusIcon /> เพิ่มบริษัท
          </Button>
        }
      />

      {renderList()}

      <ManufacturerFormDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        manufacturer={dialog.manufacturer}
        manufacturers={list}
      />
      {confirmDialog}
    </div>
  )
}
