// Pure helpers for editing a template's flat item list (parentId + sortOrder, max 3 levels).
import { cleanFieldLabels, DEFAULT_DEPARTMENTS, getDescendantIds, MAX_TASK_LEVEL, PREP_DAYS, type TaskLevel, type TaskTemplateItem } from '@flowtrade/shared'

export type Items = TaskTemplateItem[]

/** Standard preparation window: every task starts at D-90 and is due the day before launch. */
export const PREP_START_OFFSET = -PREP_DAYS
export const PREP_DUE_OFFSET = -1

/** Department suggestions: the standard departments first, then other values this template already uses. */
export function departmentSuggestions(items: Items): string[] {
  const standard: readonly string[] = DEFAULT_DEPARTMENTS
  const used = new Set(items.map((i) => i.responsible?.trim()).filter((r): r is string => !!r && !standard.includes(r)))
  return [...standard, ...[...used].sort((a, b) => a.localeCompare(b, 'th'))]
}

/** How many items each department is responsible for ('' = not assigned yet), most first. */
export function departmentCounts(items: Items): { name: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const i of items) {
    const key = i.responsible?.trim() ?? ''
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => Number(a.name === '') - Number(b.name === '') || b.count - a.count || a.name.localeCompare(b.name, 'th'))
}

export const newItemId = () => `ti-${crypto.randomUUID().slice(0, 8)}`

const bySort = (a: TaskTemplateItem, b: TaskTemplateItem) => a.sortOrder - b.sortOrder

export function childrenOf(items: Items, parentId: string | null): Items {
  return items.filter((i) => i.parentId === parentId).sort(bySort)
}

/** parentId → sorted children, for rendering without O(n²) lookups. */
export function childrenMap(items: Items): Map<string | null, Items> {
  const map = new Map<string | null, Items>()
  for (const i of items) {
    const list = map.get(i.parentId) ?? []
    list.push(i)
    map.set(i.parentId, list)
  }
  for (const list of map.values()) list.sort(bySort)
  return map
}

function applyOrder(items: Items, orderedIds: string[]): Items {
  const index = new Map(orderedIds.map((id, k) => [id, k]))
  return items.map((i) => {
    const k = index.get(i.id)
    return k === undefined ? i : { ...i, sortOrder: (k + 1) * 1000 }
  })
}

function blankItem(parentId: string | null, level: TaskLevel, start: number, due: number, responsible: string | null): TaskTemplateItem {
  return { id: newItemId(), parentId, level, title: '', startOffsetDays: start, dueOffsetDays: due, responsible, fieldLabels: [], sortOrder: 0 }
}

/** Appends a top-level Task after the last one; it starts where the previous one ended. */
export function addRoot(items: Items): { items: Items; id: string } {
  const roots = childrenOf(items, null)
  const last = roots[roots.length - 1]
  const item = last
    ? blankItem(null, 1, last.dueOffsetDays, last.dueOffsetDays + Math.max(1, last.dueOffsetDays - last.startOffsetDays), last.responsible)
    : blankItem(null, 1, PREP_START_OFFSET, PREP_DUE_OFFSET, null)
  return { items: applyOrder([...items, item], [...roots.map((r) => r.id), item.id]), id: item.id }
}

export function addChild(items: Items, parentId: string): { items: Items; id: string } | null {
  const parent = items.find((i) => i.id === parentId)
  if (!parent || parent.level >= MAX_TASK_LEVEL) return null
  const siblings = childrenOf(items, parentId)
  const item = blankItem(parentId, (parent.level + 1) as TaskLevel, parent.startOffsetDays, parent.dueOffsetDays, parent.responsible)
  return { items: applyOrder([...items, item], [...siblings.map((s) => s.id), item.id]), id: item.id }
}

/** Inserts a new item right after `afterId`, same parent and level, starting when that one ends. */
export function addSibling(items: Items, afterId: string): { items: Items; id: string } | null {
  const ref = items.find((i) => i.id === afterId)
  if (!ref) return null
  const siblings = childrenOf(items, ref.parentId)
  const at = siblings.findIndex((s) => s.id === afterId)
  const length = Math.max(0, ref.dueOffsetDays - ref.startOffsetDays)
  const item = blankItem(ref.parentId, ref.level, ref.dueOffsetDays, ref.dueOffsetDays + length, ref.responsible)
  const ids = siblings.map((s) => s.id)
  ids.splice(at + 1, 0, item.id)
  return { items: applyOrder([...items, item], ids), id: item.id }
}

export function moveItem(items: Items, id: string, direction: -1 | 1): Items {
  const ref = items.find((i) => i.id === id)
  if (!ref) return items
  const ids = childrenOf(items, ref.parentId).map((s) => s.id)
  const from = ids.indexOf(id)
  const to = from + direction
  if (to < 0 || to >= ids.length) return items
  ;[ids[from], ids[to]] = [ids[to], ids[from]]
  return applyOrder(items, ids)
}

/** Removes an item and its whole subtree; returns what was removed so it can be restored. */
export function removeItem(items: Items, id: string): { items: Items; removed: Items } {
  const drop = new Set([id, ...getDescendantIds(items, id)])
  return { items: items.filter((i) => !drop.has(i.id)), removed: items.filter((i) => drop.has(i.id)) }
}

/** Sets every item to the same start/due offsets (e.g. the standard D-90 → D-1 window). */
export function setAllOffsets(items: Items, startOffsetDays: number, dueOffsetDays: number): Items {
  return items.map((i) => ({ ...i, startOffsetDays, dueOffsetDays }))
}

export function allItemsHaveOffsets(items: Items, startOffsetDays: number, dueOffsetDays: number) {
  return items.length > 0 && items.every((i) => i.startOffsetDays === startOffsetDays && i.dueOffsetDays === dueOffsetDays)
}

export function updateItem(items: Items, id: string, patch: Partial<Omit<TaskTemplateItem, 'id' | 'parentId' | 'level'>>): Items {
  return items.map((i) => (i.id === id ? { ...i, ...patch } : i))
}

/**
 * Depth-first walk from the roots: recomputes level from depth and sortOrder from position
 * (1000, 2000, …). Items whose parent no longer exists are dropped. Output is in display order.
 */
export function normalizeItems(items: Items): Items {
  const map = childrenMap(items)
  const out: Items = []
  const walk = (parentId: string | null, depth: number) => {
    ;(map.get(parentId) ?? []).forEach((item, k) => {
      out.push({ ...item, level: Math.min(depth, MAX_TASK_LEVEL) as TaskLevel, sortOrder: (k + 1) * 1000, title: item.title.trim(), responsible: item.responsible?.trim() || null, fieldLabels: cleanFieldLabels(item.fieldLabels) })
      if (depth < MAX_TASK_LEVEL + 1) walk(item.id, depth + 1)
    })
  }
  walk(null, 1)
  return out
}

export interface ItemIssue {
  id: string | null
  field: 'title' | 'start' | 'due' | 'level' | 'items'
  message: string
}

export function depthOf(items: Items, id: string): number {
  const byId = new Map(items.map((i) => [i.id, i]))
  let depth = 1
  let current = byId.get(id)?.parentId ?? null
  while (current) {
    depth += 1
    current = byId.get(current)?.parentId ?? null
  }
  return depth
}

export function validateItems(items: Items): ItemIssue[] {
  const issues: ItemIssue[] = []
  if (items.length === 0) issues.push({ id: null, field: 'items', message: 'แม่แบบต้องมีอย่างน้อย 1 งาน — กด "เพิ่ม Task" เพื่อเริ่ม' })
  for (const item of normalizeItems(items)) {
    const label = item.title || 'งานที่ยังไม่มีชื่อ'
    if (!item.title) issues.push({ id: item.id, field: 'title', message: 'ใส่ชื่องานให้ครบทุกแถว' })
    if (!Number.isInteger(item.startOffsetDays)) issues.push({ id: item.id, field: 'start', message: `"${label}" วันเริ่มต้องเป็นจำนวนเต็ม` })
    if (!Number.isInteger(item.dueOffsetDays)) issues.push({ id: item.id, field: 'due', message: `"${label}" วันสิ้นสุดต้องเป็นจำนวนเต็ม` })
    if (item.dueOffsetDays < item.startOffsetDays) {
      issues.push({ id: item.id, field: 'due', message: `"${label}" วันเสร็จ (วันที่ ${prepDay(item.dueOffsetDays)}) มาก่อนวันเริ่ม (วันที่ ${prepDay(item.startOffsetDays)}) — ให้วันเสร็จเป็นวันเดียวกันหรือหลังวันเริ่ม` })
    }
    if (depthOf(items, item.id) > MAX_TASK_LEVEL) issues.push({ id: item.id, field: 'level', message: `"${label}" ลึกเกิน ${MAX_TASK_LEVEL} ระดับ (Task → Sub task → Mini task)` })
  }
  return issues
}

/** -60 → "D-60", 0 → "D0", 7 → "D+7" */
export function offsetLabel(n: number) {
  if (!Number.isFinite(n) || n === 0) return 'D0'
  return n > 0 ? `D+${n}` : `D${n}`
}

/** Offset → day of the standard prep window, counted forward: D-90 → 1, D-1 → 90, D0 (launch) → 91. */
export const prepDay = (offset: number) => offset + PREP_DAYS + 1
export const offsetOfPrepDay = (day: number) => day - PREP_DAYS - 1

export function offsetPhrase(n: number) {
  if (n === 0) return 'วันวางขาย'
  return n < 0 ? `${-n} วันก่อนวางขาย` : `${n} วันหลังวางขาย`
}

/**
 * Display numbers like the checklist sheet: Task "1", its sub tasks "1" … "37", mini tasks "20.1".
 * Sub tasks restart per Task; mini tasks carry their sub task's number.
 */
export function itemNumbers(map: Map<string | null, Items>): Map<string, string> {
  const out = new Map<string, string>()
  const walk = (parentId: string | null, prefix: string) => {
    ;(map.get(parentId) ?? []).forEach((item, k) => {
      const num = item.level === 3 && prefix ? `${prefix}.${k + 1}` : String(k + 1)
      out.set(item.id, num)
      walk(item.id, item.level === 1 ? '' : num)
    })
  }
  walk(null, '')
  return out
}

/** Number of items under each item (children, grandchildren, …). */
export function descendantCounts(map: Map<string | null, Items>): Map<string, number> {
  const out = new Map<string, number>()
  const count = (id: string): number => {
    const cached = out.get(id)
    if (cached !== undefined) return cached
    const n = (map.get(id) ?? []).reduce((sum, c) => sum + 1 + count(c.id), 0)
    out.set(id, n)
    return n
  }
  for (const list of map.values()) for (const i of list) count(i.id)
  return out
}

export function levelCounts(items: Items): Record<TaskLevel, number> {
  const counts: Record<TaskLevel, number> = { 1: 0, 2: 0, 3: 0 }
  for (const i of items) counts[i.level] += 1
  return counts
}

/** Copies items with fresh ids (parent links remapped) — used by "ทำสำเนา". */
export function cloneItems(items: Items): Items {
  const ids = new Map(items.map((i) => [i.id, newItemId()]))
  return items.map((i) => ({ ...i, id: ids.get(i.id) ?? newItemId(), parentId: i.parentId ? (ids.get(i.parentId) ?? null) : null }))
}

export function starterItems(): Items {
  return [
    { id: newItemId(), parentId: null, level: 1, title: 'เตรียมข้อมูลสินค้าสำหรับเสนอห้าง', startOffsetDays: PREP_START_OFFSET, dueOffsetDays: PREP_DUE_OFFSET, responsible: null, fieldLabels: [], sortOrder: 1000 },
  ]
}
