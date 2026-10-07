// Pure helpers for the calendar page: month math, bucketing launches/tasks by date, sorting.
import { addDays, isOverdue, PRIORITY_ORDER, storeNamesLabel, type Channel, type ISODate, type ProposalStatus, type Task } from '@flowtrade/shared'
import type { ProposalListItem, TaskWithContext } from '@/api/types'
import { dayjs } from '@/lib/format'

export type Layer = 'launches' | 'tasks'
export type ChannelFilter = 'ALL' | Channel
export const ALL_LAYERS: Layer[] = ['launches', 'tasks']

/** Monday-first. */
export const WEEKDAYS = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'] as const
export const WEEKDAYS_FULL = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'] as const

/** Max items drawn inside one month-grid cell before collapsing into "+N". */
export const CELL_MAX_ITEMS = 3

export type TaskTone = 'open' | 'overdue' | 'done'

export function taskTone(task: Pick<Task, 'isDone' | 'dueDate'>, today: ISODate): TaskTone {
  if (task.isDone) return 'done'
  return isOverdue(task, today) ? 'overdue' : 'open'
}

/** The badge's overdue rule: only countable tasks (leaf, IN_PROGRESS proposal). */
export const isCountedOverdue = (item: TaskWithContext, today: ISODate) => item.countable !== false && taskTone(item.task, today) === 'overdue'

export const TASK_DOT: Record<TaskTone, string> = {
  open: 'bg-primary',
  overdue: 'bg-danger',
  done: 'bg-success',
}

export interface DayBucket {
  date: ISODate
  launches: ProposalListItem[]
  tasks: TaskWithContext[]
}

export const bucketSize = (b: DayBucket | undefined) => (b ? b.launches.length + b.tasks.length : 0)

// ---------- months ----------

export const monthKey = (date: ISODate) => date.slice(0, 7)

/** 'YYYY-MM' or null when the raw value is missing / malformed. */
export function parseMonth(raw: string | null): string | null {
  if (!raw) return null
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : null
}

export function shiftMonth(month: string, delta: number): string {
  return dayjs(`${month}-01`).add(delta, 'month').format('YYYY-MM')
}

export function monthLabel(month: string, buddhistEra: boolean): string {
  return dayjs(`${month}-01`).format(buddhistEra ? 'MMMM BBBB' : 'MMMM YYYY')
}

/** Weeks (Monday-first) covering the month, including leading/trailing days of adjacent months. */
export function monthWeeks(month: string): ISODate[][] {
  const first = `${month}-01`
  const d = dayjs(first)
  const offset = (d.day() + 6) % 7
  const start = addDays(first, -offset)
  const weekCount = Math.ceil((offset + d.daysInMonth()) / 7)
  return Array.from({ length: weekCount }, (_, w) => Array.from({ length: 7 }, (_, i) => addDays(start, w * 7 + i)))
}

export function daysOfMonth(month: string): ISODate[] {
  const first = `${month}-01`
  return Array.from({ length: dayjs(first).daysInMonth() }, (_, i) => addDays(first, i))
}

/** "วันพฤหัสบดี" */
export const weekdayName = (date: ISODate) => `วัน${dayjs(date).format('dddd')}`

// ---------- bucketing ----------

const STATUS_RANK: Record<ProposalStatus, number> = { IN_PROGRESS: 0, ON_HOLD: 1, DRAFT: 2, COMPLETED: 3, CANCELLED: 4 }
const TONE_RANK: Record<TaskTone, number> = { overdue: 0, open: 1, done: 2 }

function sortLaunches(list: ProposalListItem[]) {
  return list.sort(
    (a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      a.stores[0].sortOrder - b.stores[0].sortOrder ||
      a.title.localeCompare(b.title, 'th'),
  )
}

function sortTasks(list: TaskWithContext[], today: ISODate) {
  return list.sort(
    (a, b) =>
      TONE_RANK[taskTone(a.task, today)] - TONE_RANK[taskTone(b.task, today)] ||
      PRIORITY_ORDER.indexOf(a.task.priority) - PRIORITY_ORDER.indexOf(b.task.priority) ||
      a.task.title.localeCompare(b.task.title, 'th'),
  )
}

/** Groups launches by target date and tasks by due date (tasks without a due date are skipped). */
export function bucketByDate(launches: ProposalListItem[], tasks: TaskWithContext[], today: ISODate): Map<ISODate, DayBucket> {
  const map = new Map<ISODate, DayBucket>()
  const get = (date: ISODate) => {
    let b = map.get(date)
    if (!b) {
      b = { date, launches: [], tasks: [] }
      map.set(date, b)
    }
    return b
  }
  for (const p of launches) get(p.targetDate).launches.push(p)
  for (const t of tasks) if (t.task.dueDate) get(t.task.dueDate).tasks.push(t)
  for (const b of map.values()) {
    sortLaunches(b.launches)
    sortTasks(b.tasks, today)
  }
  return map
}

/** Non-empty buckets between two dates (inclusive), in date order. */
export function bucketsInRange(buckets: Map<ISODate, DayBucket>, from: ISODate, to: ISODate): DayBucket[] {
  return [...buckets.values()].filter((b) => b.date >= from && b.date <= to && bucketSize(b) > 0).sort((a, b) => a.date.localeCompare(b.date))
}

/** Closest month (after first, then before) that has anything to show — for the empty-month hint. */
export function nearestMonthWithItems(buckets: Map<ISODate, DayBucket>, month: string): string | null {
  const months = [...new Set([...buckets.values()].filter((b) => bucketSize(b) > 0).map((b) => monthKey(b.date)))].sort()
  return months.find((m) => m > month) ?? months.filter((m) => m < month).pop() ?? null
}

/** Proposal title without the trailing "→ Stores" / "— Store" (the store logos already say it). */
export function shortTitle(p: Pick<ProposalListItem, 'title'> & { stores: { name: string }[] }): string {
  const stores = storeNamesLabel(p.stores.map((s) => s.name))
  for (const sep of [' → ', ' — ']) {
    const suffix = `${sep}${stores}`
    if (p.title.endsWith(suffix) && p.title.length > suffix.length) return p.title.slice(0, -suffix.length)
  }
  return p.title
}
