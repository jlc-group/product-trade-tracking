import { MAX_TASK_LEVEL } from './labels.js'
import type { ISODate, Progress, Task, TaskLevel, TaskNode, TaskTemplateItem } from './types.js'

// ---------- date-only helpers (no timezone drift: work in UTC on YYYY-MM-DD) ----------

export function addDays(date: ISODate, days: number): ISODate {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function diffDays(from: ISODate, to: ISODate): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

/** Today's business date in Asia/Bangkok. */
export function todayBangkok(now: Date = new Date()): ISODate {
  return new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10)
}

export function isOverdue(task: Pick<Task, 'isDone' | 'dueDate'>, today: ISODate): boolean {
  return !task.isDone && !!task.dueDate && task.dueDate < today
}

export function isDueWithin(task: Pick<Task, 'isDone' | 'dueDate'>, today: ISODate, days: number): boolean {
  return !task.isDone && !!task.dueDate && task.dueDate >= today && task.dueDate <= addDays(today, days)
}

// ---------- tree building & progress ----------

const bySort = (a: { sortOrder: number }, b: { sortOrder: number }) => a.sortOrder - b.sortOrder

export function emptyProgress(): Progress {
  return { done: 0, total: 0, percent: 0 }
}

function toPercent(done: number, total: number) {
  return total === 0 ? 0 : Math.round((done / total) * 100)
}

/** Builds the nested tree for one proposal. Progress is leaf-based (a parent counts its leaves). */
export function buildTaskTree(tasks: Task[]): TaskNode[] {
  const nodes = new Map<string, TaskNode>()
  for (const t of tasks) nodes.set(t.id, { ...t, children: [], progress: emptyProgress() })
  const roots: TaskNode[] = []
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  const finish = (node: TaskNode): Progress => {
    node.children.sort(bySort)
    if (node.children.length === 0) {
      node.progress = { done: node.isDone ? 1 : 0, total: 1, percent: node.isDone ? 100 : 0 }
      return node.progress
    }
    let done = 0
    let total = 0
    for (const c of node.children) {
      const p = finish(c)
      done += p.done
      total += p.total
    }
    node.progress = { done, total, percent: toPercent(done, total) }
    return node.progress
  }
  roots.sort(bySort)
  roots.forEach(finish)
  return roots
}

/** Leaf-based progress of a whole proposal. */
export function computeProgress(tasks: Pick<Task, 'id' | 'parentId' | 'isDone'>[]): Progress {
  const hasChildren = new Set(tasks.map((t) => t.parentId).filter(Boolean) as string[])
  const leaves = tasks.filter((t) => !hasChildren.has(t.id))
  const done = leaves.filter((t) => t.isDone).length
  return { done, total: leaves.length, percent: toPercent(done, leaves.length) }
}

export function flattenTree(nodes: TaskNode[]): TaskNode[] {
  const out: TaskNode[] = []
  const walk = (list: TaskNode[]) => {
    for (const n of list) {
      out.push(n)
      walk(n.children)
    }
  }
  walk(nodes)
  return out
}

export function getDescendantIds(tasks: Pick<Task, 'id' | 'parentId'>[], id: string): string[] {
  const out: string[] = []
  const stack = [id]
  while (stack.length) {
    const current = stack.pop()!
    for (const t of tasks) {
      if (t.parentId === current) {
        out.push(t.id)
        stack.push(t.id)
      }
    }
  }
  return out
}

export function getAncestorIds(tasks: Pick<Task, 'id' | 'parentId'>[], id: string): string[] {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const out: string[] = []
  let current = byId.get(id)?.parentId ?? null
  while (current) {
    out.push(current)
    current = byId.get(current)?.parentId ?? null
  }
  return out
}

/** 0 for a leaf, 1 if it has children, 2 if it has grandchildren. */
export function subtreeHeight(tasks: Pick<Task, 'id' | 'parentId'>[], id: string): number {
  const children = tasks.filter((t) => t.parentId === id)
  if (children.length === 0) return 0
  return 1 + Math.max(...children.map((c) => subtreeHeight(tasks, c.id)))
}

// ---------- checklist cascade ----------

export interface ToggleChange {
  id: string
  isDone: boolean
}

/**
 * Rule set (same on client and server):
 *  - A task WITH children is done exactly when all of its children are done.
 *  - Ticking/unticking a parent applies the same state to every descendant.
 *  - After any change, ancestors are re-derived from their children.
 * Returns only the tasks whose isDone actually changes.
 */
export function computeToggle(tasks: Pick<Task, 'id' | 'parentId' | 'isDone'>[], id: string, isDone: boolean): ToggleChange[] {
  const state = new Map(tasks.map((t) => [t.id, t.isDone]))
  const before = new Map(state)
  state.set(id, isDone)
  for (const d of getDescendantIds(tasks, id)) state.set(d, isDone)
  for (const a of getAncestorIds(tasks, id)) {
    const children = tasks.filter((t) => t.parentId === a)
    state.set(a, children.every((c) => state.get(c.id)))
  }
  const changes: ToggleChange[] = []
  for (const [taskId, value] of state) if (before.get(taskId) !== value) changes.push({ id: taskId, isDone: value })
  return changes
}

// ---------- moving ----------

export interface MoveCheck {
  ok: boolean
  newLevel: TaskLevel | null
  reason?: string
}

/** Can task `id` be placed under `newParentId` (null = top level) without exceeding 3 levels? */
export function checkMove(
  tasks: Pick<Task, 'id' | 'parentId' | 'level'>[],
  id: string,
  newParentId: string | null,
): MoveCheck {
  if (newParentId === id) return { ok: false, newLevel: null, reason: 'ย้ายไปไว้ใต้ตัวเองไม่ได้' }
  if (newParentId && getDescendantIds(tasks, id).includes(newParentId)) {
    return { ok: false, newLevel: null, reason: 'ย้ายไปไว้ใต้งานย่อยของตัวเองไม่ได้' }
  }
  const parent = newParentId ? tasks.find((t) => t.id === newParentId) : null
  if (newParentId && !parent) return { ok: false, newLevel: null, reason: 'ไม่พบงานปลายทาง' }
  const newLevel = (parent ? parent.level + 1 : 1) as number
  const height = subtreeHeight(tasks, id)
  if (newLevel + height > MAX_TASK_LEVEL) {
    return { ok: false, newLevel: null, reason: `งานนี้มีงานย่อยอยู่ ${height} ชั้น ย้ายแล้วจะเกิน ${MAX_TASK_LEVEL} ระดับ` }
  }
  return { ok: true, newLevel: newLevel as TaskLevel }
}

// ---------- templates ----------

export interface PlannedTask {
  templateItemId: string
  parentTemplateItemId: string | null
  level: TaskLevel
  title: string
  startDate: ISODate
  dueDate: ISODate
  responsible: string | null
  sortOrder: number
  /** true when the template wanted a start date earlier than today and it was clamped. */
  clamped: boolean
}

/** Tree pre-order: every parent before its children, siblings by sortOrder. */
export function orderAsTree<T extends { id: string; parentId: string | null; sortOrder: number }>(items: T[]): T[] {
  const ids = new Set(items.map((i) => i.id))
  const byParent = new Map<string | null, T[]>()
  for (const i of items) {
    // Orphans (parent missing from the list) are treated as roots so nothing is lost.
    const key = i.parentId && ids.has(i.parentId) ? i.parentId : null
    byParent.set(key, [...(byParent.get(key) ?? []), i])
  }
  const out: T[] = []
  const walk = (parentId: string | null) => {
    for (const i of [...(byParent.get(parentId) ?? [])].sort(bySort)) {
      out.push(i)
      walk(i.id)
    }
  }
  walk(null)
  return out
}

/**
 * Back-schedules template items from the target date, in tree pre-order (parents first).
 * Start dates earlier than `today` are clamped to today (due date never precedes start).
 */
export function planFromTemplate(
  items: TaskTemplateItem[],
  targetDate: ISODate,
  today: ISODate,
  excludedItemIds: string[] = [],
): PlannedTask[] {
  const excluded = new Set(excludedItemIds)
  // Excluding a parent excludes its subtree.
  for (const id of [...excluded]) for (const d of getDescendantIds(items, id)) excluded.add(d)
  return orderAsTree(items.filter((i) => !excluded.has(i.id)))
    .map((i) => {
      let start = addDays(targetDate, i.startOffsetDays)
      let due = addDays(targetDate, i.dueOffsetDays)
      const clamped = start < today
      if (clamped) start = today
      if (due < start) due = start
      return {
        templateItemId: i.id,
        parentTemplateItemId: i.parentId,
        level: i.level,
        title: i.title,
        startDate: start,
        dueDate: due,
        responsible: i.responsible,
        sortOrder: i.sortOrder,
        clamped,
      }
    })
}

/** Earliest start offset of a template — the lead time it needs before launch (positive days). */
export function templateLeadDays(items: TaskTemplateItem[]): number {
  if (items.length === 0) return 0
  return Math.max(0, -Math.min(...items.map((i) => i.startOffsetDays)))
}

// ---------- wizard-edited plans ----------

export interface NormalizedPlanItem {
  key: string
  parentKey: string | null
  level: TaskLevel
  title: string
  startDate: ISODate | null
  dueDate: ISODate | null
  responsible: string | null
  sortOrder: number
}

/**
 * Validates a client-edited plan and returns it parent-first with levels and sibling sortOrder
 * (1000, 2000, …). Throws an Error with a Thai message when the plan is invalid.
 */
export function normalizePlan(
  plan: { key: string; parentKey: string | null; title: string; startDate: ISODate | null; dueDate: ISODate | null; responsible?: string | null }[],
): NormalizedPlanItem[] {
  if (plan.length > 500) throw new Error('รายการงานมากเกินไป (สูงสุด 500 งาน)')
  const keys = new Set<string>()
  for (const p of plan) {
    if (!p.key) throw new Error('รายการงานไม่ถูกต้อง')
    if (keys.has(p.key)) throw new Error('รายการงานซ้ำกัน')
    keys.add(p.key)
    if (!p.title.trim()) throw new Error('กรุณาตั้งชื่องานให้ครบทุกงาน')
    if (p.startDate && p.dueDate && p.dueDate < p.startDate) throw new Error(`"${p.title.trim()}" วันครบกำหนดอยู่ก่อนวันเริ่ม`)
  }
  for (const p of plan) if (p.parentKey && !keys.has(p.parentKey)) throw new Error(`ไม่พบงานหลักของ "${p.title.trim()}"`)
  const byKey = new Map(plan.map((p) => [p.key, p]))
  const levelOf = (key: string, seen = new Set<string>()): number => {
    if (seen.has(key)) throw new Error('โครงสร้างงานวนซ้ำ')
    seen.add(key)
    const parentKey = byKey.get(key)!.parentKey
    return parentKey ? levelOf(parentKey, seen) + 1 : 1
  }
  const withMeta = plan.map((p, index) => ({ ...p, id: p.key, parentId: p.parentKey, sortOrder: index }))
  const ordered = orderAsTree(withMeta)
  const siblingIndex = new Map<string | null, number>()
  return ordered.map((p) => {
    const level = levelOf(p.key)
    if (level > MAX_TASK_LEVEL) throw new Error(`"${p.title.trim()}" ลึกเกิน ${MAX_TASK_LEVEL} ระดับ`)
    const n = (siblingIndex.get(p.parentKey) ?? 0) + 1
    siblingIndex.set(p.parentKey, n)
    return {
      key: p.key,
      parentKey: p.parentKey,
      level: level as TaskLevel,
      title: p.title.trim(),
      startDate: p.startDate,
      dueDate: p.dueDate,
      responsible: p.responsible?.trim() || null,
      sortOrder: n * 1000,
    }
  })
}
