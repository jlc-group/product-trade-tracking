import { MANUFACTURER_NAME_MAX, MANUFACTURER_NOTE_MAX } from '@flowtrade/shared'
import { z } from 'zod'
import { zBoolQuery, zId } from '../../common/zod.js'

// Limits mirror the manufacturers table (CHECK name not blank, unique lower(name)) and the shared constants.
const NAME_REQUIRED = 'กรุณาระบุชื่อบริษัท'

/** Trimmed, inner runs of whitespace collapsed to one space ("ABC  Co., Ltd." = "ABC Co., Ltd."). */
export const normalizeManufacturerName = (value: string) => value.trim().replace(/\s+/g, ' ')

/** Counted after the whitespace is collapsed, as stored. */
const zName = z
  .string({ error: NAME_REQUIRED })
  .overwrite(normalizeManufacturerName)
  .min(1, NAME_REQUIRED)
  .max(MANUFACTURER_NAME_MAX, `ชื่อบริษัทยาวเกินไป (ไม่เกิน ${MANUFACTURER_NAME_MAX} ตัวอักษร)`)
/** Address / phone / remark; empty string → null (normalised in the service). */
const zNote = z
  .string({ error: 'หมายเหตุไม่ถูกต้อง' })
  .trim()
  .max(MANUFACTURER_NOTE_MAX, `หมายเหตุยาวเกินไป (ไม่เกิน ${MANUFACTURER_NOTE_MAX} ตัวอักษร)`)
  .nullable()

export const listManufacturersQuery = z.object({ includeInactive: zBoolQuery })
export type ListManufacturersQuery = z.output<typeof listManufacturersQuery>

export const createManufacturerSchema = z.object({ name: zName, note: zNote.optional() }, { error: 'ข้อมูลไม่ถูกต้อง' })
export type CreateManufacturerBody = z.output<typeof createManufacturerSchema>

export const updateManufacturerSchema = z.object(
  {
    name: zName.optional(),
    note: zNote.optional(),
    isActive: z.boolean({ error: 'สถานะการใช้งานไม่ถูกต้อง' }).optional(),
  },
  { error: 'ข้อมูลไม่ถูกต้อง' },
)
export type UpdateManufacturerBody = z.output<typeof updateManufacturerSchema>

export const reorderManufacturersSchema = z.object(
  { ids: z.array(zId, { error: 'รายการที่ต้องเรียงลำดับไม่ถูกต้อง' }).max(1000, 'รายการที่ต้องเรียงลำดับมากเกินไป') },
  { error: 'ข้อมูลไม่ถูกต้อง' },
)
export type ReorderManufacturersBody = z.output<typeof reorderManufacturersSchema>
