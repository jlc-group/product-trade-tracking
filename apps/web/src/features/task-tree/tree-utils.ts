import type { ISODate, TaskLevel, TaskNode } from '@flowtrade/shared'
import { formatDateRange } from '@/lib/format'

/** Key used for the top-level sibling group (parentId = null). */
export const ROOT_KEY = '__root__'
export const parentKeyOf = (parentId: string | null) => parentId ?? ROOT_KEY

/** Horizontal indent per tree level, in px — also the width of the chevron column. */
export const INDENT = 20

/** Wide-layout columns (container ≥ @3xl): งาน · แผนก · ผู้รับผิดชอบ · ระยะเวลา · ความสำคัญ · menu. */
export const GRID_COLS = '@3xl:grid-cols-[minmax(0,1fr)_8rem_6.5rem_11rem_4.75rem_2.5rem]'

/** "Sub task" for a child of a level-1 task, "Mini task" for a child of a level-2 task. */
export function childLabel(level: TaskLevel): string {
  return level === 1 ? 'Sub task' : 'Mini task'
}

/** Button text for adding a child under a parent of this level (null = top level). */
export function addLabel(parentLevel: TaskLevel | null): string {
  return parentLevel === null ? 'เพิ่มงานหลัก' : `เพิ่ม ${childLabel(parentLevel)}`
}

export const LEVEL_DOT: Record<TaskLevel, string> = {
  1: 'bg-primary',
  2: 'bg-info',
  3: 'bg-muted-foreground/50',
}

/** True when a child's dates fall outside the parent's start–due window (a warning, not an error). */
export function outsideParentRange(start: ISODate | null, due: ISODate | null, parentStart: ISODate | null, parentDue: ISODate | null): boolean {
  if (!start && !due) return false
  const dates = [start, due].filter(Boolean) as ISODate[]
  if (parentStart && dates.some((d) => d < parentStart)) return true
  if (parentDue && dates.some((d) => d > parentDue)) return true
  return false
}

export function parentRangeText(parentStart: ISODate | null, parentDue: ISODate | null) {
  return formatDateRange(parentStart, parentDue)
}

/** Count of descendants (all levels) under a node. */
export function countDescendants(node: TaskNode): number {
  return node.children.reduce((sum, c) => sum + 1 + countDescendants(c), 0)
}

