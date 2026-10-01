import { z } from 'zod'
import { zDate, zId, zPriority } from '../../common/zod.js'

/** YYYY-MM-DD that is also a real calendar date (rejects 2026-02-30). */
const zTaskDate = zDate.refine((v) => {
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}, 'วันที่ไม่ถูกต้อง')

const zTitle = z.string({ message: 'กรุณาระบุชื่องาน' }).max(500, 'ชื่องานยาวเกินไป (ไม่เกิน 500 ตัวอักษร)')
const zDescription = z.string({ message: 'รายละเอียดไม่ถูกต้อง' }).max(10_000, 'รายละเอียดยาวเกินไป')
const zAssignees = z.array(zId, { message: 'ผู้รับผิดชอบไม่ถูกต้อง' }).max(50, 'เลือกผู้รับผิดชอบได้ไม่เกิน 50 คน')
const zIndex = z.number({ message: 'ตำแหน่งไม่ถูกต้อง' }).int('ตำแหน่งไม่ถูกต้อง')
const zParentId = zId.nullish().transform((v) => v ?? null)

export const RESPONSIBLE_MAX = 100
/**
 * Responsible department, e.g. "NPD" (free text). Trimmed; '' and null both mean "none" (→ null);
 * absent stays undefined (= unchanged on updates).
 */
export const zResponsible = z
  .string({ message: 'แผนกผู้รับผิดชอบไม่ถูกต้อง' })
  .trim()
  .max(RESPONSIBLE_MAX, `ชื่อแผนกผู้รับผิดชอบยาวเกินไป (ไม่เกิน ${RESPONSIBLE_MAX} ตัวอักษร)`)
  .nullish()
  .transform((v) => (v === undefined ? undefined : v || null))

export const createTaskSchema = z.object(
  {
    proposalId: zId,
    parentId: zParentId,
    title: zTitle,
    description: zDescription.nullish(),
    startDate: zTaskDate.nullish(),
    dueDate: zTaskDate.nullish(),
    assigneeIds: zAssignees.optional(),
    responsible: zResponsible,
    priority: zPriority.optional(),
    /** Insert before this sibling's position; null/absent = append. */
    index: zIndex.nullish(),
  },
  { message: 'ข้อมูลไม่ถูกต้อง' },
)
export type CreateTaskBody = z.output<typeof createTaskSchema>

export const updateTaskSchema = z.object(
  {
    title: zTitle.optional(),
    description: zDescription.nullish(),
    startDate: zTaskDate.nullish(),
    dueDate: zTaskDate.nullish(),
    assigneeIds: zAssignees.optional(),
    /** null or '' clears it. */
    responsible: zResponsible,
    priority: zPriority.optional(),
  },
  { message: 'ข้อมูลไม่ถูกต้อง' },
)
export type UpdateTaskBody = z.output<typeof updateTaskSchema>

export const toggleTaskSchema = z.object({ isDone: z.boolean({ message: 'สถานะงานไม่ถูกต้อง' }) }, { message: 'ข้อมูลไม่ถูกต้อง' })
export type ToggleTaskBody = z.output<typeof toggleTaskSchema>

export const moveTaskSchema = z.object({ parentId: zParentId, index: zIndex }, { message: 'ข้อมูลไม่ถูกต้อง' })
export type MoveTaskBody = z.output<typeof moveTaskSchema>

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v)

export const myTasksQuerySchema = z.object({
  status: z.preprocess(emptyToUndefined, z.enum(['open', 'done', 'all'], { message: 'ตัวกรองสถานะไม่ถูกต้อง' }).optional()),
  due: z.preprocess(emptyToUndefined, z.enum(['overdue', 'today', 'week', 'all'], { message: 'ตัวกรองกำหนดส่งไม่ถูกต้อง' }).optional()),
  proposalId: z.preprocess(emptyToUndefined, zId.optional()),
})
export type MyTasksQuery = z.output<typeof myTasksQuerySchema>
