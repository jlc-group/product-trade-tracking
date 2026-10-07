import type { Channel, DescriptionFormat, ISODate, ProposalStatus, Role, TaskLevel, TaskPriority } from './types.js'

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

/** Short word for the retailer: "ห้าง" (offline) / "แพลตฟอร์ม" (online). */
export function storeWord(channel: Channel) {
  return channel === 'ONLINE' ? 'แพลตฟอร์ม' : 'ห้าง'
}

/** The identifier a person types to sign in: username first, then email. */
export function signInName(user: { username: string | null; email: string | null }): string {
  return user.username ?? user.email ?? ''
}

/** Store names on one line: up to `max` names, then "+N" for the rest ("Watsons, Lotus's, Big C +4"). */
export function storeNamesLabel(names: readonly string[], max = 3): string {
  return names.length <= max ? names.join(', ') : `${names.slice(0, max).join(', ')} +${names.length - max}`
}

const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

/**
 * "15 ต.ค. 69" (Buddhist era), the web's default formatDate, for text built where the viewer's BE/CE
 * preference is unknown (API messages). Anything that is not YYYY-MM-DD comes back as is; empty → "—".
 */
export function formatThaiDate(date: ISODate | null | undefined): string {
  if (!date) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const month = m ? THAI_MONTHS_SHORT[Number(m[2]) - 1] : undefined
  if (!m || !month) return date
  return `${Number(m[3])} ${month} ${String((Number(m[1]) + 543) % 100).padStart(2, '0')}`
}

/** Longest title the proposal title inputs accept (the API allows 200). */
export const PROPOSAL_TITLE_MAX = 160

/** Cuts a generated title to PROPOSAL_TITLE_MAX, ending in "…", so saving it again never hits the API limit. */
export function clipProposalTitle(title: string): string {
  if (title.length <= PROPOSAL_TITLE_MAX) return title
  // Don't leave half of a surrogate pair (emoji) before the "…".
  return `${title.slice(0, PROPOSAL_TITLE_MAX - 1).replace(/[\uD800-\uDBFF]$/, '').trimEnd()}…`
}

/** The title a proposal gets when none is typed: "<first product> +N → <stores>". */
export function autoProposalTitle(productNames: readonly string[], storeNames: readonly string[]): string {
  if (productNames.length === 0) return ''
  const head = `${productNames[0]}${productNames.length > 1 ? ` +${productNames.length - 1}` : ''}`
  return clipProposalTitle(storeNames.length > 0 ? `${head} → ${storeNamesLabel(storeNames)}` : head)
}
