import {
  canEditTaskDates,
  canManageTask,
  canToggleTask,
  taskLockReason,
  type Proposal,
  type Task,
  type TaskStructureRights,
  type User,
} from '@flowtrade/shared'
import { useTreeEnv } from './tree-context'

/** What the current user may do with one task — the same shared rules the API enforces. */
export interface TaskRights {
  /** Full edit: rename, department, assignees, priority, table rows, sub tasks. */
  manage: boolean
  /** Tick, fill the table and edit the description (task managers and the task's assignees). */
  fill: boolean
  /** Set or change the dates of a task that exists (ADMIN only). */
  dates: boolean
  /** Why the task is read-only for this user (it belongs to another department), or null. */
  lockReason: string | null
  /** Its place in the tree: reorder / move / copy / delete (the parent and sub tasks count too). */
  structure: TaskStructureRights
}

const NO_STRUCTURE: TaskStructureRights = { reorder: false, remove: false, duplicate: false, move: false, reason: null }

type RightsTask = Pick<Task, 'responsible' | 'assigneeIds' | 'startDate' | 'dueDate'>

export function taskRights(
  me: User,
  proposal: Pick<Proposal, 'ownerId' | 'memberIds'>,
  task: RightsTask,
  structure: TaskStructureRights = NO_STRUCTURE,
): TaskRights {
  return {
    manage: canManageTask(me, proposal, task),
    fill: canToggleTask(me, proposal, task),
    dates: canEditTaskDates(me),
    lockReason: taskLockReason(me, task),
    structure,
  }
}

export function useTaskRights(task: RightsTask & Pick<Task, 'id'>): TaskRights {
  const { me, proposal, structure } = useTreeEnv()
  return taskRights(me, proposal, task, structure.get(task.id))
}

/** "ย้าย/คัดลอกไม่ได้ เพราะเกี่ยวข้องกับงาน …" — why some structure actions are off, or null when none is. */
export function structureNote(s: TaskStructureRights): string | null {
  const refused = [!s.move && 'ย้าย', !s.duplicate && 'คัดลอก', !s.remove && 'ลบ'].filter(Boolean)
  return refused.length && s.reason ? `${refused.join('/')}ไม่ได้ เพราะ${s.reason}` : null
}
