import type { Role } from '@flowtrade/shared'

export const ROLE_ORDER: Role[] = ['ADMIN', 'MANAGER', 'USER']

/** One-line explanation shown next to each role when picking it. */
export const ROLE_DESCRIPTION: Record<Role, string> = {
  ADMIN: 'จัดการได้ทุกอย่าง รวมถึงผู้ใช้ ห้าง / แพลตฟอร์ม และประเภท Shelf',
  MANAGER: 'ดูและแก้ไขทุกโปรเจกต์ ดูหน้า Monitor จัดการสินค้าและแม่แบบ Task',
  USER: 'สร้างการเสนอสินค้า และทำงานในโปรเจกต์ที่ตัวเองเป็นเจ้าของหรือเป็นทีมงาน',
}

export const ROLE_TONE: Record<Role, string> = {
  ADMIN: 'bg-brand-soft text-brand',
  MANAGER: 'bg-info-soft text-info',
  USER: 'bg-muted text-muted-foreground',
}

export function toRole(value: string): Role | undefined {
  return ROLE_ORDER.find((r) => r === value)
}

export interface IssuedPassword {
  user: { name: string; email: string | null; username: string | null }
  tempPassword: string
}
