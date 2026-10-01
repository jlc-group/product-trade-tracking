import { z } from 'zod'
import { zBoolQuery, zId } from '../../common/zod.js'

// Limits mirror the departments table (CHECK name not blank, unique lower(name)).
export const DEPARTMENT_NAME_MAX = 100
const NAME_REQUIRED = 'กรุณาระบุชื่อแผนก'

/** Trimmed, inner runs of whitespace collapsed to one space ("HR  and Account" = "HR and Account"). */
export const normalizeDepartmentName = (value: string) => value.trim().replace(/\s+/g, ' ')

const zName = z
  .string({ error: NAME_REQUIRED })
  .trim()
  .min(1, NAME_REQUIRED)
  .max(DEPARTMENT_NAME_MAX, `ชื่อแผนกยาวเกินไป (ไม่เกิน ${DEPARTMENT_NAME_MAX} ตัวอักษร)`)
  .transform(normalizeDepartmentName)

export const listDepartmentsQuery = z.object({ includeInactive: zBoolQuery })
export type ListDepartmentsQuery = z.output<typeof listDepartmentsQuery>

export const createDepartmentSchema = z.object({ name: zName }, { error: 'ข้อมูลไม่ถูกต้อง' })
export type CreateDepartmentBody = z.output<typeof createDepartmentSchema>

export const updateDepartmentSchema = z.object(
  {
    name: zName.optional(),
    isActive: z.boolean({ error: 'สถานะการใช้งานไม่ถูกต้อง' }).optional(),
  },
  { error: 'ข้อมูลไม่ถูกต้อง' },
)
export type UpdateDepartmentBody = z.output<typeof updateDepartmentSchema>

export const reorderDepartmentsSchema = z.object(
  { ids: z.array(zId, { error: 'รายการที่ต้องเรียงลำดับไม่ถูกต้อง' }).max(1000, 'รายการที่ต้องเรียงลำดับมากเกินไป') },
  { error: 'ข้อมูลไม่ถูกต้อง' },
)
export type ReorderDepartmentsBody = z.output<typeof reorderDepartmentsSchema>
