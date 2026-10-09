import { MAX_TASK_LEVEL } from './labels.js'
import { cleanFieldLabels, detailFieldsProgress } from './detail-fields.js'
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

/** Red starts this many days before a task's due date. */
export const TIMELINE_RED_DAYS = 2
export const TIMELINE_LATE_NOTE = 'จัดการงานล่าช้า ส่งผลต่อการเลื่อนวันขาย'
/** 'active' = yellow, 'due-soon' and 'late' = red ('late' also shows TIMELINE_LATE_NOTE); 'none' = no colour. */
export type TimelineTone = 'none' | 'active' | 'due-soon' | 'late'

/**
 * Colour of an open task's timeline: yellow while today is inside start…due, red from TIMELINE_RED_DAYS before the
 * due date, red + a note once it is past due. Done tasks, tasks without a due date and tasks not started yet: none.
 */
export function timelineTone(task: Pick<Task, 'isDone' | 'startDate' | 'dueDate'>, today: ISODate): TimelineTone {
  if (task.isDone || !task.dueDate) return 'none'
  if (task.dueDate < today) return 'late'
  if (task.dueDate <= addDays(today, TIMELINE_RED_DAYS)) return 'due-soon'
  if (!task.startDate || task.startDate <= today) return 'active'
  return 'none'
}

// ---------- tree building & progress ----------

const bySort = (a: { sortOrder: number }, b: { sortOrder: number }) => a.sortOrder - b.sortOrder

export function emptyProgress(): Progress {
  return { done: 0, total: 0, percent: 0 }
}

function toPercent(done: number, total: number) {
  return total === 0 ? 0 : Math.round((done / total) * 100)
}

/**
 * Builds the nested tree for one proposal. Progress counts work units (isWorkUnit): a parent counts its own table, if
 * it has one, plus the units below it.
 */
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
    const own = hasDetailTable(node)
    let done = own && detailTableFilled(node) ? 1 : 0
    let total = own ? 1 : 0
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

/**
 * The pieces of work progress counts: every leaf, plus a parent with a table of its own (filling it is work too). A
 * leaf is done when ticked (or its table filled); a parent's unit when its own table is filled.
 */
export function workUnits<T extends Pick<Task, 'id' | 'parentId' | 'isDone' | 'descriptionFormat' | 'detailFields'>>(tasks: T[]): { task: T; done: boolean }[] {
  const parents = new Set(tasks.map((t) => t.parentId).filter(Boolean) as string[])
  return tasks.flatMap((t) => (!parents.has(t.id) ? [{ task: t, done: t.isDone }] : hasDetailTable(t) ? [{ task: t, done: detailTableFilled(t) }] : []))
}

/** Progress of a whole proposal over its work units (workUnits). */
export function computeProgress(tasks: Pick<Task, 'id' | 'parentId' | 'isDone' | 'descriptionFormat' | 'detailFields'>[]): Progress {
  const units = workUnits(tasks)
  const done = units.filter((u) => u.done).length
  return { done, total: units.length, percent: toPercent(done, units.length) }
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

// ---------- completion (ticked by hand, or derived from the task's data) ----------

export interface ToggleChange {
  id: string
  isDone: boolean
}

/** How a task gets done: by hand only when it has neither a table to fill nor sub tasks; otherwise it follows them. */
export type TaskCompletionMode = 'manual' | 'table' | 'children' | 'both'

type CompletionData = Pick<Task, 'descriptionFormat' | 'detailFields'>
type CompletionNode = Pick<Task, 'id' | 'parentId' | 'isDone' | 'descriptionFormat' | 'detailFields'>

/** A table with rows to fill (FIELDS with ≥ 1 row); an empty table counts as none. */
export const hasDetailTable = (t: CompletionData) => t.descriptionFormat === 'FIELDS' && t.detailFields.length > 0

/** Every row of the task's table has a value. */
export function detailTableFilled(t: CompletionData): boolean {
  const { filled, total } = detailFieldsProgress(t.detailFields)
  return hasDetailTable(t) && filled === total
}

export function completionMode(t: CompletionData, hasChildren: boolean): TaskCompletionMode {
  const table = hasDetailTable(t)
  return table && hasChildren ? 'both' : table ? 'table' : hasChildren ? 'children' : 'manual'
}

/** Why a box can't be ticked by hand (tooltips, the API's 422). */
export function autoCompletionHint(mode: Exclude<TaskCompletionMode, 'manual'>): string {
  switch (mode) {
    case 'table':
      return 'ติ๊กเสร็จอัตโนมัติเมื่อกรอกข้อมูลในตารางครบ'
    case 'children':
      return 'ติ๊กเสร็จอัตโนมัติเมื่อ Sub task เสร็จครบ'
    case 'both':
      return 'ติ๊กเสร็จอัตโนมัติเมื่อกรอกตารางครบและ Sub task เสร็จครบ'
  }
}

/**
 * Completion rules (same on client and server):
 *  - A task with neither a table nor sub tasks is ticked by hand: its stored isDone stands.
 *  - Any other task is done exactly when its table is fully filled (if it has one) AND all of its sub tasks are done
 *    (if it has any). Derived bottom-up, so clearing a value re-opens the task and its ancestors.
 * Returns only the tasks whose isDone must change (older rows ticked by hand against these rules are corrected too).
 */
export function deriveCompletion(tasks: CompletionNode[]): ToggleChange[] {
  const kids = new Map<string, CompletionNode[]>()
  for (const t of tasks) {
    if (!t.parentId) continue
    const list = kids.get(t.parentId)
    if (list) list.push(t)
    else kids.set(t.parentId, [t])
  }
  const memo = new Map<string, boolean>()
  const done = (t: CompletionNode): boolean => {
    const known = memo.get(t.id)
    if (known !== undefined) return known
    const children = kids.get(t.id) ?? []
    const table = hasDetailTable(t)
    const value = !table && children.length === 0 ? t.isDone : (!table || detailTableFilled(t)) && children.every((c) => done(c))
    memo.set(t.id, value)
    return value
  }
  const changes: ToggleChange[] = []
  for (const t of tasks) {
    const value = done(t)
    if (value !== t.isDone) changes.push({ id: t.id, isDone: value })
  }
  return changes
}

/**
 * Tick / untick a task done by hand ('manual'), then let everything derived follow (its ancestors). A task whose
 * completion is derived can't be ticked: [] (the API answers 422). Returns only the tasks whose isDone changes.
 */
export function computeToggle(tasks: CompletionNode[], id: string, isDone: boolean): ToggleChange[] {
  const target = tasks.find((t) => t.id === id)
  if (!target || completionMode(target, tasks.some((t) => t.parentId === id)) !== 'manual') return []
  const own: ToggleChange[] = target.isDone === isDone ? [] : [{ id, isDone }]
  return [...own, ...deriveCompletion(tasks.map((t) => (t.id === id ? { ...t, isDone } : t)))]
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
  fieldLabels: string[]
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
        fieldLabels: i.fieldLabels,
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
  /** Table row labels for the new task ([] = free-text details). */
  fieldLabels: string[]
  sortOrder: number
}

/**
 * Validates a client-edited plan and returns it parent-first with levels and sibling sortOrder
 * (1000, 2000, …). Throws an Error with a Thai message when the plan is invalid.
 */
export function normalizePlan(
  plan: { key: string; parentKey: string | null; title: string; startDate: ISODate | null; dueDate: ISODate | null; responsible?: string | null; fieldLabels?: string[] }[],
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
      fieldLabels: cleanFieldLabels(p.fieldLabels),
      sortOrder: n * 1000,
    }
  })
}
