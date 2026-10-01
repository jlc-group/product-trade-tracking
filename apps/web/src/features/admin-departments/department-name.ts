import type { Department } from '@flowtrade/shared'
import { ApiError } from '@/api'

/** Same limit as the API (departments.schemas.ts DEPARTMENT_NAME_MAX). */
export const DEPARTMENT_NAME_MAX = 100

/** Trim and collapse inner spaces, so "HR  and Account " can't sit next to "HR and Account". */
export const cleanDepartmentName = (raw: string) => raw.trim().replace(/\s+/g, ' ')

/** Client-side check before create / rename (the server's unique lower(name) index is the backstop). */
export function departmentNameError(raw: string, departments: readonly Department[], selfId?: string): string | null {
  const name = cleanDepartmentName(raw)
  if (!name) return 'กรุณาระบุชื่อแผนก'
  if (name.length > DEPARTMENT_NAME_MAX) return `ชื่อแผนกยาวเกินไป (ไม่เกิน ${DEPARTMENT_NAME_MAX} ตัวอักษร)`
  const needle = name.toLowerCase()
  const dup = departments.find((d) => d.id !== selfId && cleanDepartmentName(d.name).toLowerCase() === needle)
  if (dup) return `มีแผนก “${dup.name}” อยู่แล้ว${dup.isActive ? '' : ' (ปิดใช้งานอยู่ — เปิดใช้งานแทนได้)'}`
  return null
}

/** A name problem the server reported (e.g. a duplicate added by someone else meanwhile), to show under the field. */
export function serverNameError(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null
  if (error.fields?.name) return error.fields.name
  if (error.status === 409 || error.status === 422) return error.message
  return null
}
