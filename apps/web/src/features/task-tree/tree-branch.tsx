import type { TaskNode } from '@flowtrade/shared'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { memo, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { InlineAdd } from './inline-add'
import { TaskRow } from './task-row'
import { useTreeEnv, useTreeView } from './tree-context'
import { parentKeyOf } from './tree-utils'

interface TreeBranchProps {
  nodes: TaskNode[]
  parent: TaskNode | null
  depth: number
}

/** One sibling group: its sortable rows (each with its own subtree) and the inline "+ add" row. */
export const TreeBranch = memo(function TreeBranch({ nodes, parent, depth }: TreeBranchProps) {
  const { canManage, dragEnabled, actions } = useTreeEnv()
  const { filter, addingKey } = useTreeView()
  const visible = useMemo(() => (filter ? nodes.filter((n) => filter.visible.has(n.id)) : nodes), [nodes, filter])
  const ids = useMemo(() => visible.map((n) => n.id), [visible])
  const groupKey = parentKeyOf(parent?.id ?? null)
  const showAdd = !!parent && canManage && !filter && parent.level < 3 && (nodes.length > 0 || addingKey === parent.id)

  return (
    <>
      <SortableContext id={groupKey} items={ids} strategy={verticalListSortingStrategy}>
        {visible.map((node, i) => (
          <SortableTaskItem key={node.id} node={node} parent={parent} depth={depth} index={i} count={visible.length} groupKey={groupKey} />
        ))}
      </SortableContext>
      {showAdd && (
        <div className="border-b border-border/60">
          <InlineAdd
            parentId={parent.id}
            parentLevel={parent.level}
            depth={depth}
            active={addingKey === parent.id}
            onActivate={() => actions.startAdd(parent.id)}
            onClose={actions.stopAdd}
            withHandleSpace={dragEnabled}
          />
        </div>
      )}
    </>
  )
})

interface SortableTaskItemProps {
  node: TaskNode
  parent: TaskNode | null
  depth: number
  index: number
  count: number
  groupKey: string
}

const SortableTaskItem = memo(function SortableTaskItem({ node, parent, depth, index, count, groupKey }: SortableTaskItemProps) {
  const { dragEnabled } = useTreeEnv()
  const view = useTreeView()
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: node.id,
    data: { groupKey },
    // Only siblings are drop targets while something is being dragged.
    disabled: { draggable: !dragEnabled, droppable: view.dragGroup !== null && view.dragGroup !== groupKey },
  })
  const expanded = view.isExpanded(node.id)
  const showChildren = expanded && (node.children.length > 0 || view.addingKey === node.id)
  const handle = useMemo(() => (dragEnabled ? { setActivatorNodeRef, attributes, listeners } : null), [dragEnabled, setActivatorNodeRef, attributes, listeners])

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(isDragging && 'relative z-20 overflow-hidden rounded-lg bg-card opacity-95 shadow-xl ring-1 ring-primary/30')}
    >
      <TaskRow
        node={node}
        depth={depth}
        parentStart={parent?.startDate ?? null}
        parentDue={parent?.dueDate ?? null}
        expanded={expanded && node.children.length > 0}
        isContext={!!view.filter && !view.filter.matches.has(node.id)}
        commentCount={view.commentCounts[node.id] ?? 0}
        renaming={view.renamingId === node.id}
        selected={view.selectedId === node.id}
        siblingIndex={index}
        siblingCount={count}
        reorderable={!view.filter}
        handle={handle}
      />
      {showChildren && <TreeBranch nodes={node.children} parent={node} depth={depth + 1} />}
    </div>
  )
})
