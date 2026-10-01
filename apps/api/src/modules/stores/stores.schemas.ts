import { z } from 'zod'
import { zBoolQuery, zChannel, zId } from '../../common/zod.js'

// Limits mirror the admin form (apps/web/src/features/admin-master/store-form-dialog.tsx).
const NAME_REQUIRED = 'กรุณาระบุชื่อ'
const COLOR_MESSAGE = 'สีต้องเป็นรหัส hex เช่น #2563eb'

const zName = z.string({ error: NAME_REQUIRED }).trim().min(1, NAME_REQUIRED).max(60, 'ชื่อยาวเกินไป (ไม่เกิน 60 ตัวอักษร)')
/** Empty → falls back to the first 5 characters of the name. */
const zShortName = z.string({ error: 'ชื่อย่อไม่ถูกต้อง' }).trim().max(6, 'ชื่อย่อได้ไม่เกิน 6 ตัวอักษร')
const zStoreColor = z.string({ error: COLOR_MESSAGE }).regex(/^#[0-9a-fA-F]{6}$/, COLOR_MESSAGE)
/** Empty string → null (normalised in the service). */
const zDescription = z.string({ error: 'คำอธิบายไม่ถูกต้อง' }).trim().max(200, 'คำอธิบายยาวเกินไป (ไม่เกิน 200 ตัวอักษร)').nullable()

export const listStoresQuery = z.object({ includeInactive: zBoolQuery })

export const createStoreSchema = z.object(
  {
    name: zName,
    shortName: zShortName.optional(),
    channel: zChannel,
    color: zStoreColor,
    description: zDescription.optional(),
  },
  { error: 'ข้อมูลไม่ถูกต้อง' },
)
export type CreateStoreBody = z.output<typeof createStoreSchema>

export const updateStoreSchema = z.object(
  {
    name: zName.optional(),
    shortName: zShortName.optional(),
    channel: zChannel.optional(),
    color: zStoreColor.optional(),
    description: zDescription.optional(),
    isActive: z.boolean({ error: 'สถานะการใช้งานไม่ถูกต้อง' }).optional(),
  },
  { error: 'ข้อมูลไม่ถูกต้อง' },
)
export type UpdateStoreBody = z.output<typeof updateStoreSchema>

export const reorderStoresSchema = z.object(
  { ids: z.array(zId, { error: 'รายการที่ต้องเรียงลำดับไม่ถูกต้อง' }).max(1000, 'รายการที่ต้องเรียงลำดับมากเกินไป') },
  { error: 'ข้อมูลไม่ถูกต้อง' },
)
export type ReorderStoresBody = z.output<typeof reorderStoresSchema>
