import { autoCompletionHint, canToggleTask, completionMode, detailFieldsProgress, LEVEL_LABEL, PRIORITY_ORDER, type TaskNode, type User } from '@flowtrade/shared'
import { CopyIcon, FolderInputIcon, SearchXIcon, Trash2Icon, UserPlusIcon } from 'lucide-react'
import { Fragment, useId, useState, type ReactNode } from 'react'
import { PriorityBadge } from '@/components/common/badges'
import { DueChip, ProgressRing } from '@/components/common/misc'
import { AvatarStack } from '@/components/common/user-avatar'
import { UserPicker } from '@/components/common/user-picker'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { displayName, formatDate, formatDateRange, formatDateTime, fromNow, relativeDay, spanDays } from '@/lib/format'
import { cn } from '@/lib/utils'
import { AutosaveText } from './autosave-text'
import { DateRangeFields } from './date-range-popover'
import { DepartmentChip, DepartmentInput } from './department'
import { InlineAdd } from './inline-add'
import { TaskComments } from './task-comments'
import { TaskDetails } from './task-details'
import { useTreeEnv } from './tree-context'
import { childLabel, LEVEL_DOT } from './tree-utils'
import type { TreeData } from './use-tree-state'

interface TaskDrawerProps {
  taskId: string | null
  tree: TreeData
  loaded: boolean
  focusComments: boolean
  onClose: () => void
}

/** Right-side task drawer (full screen on phones), driven by ?task=<id>. */
export function TaskDrawer({ taskId, tree, loaded, focusComments, onClose }: TaskDrawerProps) {
  const node = taskId ? (tree.byId.get(taskId) ?? null) : null
  return (
    <Sheet open={!!taskId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[520px]"
        onEscapeKeyDown={(e) => {
          // inputs that use Esc to cancel their own edit shouldn't also close the drawer
          const el = document.activeElement
          if (el instanceof HTMLElement && el.closest('[data-local-escape]')) e.preventDefault()
        }}
      >
        {node ? <DrawerBody key={node.id} node={node} tree={tree} focusComments={focusComments} /> : <DrawerFallback loaded={loaded} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  )
}

function DrawerFallback({ loaded, onClose }: { loaded: boolean; onClose: () => void }) {
  if (!loaded) {
    return (
      <div className="space-y-4 p-4 pr-12">
        <SheetTitle className="sr-only">กำลังโหลดงาน</SheetTitle>
        <SheetDescription className="sr-only">กำลังโหลดรายละเอียดงาน</SheetDescription>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-7 w-3/4" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    )
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <SearchXIcon className="size-5" />
      </div>
      <SheetTitle>ไม่พบงานนี้</SheetTitle>
      <SheetDescription className="max-w-xs">งานอาจถูกลบหรือย้ายไปโปรเจกต์อื่นแล้ว ลองเลือกงานจากรายการอีกครั้ง</SheetDescription>
      <Button variant="outline" onClick={onClose}>
        กลับไปที่รายการงาน
      </Button>
    </div>
  )
}

function DrawerBody({ node, tree, focusComments }: { node: TaskNode; tree: TreeData; focusComments: boolean }) {
  const { me, proposal, canManage, usersById, actions } = useTreeEnv()
  const parent = node.parentId ? tree.byId.get(node.parentId) : undefined
  const ancestors: TaskNode[] = []
  for (let p = parent; p; p = p.parentId ? tree.byId.get(p.parentId) : undefined) ancestors.unshift(p)
  const canEditDetails = canManage || node.assigneeIds.includes(me.id)
  const creator = usersById.get(node.createdById)

  return (
    <>
      <SheetHeader className="gap-2 border-b p-4 pr-12">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-1.5 py-0.5 font-medium text-foreground">
            <span className={cn('size-1.5 rounded-full', LEVEL_DOT[node.level])} aria-hidden />
            {LEVEL_LABEL[node.level]}
          </span>
          <Breadcrumb className="min-w-0">
            <BreadcrumbList className="gap-1 text-xs sm:gap-1">
              <BreadcrumbItem className="tabular">{proposal.code}</BreadcrumbItem>
              {ancestors.map((a) => (
                <Fragment key={a.id}>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem className="min-w-0">
                    <BreadcrumbLink asChild>
                      <button type="button" onClick={() => actions.openTask(a.id)} className="max-w-40 truncate rounded-sm text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50" title={a.title}>
                        {a.title}
                      </button>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                </Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        </div>
        <SheetTitle className="sr-only">{node.title}</SheetTitle>
        <SheetDescription className="sr-only">รายละเอียดงาน วันที่ ผู้รับผิดชอบ งานย่อย และความคิดเห็น</SheetDescription>
        {canManage ? (
          <AutosaveText
            serverValue={node.title}
            onSave={(title) => actions.update(node.id, { title })}
            validate={(v) => v.length > 0}
            singleLine
            aria-label="ชื่องาน"
            className={cn('-mx-2 min-h-0 resize-none border-transparent px-2 py-1 text-lg leading-snug font-semibold shadow-none hover:border-input md:text-lg dark:bg-transparent', node.isDone && 'text-muted-foreground line-through')}
          />
        ) : (
          <p className={cn('text-lg leading-snug font-semibold break-words', node.isDone && 'text-muted-foreground line-through')}>{node.title}</p>
        )}
      </SheetHeader>

      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        <StatusCard node={node} />

        <section className="space-y-4" aria-label="ข้อมูลงาน">
          <DepartmentField node={node} editable={canManage} />
          <AssigneeField node={node} editable={canManage} />
          {canEditDetails ? (
            <DateRangeFields
              task={node}
              parentStart={parent?.startDate ?? null}
              parentDue={parent?.dueDate ?? null}
              hasParent={!!parent}
              onChange={(patch) => actions.update(node.id, patch)}
            />
          ) : (
            <ReadOnlyField label="ระยะเวลา">
              {formatDateRange(node.startDate, node.dueDate)}
              {spanDays(node.startDate, node.dueDate) !== null && <span className="text-muted-foreground"> · {spanDays(node.startDate, node.dueDate)} วัน</span>}
            </ReadOnlyField>
          )}
          <PriorityField node={node} editable={canManage} />
        </section>

        <TaskDetails node={node} canManage={canManage} canFill={canEditDetails} />

        {node.level < 3 && <ChildrenSection node={node} />}

        <TaskComments taskId={node.id} autoFocus={focusComments} />

        <footer className="space-y-3 border-t pt-4">
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => actions.requestMove(node)}>
                <FolderInputIcon />
                ย้ายไปไว้ใต้…
              </Button>
              <Button variant="outline" size="sm" onClick={() => actions.duplicate(node)}>
                <CopyIcon />
                คัดลอก
              </Button>
              <Button variant="destructive" size="sm" onClick={() => actions.remove(node)}>
                <Trash2Icon />
                ลบงาน
              </Button>
            </div>
          )}
          <div className="space-y-0.5 text-xs text-muted-foreground">
            <p>
              สร้างโดย {creator ? displayName(creator) : 'ผู้ใช้ที่ไม่อยู่ในระบบแล้ว'} · {formatDateTime(node.createdAt)}
            </p>
            <p title={formatDateTime(node.updatedAt)}>แก้ไขล่าสุด {fromNow(node.updatedAt)}</p>
            {!canManage && (
              <p className="pt-1">
                {canEditDetails ? 'คุณเป็นผู้รับผิดชอบงานนี้ — แก้ไขรายละเอียด กรอกข้อมูลในตาราง และแก้วันที่ได้ ส่วนชื่องาน แผนก ผู้รับผิดชอบ และหัวข้อในตาราง ให้ทีมงานโปรเจกต์เป็นผู้แก้' : 'คุณดูงานนี้ได้อย่างเดียว — แสดงความคิดเห็นได้ตามปกติ'}
              </p>
            )}
          </div>
        </footer>
      </div>
    </>
  )
}

// ---------- sections ----------

function StatusCard({ node }: { node: TaskNode }) {
  const { me, proposal, cancelled, usersById, actions } = useTreeEnv()
  const id = useId()
  const hasChildren = node.children.length > 0
  // Ticked by hand only without a table or sub tasks; otherwise it follows them (shared completion rules).
  const mode = completionMode(node, hasChildren)
  const auto = mode !== 'manual'
  const allowed = !cancelled && canToggleTask(me, proposal, node)
  const canToggle = allowed && !auto
  const completer = node.completedById ? usersById.get(node.completedById) : undefined
  const table = mode === 'table' || mode === 'both' ? detailFieldsProgress(node.detailFields) : null
  const waiting = [
    table && `กรอกตารางแล้ว ${table.filled}/${table.total}`,
    hasChildren && `Sub task เสร็จ ${node.children.filter((c) => c.isDone).length}/${node.children.length}`,
  ].filter(Boolean)

  const box = <Checkbox id={id} checked={node.isDone} disabled={!canToggle} onCheckedChange={(v) => actions.toggle(node, v === true)} className="size-5 bg-background" />

  return (
    <div className={cn('flex items-center gap-3 rounded-xl border p-3 transition-colors', node.isDone ? 'border-success/30 bg-success-soft' : 'bg-card')}>
      {canToggle ? (
        box
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="inline-flex rounded outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              {box}
            </span>
          </TooltipTrigger>
          <TooltipContent>{cancelled ? 'โปรเจกต์นี้ถูกยกเลิกแล้ว' : auto ? autoCompletionHint(mode) : 'ทำเครื่องหมายได้เฉพาะทีมงานโปรเจกต์หรือผู้รับผิดชอบงานนี้'}</TooltipContent>
        </Tooltip>
      )}
      <div className="min-w-0 flex-1 space-y-0.5">
        <Label htmlFor={id} className={cn('text-sm', node.isDone && 'text-success')}>
          {node.isDone ? (auto ? 'เสร็จแล้ว (ติ๊กอัตโนมัติ)' : 'เสร็จแล้ว') : canToggle ? 'ยังไม่เสร็จ — ติ๊กเมื่อทำเสร็จ' : auto ? 'ยังไม่เสร็จ — ติ๊กให้อัตโนมัติเมื่อครบ' : 'ยังไม่เสร็จ'}
        </Label>
        <p className="text-xs text-muted-foreground">
          {node.isDone && node.completedAt
            ? `${completer ? `โดย ${completer.nickname || completer.name} · ` : ''}${fromNow(node.completedAt)}`
            : auto
              ? waiting.join(' · ')
              : node.dueDate
                ? `ครบกำหนด ${formatDate(node.dueDate)} (${relativeDay(node.dueDate)})`
                : 'ยังไม่ได้กำหนดวันครบกำหนด'}
        </p>
      </div>
      {hasChildren && <ProgressRing progress={node.progress} size={40} stroke={4} />}
    </div>
  )
}

function ReadOnlyField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  )
}

function DepartmentField({ node, editable }: { node: TaskNode; editable: boolean }) {
  const { departments, actions } = useTreeEnv()
  const id = useId()
  if (!editable) {
    return (
      <ReadOnlyField label="แผนกที่รับผิดชอบ">
        {node.responsible ? <DepartmentChip name={node.responsible} /> : <span className="text-muted-foreground">ยังไม่ระบุแผนก</span>}
      </ReadOnlyField>
    )
  }
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        แผนกที่รับผิดชอบ
      </Label>
      <DepartmentInput
        id={id}
        serverValue={node.responsible}
        options={departments}
        onSave={(responsible) => actions.update(node.id, { responsible }, responsible ? `ตั้งแผนก ${responsible} แล้ว` : 'ล้างแผนกแล้ว')}
      />
    </div>
  )
}

function AssigneeField({ node, editable }: { node: TaskNode; editable: boolean }) {
  const { usersById, actions } = useTreeEnv()
  const id = useId()
  const users = node.assigneeIds.map((a) => usersById.get(a)).filter((u): u is User => !!u)
  const summary = users.length === 0 ? null : users.length === 1 ? displayName(users[0]) : users.map((u) => u.nickname || u.name).join(', ')

  if (!editable) {
    return (
      <ReadOnlyField label="ผู้รับผิดชอบ">
        {users.length ? (
          <span className="flex items-center gap-2">
            <AvatarStack users={users} max={4} size="sm" />
            <span className="min-w-0 truncate">{summary}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">ยังไม่มีผู้รับผิดชอบ</span>
        )}
      </ReadOnlyField>
    )
  }
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        ผู้รับผิดชอบ
      </Label>
      <UserPicker
        value={node.assigneeIds}
        onChange={(assigneeIds) => actions.update(node.id, { assigneeIds })}
        trigger={
          <Button id={id} type="button" variant="outline" className="h-9 w-full justify-start gap-2 px-2.5 font-normal">
            {users.length ? (
              <>
                <AvatarStack users={users} max={4} size="xs" />
                <span className="min-w-0 truncate">{summary}</span>
              </>
            ) : (
              <>
                <UserPlusIcon className="text-muted-foreground" />
                <span className="text-muted-foreground">เลือกผู้รับผิดชอบ</span>
              </>
            )}
          </Button>
        }
      />
    </div>
  )
}

function PriorityField({ node, editable }: { node: TaskNode; editable: boolean }) {
  const { actions } = useTreeEnv()
  const id = useId()
  if (!editable) {
    return (
      <ReadOnlyField label="ความสำคัญ">
        <PriorityBadge priority={node.priority} />
      </ReadOnlyField>
    )
  }
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        ความสำคัญ
      </Label>
      <Select
        value={node.priority}
        onValueChange={(v) => {
          const next = PRIORITY_ORDER.find((p) => p === v)
          if (next && next !== node.priority) actions.update(node.id, { priority: next })
        }}
      >
        <SelectTrigger id={id} className="h-9 w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRIORITY_ORDER.map((p) => (
            <SelectItem key={p} value={p}>
              <PriorityBadge priority={p} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function ChildrenSection({ node }: { node: TaskNode }) {
  const { me, proposal, canManage, cancelled, usersById, actions } = useTreeEnv()
  const [adding, setAdding] = useState(false)
  const label = childLabel(node.level)
  const doneCount = node.children.filter((c) => c.isDone).length

  return (
    <section className="space-y-2" aria-label={label}>
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        {label}
        {node.children.length > 0 && (
          <span className="tabular text-xs font-normal text-muted-foreground">
            เสร็จ {doneCount}/{node.children.length}
          </span>
        )}
      </h3>
      {node.children.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {node.children.map((c) => {
            const childMode = completionMode(c, c.children.length > 0)
            const canToggle = !cancelled && canToggleTask(me, proposal, c) && childMode === 'manual'
            const users = c.assigneeIds.map((a) => usersById.get(a)).filter((u): u is User => !!u)
            return (
              <li key={c.id} className="flex min-h-10 items-center gap-2.5 px-3 py-1.5">
                <Checkbox
                  checked={c.isDone}
                  disabled={!canToggle}
                  title={childMode !== 'manual' ? autoCompletionHint(childMode) : undefined}
                  onCheckedChange={(v) => actions.toggle(c, v === true)}
                  aria-label={c.isDone ? `ยกเลิกเครื่องหมายเสร็จของ “${c.title}”` : `ทำเครื่องหมายว่า “${c.title}” เสร็จแล้ว`}
                />
                <button
                  type="button"
                  onClick={() => actions.openTask(c.id)}
                  className={cn('min-w-0 flex-1 truncate rounded-sm text-left text-sm underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50', c.isDone && 'text-muted-foreground line-through')}
                >
                  {c.title}
                </button>
                {c.children.length > 0 && (
                  <span className="tabular shrink-0 text-xs text-muted-foreground">
                    {c.progress.done}/{c.progress.total}
                  </span>
                )}
                {c.responsible && <DepartmentChip name={c.responsible} className="hidden max-w-28 shrink-0 sm:inline-flex" />}
                {c.dueDate && <DueChip startDate={c.startDate} dueDate={c.dueDate} isDone={c.isDone} compact className="shrink-0" />}
                {users.length > 0 && <AvatarStack users={users} max={2} size="xs" className="shrink-0" />}
              </li>
            )
          })}
        </ul>
      )}
      {canManage ? (
        <InlineAdd variant="plain" parentId={node.id} parentLevel={node.level} active={adding} onActivate={() => setAdding(true)} onClose={() => setAdding(false)} />
      ) : (
        node.children.length === 0 && <p className="text-xs text-muted-foreground">ยังไม่มี {label} ในงานนี้</p>
      )}
    </section>
  )
}
