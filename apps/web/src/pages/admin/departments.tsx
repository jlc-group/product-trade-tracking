import type { Department } from '@flowtrade/shared'
import { useQueryClient } from '@tanstack/react-query'
import { Building2Icon, GripVerticalIcon, PlusIcon, RotateCwIcon, TriangleAlertIcon } from 'lucide-react'
import { useRef } from 'react'
import { toast } from 'sonner'
import { departmentMutations, qk, useDepartments, useDepartmentUsage, useReorderDepartments } from '@/api/hooks'
import { EmptyState, PageHeader, useConfirm } from '@/components/common/misc'
import { Button } from '@/components/ui/button'
import { AddDepartmentForm } from '@/features/admin-departments/add-department-form'
import { DepartmentPickerPreview, DepartmentRules } from '@/features/admin-departments/department-aside'
import { DepartmentListSkeleton, DepartmentRow, type UserCount } from '@/features/admin-departments/department-row'
import { ListSummary } from '@/features/admin-master/master-row'
import { SortableList } from '@/features/admin-master/sortable-list'

export default function AdminDepartmentsPage() {
  const qc = useQueryClient()
  const { data: departments, isLoading, isError, refetch, isFetching } = useDepartments(true)
  const usageQuery = useDepartmentUsage()
  const create = departmentMutations.useCreate()
  const update = departmentMutations.useUpdate()
  const remove = departmentMutations.useRemove()
  const reorder = useReorderDepartments()
  const [confirm, confirmDialog] = useConfirm()
  const addInputRef = useRef<HTMLInputElement>(null)

  const list = departments ?? []
  const usersOf = (id: string): UserCount => (usageQuery.data ? (usageQuery.data[id] ?? 0) : usageQuery.isError ? null : undefined)

  const focusAdd = () => {
    const input = addInputRef.current
    if (!input) return
    input.scrollIntoView({ block: 'center', behavior: 'smooth' })
    input.focus({ preventScroll: true })
  }

  const handleCreate = async (name: string) => {
    await create.mutateAsync({ name })
    toast.success(`เพิ่มแผนก “${name}” แล้ว`, { description: 'ผู้ใช้เลือกแผนกนี้ได้ทันที' })
  }

  const handleRename = async (d: Department, name: string) => {
    await update.mutateAsync({ id: d.id, patch: { name } })
    // The server renames the department on every user, so user lists and the signed-in user's menu refresh too.
    void qc.invalidateQueries({ queryKey: ['users'] })
    void qc.invalidateQueries({ queryKey: qk.me })
    const users = usersOf(d.id)
    toast.success(`เปลี่ยนชื่อ “${d.name}” เป็น “${name}” แล้ว`, users ? { description: `อัปเดตแผนกของผู้ใช้ ${users} คนให้อัตโนมัติ` } : undefined)
  }

  const handleSetActive = async (d: Department, isActive: boolean) => {
    await update.mutateAsync({ id: d.id, patch: { isActive } })
    if (isActive) toast.success(`เปิดใช้งาน ${d.name} แล้ว`, { description: 'กลับมาให้เลือกเป็นแผนกของผู้ใช้ได้ตามปกติ' })
    else toast.success(`ปิดใช้งาน ${d.name} แล้ว`, { description: 'จะไม่แสดงให้เลือกตอนเพิ่มหรือแก้ไขผู้ใช้ — ผู้ใช้ที่อยู่ในแผนกนี้ยังอยู่เหมือนเดิม' })
  }

  const handleDelete = async (d: Department) => {
    await remove.mutateAsync(d.id)
    toast.success(`ลบแผนก “${d.name}” แล้ว`)
  }

  const renderList = () => {
    if (isLoading) return <DepartmentListSkeleton />
    if (isError)
      return (
        <EmptyState
          icon={<TriangleAlertIcon className="size-5" />}
          title="โหลดรายชื่อแผนกไม่สำเร็จ"
          description="ตรวจสอบการเชื่อมต่อแล้วลองใหม่อีกครั้ง"
          action={
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RotateCwIcon className={isFetching ? 'animate-spin' : undefined} /> ลองใหม่
            </Button>
          }
        />
      )
    return (
      <>
        {list.length === 0 ? (
          <EmptyState
            icon={<Building2Icon className="size-5" />}
            title="ยังไม่มีแผนก"
            description="เพิ่มแผนกแรกด้านล่าง เพื่อให้ผู้ใช้เลือกแผนกของตัวเองได้"
          />
        ) : (
          <>
            <ListSummary total={list.length} active={list.filter((d) => d.isActive).length} unit="แผนก">
              {usageQuery.isError ? (
                <span className="inline-flex items-center gap-1.5 text-warning-foreground">
                  <TriangleAlertIcon className="size-3.5 text-warning" /> โหลดจำนวนผู้ใช้ไม่สำเร็จ
                  <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => usageQuery.refetch()} disabled={usageQuery.isFetching}>
                    ลองใหม่
                  </Button>
                </span>
              ) : (
                <span className="hidden items-center gap-1 sm:inline-flex">
                  <GripVerticalIcon className="size-3.5" /> ลากเพื่อจัดลำดับ — ใช้เป็นลำดับในตัวเลือกแผนก
                </span>
              )}
            </ListSummary>
            <section className="sm:rounded-xl sm:border sm:bg-card" aria-label="รายชื่อแผนก">
              <SortableList
                items={list}
                getLabel={(d) => d.name}
                onReorder={(ids) => reorder.mutateAsync(ids)}
                className="space-y-2 divide-y-0 sm:space-y-0 sm:divide-y"
                itemClassName="rounded-xl border sm:rounded-none sm:border-0"
                renderItem={(d, handle) => (
                  <DepartmentRow
                    department={d}
                    users={usersOf(d.id)}
                    departments={list}
                    handle={handle}
                    confirm={confirm}
                    onRename={(name) => handleRename(d, name)}
                    onSetActive={(v) => handleSetActive(d, v)}
                    onDelete={() => handleDelete(d)}
                  />
                )}
              />
            </section>
          </>
        )}
        <AddDepartmentForm departments={list} onCreate={handleCreate} inputRef={addInputRef} />
      </>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="ผู้ดูแลระบบ"
        title="แผนก"
        description="ผู้ใช้ทุกคนต้องเลือกแผนกจากรายชื่อนี้เท่านั้น — เฉพาะผู้ดูแลระบบ (ADMIN) ที่เพิ่ม เปลี่ยนชื่อ จัดลำดับ หรือปิดใช้งานแผนกได้"
        actions={
          <Button onClick={focusAdd} disabled={!departments}>
            <PlusIcon /> เพิ่มแผนก
          </Button>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-3">{renderList()}</div>
        <aside className="space-y-6">
          <DepartmentRules />
          {departments && departments.length > 0 && <DepartmentPickerPreview departments={departments} />}
        </aside>
      </div>

      {confirmDialog}
    </div>
  )
}
