import { buildTaskTree, isOverdue, type ISODate, type Task, type TaskNode } from '@flowtrade/shared'
import { useCallback, useState } from 'react'

export type TreeFilter = 'all' | 'mine' | 'open' | 'overdue'

export const FILTER_LABEL: Record<TreeFilter, string> = {
  all: 'ทั้งหมด',
  mine: 'ของฉัน',
  open: 'ยังไม่เสร็จ',
  overdue: 'เลยกำหนด',
}

// ---------- stable tree (unchanged nodes keep their identity → memoized rows skip re-render) ----------

const TASK_KEYS = [
  'id',
  'proposalId',
  'parentId',
  'level',
  'title',
  'description',
  'descriptionFormat',
  'startDate',
  'dueDate',
  'responsible',
  'priority',
  'isDone',
  'completedAt',
  'completedById',
  'sortOrder',
  'createdById',
  'createdAt',
  'updatedAt',
] as const satisfies readonly (keyof Task)[]

function sameNode(prev: TaskNode, next: TaskNode, children: TaskNode[]) {
  for (const k of TASK_KEYS) if (prev[k] !== next[k]) return false
  if (prev.detailFields.length !== next.detailFields.length || prev.detailFields.some((f, i) => f.id !== next.detailFields[i].id || f.label !== next.detailFields[i].label || f.value !== next.detailFields[i].value)) return false
  if (prev.assigneeIds.length !== next.assigneeIds.length || prev.assigneeIds.some((a, i) => a !== next.assigneeIds[i])) return false
  if (prev.progress.done !== next.progress.done || prev.progress.total !== next.progress.total) return false
  if (prev.children.length !== children.length || prev.children.some((c, i) => c !== children[i])) return false
  return true
}

export interface TreeData {
  roots: TaskNode[]
  byId: Map<string, TaskNode>
  /** Ids of nodes that have children (for "collapse all"). */
  parentIds: string[]
}

function buildStable(tasks: Task[] | undefined, prev: Map<string, TaskNode>): TreeData {
  const byId = new Map<string, TaskNode>()
  const parentIds: string[] = []
  const stabilize = (node: TaskNode): TaskNode => {
    const children = node.children.map(stabilize)
    const old = prev.get(node.id)
    const result = old && sameNode(old, node, children) ? old : { ...node, children }
    byId.set(result.id, result)
    if (children.length) parentIds.push(result.id)
    return result
  }
  const roots = buildTaskTree(tasks ?? []).map(stabilize)
  return { roots, byId, parentIds }
}

/** buildTaskTree, but nodes that did not change keep their previous object identity. */
export function useStableTree(tasks: Task[] | undefined): TreeData {
  // "Storing information from previous renders": rebuild only when the task list changes.
  const [state, setState] = useState(() => ({ tasks, data: buildStable(tasks, new Map()) }))
  if (state.tasks !== tasks) {
    const data = buildStable(tasks, state.data.byId)
    setState({ tasks, data })
    return data
  }
  return state.data
}

// ---------- filtering ----------

/** Department filter: null = every department, NO_DEPARTMENT = tasks without one, else the exact name. */
export type DepartmentFilter = string | null
export const NO_DEPARTMENT = ''

export function matchesFilter(task: Task, filter: TreeFilter, meId: string, today: ISODate): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'mine':
      return task.assigneeIds.includes(meId)
    case 'open':
      return !task.isDone
    case 'overdue':
      return isOverdue(task, today)
  }
}

export function matchesDepartment(task: Pick<Task, 'responsible'>, department: DepartmentFilter): boolean {
  if (department === null) return true
  if (department === NO_DEPARTMENT) return !task.responsible
  return task.responsible === department
}

export interface FilterResult {
  /** Nodes that match the filter themselves. */
  matches: Set<string>
  /** Matches plus their ancestors (kept visible for context). */
  visible: Set<string>
}

export function computeFilter(byId: Map<string, TaskNode>, filter: TreeFilter, department: DepartmentFilter, meId: string, today: ISODate): FilterResult | null {
  if (filter === 'all' && department === null) return null
  const matches = new Set<string>()
  const visible = new Set<string>()
  for (const node of byId.values()) {
    if (!matchesDepartment(node, department) || !matchesFilter(node, filter, meId, today)) continue
    matches.add(node.id)
    let current: TaskNode | undefined = node
    while (current && !visible.has(current.id)) {
      visible.add(current.id)
      current = current.parentId ? byId.get(current.parentId) : undefined
    }
  }
  return { matches, visible }
}

/** Counts for the status chips, within the selected department. */
export function countMatches(byId: Map<string, TaskNode>, department: DepartmentFilter, meId: string, today: ISODate): Record<TreeFilter, number> {
  const out: Record<TreeFilter, number> = { all: 0, mine: 0, open: 0, overdue: 0 }
  for (const node of byId.values()) {
    if (!matchesDepartment(node, department)) continue
    out.all++
    if (matchesFilter(node, 'mine', meId, today)) out.mine++
    if (matchesFilter(node, 'open', meId, today)) out.open++
    if (matchesFilter(node, 'overdue', meId, today)) out.overdue++
  }
  return out
}

export interface DepartmentCount {
  name: string
  count: number
}

/** Departments present in the tree (with task counts) and how many tasks have none. */
export function countDepartments(byId: Map<string, TaskNode>, compare: (a: string, b: string) => number): { departments: DepartmentCount[]; none: number } {
  const counts = new Map<string, number>()
  let none = 0
  for (const node of byId.values()) {
    if (node.responsible) counts.set(node.responsible, (counts.get(node.responsible) ?? 0) + 1)
    else none++
  }
  const departments = [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => compare(a.name, b.name))
  return { departments, none }
}

// ---------- expand / collapse (persisted per proposal) ----------

const storageKey = (proposalId: string) => `flowtrade.taskTree.collapsed.${proposalId}`

function readCollapsed(proposalId: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(proposalId))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

function writeCollapsed(proposalId: string, ids: Set<string>) {
  try {
    if (ids.size === 0) localStorage.removeItem(storageKey(proposalId))
    else localStorage.setItem(storageKey(proposalId), JSON.stringify([...ids]))
  } catch {
    // storage blocked — expansion just isn't remembered
  }
}

/**
 * Tree UI state. Expansion is stored as the set of *collapsed* parents so that new parents
 * start expanded; it is remembered per proposal in localStorage. While a filter is active a
 * separate, temporary set is used so filtering never hides a match behind a collapsed parent.
 */
export function useTreeState(proposalId: string) {
  const [persisted, setPersisted] = useState(() => ({ proposalId, collapsed: readCollapsed(proposalId) }))
  const [filter, setFilterState] = useState<TreeFilter>('all')
  const [department, setDepartmentState] = useState<DepartmentFilter>(null)
  const [filterCollapsed, setFilterCollapsed] = useState<Set<string>>(() => new Set())

  // Navigated to another proposal with the same component instance → reload its state.
  let collapsed = persisted.collapsed
  if (persisted.proposalId !== proposalId) {
    collapsed = readCollapsed(proposalId)
    setPersisted({ proposalId, collapsed })
  }

  const updateCollapsed = useCallback(
    (fn: (prev: Set<string>) => Set<string>) => {
      setPersisted((p) => {
        const next = fn(p.collapsed)
        writeCollapsed(p.proposalId, next)
        return { ...p, collapsed: next }
      })
    },
    [],
  )

  const isFiltering = filter !== 'all' || department !== null
  const activeSet = isFiltering ? filterCollapsed : collapsed

  const isExpanded = useCallback((id: string) => !activeSet.has(id), [activeSet])

  const setOpen = useCallback(
    (id: string, open: boolean) => {
      const apply = (prev: Set<string>) => {
        if (open === !prev.has(id)) return prev
        const next = new Set(prev)
        if (open) next.delete(id)
        else next.add(id)
        return next
      }
      if (isFiltering) setFilterCollapsed(apply)
      else updateCollapsed(apply)
    },
    [isFiltering, updateCollapsed],
  )

  const toggleExpanded = useCallback((id: string) => setOpen(id, activeSet.has(id)), [activeSet, setOpen])

  /** Expand several nodes at once (e.g. the ancestors of a task opened from a link). */
  const expandMany = useCallback(
    (ids: string[]) => {
      const apply = (prev: Set<string>) => {
        if (!ids.some((id) => prev.has(id))) return prev
        const next = new Set(prev)
        for (const id of ids) next.delete(id)
        return next
      }
      updateCollapsed(apply)
      setFilterCollapsed(apply)
    },
    [updateCollapsed],
  )

  const expandAll = useCallback(() => {
    if (isFiltering) setFilterCollapsed(new Set())
    else updateCollapsed(() => new Set())
  }, [isFiltering, updateCollapsed])

  const collapseAll = useCallback(
    (parentIds: string[]) => {
      if (isFiltering) setFilterCollapsed(new Set(parentIds))
      else updateCollapsed(() => new Set(parentIds))
    },
    [isFiltering, updateCollapsed],
  )

  const setFilter = useCallback((next: TreeFilter) => {
    setFilterState(next)
    setFilterCollapsed(new Set())
  }, [])

  const setDepartment = useCallback((next: DepartmentFilter) => {
    setDepartmentState(next)
    setFilterCollapsed(new Set())
  }, [])

  const clearFilters = useCallback(() => {
    setFilterState('all')
    setDepartmentState(null)
    setFilterCollapsed(new Set())
  }, [])

  return { filter, setFilter, department, setDepartment, clearFilters, isFiltering, isExpanded, setOpen, toggleExpanded, expandMany, expandAll, collapseAll }
}
