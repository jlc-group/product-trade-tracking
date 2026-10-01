import {
  canEditProposal,
  canManageTasks,
  computeProgress,
  computeToggle,
  getAncestorIds,
  type Task,
  type TaskNode,
  type User,
} from '@flowtrade/shared'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useQueryClient } from '@tanstack/react-query'
import { ListTreeIcon, PlusIcon, RefreshCwIcon, SearchXIcon } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import type { ProposalDetail, UpdateTaskInput } from '@/api'
import {
  qk,
  useChangeProposalStatus,
  useCommentCounts,
  useDeleteTask,
  useDuplicateTask,
  useMoveTask,
  useTasks,
  useToggleTask,
  useUpdateTask,
  useUserLookup,
} from '@/api/hooks'
import { useCurrentUser } from '@/auth/auth'
import { EmptyState, useConfirm } from '@/components/common/misc'
import { Button } from '@/components/ui/button'
import { today } from '@/lib/format'
import { cn } from '@/lib/utils'
import { compareDepartments, departmentOptions } from './department-utils'
import { InlineAdd } from './inline-add'
import { MoveDialog } from './move-dialog'
import { TaskDrawer } from './task-drawer'
import { TreeBranch } from './tree-branch'
import { TreeSkeleton, TreeToolbar } from './tree-toolbar'
import { TreeEnvContext, TreeViewContext, type TreeActions, type TreeEnv, type TreeView } from './tree-context'
import { countDescendants, countDescendantsNot, GRID_COLS, levelNoun, parentKeyOf, ROOT_KEY } from './tree-utils'
import { computeFilter, countDepartments, countMatches, FILTER_LABEL, NO_DEPARTMENT, useStableTree, useTreeState, type DepartmentFilter, type TreeFilter } from './use-tree-state'

const NO_COUNTS: Record<string, number> = {}

/** "ยังไม่เสร็จ · แผนก NPD" — what the active filters show, for the empty message. */
function filterSummary(filter: TreeFilter, department: DepartmentFilter) {
  const parts: string[] = []
  if (filter !== 'all') parts.push(FILTER_LABEL[filter])
  if (department === NO_DEPARTMENT) parts.push('ยังไม่ระบุแผนก')
  else if (department !== null) parts.push(`แผนก ${department}`)
  return parts.join(' · ')
}

function noMatchHint(filter: TreeFilter, department: DepartmentFilter) {
  if (department !== null && filter === 'all') return department === NO_DEPARTMENT ? 'ทุกงานระบุแผนกที่รับผิดชอบครบแล้ว' : 'ยังไม่มีงานของแผนกนี้ในโปรเจกต์'
  if (filter === 'overdue') return 'ไม่มีงานที่เลยกำหนด เยี่ยมมาก!'
  if (filter === 'mine') return department !== null ? 'ไม่มีงานของคุณในแผนกนี้' : 'ยังไม่มีงานที่มอบหมายให้คุณในโปรเจกต์นี้'
  return department !== null ? 'งานของแผนกนี้เสร็จครบแล้ว' : 'ทุกงานเสร็จแล้ว'
}

function groupOf(data: unknown): string | null {
  if (data && typeof data === 'object' && 'groupKey' in data) return String((data as { groupKey: unknown }).groupKey)
  return null
}

/** Drop targets are limited to the dragged task's own siblings. */
const siblingCollision: CollisionDetection = (args) => {
  const group = groupOf(args.active.data.current)
  return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => groupOf(c.data.current) === group) })
}

/**
 * Contract used by pages/proposals/detail.tsx — the full 3-level task tree for one proposal.
 * Reads tasks itself (useTasks), computes permissions itself, and opens the task drawer
 * when the URL has ?task=<id>.
 */
export function TaskTree({ proposal }: { proposal: ProposalDetail }) {
  const me = useCurrentUser()
  const qc = useQueryClient()
  const tasksQuery = useTasks(proposal.id)
  const tasks = tasksQuery.data
  const { data: commentCounts = NO_COUNTS } = useCommentCounts(proposal.id)
  const { data: lookupUsers } = useUserLookup()
  const tree = useStableTree(tasks)
  const treeState = useTreeState(proposal.id)
  const { filter, department, isFiltering, isExpanded, expandMany } = treeState

  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get('task')
  const [focusComments, setFocusComments] = useState(false)
  const [addingKey, setAddingKey] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [moveId, setMoveId] = useState<string | null>(null)
  const [dragGroup, setDragGroup] = useState<string | null>(null)
  const [confirm, confirmDialog] = useConfirm()

  const updateTask = useUpdateTask(proposal.id)
  const toggleTask = useToggleTask(proposal.id)
  const moveTask = useMoveTask(proposal.id)
  const deleteTask = useDeleteTask(proposal.id)
  const duplicateTask = useDuplicateTask(proposal.id)
  const changeStatus = useChangeProposalStatus()

  const canManage = canManageTasks(me, proposal)
  const cancelled = proposal.status === 'CANCELLED'
  const dragEnabled = canManage && !isFiltering
  const todayStr = today()

  const filterResult = useMemo(() => computeFilter(tree.byId, filter, department, me.id, todayStr), [tree.byId, filter, department, me.id, todayStr])
  const counts = useMemo(() => countMatches(tree.byId, department, me.id, todayStr), [tree.byId, department, me.id, todayStr])
  const departmentCounts = useMemo(() => countDepartments(tree.byId, compareDepartments), [tree.byId])
  // Suggestions change only when the set of names changes, so rows don't re-render on every edit.
  const departmentKey = JSON.stringify(departmentCounts.departments.map((d) => d.name))
  const departments = useMemo(() => departmentOptions(JSON.parse(departmentKey) as string[]), [departmentKey])
  const progress = useMemo(() => computeProgress(tasks ?? []), [tasks])
  const usersById = useMemo(() => {
    const map = new Map<string, User>()
    map.set(proposal.owner.id, proposal.owner)
    for (const u of proposal.members) map.set(u.id, u)
    for (const u of lookupUsers ?? []) map.set(u.id, u)
    return map
  }, [proposal.owner, proposal.members, lookupUsers])

  // ---------- behaviour (kept in a ref so the actions object handed to rows never changes) ----------

  const siblingsOf = (node: Pick<Task, 'parentId'>) => (node.parentId ? (tree.byId.get(node.parentId)?.children ?? []) : tree.roots)

  const closeTask = () => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('task')
        return next
      },
      { replace: true },
    )
  }

  const reorder = (node: TaskNode, newIndex: number) => {
    const siblings = siblingsOf(node)
    const oldIndex = siblings.findIndex((s) => s.id === node.id)
    if (oldIndex < 0 || newIndex < 0 || newIndex >= siblings.length || newIndex === oldIndex) return
    // Show the new order right away; the server answer replaces it (or a refetch restores it on error).
    const order = new Map(arrayMove(siblings, oldIndex, newIndex).map((s, i) => [s.id, (i + 1) * 1000]))
    void qc.cancelQueries({ queryKey: qk.tasks(proposal.id) })
    qc.setQueryData<Task[]>(qk.tasks(proposal.id), (old) => old?.map((t) => (order.has(t.id) ? { ...t, sortOrder: order.get(t.id)! } : t)))
    moveTask.mutate({ id: node.id, input: { parentId: node.parentId, index: newIndex } })
  }

  const impl: TreeActions = {
    openTask: (id, opts) => {
      setFocusComments(!!opts?.focusComments)
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set('task', id)
          return next
        },
        { replace: true },
      )
    },
    toggle: async (node, isDone) => {
      const all = tasks ?? []
      const affected = countDescendantsNot(node, isDone)
      if (affected > 0) {
        const ok = await confirm(
          isDone
            ? {
                title: `ทำเครื่องหมาย “${node.title}” ว่าเสร็จ?`,
                description: `จะทำเครื่องหมายงานย่อยอีก ${affected} รายการว่าเสร็จด้วย`,
                confirmLabel: `เสร็จทั้งหมด ${affected + 1} รายการ`,
              }
            : {
                title: `เปิด “${node.title}” อีกครั้ง?`,
                description: `งานย่อยที่เสร็จแล้ว ${affected} รายการจะกลับเป็น “ยังไม่เสร็จ” ด้วย`,
                confirmLabel: 'เปิดงานอีกครั้ง',
              },
        )
        if (!ok) return
      }
      // Which ancestors will auto-complete because of this tick (same cascade rules as the server)?
      const ancestors = new Set(getAncestorIds(all, node.id))
      const completedAncestor = isDone
        ? computeToggle(all, node.id, true)
            .filter((c) => c.isDone && ancestors.has(c.id))
            .map((c) => tree.byId.get(c.id))
            .filter((n): n is TaskNode => !!n)
            .sort((a, b) => a.level - b.level)[0]
        : undefined
      try {
        const result = await toggleTask.mutateAsync({ id: node.id, isDone })
        if (isDone && result.allDone && proposal.status !== 'COMPLETED') {
          const canClose = canEditProposal(me, proposal) && !cancelled
          toast.success('งานครบ 100% แล้ว 🎉', {
            description: canClose ? 'เปลี่ยนสถานะโปรเจกต์เป็น “เสร็จสิ้น” ได้เลย' : 'แจ้งเจ้าของโปรเจกต์ให้เปลี่ยนสถานะเป็น “เสร็จสิ้น”',
            duration: 10_000,
            action: canClose
              ? {
                  label: 'ตั้งเป็นเสร็จสิ้น',
                  onClick: () => changeStatus.mutate({ id: proposal.id, status: 'COMPLETED' }, { onSuccess: () => toast.success(`ปิดโปรเจกต์ ${proposal.code} เรียบร้อย`) }),
                }
              : undefined,
          })
        } else if (completedAncestor) {
          toast.success(`${levelNoun(completedAncestor.level)} “${completedAncestor.title}” เสร็จครบแล้ว 🎉`)
        }
      } catch {
        // already toasted and rolled back by the hook
      }
    },
    update: (id, patch: UpdateTaskInput, successMessage) => {
      updateTask.mutate({ id, patch }, { onSuccess: () => successMessage && toast.success(successMessage) })
    },
    toggleExpanded: (id) => treeState.toggleExpanded(id),
    startAdd: (parentId) => {
      if (isFiltering) treeState.clearFilters()
      if (parentId) expandMany([parentId])
      setRenamingId(null)
      setAddingKey(parentKeyOf(parentId))
    },
    stopAdd: () => setAddingKey(null),
    startRename: (id) => setRenamingId(id),
    stopRename: () => setRenamingId(null),
    requestMove: (node) => setMoveId(node.id),
    moveBy: (node, delta) => {
      const index = siblingsOf(node).findIndex((s) => s.id === node.id)
      reorder(node, index + delta)
    },
    duplicate: (node) => {
      duplicateTask.mutate(node.id, {
        onSuccess: (copy) =>
          toast.success(`คัดลอก “${node.title}” แล้ว`, {
            description: node.children.length ? `รวมงานย่อย ${countDescendants(node)} รายการ (ยังไม่ติ๊ก)` : undefined,
            action: { label: 'เปิดดู', onClick: () => actionsRef.current.openTask(copy.id) },
          }),
      })
    },
    remove: async (node) => {
      const sub = countDescendants(node)
      const ok = await confirm({
        title: `ลบ “${node.title}”?`,
        description:
          sub > 0
            ? `งานย่อยอีก ${sub} รายการ และความคิดเห็นทั้งหมดในงานเหล่านี้จะถูกลบไปด้วย กู้คืนไม่ได้`
            : 'ความคิดเห็นในงานนี้จะถูกลบไปด้วย กู้คืนไม่ได้',
        confirmLabel: sub > 0 ? `ลบทั้งหมด ${sub + 1} รายการ` : 'ลบงาน',
        destructive: true,
      })
      if (!ok) return
      deleteTask.mutate(node.id, {
        onSuccess: (res) => {
          toast.success(sub > 0 ? `ลบ “${node.title}” และงานย่อยแล้ว` : `ลบ “${node.title}” แล้ว`)
          if (selectedId && res.removed.includes(selectedId)) closeTask()
        },
      })
    },
  }

  const actionsRef = useRef(impl)
  useLayoutEffect(() => {
    actionsRef.current = impl
  })
  const actions = useMemo<TreeActions>(
    () => ({
      openTask: (id, opts) => actionsRef.current.openTask(id, opts),
      toggle: (node, isDone) => actionsRef.current.toggle(node, isDone),
      update: (id, patch, msg) => actionsRef.current.update(id, patch, msg),
      toggleExpanded: (id) => actionsRef.current.toggleExpanded(id),
      startAdd: (parentId) => actionsRef.current.startAdd(parentId),
      stopAdd: () => actionsRef.current.stopAdd(),
      startRename: (id) => actionsRef.current.startRename(id),
      stopRename: () => actionsRef.current.stopRename(),
      requestMove: (node) => actionsRef.current.requestMove(node),
      moveBy: (node, delta) => actionsRef.current.moveBy(node, delta),
      duplicate: (node) => actionsRef.current.duplicate(node),
      remove: (node) => actionsRef.current.remove(node),
    }),
    [],
  )

  // Opening a task (also from a link ?task=…) makes sure its row is visible; the first one is scrolled into view.
  const expandedFor = useRef<string | null>(null)
  const scrolledOnce = useRef(false)
  const tasksLoaded = !!tasks
  useEffect(() => {
    if (!selectedId) {
      expandedFor.current = null
      return
    }
    if (!tasks || expandedFor.current === selectedId) return
    expandedFor.current = selectedId
    const ancestors = getAncestorIds(tasks, selectedId)
    if (ancestors.length) expandMany(ancestors)
    if (!scrolledOnce.current) {
      scrolledOnce.current = true
      requestAnimationFrame(() => document.getElementById(`task-row-${selectedId}`)?.scrollIntoView({ block: 'center' }))
    }
  }, [selectedId, tasks, expandMany])

  // ---------- drag & drop ----------

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const titleOf = (id: UniqueIdentifier) => tree.byId.get(String(id))?.title ?? 'งาน'
  const accessibility = {
    screenReaderInstructions: {
      draggable: 'กด Space หรือ Enter เพื่อหยิบงาน ใช้ลูกศรขึ้นหรือลงเพื่อเลื่อนตำแหน่งในกลุ่มเดียวกัน กด Space หรือ Enter อีกครั้งเพื่อวาง หรือ Esc เพื่อยกเลิก',
    },
    announcements: {
      onDragStart: ({ active }) => `หยิบ “${titleOf(active.id)}” แล้ว`,
      onDragOver: ({ active, over }) => (over ? `“${titleOf(active.id)}” อยู่ตำแหน่งของ “${titleOf(over.id)}”` : undefined),
      onDragEnd: ({ active, over }) => (over ? `วาง “${titleOf(active.id)}” แล้ว` : `ยกเลิกการย้าย “${titleOf(active.id)}”`),
      onDragCancel: ({ active }) => `ยกเลิกการย้าย “${titleOf(active.id)}”`,
    } satisfies Announcements,
  }

  const onDragStart = (e: DragStartEvent) => setDragGroup(groupOf(e.active.data.current))
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragGroup(null)
    if (!over || active.id === over.id) return
    if (groupOf(active.data.current) !== groupOf(over.data.current)) return
    const node = tree.byId.get(String(active.id))
    if (!node) return
    reorder(node, siblingsOf(node).findIndex((s) => s.id === over.id))
  }

  // ---------- context values ----------

  const env = useMemo<TreeEnv>(
    () => ({ me, proposal, canManage, cancelled, usersById, departments, dragEnabled, actions }),
    [me, proposal, canManage, cancelled, usersById, departments, dragEnabled, actions],
  )
  const view = useMemo<TreeView>(
    () => ({ isExpanded, filter: filterResult, addingKey, renamingId, selectedId, dragGroup, commentCounts }),
    [isExpanded, filterResult, addingKey, renamingId, selectedId, dragGroup, commentCounts],
  )

  // ---------- render ----------

  if (tasksQuery.isLoading) return <TreeSkeleton />
  if (tasksQuery.isError || !tasks) {
    return (
      <EmptyState
        icon={<RefreshCwIcon className="size-5" />}
        title="โหลดรายการงานไม่สำเร็จ"
        description="ตรวจสอบการเชื่อมต่อแล้วลองใหม่อีกครั้ง"
        action={
          <Button variant="outline" onClick={() => tasksQuery.refetch()}>
            <RefreshCwIcon />
            ลองอีกครั้ง
          </Button>
        }
      />
    )
  }

  const moveNode = moveId ? (tree.byId.get(moveId) ?? null) : null
  const isEmpty = tree.roots.length === 0
  const showRootAdd = canManage && !isFiltering
  const noMatches = !!filterResult && filterResult.matches.size === 0

  return (
    <TreeEnvContext.Provider value={env}>
      <TreeViewContext.Provider value={view}>
        {isEmpty && addingKey !== ROOT_KEY ? (
          <EmptyState
            icon={<ListTreeIcon className="size-5" />}
            title="ยังไม่มีงานในโปรเจกต์นี้"
            description={
              canManage
                ? 'แบ่งงานเป็น Task → Sub task → Mini task กำหนดวันและผู้รับผิดชอบ แล้วติ๊กเมื่อเสร็จ ทุกคนในทีมจะเห็นความคืบหน้าทันที'
                : 'ทีมงานของโปรเจกต์ยังไม่ได้เพิ่มงาน เมื่อมีงานแล้วจะแสดงที่นี่'
            }
            action={
              canManage && (
                <Button onClick={() => actions.startAdd(null)}>
                  <PlusIcon />
                  เพิ่มงานหลัก
                </Button>
              )
            }
          />
        ) : (
          <section aria-label="รายการงาน" className="@container overflow-hidden rounded-xl border bg-card">
            <TreeToolbar
              progress={progress}
              counts={counts}
              filter={filter}
              onFilter={treeState.setFilter}
              department={department}
              departmentCounts={departmentCounts}
              onDepartment={treeState.setDepartment}
              isFiltering={isFiltering}
              canExpand={tree.parentIds.length > 0}
              onExpandAll={treeState.expandAll}
              onCollapseAll={() => treeState.collapseAll(tree.parentIds)}
              onAddRoot={canManage ? () => actions.startAdd(null) : null}
            />

            {/* column headers (wide layout) */}
            <div className={cn('hidden border-b bg-muted/40 text-xs font-medium text-muted-foreground @3xl:grid', GRID_COLS)}>
              <div className={cn('py-2', dragEnabled ? 'pl-8' : 'pl-3')}>งาน</div>
              <div className="px-2 py-2">แผนก</div>
              <div className="px-2 py-2">ผู้รับผิดชอบ</div>
              <div className="px-2 py-2">ระยะเวลา</div>
              <div className="px-2 py-2">ความสำคัญ</div>
              <div className="sr-only">ตัวเลือก</div>
            </div>

            {noMatches ? (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                <SearchXIcon className="size-5 text-muted-foreground" />
                <p className="text-sm font-medium">ไม่มีงานที่ตรงกับ “{filterSummary(filter, department)}”</p>
                <p className="text-xs text-muted-foreground">{noMatchHint(filter, department)}</p>
                <Button variant="outline" size="sm" onClick={treeState.clearFilters}>
                  ดูงานทั้งหมด
                </Button>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={siblingCollision}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDragCancel={() => setDragGroup(null)}
                accessibility={accessibility}
              >
                <TreeBranch nodes={tree.roots} parent={null} depth={0} />
              </DndContext>
            )}

            {showRootAdd && (
              <InlineAdd
                parentId={null}
                parentLevel={null}
                depth={0}
                active={addingKey === ROOT_KEY}
                onActivate={() => actions.startAdd(null)}
                onClose={actions.stopAdd}
                withHandleSpace={dragEnabled}
              />
            )}
          </section>
        )}

        <MoveDialog
          node={moveNode}
          roots={tree.roots}
          tasks={tasks}
          pending={moveTask.isPending}
          onClose={() => setMoveId(null)}
          onMove={(node, parentId) => {
            const index = parentId ? (tree.byId.get(parentId)?.children.length ?? 0) : tree.roots.length
            const target = parentId ? tree.byId.get(parentId) : null
            moveTask.mutate(
              { id: node.id, input: { parentId, index } },
              {
                onSuccess: () => {
                  setMoveId(null)
                  if (parentId) expandMany([parentId, ...getAncestorIds(tasks, parentId)])
                  toast.success(target ? `ย้าย “${node.title}” ไปไว้ใต้ “${target.title}” แล้ว` : `ย้าย “${node.title}” ขึ้นเป็นงานหลักแล้ว`)
                },
              },
            )
          }}
        />
        <TaskDrawer taskId={selectedId} tree={tree} loaded={tasksLoaded} focusComments={focusComments} onClose={closeTask} />
        {confirmDialog}
      </TreeViewContext.Provider>
    </TreeEnvContext.Provider>
  )
}
