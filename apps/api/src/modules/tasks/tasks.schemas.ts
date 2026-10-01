import { DETAIL_FIELDS_MAX, DETAIL_LABEL_MAX, DETAIL_VALUE_MAX } from '@flowtrade/shared'
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

const zDetailValue = z.string({ message: 'ข้อมูลไม่ถูกต้อง' }).trim().max(DETAIL_VALUE_MAX, `ข้อมูลยาวเกินไป (ไม่เกิน ${DETAIL_VALUE_MAX} ตัวอักษร)`)
const zDetailLabel = z
  .string({ message: 'กรุณาระบุหัวข้อ' })
  .trim()
  .min(1, 'กรุณาระบุหัวข้อ')
  .max(DETAIL_LABEL_MAX, `หัวข้อยาวเกินไป (ไม่เกิน ${DETAIL_LABEL_MAX} ตัวอักษร)`)
const zDetailField = z.object(
  {
    id: zId.optional(),
    label: zDetailLabel,
    value: zDetailValue.optional().transform((v) => v ?? ''),
  },
  { message: 'แถวข้อมูลไม่ถูกต้อง' },
)
const zDetailFields = z
  .array(zDetailField, { message: 'ตารางข้อมูลไม่ถูกต้อง' })
  .max(DETAIL_FIELDS_MAX, `ตารางมีได้ไม่เกิน ${DETAIL_FIELDS_MAX} แถว`)
  .refine((rows) => {
    const ids = rows.flatMap((r) => (r.id ? [r.id] : []))
    return new Set(ids).size === ids.length
  }, 'แถวข้อมูลซ้ำกัน')
const byId = <T extends z.ZodType>(value: T, message: string) =>
  z.record(zId, value, { message }).refine((v) => Object.keys(v).length <= DETAIL_FIELDS_MAX, `ตารางมีได้ไม่เกิน ${DETAIL_FIELDS_MAX} แถว`)

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
    descriptionFormat: z.enum(['TEXT', 'FIELDS'], { message: 'รูปแบบรายละเอียดไม่ถูกต้อง' }).optional(),
    // Table rows — applied by applyDetailPatch (shared). All but detailValues are managers only.
    detailFields: zDetailFields.optional(),
    detailAppend: zDetailFields.optional(),
    detailLabels: byId(zDetailLabel, 'หัวข้อในตารางไม่ถูกต้อง').optional(),
    detailRemove: z.array(zId, { message: 'แถวที่จะลบไม่ถูกต้อง' }).max(DETAIL_FIELDS_MAX, `ตารางมีได้ไม่เกิน ${DETAIL_FIELDS_MAX} แถว`).optional(),
    detailValues: byId(zDetailValue, 'ข้อมูลในตารางไม่ถูกต้อง').optional(),
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
