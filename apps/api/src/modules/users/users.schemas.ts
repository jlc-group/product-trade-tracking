import { z } from 'zod'
import { zRole } from '../../common/zod.js'
import { DEPARTMENT_NAME_MAX, normalizeDepartmentName } from '../departments/departments.schemas.js'

/** Same pattern as the web form. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Optional email: trimmed + lower-cased; '' / null clears it on update. */
const email = z
  .string({ message: 'อีเมลต้องเป็นข้อความ' })
  .trim()
  .toLowerCase()
  .max(254, 'อีเมลยาวเกินไป')
  .nullish()
  .transform((v) => (v === undefined ? undefined : v || null))
  .refine((v) => v == null || EMAIL_RE.test(v), 'รูปแบบอีเมลไม่ถูกต้อง เช่น somchai@company.co.th — ถ้าไม่มีอีเมล ให้ใช้ชื่อผู้ใช้แทน')

export const USERNAME_RE = /^[a-z0-9._-]{3,32}$/

/** Optional username: trimmed + lower-cased; '' / null clears it on update. */
const username = z
  .string({ message: 'ชื่อผู้ใช้ต้องเป็นข้อความ' })
  .trim()
  .toLowerCase()
  .nullish()
  .transform((v) => (v === undefined ? undefined : v || null))
  .refine((v) => v == null || USERNAME_RE.test(v), 'ชื่อผู้ใช้ใช้ได้เฉพาะ a-z 0-9 . _ - ยาว 3–32 ตัวอักษร')

/** Admin-set password; '' means "not set". */
const password = z
  .string({ message: 'รหัสผ่านต้องเป็นข้อความ' })
  .optional()
  .transform((v) => v || undefined)
  .refine((v) => v === undefined || v.length >= 8, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร')
  .refine((v) => v === undefined || v.length <= 128, 'รหัสผ่านยาวเกินไป (ไม่เกิน 128 ตัวอักษร)')

const name = z.string({ message: 'กรุณากรอกชื่อ-นามสกุล' }).trim().min(1, 'กรุณากรอกชื่อ-นามสกุล').max(200, 'ชื่อ-นามสกุลยาวเกินไป')

/** Optional free text: trimmed, empty → null; undefined stays undefined (= "not sent" on PATCH). */
const optionalText = (label: string, max: number) =>
  z
    .string({ message: `${label}ต้องเป็นข้อความ` })
    .trim()
    .max(max, `${label}ยาวเกินไป`)
    .nullish()
    .transform((v) => (v === undefined ? undefined : v || null))

export const DEPARTMENT_UNKNOWN = 'ไม่พบแผนกนี้ — เลือกจากรายชื่อแผนกที่ผู้ดูแลระบบกำหนด'
export const DEPARTMENT_INACTIVE = 'แผนกนี้ถูกปิดการใช้งานแล้ว'

/**
 * Department NAME from the admin-managed list: trimmed (inner spaces collapsed), '' / null → null.
 * The service matches it case-insensitively and stores the canonical spelling.
 */
const department = z
  .string({ message: 'แผนกต้องเป็นข้อความ' })
  .trim()
  .max(DEPARTMENT_NAME_MAX, DEPARTMENT_UNKNOWN)
  .nullish()
  .transform((v) => (v === undefined ? undefined : v ? normalizeDepartmentName(v) : null))

const fields = {
  email,
  username,
  name,
  nickname: optionalText('ชื่อเล่น', 100),
  department,
  position: optionalText('ตำแหน่ง', 200),
  role: zRole,
  password,
  mustChangePassword: z.boolean({ message: 'ค่าบังคับเปลี่ยนรหัสผ่านไม่ถูกต้อง' }).optional(),
}

export const IDENTIFIER_REQUIRED = 'กรอกชื่อผู้ใช้ หรืออีเมล อย่างน้อย 1 ช่อง เพื่อใช้เข้าสู่ระบบ'

export const createUserSchema = z
  .object(fields, { message: 'ข้อมูลไม่ถูกต้อง' })
  .refine((v) => !!v.email || !!v.username, { message: IDENTIFIER_REQUIRED, path: ['username'] })
export type CreateUserBody = z.output<typeof createUserSchema>

export const updateUserSchema = z.object(fields, { message: 'ข้อมูลไม่ถูกต้อง' }).partial()
export type UpdateUserBody = z.output<typeof updateUserSchema>

export const setActiveSchema = z.object({ isActive: z.boolean({ message: 'กรุณาระบุสถานะการใช้งาน (true/false)' }) }, { message: 'ข้อมูลไม่ถูกต้อง' })
export type SetActiveBody = z.output<typeof setActiveSchema>
