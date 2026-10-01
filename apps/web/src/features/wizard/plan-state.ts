// The editable task plan of the wizard. Dates are stored as day offsets from the target date,
// so moving the launch date moves every task with it; edits convert absolute dates back to offsets.
import { addDays, diffDays, type ISODate, type TaskLevel, type TaskTemplateItem } from '@flowtrade/shared'
import type { ProposalPlanItemInput, TemplatePreviewItem } from '@/api'

export interface PlanItem {
  key: string
  parentKey: string | null
  title: string
  /** Days relative to the target date (negative = before launch). */
  startOffset: number
  dueOffset: number
  responsible: string | null
  /** Typed by the user (not from the template). */
  custom: boolean
}

export interface PlanState {
  /** 'template:<id>' or 'none' once loaded; '' before the first load. */
  source: string
  items: PlanItem[]
  /** Unchecked keys (a parent's subtree is excluded with it). */
  excluded: string[]
  /** The user changed something compared with the template. */
  edited: boolean
}

export const initialPlanState: PlanState = { source: '', items: [], excluded: [], edited: false }

export const planSource = (templateId: string | null) => (templateId ? `template:${templateId}` : 'none')

export type PlanAction =
  | { type: 'plan/load'; templateId: string | null; items: TaskTemplateItem[]; keepCustom: boolean }
  | { type: 'plan/update'; key: string; patch: Partial<Pick<PlanItem, 'title' | 'startOffset' | 'dueOffset' | 'responsible'>> }
  | { type: 'plan/shift'; key: string; days: number }
  | { type: 'plan/add'; item: PlanItem }
  | { type: 'plan/remove'; key: string }
  | { type: 'plan/restore'; key: string }
  | { type: 'plan/setExcluded'; keys: string[] }
  | { type: 'plan/move'; key: string; direction: -1 | 1 }

export function descendantKeys(items: Pick<PlanItem, 'key' | 'parentKey'>[], key: string): string[] {
  const out: string[] = []
  const stack = [key]
  while (stack.length) {
    const current = stack.pop()!
    for (const i of items) {
      if (i.parentKey === current) {
        out.push(i.key)
        stack.push(i.key)
      }
    }
  }
  return out
}

export function levelOf(items: Pick<PlanItem, 'key' | 'parentKey'>[], key: string): TaskLevel {
  const byKey = new Map(items.map((i) => [i.key, i]))
  let level = 1
  let parent = byKey.get(key)?.parentKey ?? null
  while (parent && level < 4) {
    level++
    parent = byKey.get(parent)?.parentKey ?? null
  }
  return Math.min(level, 3) as TaskLevel
}

export function excludedClosure(items: PlanItem[], excluded: string[]) {
  const out = new Set(excluded)
  for (const key of excluded) for (const d of descendantKeys(items, key)) out.add(d)
  return out
}

export function planReducer(state: PlanState, action: PlanAction): PlanState {
  switch (action.type) {
    case 'plan/load': {
      const fromTemplate: PlanItem[] = [...action.items]
        .sort((a, b) => a.level - b.level || a.sortOrder - b.sortOrder)
        .map((i) => ({ key: i.id, parentKey: i.parentId, title: i.title, startOffset: i.startOffsetDays, dueOffset: i.dueOffsetDays, responsible: i.responsible, custom: false }))
      const templateKeys = new Set(fromTemplate.map((i) => i.key))
      const prevCustom = action.keepCustom ? state.items.filter((i) => i.custom) : []
      const customKeys = new Set(prevCustom.map((i) => i.key))
      // Typed tasks survive a template switch; ones that hung under the old template's items move to the top level.
      const custom = prevCustom.map((i) => (i.parentKey && !customKeys.has(i.parentKey) && !templateKeys.has(i.parentKey) ? { ...i, parentKey: null } : i))
      return {
        source: planSource(action.templateId),
        items: [...fromTemplate, ...custom],
        excluded: state.excluded.filter((k) => customKeys.has(k)),
        edited: action.keepCustom ? custom.length > 0 : false,
      }
    }
    case 'plan/update':
      return { ...state, edited: true, items: state.items.map((i) => (i.key === action.key ? { ...i, ...action.patch } : i)) }
    case 'plan/shift': {
      const keys = new Set([action.key, ...descendantKeys(state.items, action.key)])
      return {
        ...state,
        edited: true,
        items: state.items.map((i) => (keys.has(i.key) ? { ...i, startOffset: i.startOffset + action.days, dueOffset: i.dueOffset + action.days } : i)),
      }
    }
    case 'plan/add': {
      // Sibling order = relative array order; place it before the first sibling that starts later.
      const items = [...state.items]
      const later = items.find((i) => i.parentKey === action.item.parentKey && i.startOffset > action.item.startOffset)
      if (later) items.splice(items.indexOf(later), 0, action.item)
      else items.push(action.item)
      return { ...state, edited: true, items }
    }
    case 'plan/remove': {
      const item = state.items.find((i) => i.key === action.key)
      if (!item) return state
      if (item.custom) {
        const gone = new Set([item.key, ...descendantKeys(state.items, item.key)])
        return { ...state, edited: true, items: state.items.filter((i) => !gone.has(i.key)), excluded: state.excluded.filter((k) => !gone.has(k)) }
      }
      // Template items are only switched off, so they can be brought back.
      return state.excluded.includes(item.key) ? state : { ...state, edited: true, excluded: [...state.excluded, item.key] }
    }
    case 'plan/restore': {
      // Bring back the item and any excluded ancestor (otherwise it would stay hidden by the closure).
      const byKey = new Map(state.items.map((i) => [i.key, i]))
      const lift = new Set<string>([action.key])
      let parent = byKey.get(action.key)?.parentKey ?? null
      while (parent) {
        lift.add(parent)
        parent = byKey.get(parent)?.parentKey ?? null
      }
      return { ...state, edited: true, excluded: state.excluded.filter((k) => !lift.has(k)) }
    }
    case 'plan/setExcluded':
      return { ...state, edited: true, excluded: action.keys }
    case 'plan/move': {
      const item = state.items.find((i) => i.key === action.key)
      if (!item) return state
      const siblings = state.items.filter((i) => i.parentKey === item.parentKey)
      const index = siblings.indexOf(item)
      const swapWith = siblings[index + action.direction]
      if (!swapWith) return state
      const items = [...state.items]
      const a = items.indexOf(item)
      const b = items.indexOf(swapWith)
      items[a] = swapWith
      items[b] = item
      return { ...state, edited: true, items }
    }
  }
}

// ---------- derived views ----------

export interface PlanRow extends PlanItem {
  level: TaskLevel
  /** Dates as they will be created (start clamped to today). */
  startDate: ISODate
  dueDate: ISODate
  clamped: boolean
  excluded: boolean
  childCount: number
}

/** Rows in tree order (parents first, siblings in array order) with resolved dates. */
export function planRows(plan: PlanState, targetDate: ISODate, today: ISODate): PlanRow[] {
  const excluded = excludedClosure(plan.items, plan.excluded)
  const byParent = new Map<string | null, PlanItem[]>()
  for (const i of plan.items) byParent.set(i.parentKey, [...(byParent.get(i.parentKey) ?? []), i])
  const out: PlanRow[] = []
  const walk = (parentKey: string | null, level: number) => {
    for (const i of byParent.get(parentKey) ?? []) {
      let start = addDays(targetDate, i.startOffset)
      let due = addDays(targetDate, i.dueOffset)
      const clamped = start < today
      if (clamped) start = today
      if (due < start) due = start
      out.push({ ...i, level: Math.min(level, 3) as TaskLevel, startDate: start, dueDate: due, clamped, excluded: excluded.has(i.key), childCount: byParent.get(i.key)?.length ?? 0 })
      walk(i.key, level + 1)
    }
  }
  walk(null, 1)
  return out
}

/** Same shape the review step's tree preview already understands. */
export function toPreviewItems(rows: PlanRow[]): (TemplatePreviewItem & { custom: boolean })[] {
  return rows.map((r) => ({
    templateItemId: r.key,
    parentTemplateItemId: r.parentKey,
    level: r.level,
    title: r.title,
    startDate: r.startDate,
    dueDate: r.dueDate,
    responsible: r.responsible?.trim() || null,
    clamped: r.clamped,
    custom: r.custom,
  }))
}

/** The payload sent to POST /proposals (excluded items dropped; blank department → null). */
export function toPlanInput(rows: PlanRow[]): ProposalPlanItemInput[] {
  return rows
    .filter((r) => !r.excluded)
    .map((r) => ({
      key: r.key,
      parentKey: r.parentKey,
      title: r.title.trim(),
      startDate: r.startDate,
      dueDate: r.dueDate,
      responsible: r.responsible?.trim() || null,
    }))
}

export function offsetFor(targetDate: ISODate, date: ISODate) {
  return diffDays(targetDate, date)
}

let seq = 0
export function newPlanKey() {
  seq += 1
  return `new-${Date.now().toString(36)}-${seq}`
}
