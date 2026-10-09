import type { Proposal, Role, Task, User } from './types.js'

/**
 * Permission keys. Roles map to permission sets so new roles can be added later;
 * resource-level rules (owner / member / assignee) are applied on top by the helpers below.
 */
export const PERMISSIONS = [
  'proposal.create',
  'proposal.read.all',
  'proposal.update.any',
  'proposal.delete.any',
  'proposal.stores.edit',
  'task.manage.any',
  'dashboard.monitor',
  'store.manage',
  'shelfType.manage',
  'product.manage',
  'template.manage',
  'user.manage',
  'department.manage',
  'manufacturer.manage',
  'activity.read.all',
  'task.dates.edit',
  'proposal.reschedule',
  'proposal.details.any',
  'task.department.any',
] as const

export type Permission = (typeof PERMISSIONS)[number]

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  MANAGER: [
    'proposal.create',
    'proposal.read.all',
    'proposal.update.any',
    'task.manage.any',
    'dashboard.monitor',
    'product.manage',
    'template.manage',
    'activity.read.all',
  ],
  USER: ['proposal.create'],
}

export const PERMISSION_LABEL: Record<Permission, string> = {
  'proposal.create': 'สร้างการเสนอสินค้า',
  'proposal.read.all': 'ดูการเสนอสินค้าทั้งหมด',
  'proposal.update.any': 'เปลี่ยนสถานะ / ตัดสินผลนำเสนอและการผลิตของทุกโปรเจกต์ (แก้ข้อมูลโปรเจกต์ไม่ได้)',
  'proposal.delete.any': 'ลบการเสนอสินค้าของทุกคน',
  'proposal.stores.edit': 'เปลี่ยนห้าง / แพลตฟอร์มของโปรเจกต์ที่สร้างแล้ว',
  'task.manage.any': 'จัดการ Task ในทุกโปรเจกต์',
  'dashboard.monitor': 'ดูหน้า Monitor ภาพรวม',
  'store.manage': 'จัดการห้าง / แพลตฟอร์ม',
  'shelfType.manage': 'จัดการประเภท Shelf',
  'product.manage': 'จัดการสินค้า',
  'template.manage': 'จัดการแม่แบบ Task',
  'user.manage': 'จัดการผู้ใช้และสิทธิ์',
  'department.manage': 'จัดการรายชื่อแผนก',
  'manufacturer.manage': 'จัดการรายชื่อบริษัทรับผลิต',
  'activity.read.all': 'ดูประวัติการใช้งานทั้งหมด',
  'task.dates.edit': 'แก้วันเริ่ม / วันครบกำหนดของงานที่สร้างแล้ว',
  'proposal.details.any': 'แก้ไขข้อมูลโปรเจกต์ของทุกคน (ชื่อ ประเภท Shelf สินค้า เจ้าของ ทีมงาน หมายเหตุ)',
  'proposal.reschedule': 'เลื่อนวันวางขาย / วันเปิดขายของทุกโปรเจกต์ (เจ้าของเลื่อนได้เฉพาะโปรเจกต์ของตัวเอง)',
  'task.department.any': 'แก้ไขงานของทุกแผนก',
}

type Actor = Pick<User, 'id' | 'role'>
/** Actor for department-aware task rules (the request user / useCurrentUser carry `department`). */
type DeptActor = Pick<User, 'id' | 'role' | 'department'>

export function can(user: Actor | null | undefined, permission: Permission): boolean {
  if (!user) return false
  return ROLE_PERMISSIONS[user.role].includes(permission)
}

export function isProposalOwner(user: Actor, proposal: Pick<Proposal, 'ownerId'>) {
  return proposal.ownerId === user.id
}

export function isProposalMember(user: Actor, proposal: Pick<Proposal, 'ownerId' | 'memberIds'>) {
  return proposal.ownerId === user.id || proposal.memberIds.includes(user.id)
}

/** Can see the proposal at all (owner, member, assignee of any task, or proposal.read.all). */
export function canViewProposal(
  user: Actor | null | undefined,
  proposal: Pick<Proposal, 'ownerId' | 'memberIds'>,
  assignedTaskCount = 0,
) {
  if (!user) return false
  return can(user, 'proposal.read.all') || isProposalMember(user, proposal) || assignedTaskCount > 0
}

/** Edit proposal header (title, products, members, target date, status). Its stores need canEditProposalStores. */
export function canEditProposal(user: Actor | null | undefined, proposal: Pick<Proposal, 'ownerId'>) {
  if (!user) return false
  return can(user, 'proposal.update.any') || isProposalOwner(user, proposal)
}

/** Move the launch date (and with it every open task): the project's owner (its creator) or ADMIN — no one else, not even a MANAGER. */
export function canRescheduleProposal(user: Actor | null | undefined, proposal: Pick<Proposal, 'ownerId'>) {
  if (!user) return false
  return can(user, 'proposal.reschedule') || isProposalOwner(user, proposal)
}

/**
 * Edit the project's details (title, shelf type, products, owner, team, note — the "แก้ไขข้อมูล" dialog): its owner or ADMIN
 * only; a MANAGER who is not the owner cannot. Status, production and presentation decisions keep canEditProposal.
 */
export function canEditProposalDetails(user: Actor | null | undefined, proposal: Pick<Proposal, 'ownerId'>) {
  if (!user) return false
  return can(user, 'proposal.details.any') || isProposalOwner(user, proposal)
}

/** Stores are fixed once a proposal exists; only ADMIN may add or remove them. */
export function canEditProposalStores(user: Actor | null | undefined) {
  return can(user, 'proposal.stores.edit')
}

export function canDeleteProposal(user: Actor | null | undefined, proposal: Pick<Proposal, 'ownerId' | 'status'>) {
  if (!user) return false
  if (can(user, 'proposal.delete.any')) return true
  // Owners may delete only their own drafts; anything further along is cancelled instead.
  return isProposalOwner(user, proposal) && proposal.status === 'DRAFT'
}

/** Add / edit / move / delete tasks of a proposal. */
export function canManageTasks(user: Actor | null | undefined, proposal: Pick<Proposal, 'ownerId' | 'memberIds'>) {
  if (!user) return false
  return can(user, 'task.manage.any') || isProposalMember(user, proposal)
}

const deptKey = (name: string | null | undefined) => (name ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('th')

/** Two department names are the same department (trimmed, spaces collapsed, case-insensitive; blank never matches). */
export function sameDepartment(a: string | null | undefined, b: string | null | undefined) {
  const ka = deptKey(a)
  return ka !== '' && ka === deptKey(b)
}

/**
 * A task that belongs to a department is read-only for everyone outside it (incl. the project owner and MANAGER);
 * `task.department.any` (ADMIN) is never locked. Tasks without a department keep the team rules.
 */
export function taskDepartmentLocked(user: DeptActor | null | undefined, task: Pick<Task, 'responsible'>) {
  if (!user) return true
  if (can(user, 'task.department.any') || deptKey(task.responsible) === '') return false
  return !sameDepartment(user.department, task.responsible)
}

/** Set or change the start / due dates of a task that already exists: ADMIN only (User and Manager never). */
export function canEditTaskDates(user: Actor | null | undefined) {
  return can(user, 'task.dates.edit')
}

/** Full edit of one task: rename, assign, department, priority, table rows, sub tasks, move, copy, delete. */
export function canManageTask(user: DeptActor | null | undefined, proposal: Pick<Proposal, 'ownerId' | 'memberIds'>, task: Pick<Task, 'responsible'>) {
  if (!user) return false
  if (can(user, 'task.department.any')) return true
  return canManageTasks(user, proposal) && !taskDepartmentLocked(user, task)
}

/** Add a task (or sub task) with this department: the department's own people on the team, or ADMIN. */
export function canCreateTask(user: DeptActor | null | undefined, proposal: Pick<Proposal, 'ownerId' | 'memberIds'>, responsible: string | null | undefined) {
  return canManageTask(user, proposal, { responsible: responsible ?? null })
}

/** Tick / untick a task (and fill its table): its task managers, or its own assignees — same department only. */
export function canToggleTask(
  user: DeptActor | null | undefined,
  proposal: Pick<Proposal, 'ownerId' | 'memberIds'>,
  task: Pick<Task, 'assigneeIds' | 'responsible'>,
) {
  if (!user) return false
  if (can(user, 'task.department.any')) return true
  if (taskDepartmentLocked(user, task)) return false
  return canManageTasks(user, proposal) || task.assigneeIds.includes(user.id)
}

type TreeTask = Pick<Task, 'id' | 'parentId' | 'responsible' | 'title'>

/** What the user may do to a task's place in the tree, with the first department lock that stops it. */
export interface TaskStructureRights {
  /** Reorder among its current siblings (only the task itself must be editable). */
  reorder: boolean
  /** Delete it — the task and every task under it must be editable. */
  remove: boolean
  /** Copy it next to itself — like delete, plus its parent (the copy becomes the parent's new child). */
  duplicate: boolean
  /** Move it under another parent — like delete, plus its current parent (use canMoveTaskTo for the target). */
  move: boolean
  /** Why one of the above is refused, or null. */
  reason: string | null
}

export function taskStructureRights(
  user: DeptActor | null | undefined,
  proposal: Pick<Proposal, 'ownerId' | 'memberIds'>,
  tasks: readonly TreeTask[],
  id: string,
): TaskStructureRights {
  const task = tasks.find((t) => t.id === id)
  const none = { reorder: false, remove: false, duplicate: false, move: false }
  if (!task) return { ...none, reason: null }
  if (!canManageTask(user, proposal, task)) return { ...none, reason: taskLockReason(user, task) }
  const children = new Map<string, TreeTask[]>()
  for (const t of tasks) if (t.parentId) children.set(t.parentId, [...(children.get(t.parentId) ?? []), t])
  const below: TreeTask[] = []
  for (let queue = [...(children.get(id) ?? [])]; queue.length; ) {
    const t = queue.shift()!
    below.push(t)
    queue.push(...(children.get(t.id) ?? []))
  }
  const lockedBelow = below.find((t) => !canManageTask(user, proposal, t))
  const parent = task.parentId ? tasks.find((t) => t.id === task.parentId) : undefined
  const parentLocked = !!parent && !canManageTask(user, proposal, parent)
  const subtree = !lockedBelow
  return {
    reorder: true,
    remove: subtree,
    duplicate: subtree && !parentLocked,
    move: subtree && !parentLocked,
    reason: lockedBelow ? relatedLockReason(lockedBelow) : parentLocked ? relatedLockReason(parent) : null,
  }
}

/** Moving task `id` under `parentId` (null = top level): null when allowed, else why not (department rules only). */
export function moveTaskLockReason(
  user: DeptActor | null | undefined,
  proposal: Pick<Proposal, 'ownerId' | 'memberIds'>,
  tasks: readonly TreeTask[],
  id: string,
  parentId: string | null,
): string | null {
  const task = tasks.find((t) => t.id === id)
  if (!task) return null
  const rights = taskStructureRights(user, proposal, tasks, id)
  if (task.parentId === parentId) return rights.reorder ? null : rights.reason
  if (!rights.move) return rights.reason ?? taskLockReason(user, task)
  const target = parentId ? tasks.find((t) => t.id === parentId) : undefined
  return target && !canManageTask(user, proposal, target) ? relatedLockReason(target) : null
}

const relatedLockReason = (t: Pick<Task, 'title' | 'responsible'>) => {
  const dept = t.responsible?.trim()
  return `เกี่ยวข้องกับงาน “${t.title}” ของแผนก ${dept} ซึ่งแก้ไขได้เฉพาะแผนก ${dept} หรือ Admin`
}

/** Why a task is read-only for this user, or null when it is not locked by department. */
export function taskLockReason(user: DeptActor | null | undefined, task: Pick<Task, 'responsible'>) {
  return user && taskDepartmentLocked(user, task) ? `เฉพาะแผนก ${task.responsible?.trim()} แก้ไขงานนี้ได้ — แผนกอื่นดูได้อย่างเดียว` : null
}

export const TASK_DATES_ADMIN_ONLY = 'วันเริ่มและวันครบกำหนดของงานแก้ได้เฉพาะ Admin'
