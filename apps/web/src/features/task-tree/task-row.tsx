import { canToggleTask, detailFieldsProgress, LEVEL_LABEL, PRIORITY_LABEL, PRIORITY_ORDER, type ISODate, type TaskNode, type TaskPriority, type User } from '@flowtrade/shared'
import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronRightIcon,
  CopyIcon,
  CornerDownRightIcon,
  EllipsisIcon,
  FolderInputIcon,
  GripVerticalIcon,
  MessageSquareIcon,
  PanelRightOpenIcon,
  PencilIcon,
  TableIcon,
  Trash2Icon,
  UserPlusIcon,
} from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { PriorityBadge } from '@/components/common/badges'
import { AvatarStack } from '@/components/common/user-avatar'
import { UserPicker } from '@/components/common/user-picker'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { DateRangePopover } from './date-range-popover'
import { DepartmentChip, DepartmentPopover } from './department'
import { IndentGuides } from './inline-add'
import { useTreeEnv } from './tree-context'
import { addLabel, GRID_COLS, INDENT, LEVEL_DOT } from './tree-utils'

export interface DragHandleProps {
  setActivatorNodeRef: (el: HTMLElement | null) => void
  attributes: DraggableAttributes
  listeners: DraggableSyntheticListeners
}

export interface TaskRowProps {
  node: TaskNode
  depth: number
  parentStart: ISODate | null
  parentDue: ISODate | null
  expanded: boolean
  /** Shown only as the ancestor of a filter match. */
  isContext: boolean
  commentCount: number
  renaming: boolean
  selected: boolean
  siblingIndex: number
  siblingCount: number
  /** Up/down reordering is offered (no filter active). */
  reorderable: boolean
  handle: DragHandleProps | null
}

/** Left offset of the title on narrow screens: gutter + guides + chevron + checkbox + level dot. */
const metaIndent = (depth: number) => 74 + depth * INDENT

export function TaskRow({ node, depth, parentStart, parentDue, expanded, isContext, commentCount, renaming, selected, siblingIndex, siblingCount, reorderable, handle }: TaskRowProps) {
  const { me, proposal, canManage, cancelled, usersById, actions } = useTreeEnv()
  const hasChildren = node.children.length > 0
  const isAssignee = node.assigneeIds.includes(me.id)
  const canToggle = !cancelled && canToggleTask(me, proposal, node)
  const canEditDetails = canManage || isAssignee
  const assignees = node.assigneeIds.map((id) => usersById.get(id)).filter((u): u is User => !!u)
  const quietPriority = node.priority === 'MEDIUM' || node.priority === 'LOW'
  const hasMeta = canManage || canEditDetails || assignees.length > 0 || !!node.responsible || !!(node.startDate || node.dueDate) || !quietPriority

  return (
    <div
      id={`task-row-${node.id}`}
      className={cn(
        'group/row relative grid grid-cols-[minmax(0,1fr)_auto] border-b border-border/60 transition-colors hover:bg-muted/40',
        GRID_COLS,
        '@3xl:items-center',
        selected && 'bg-brand-soft/50 hover:bg-brand-soft/70',
      )}
    >
      {depth > 0 && <IndentGuides depth={depth} className={cn('pointer-events-none absolute inset-y-0', handle ? 'left-2 @3xl:left-[30px]' : 'left-2')} />}
      {/* tree / title cell */}
      <div className="col-start-1 row-start-1 flex min-h-11 min-w-0 items-center gap-1.5 self-stretch pr-1 pl-2 @3xl:col-start-auto @3xl:row-start-auto @3xl:pr-3">
        {handle && <DragHandle {...handle} title={node.title} />}
        {/* indent spacer; the guide lines themselves span the full row height (both lines on phones) */}
        <span className="shrink-0" style={{ width: depth * INDENT }} aria-hidden />
        {hasChildren ? (
          <button
            type="button"
            onClick={() => actions.toggleExpanded(node.id)}
            aria-expanded={expanded}
            aria-label={`${expanded ? 'ย่อ' : 'ขยาย'} “${node.title}”`}
            className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ChevronRightIcon className={cn('size-4 transition-transform duration-150', expanded && 'rotate-90')} />
          </button>
        ) : (
          <span className="w-5 shrink-0" aria-hidden />
        )}
        <RowCheckbox node={node} canToggle={canToggle} cancelled={cancelled} />
        <span className={cn('size-1.5 shrink-0 rounded-full', LEVEL_DOT[node.level])} title={LEVEL_LABEL[node.level]} aria-hidden />
        <span className="sr-only">{LEVEL_LABEL[node.level]}:</span>
        {renaming ? (
          <RenameInput node={node} />
        ) : (
          <TitleButton node={node} canRename={canManage} muted={isContext} />
        )}
        {hasChildren && (
          <span
            className={cn('tabular shrink-0 text-xs', node.progress.done === node.progress.total ? 'font-medium text-success' : 'text-muted-foreground')}
            title={`เสร็จ ${node.progress.done} จาก ${node.progress.total} รายการย่อย`}
          >
            {node.progress.done}/{node.progress.total}
          </span>
        )}
        {node.descriptionFormat === 'FIELDS' && node.detailFields.length > 0 && <DetailFieldsChip node={node} />}
        {commentCount > 0 && (
          <button
            type="button"
            onClick={() => actions.openTask(node.id, { focusComments: true })}
            aria-label={`ความคิดเห็น ${commentCount} รายการ`}
            className="inline-flex h-6 shrink-0 items-center gap-0.5 rounded px-1 text-xs text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <MessageSquareIcon className="size-3.5" />
            <span className="tabular">{commentCount}</span>
          </button>
        )}
      </div>

      {/* meta: a second line on narrow screens, four grid columns on wide ones */}
      <div
        className={cn('col-span-2 row-start-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pr-3 pb-2 @3xl:contents', !hasMeta && '@max-3xl:hidden')}
        style={{ paddingLeft: metaIndent(depth) }}
      >
        <div className={cn('flex min-w-0 items-center @3xl:px-2', !node.responsible && !canManage && '@max-3xl:hidden')}>
          <DepartmentCell node={node} editable={canManage} />
        </div>
        <div className="flex min-w-0 items-center @3xl:px-2">
          <AssigneeCell node={node} users={assignees} editable={canManage} />
        </div>
        <div className="flex min-w-0 items-center @3xl:px-2">
          <DateRangePopover
            task={node}
            parentStart={parentStart}
            parentDue={parentDue}
            hasParent={!!node.parentId}
            editable={canEditDetails}
            onChange={(patch) => actions.update(node.id, patch)}
          />
        </div>
        <div className={cn('flex items-center @3xl:px-2', quietPriority && '@max-3xl:hidden')}>
          <PriorityCell priority={node.priority} editable={canManage} onChange={(priority) => actions.update(node.id, { priority })} />
        </div>
      </div>

      {/* actions */}
      <div className="col-start-2 row-start-1 flex items-center justify-end pr-1.5 @3xl:col-start-auto @3xl:row-start-auto">
        <RowMenu node={node} canManage={canManage} canEditDetails={canEditDetails} siblingIndex={siblingIndex} siblingCount={siblingCount} reorderable={reorderable} />
      </div>
    </div>
  )
}

// ---------- cells ----------

function DragHandle({ setActivatorNodeRef, attributes, listeners, title }: DragHandleProps & { title: string }) {
  return (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`ลากเพื่อจัดลำดับ “${title}” (Space เพื่อจับ ลูกศรขึ้น/ลงเพื่อย้าย)`}
      className="hidden h-7 w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/70 opacity-0 transition-opacity outline-none group-hover/row:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing @3xl:flex"
    >
      <GripVerticalIcon className="size-3.5" />
    </button>
  )
}

function RowCheckbox({ node, canToggle, cancelled }: { node: TaskNode; canToggle: boolean; cancelled: boolean }) {
  const { actions } = useTreeEnv()
  const label = node.isDone ? `ยกเลิกเครื่องหมายเสร็จของ “${node.title}”` : `ทำเครื่องหมายว่า “${node.title}” เสร็จแล้ว`
  if (canToggle) {
    return <Checkbox checked={node.isDone} onCheckedChange={(v) => actions.toggle(node, v === true)} aria-label={label} className="bg-background" />
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex rounded outline-none focus-visible:ring-3 focus-visible:ring-ring/50" aria-label={node.isDone ? 'เสร็จแล้ว' : 'ยังไม่เสร็จ'}>
          <Checkbox checked={node.isDone} disabled aria-hidden tabIndex={-1} />
        </span>
      </TooltipTrigger>
      <TooltipContent>{cancelled ? 'โปรเจกต์นี้ถูกยกเลิกแล้ว — ทำเครื่องหมายไม่ได้' : 'ทำเครื่องหมายได้เฉพาะทีมงานโปรเจกต์หรือผู้รับผิดชอบงานนี้'}</TooltipContent>
    </Tooltip>
  )
}

function TitleButton({ node, canRename, muted }: { node: TaskNode; canRename: boolean; muted: boolean }) {
  const { actions } = useTreeEnv()
  const timer = useRef<number | null>(null)
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current)
  }, [])

  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (!canRename || e.detail === 0) {
      actions.openTask(node.id)
      return
    }
    if (timer.current) window.clearTimeout(timer.current)
    if (e.detail >= 2) {
      timer.current = null
      actions.startRename(node.id)
      return
    }
    // wait briefly so a double-click can become "rename" instead of opening the drawer
    timer.current = window.setTimeout(() => {
      timer.current = null
      actions.openTask(node.id)
    }, 220)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'F2' && canRename) {
      e.preventDefault()
      actions.startRename(node.id)
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      onKeyDown={onKeyDown}
      title={canRename ? `${node.title}\n(ดับเบิลคลิกเพื่อเปลี่ยนชื่อ)` : node.title}
      className={cn(
        'line-clamp-2 min-w-0 rounded-sm text-left text-sm break-words underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 @3xl:line-clamp-1',
        node.level === 1 && 'font-medium',
        node.isDone && 'text-muted-foreground line-through decoration-muted-foreground/60',
        muted && !node.isDone && 'text-muted-foreground',
      )}
    >
      {node.title}
    </button>
  )
}

function RenameInput({ node }: { node: TaskNode }) {
  const { actions } = useTreeEnv()
  const [value, setValue] = useState(node.title)
  const done = useRef(false)

  const finish = (save: boolean) => {
    if (done.current) return
    done.current = true
    const title = value.trim()
    if (save && title && title !== node.title) actions.update(node.id, { title })
    actions.stopRename()
  }

  return (
    <Input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
          e.preventDefault()
          finish(true)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          finish(false)
        }
      }}
      onBlur={() => finish(true)}
      aria-label="ชื่องาน (Enter บันทึก · Esc ยกเลิก)"
      data-local-escape=""
      maxLength={200}
      className="h-7 min-w-0 flex-1 bg-background px-2"
    />
  )
}

function DepartmentCell({ node, editable }: { node: TaskNode; editable: boolean }) {
  const { departments, actions } = useTreeEnv()
  if (!editable) return node.responsible ? <DepartmentChip name={node.responsible} /> : null
  return (
    <DepartmentPopover
      value={node.responsible}
      options={departments}
      taskTitle={node.title}
      onChange={(responsible) => actions.update(node.id, { responsible })}
    />
  )
}

function AssigneeCell({ node, users, editable }: { node: TaskNode; users: User[]; editable: boolean }) {
  const { actions } = useTreeEnv()
  const names = users.map((u) => u.nickname || u.name).join(', ')
  if (!editable) {
    return users.length ? <AvatarStack users={users} max={3} size="sm" /> : null
  }
  return (
    <UserPicker
      value={node.assigneeIds}
      onChange={(assigneeIds) => actions.update(node.id, { assigneeIds })}
      trigger={
        <button
          type="button"
          aria-label={users.length ? `ผู้รับผิดชอบ: ${names} — คลิกเพื่อเปลี่ยน` : `มอบหมายผู้รับผิดชอบให้ “${node.title}”`}
          className="inline-flex min-h-7 items-center gap-1.5 rounded-full p-0.5 pr-1.5 text-xs text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {users.length ? (
            <AvatarStack users={users} max={3} size="sm" />
          ) : (
            <>
              <span className="inline-flex size-6 items-center justify-center rounded-full border border-dashed border-muted-foreground/40">
                <UserPlusIcon className="size-3.5" />
              </span>
              <span className="@3xl:hidden">มอบหมาย</span>
            </>
          )}
        </button>
      }
    />
  )
}

function PriorityCell({ priority, editable, onChange }: { priority: TaskPriority; editable: boolean; onChange: (p: TaskPriority) => void }) {
  if (!editable) return <PriorityBadge priority={priority} />
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`ความสำคัญ: ${PRIORITY_LABEL[priority]} — คลิกเพื่อเปลี่ยน`}
          className="inline-flex rounded outline-none hover:opacity-80 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <PriorityBadge priority={priority} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-36">
        <DropdownMenuLabel className="text-xs text-muted-foreground">ความสำคัญ</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={priority}
          onValueChange={(v) => {
            const next = PRIORITY_ORDER.find((p) => p === v)
            if (next && next !== priority) onChange(next)
          }}
        >
          {PRIORITY_ORDER.map((p) => (
            <DropdownMenuRadioItem key={p} value={p}>
              <PriorityBadge priority={p} />
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function RowMenu({
  node,
  canManage,
  canEditDetails,
  siblingIndex,
  siblingCount,
  reorderable,
}: {
  node: TaskNode
  canManage: boolean
  canEditDetails: boolean
  siblingIndex: number
  siblingCount: number
  reorderable: boolean
}) {
  const { actions } = useTreeEnv()
  // Actions that move focus elsewhere (an input, the drawer, a dialog) must not get it pulled back to the trigger.
  const keepFocus = useRef(false)
  const handOff = (fn: () => void) => () => {
    keepFocus.current = true
    // let the menu finish closing before another layer (input, drawer, dialog) takes focus
    window.setTimeout(fn, 0)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`ตัวเลือกของ “${node.title}”`} className="text-muted-foreground @3xl:opacity-60 @3xl:group-hover/row:opacity-100 @3xl:focus-visible:opacity-100 @3xl:aria-expanded:opacity-100">
          <EllipsisIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56"
        onCloseAutoFocus={(e) => {
          if (keepFocus.current) e.preventDefault()
          keepFocus.current = false
        }}
      >
        {canManage && node.level < 3 && (
          <DropdownMenuItem onSelect={handOff(() => actions.startAdd(node.id))}>
            <CornerDownRightIcon />
            {addLabel(node.level)}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={handOff(() => actions.openTask(node.id))}>
          <PanelRightOpenIcon />
          {canEditDetails ? 'แก้ไขรายละเอียด' : 'ดูรายละเอียด'}
        </DropdownMenuItem>
        {canManage && (
          <>
            <DropdownMenuItem onSelect={handOff(() => actions.startRename(node.id))}>
              <PencilIcon />
              เปลี่ยนชื่อ
              <DropdownMenuShortcut>F2</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => actions.duplicate(node)}>
              <CopyIcon />
              คัดลอก
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {reorderable && (
              <>
                <DropdownMenuItem disabled={siblingIndex <= 0} onSelect={() => actions.moveBy(node, -1)}>
                  <ArrowUpIcon />
                  เลื่อนขึ้น
                </DropdownMenuItem>
                <DropdownMenuItem disabled={siblingIndex >= siblingCount - 1} onSelect={() => actions.moveBy(node, 1)}>
                  <ArrowDownIcon />
                  เลื่อนลง
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem onSelect={handOff(() => actions.requestMove(node))}>
              <FolderInputIcon />
              ย้ายไปไว้ใต้…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={handOff(() => actions.remove(node))}>
              <Trash2Icon />
              ลบ
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** "3/8" data rows filled — opens the drawer. */
function DetailFieldsChip({ node }: { node: TaskNode }) {
  const { actions } = useTreeEnv()
  const { filled, total } = detailFieldsProgress(node.detailFields)
  return (
    <button
      type="button"
      onClick={() => actions.openTask(node.id)}
      aria-label={`กรอกข้อมูลแล้ว ${filled} จาก ${total} แถว`}
      title={`กรอกข้อมูลแล้ว ${filled} จาก ${total} แถว`}
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-0.5 rounded px-1 text-xs outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
        filled === total ? 'text-success' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <TableIcon className="size-3.5" />
      <span className="tabular">
        {filled}/{total}
      </span>
    </button>
  )
}
