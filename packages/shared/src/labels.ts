import type { Channel, DescriptionFormat, ProposalStatus, Role, TaskLevel, TaskPriority } from './types.js'

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'ผู้ดูแลระบบ (Admin)',
  MANAGER: 'ผู้จัดการ (Manager)',
  USER: 'ผู้ใช้งาน (User)',
}

export const ROLE_SHORT: Record<Role, string> = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  USER: 'User',
}

export const CHANNEL_LABEL: Record<Channel, string> = {
  OFFLINE: 'ออฟไลน์ (หน้าร้าน)',
  ONLINE: 'ออนไลน์',
}

export const CHANNEL_SHORT: Record<Channel, string> = {
  OFFLINE: 'Offline',
  ONLINE: 'Online',
}

/** What the "store" and "shelf type" are called in each channel. */
export const CHANNEL_TERMS: Record<Channel, { store: string; shelf: string; date: string }> = {
  OFFLINE: { store: 'ห้าง / ร้านค้า', shelf: 'ประเภท Shelf', date: 'วันที่วางขาย' },
  ONLINE: { store: 'แพลตฟอร์ม', shelf: 'ประเภทการลงขาย', date: 'วันที่เปิดขาย' },
}

export const STATUS_LABEL: Record<ProposalStatus, string> = {
  DRAFT: 'ร่าง',
  IN_PROGRESS: 'กำลังดำเนินการ',
  ON_HOLD: 'พักไว้',
  COMPLETED: 'เสร็จสิ้น',
  CANCELLED: 'ยกเลิก',
}

export const STATUS_ORDER: ProposalStatus[] = ['DRAFT', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED']

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  LOW: 'ต่ำ',
  MEDIUM: 'ปกติ',
  HIGH: 'สูง',
  URGENT: 'ด่วน',
}

export const PRIORITY_ORDER: TaskPriority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW']

export const LEVEL_LABEL: Record<TaskLevel, string> = {
  1: 'Task',
  2: 'Sub task',
  3: 'Mini task',
}

export const LEVEL_LABEL_TH: Record<TaskLevel, string> = {
  1: 'งานหลัก',
  2: 'งานย่อย',
  3: 'งานย่อยระดับ 3',
}

export const MAX_TASK_LEVEL = 3

export const DESCRIPTION_FORMAT_LABEL: Record<DescriptionFormat, string> = {
  TEXT: 'ข้อความ',
  FIELDS: 'ตาราง',
}

/** The identifier a person types to sign in: username first, then email. */
export function signInName(user: { username: string | null; email: string | null }): string {
  return user.username ?? user.email ?? ''
}
