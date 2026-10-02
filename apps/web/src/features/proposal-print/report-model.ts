// Pure view model for the printable proposal report (PDF export): the task tree with numbers,
// inherited departments, states, table fill counts, comments and the last change of each task.
import { buildTaskTree, detailFieldsProgress, isOverdue, type Channel, type ISODate, type ISODateTime, type Task, type TaskNode, type User } from '@flowtrade/shared'
import type { CommentWithAuthor, ProposalDetail, ProposalReport } from '@/api'
import { storeWord } from '@/features/proposal-detail/utils'
import { formatDate } from '@/lib/format'

export type ReportTaskState = 'done' | 'overdue' | 'open'

export const REPORT_STATE_LABEL: Record<ReportTaskState, string> = {
  done: 'เสร็จแล้ว',
  overdue: 'เลยกำหนด',
  open: 'ยังไม่เสร็จ',
}

export interface ReportOptions {
  /** Show table rows that have no value yet (highlighted). */
  showEmpty: boolean
  showComments: boolean
  /** Version for the store: hides internal info (status, people, progress, comments, history). */
  storeVersion: boolean
}

export interface LastChange {
  kind: 'created' | 'updated'
  at: ISODateTime
  /** null when the change wasn't logged (e.g. a parent ticked done by its sub tasks). */
  by: User | null
}

export interface ReportTask {
  task: Task
  /** "1", "1.2", "1.2.3" */
  number: string
  depth: number
  /** The task's own department, or the nearest ancestor's. */
  department: string | null
  assignees: User[]
  state: ReportTaskState
  /** Table rows filled / total — FIELDS tasks only. */
  fields: { filled: number; total: number } | null
  comments: CommentWithAuthor[]
  completedBy: User | null
  lastChange: LastChange
  children: ReportTask[]
}

export interface ReportModel {
  tasks: ReportTask[]
  /** Every task in tree order (parents first). */
  flat: ReportTask[]
  fieldsFilled: number
  fieldsTotal: number
  usersById: Map<string, User>
}

/** Seconds of slack between a task update and the activity row written in the same transaction. */
const SAME_CHANGE_MS = 5000

function lastChangeOf(task: Task, report: ProposalReport, usersById: Map<string, User>): LastChange {
  const logged = report.lastActivity[task.id]
  const updated = Date.parse(task.updatedAt)
  if (logged && Date.parse(logged.createdAt) >= updated - SAME_CHANGE_MS) return { kind: 'updated', at: logged.createdAt, by: logged.actor }
  if (!logged && updated - Date.parse(task.createdAt) < SAME_CHANGE_MS) return { kind: 'created', at: task.createdAt, by: usersById.get(task.createdById) ?? null }
  // Changed without a log row of its own (cascaded tick, launch date shift): the time is known, the person isn't.
  return { kind: 'updated', at: task.updatedAt, by: null }
}

export function buildReportModel(proposal: ProposalDetail, tasks: Task[], report: ProposalReport, today: ISODate): ReportModel {
  const usersById = new Map<string, User>()
  for (const u of [...report.users, ...proposal.members, proposal.owner]) usersById.set(u.id, u)
  const commentsByTask = new Map<string, CommentWithAuthor[]>()
  for (const c of report.comments) {
    if (!c.taskId) continue
    commentsByTask.set(c.taskId, [...(commentsByTask.get(c.taskId) ?? []), c])
  }

  const flat: ReportTask[] = []
  let fieldsFilled = 0
  let fieldsTotal = 0
  const walk = (nodes: TaskNode[], prefix: string, depth: number, parentDepartment: string | null): ReportTask[] =>
    nodes.map((node, i) => {
      const number = prefix ? `${prefix}.${i + 1}` : String(i + 1)
      const department = node.responsible?.trim() || parentDepartment
      const fields = node.descriptionFormat === 'FIELDS' ? detailFieldsProgress(node.detailFields) : null
      if (fields) {
        fieldsFilled += fields.filled
        fieldsTotal += fields.total
      }
      const item: ReportTask = {
        task: node,
        number,
        depth,
        department,
        assignees: node.assigneeIds.map((id) => usersById.get(id)).filter((u): u is User => !!u),
        state: node.isDone ? 'done' : isOverdue(node, today) ? 'overdue' : 'open',
        fields,
        comments: commentsByTask.get(node.id) ?? [],
        completedBy: node.completedById ? (usersById.get(node.completedById) ?? null) : null,
        lastChange: lastChangeOf(node, report, usersById),
        children: [],
      }
      flat.push(item)
      item.children = walk(node.children, number, depth + 1, department)
      return item
    })
  const roots = walk(buildTaskTree(tasks), '', 0, null)
  return { tasks: roots, flat, fieldsFilled, fieldsTotal, usersById }
}

/** Short name for tables: the nickname when there is one. */
export const shortName = (user: Pick<User, 'name' | 'nickname'>) => user.nickname?.trim() || user.name

/**
 * A date span with the year written once: "15–29 ธ.ค. 69", "29 ธ.ค. 69 – 19 ม.ค. 70", "5 ม.ค. – 2 ก.พ. 70".
 * (formatDateRange drops the year, which is ambiguous on paper.)
 */
export function formatSpan(start: ISODate | null, due: ISODate | null) {
  if (!start && !due) return 'ยังไม่กำหนดวัน'
  if (!start || !due) return due ? `ภายใน ${formatDate(due)}` : `เริ่ม ${formatDate(start)}`
  if (start === due) return formatDate(due)
  if (start.slice(0, 7) === due.slice(0, 7)) return `${Number(start.slice(8, 10))}–${formatDate(due)}`
  if (start.slice(0, 4) === due.slice(0, 4)) return `${formatDate(start, { withYear: false })} – ${formatDate(due)}`
  return `${formatDate(start)} – ${formatDate(due)}`
}

/** "ฉบับส่งห้าง" (offline) / "ฉบับส่งแพลตฟอร์ม" (online). */
export const storeVersionLabel = (channel: Channel) => `ฉบับส่ง${storeWord(channel)}`

/** File name the browser suggests for "Save as PDF" (it uses document.title). */
export function reportFileName(proposal: Pick<ProposalDetail, 'code' | 'title' | 'channel'>, storeVersion: boolean) {
  const title = proposal.title.replace(/\s*→\s*/g, ' - ').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim()
  return `${proposal.code} ${title}${storeVersion ? ` (${storeVersionLabel(proposal.channel)})` : ''}`
}

/** A CSS string literal (for @page margin boxes). */
export function cssString(text: string) {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ')}"`
}
