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
  'task.manage.any',
  'dashboard.monitor',
  'store.manage',
  'shelfType.manage',
  'product.manage',
  'template.manage',
  'user.manage',
  'department.manage',
  'activity.read.all',
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
  'proposal.update.any': 'แก้ไขการเสนอสินค้าของทุกคน',
  'proposal.delete.any': 'ลบการเสนอสินค้าของทุกคน',
  'task.manage.any': 'จัดการ Task ในทุกโปรเจกต์',
  'dashboard.monitor': 'ดูหน้า Monitor ภาพรวม',
  'store.manage': 'จัดการห้าง / แพลตฟอร์ม',
  'shelfType.manage': 'จัดการประเภท Shelf',
  'product.manage': 'จัดการสินค้า',
  'template.manage': 'จัดการแม่แบบ Task',
  'user.manage': 'จัดการผู้ใช้และสิทธิ์',
  'department.manage': 'จัดการรายชื่อแผนก',
  'activity.read.all': 'ดูประวัติการใช้งานทั้งหมด',
}

type Actor = Pick<User, 'id' | 'role'>

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

/** Edit proposal header (title, products, members, target date, status). */
export function canEditProposal(user: Actor | null | undefined, proposal: Pick<Proposal, 'ownerId'>) {
  if (!user) return false
  return can(user, 'proposal.update.any') || isProposalOwner(user, proposal)
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

/** Tick / untick a task: task managers, or the task's own assignees. */
export function canToggleTask(
  user: Actor | null | undefined,
  proposal: Pick<Proposal, 'ownerId' | 'memberIds'>,
  task: Pick<Task, 'assigneeIds'>,
) {
  if (!user) return false
  return canManageTasks(user, proposal) || task.assigneeIds.includes(user.id)
}
