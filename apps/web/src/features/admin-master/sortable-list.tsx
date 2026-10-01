import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type Modifier,
  type ScreenReaderInstructions,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVerticalIcon } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

const lockToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 })

const screenReaderInstructions: ScreenReaderInstructions = {
  draggable: 'กด Space หรือ Enter เพื่อหยิบรายการ ใช้ลูกศรขึ้น/ลงเพื่อเลื่อน แล้วกด Space หรือ Enter อีกครั้งเพื่อวาง หรือกด Esc เพื่อยกเลิก',
}

interface SortableListProps<T extends { id: string }> {
  items: T[]
  /** Called with every id in the new order. Return the mutation promise so the list holds the new order until the server confirms. */
  onReorder: (ids: string[]) => Promise<unknown> | void
  /** Name used in drag handle labels and screen reader announcements. */
  getLabel: (item: T) => string
  renderItem: (item: T, handle: ReactNode) => ReactNode
  disabled?: boolean
  className?: string
  itemClassName?: string
}

/** Vertical list reorderable by a drag handle (mouse, touch and keyboard). */
export function SortableList<T extends { id: string }>({ items, onReorder, getLabel, renderItem, disabled, className, itemClassName }: SortableListProps<T>) {
  // Holds the dropped order until the server answers, so rows don't jump back while saving.
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const ordered = useMemo(() => {
    if (!pendingOrder || pendingOrder.length !== items.length) return items
    const byId = new Map(items.map((i) => [i.id, i]))
    const next = pendingOrder.map((id) => byId.get(id)).filter((i): i is T => !!i)
    return next.length === items.length ? next : items
  }, [items, pendingOrder])

  const ids = ordered.map((i) => i.id)
  const labelOf = (id: UniqueIdentifier) => {
    const item = ordered.find((i) => i.id === String(id))
    return item ? getLabel(item) : 'รายการ'
  }
  const positionOf = (id: UniqueIdentifier) => ids.indexOf(String(id)) + 1

  const announcements: Announcements = {
    onDragStart: ({ active }) => `หยิบ ${labelOf(active.id)} จากลำดับที่ ${positionOf(active.id)} จาก ${ids.length}`,
    onDragOver: ({ active, over }) => (over ? `${labelOf(active.id)} อยู่ที่ลำดับ ${positionOf(over.id)} จาก ${ids.length}` : undefined),
    onDragEnd: ({ active, over }) => (over ? `วาง ${labelOf(active.id)} ที่ลำดับ ${positionOf(over.id)} แล้ว` : `วาง ${labelOf(active.id)} แล้ว`),
    onDragCancel: ({ active }) => `ยกเลิกการย้าย ${labelOf(active.id)}`,
  }

  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const next = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)))
    setPendingOrder(next)
    try {
      await onReorder(next)
    } catch {
      // The mutation hook already shows the error; fall back to the server order.
    } finally {
      setPendingOrder(null)
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[lockToVerticalAxis]}
      onDragEnd={handleDragEnd}
      accessibility={{ announcements, screenReaderInstructions }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy} disabled={disabled}>
        <ul className={cn('divide-y', className)}>
          {ordered.map((item) => (
            <SortableRow key={item.id} id={item.id} label={getLabel(item)} disabled={disabled} className={itemClassName}>
              {(handle) => renderItem(item, handle)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

function SortableRow({ id, label, disabled, className, children }: { id: string; label: string; disabled?: boolean; className?: string; children: (handle: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })
  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`ลากเพื่อเลื่อนลำดับ ${label}`}
      title="ลากเพื่อเลื่อนลำดับ"
      disabled={disabled}
      className={cn(
        'flex h-8 w-6 shrink-0 touch-none items-center justify-center rounded-md text-muted-foreground/60 outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default disabled:opacity-30',
        isDragging ? 'cursor-grabbing' : 'cursor-grab',
      )}
    >
      <GripVerticalIcon className="size-4" />
    </button>
  )
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('relative bg-card first:rounded-t-xl last:rounded-b-xl', isDragging && 'z-10 rounded-xl shadow-lg ring-1 ring-primary/30', className)}
    >
      {children(handle)}
    </li>
  )
}
