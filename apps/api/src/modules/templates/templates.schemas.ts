import { cleanFieldLabels, DETAIL_FIELDS_MAX, DETAIL_LABEL_MAX, MAX_TASK_LEVEL } from '@flowtrade/shared'
import { z } from 'zod'
import { zBoolQuery, zChannel, zDate, zId } from '../../common/zod.js'
import { zResponsible } from '../tasks/tasks.schemas.js'

/** Generous bounds so a typo can't overflow the INT columns or produce an invalid date. */
export const MAX_OFFSET_DAYS = 3650
export const MAX_TEMPLATE_ITEMS = 500

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (v: string) => UUID_RE.test(v)

const zOffset = (label: string) =>
  z
    .number({ message: `${label}ต้องเป็นตัวเลข` })
    .int(`${label}ต้องเป็นจำนวนเต็ม`)
    .min(-MAX_OFFSET_DAYS, `${label}ต้องอยู่ระหว่าง D-${MAX_OFFSET_DAYS} ถึง D+${MAX_OFFSET_DAYS}`)
    .max(MAX_OFFSET_DAYS, `${label}ต้องอยู่ระหว่าง D-${MAX_OFFSET_DAYS} ถึง D+${MAX_OFFSET_DAYS}`)

/** Item ids may be client temporary ids (e.g. "ti-ab12cd34"); the server re-keys them. */
const zItemRef = z.string({ message: 'รหัสงานในแม่แบบไม่ถูกต้อง' }).trim().min(1, 'รหัสงานในแม่แบบไม่ถูกต้อง').max(100, 'รหัสงานในแม่แบบไม่ถูกต้อง')

export const templateItemSchema = z.object({
  id: zItemRef,
  parentId: zItemRef.nullable().optional().transform((v) => v ?? null),
  level: z
    .number({ message: 'ระดับงานไม่ถูกต้อง' })
    .int('ระดับงานไม่ถูกต้อง')
    .min(1, 'ระดับงานไม่ถูกต้อง')
    .max(MAX_TASK_LEVEL, `แม่แบบมีได้สูงสุด ${MAX_TASK_LEVEL} ระดับ`),
  title: z.string({ message: 'ใส่ชื่องานให้ครบทุกแถว' }).trim().min(1, 'ใส่ชื่องานให้ครบทุกแถว'),
  startOffsetDays: zOffset('วันเริ่ม'),
  dueOffsetDays: zOffset('วันสิ้นสุด'),
  /** Responsible department copied to each task (trimmed; '' → null). */
  responsible: zResponsible.transform((v) => v ?? null),
  /** Table row labels; non-empty = tasks start as a table with these rows. Blank labels are dropped. */
  fieldLabels: z
    .array(z.string({ message: 'หัวข้อในตารางไม่ถูกต้อง' }).max(DETAIL_LABEL_MAX, `หัวข้อในตารางยาวเกินไป (ไม่เกิน ${DETAIL_LABEL_MAX} ตัวอักษร)`), { message: 'หัวข้อในตารางไม่ถูกต้อง' })
    .max(DETAIL_FIELDS_MAX, `ตารางมีได้ไม่เกิน ${DETAIL_FIELDS_MAX} แถว`)
    .optional()
    .transform((v) => cleanFieldLabels(v)),
  sortOrder: z.number({ message: 'ลำดับงานไม่ถูกต้อง' }).int('ลำดับงานไม่ถูกต้อง').optional(),
})
export type TemplateItemPayload = z.output<typeof templateItemSchema>

const zItems = z.array(templateItemSchema, { message: 'รายการงานในแม่แบบไม่ถูกต้อง' }).max(MAX_TEMPLATE_ITEMS, `แม่แบบมีงานได้ไม่เกิน ${MAX_TEMPLATE_ITEMS} รายการ`)

const zName = z.string({ message: 'กรุณาระบุชื่อแม่แบบ' }).trim().min(1, 'กรุณาระบุชื่อแม่แบบ')
const zDescription = z
  .string({ message: 'คำอธิบายไม่ถูกต้อง' })
  .nullable()
  .optional()
  .transform((v) => (v == null ? v : v.trim() || null))
const zRef = zId.nullable()
/** null = every channel (offline and online); then shelfTypeId and storeId must be null too (checked in the service). */
const zTemplateChannel = zChannel.nullable()

export const createTemplateSchema = z.object({
  name: zName,
  description: zDescription,
  channel: zTemplateChannel,
  shelfTypeId: zRef.optional().transform((v) => v ?? null),
  storeId: zRef.optional().transform((v) => v ?? null),
  isActive: z.boolean({ message: 'สถานะการใช้งานไม่ถูกต้อง' }).optional(),
  items: zItems,
})
export type CreateTemplateBody = z.output<typeof createTemplateSchema>

export const updateTemplateSchema = z.object({
  name: zName.optional(),
  description: zDescription,
  channel: zTemplateChannel.optional(),
  shelfTypeId: zRef.optional(),
  storeId: zRef.optional(),
  isActive: z.boolean({ message: 'สถานะการใช้งานไม่ถูกต้อง' }).optional(),
  items: zItems.optional(),
})
export type UpdateTemplateBody = z.output<typeof updateTemplateSchema>

export const listQuerySchema = z.object({ includeInactive: zBoolQuery })

/** Empty / "null" query values mean "not chosen". Non-uuid values simply never match a template. */
const zOptionalRefQuery = z
  .string()
  .optional()
  .transform((v) => {
    const s = v?.trim()
    return s && s !== 'null' && s !== 'undefined' ? s : null
  })

export const suggestQuerySchema = z.object({
  channel: zChannel,
  shelfTypeId: zOptionalRefQuery,
  storeId: zOptionalRefQuery,
})
export type SuggestQuery = z.output<typeof suggestQuerySchema>

const isRealDate = (v: string) => {
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

export const previewQuerySchema = z.object({
  targetDate: zDate.refine(isRealDate, 'วันที่ไม่ถูกต้อง'),
  excluded: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) =>
      (Array.isArray(v) ? v : v ? [v] : [])
        .flatMap((s) => s.split(','))
        .map((s) => s.trim())
        .filter(Boolean),
    ),
})
export type PreviewQuery = z.output<typeof previewQuerySchema>
