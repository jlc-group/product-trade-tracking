import { z } from 'zod'
import { zBoolQuery, zChannel, zId } from '../../common/zod.js'

// Limits mirror the admin form (apps/web/src/features/admin-master/shelf-type-form-dialog.tsx).
const NAME_REQUIRED = 'กรุณาระบุชื่อ'
const COLOR_MESSAGE = 'สีต้องเป็นรหัส hex เช่น #2563eb'

const zName = z.string({ error: NAME_REQUIRED }).trim().min(1, NAME_REQUIRED).max(50, 'ชื่อยาวเกินไป (ไม่เกิน 50 ตัวอักษร)')
const zShelfColor = z.string({ error: COLOR_MESSAGE }).regex(/^#[0-9a-fA-F]{6}$/, COLOR_MESSAGE)
/** Empty string → null (normalised in the service). */
const zDescription = z.string({ error: 'คำอธิบายไม่ถูกต้อง' }).trim().max(160, 'คำอธิบายยาวเกินไป (ไม่เกิน 160 ตัวอักษร)').nullable()

export const listShelfTypesQuery = z.object({ includeInactive: zBoolQuery })

export const createShelfTypeSchema = z.object(
  {
    name: zName,
    channel: zChannel,
    color: zShelfColor,
    description: zDescription.optional(),
  },
  { error: 'ข้อมูลไม่ถูกต้อง' },
)
export type CreateShelfTypeBody = z.output<typeof createShelfTypeSchema>

export const updateShelfTypeSchema = z.object(
  {
    name: zName.optional(),
    channel: zChannel.optional(),
    color: zShelfColor.optional(),
    description: zDescription.optional(),
    isActive: z.boolean({ error: 'สถานะการใช้งานไม่ถูกต้อง' }).optional(),
  },
  { error: 'ข้อมูลไม่ถูกต้อง' },
)
export type UpdateShelfTypeBody = z.output<typeof updateShelfTypeSchema>

export const reorderShelfTypesSchema = z.object(
  { ids: z.array(zId, { error: 'รายการที่ต้องเรียงลำดับไม่ถูกต้อง' }).max(1000, 'รายการที่ต้องเรียงลำดับมากเกินไป') },
  { error: 'ข้อมูลไม่ถูกต้อง' },
)
export type ReorderShelfTypesBody = z.output<typeof reorderShelfTypesSchema>
