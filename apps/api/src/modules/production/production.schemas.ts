import { PERR, PRODUCTION_LEAD_DAYS_MAX, PRODUCTION_QTY_MAX } from '@flowtrade/shared'
import { z } from 'zod'
import { zDate, zId } from '../../common/zod.js'
import { realDate, zStepDate } from '../presentation/presentation.schemas.js'

// Shape and size only. The business rules (status, dates, who) are the shared validators', so the API answers with
// the copy the tab's dialogs show. Text caps here are well above NOTE_MAX and only stop oversized bodies.

const TEXT_CAP = 5000
const IDS_MAX = 200
const BAD = 'ข้อมูลไม่ถูกต้อง'

const zQty = z.number({ message: PERR.qty }).int(PERR.qty).min(1, PERR.qty).max(PRODUCTION_QTY_MAX, PERR.qty)
const uniqueIds = (items: { productId: string }[]) => new Set(items.map((i) => i.productId)).size === items.length
const zRealDate = zDate.refine(realDate, PERR.dateInvalid)

export const quantitiesSchema = z.object(
  {
    items: z
      .array(z.object({ productId: zId, quantity: zQty, before: zQty.nullable() }, { message: BAD }), { message: BAD })
      .min(1, BAD)
      .max(IDS_MAX, BAD)
      .refine(uniqueIds, 'สินค้าซ้ำกัน'),
  },
  { message: BAD },
)
export type QuantitiesBody = z.output<typeof quantitiesSchema>

export const planSchema = z
  .object(
    {
      leadDays: z.number({ message: PERR.leadDays }).int(PERR.leadDays).min(0, PERR.leadDays).max(PRODUCTION_LEAD_DAYS_MAX, PERR.leadDays).optional(),
      note: z
        .string({ message: 'ข้อความไม่ถูกต้อง' })
        .max(TEXT_CAP, 'ข้อความยาวเกินไป')
        .nullable()
        .optional()
        .transform((v) => (v === undefined ? undefined : v?.trim() || null)),
    },
    { message: BAD },
  )
  .refine((v) => v.leadDays !== undefined || v.note !== undefined, PERR.nothingToSave)
export type PlanBody = z.output<typeof planSchema>

/** An id the shared validator requires: missing stays missing, '' → null, so orderFieldErrors answers "เลือก…" (not the generic id error). */
const zPickedId = z.preprocess((v) => (v === '' ? null : v), zId.nullable().optional())

/**
 * The "ใบสั่งผลิต" fields (shape only: required ids, ≤ PRODUCTION_REF_MAX reference, the start's bounds, 1–365 days,
 * the main contact not a co-contact, ≤ ORDER_CO_CONTACTS_MAX co-contacts are orderFieldErrors', so the API answers with
 * PERR copy — a missing / null / '' manufacturerId, mainContactId, startedOn or productionDays passes here and gets
 * "เลือกบริษัทรับผลิต" / "เลือกผู้ติดต่อหลัก" / "เลือกวันที่เริ่มผลิต" / "กรอกระยะเวลาผลิต"). referenceNo is stored cleaned
 * (cleanReferenceNo; blank → null).
 */
const zOrderFields = {
  referenceNo: z.string({ message: BAD }).max(TEXT_CAP, 'ข้อความยาวเกินไป').nullable().optional(),
  manufacturerId: zPickedId,
  mainContactId: zPickedId,
  coContactIds: z.array(zId, { message: BAD }).max(IDS_MAX, BAD),
  startedOn: zStepDate.nullable().optional(),
  productionDays: z.preprocess((v) => (v === '' ? null : v), z.number({ message: PERR.days }).nullable().optional()),
}

export const confirmSchema = z.object(
  {
    items: z
      .array(z.object({ productId: zId, quantity: zQty, saved: zQty.nullable() }, { message: BAD }), { message: BAD })
      .min(1, PERR.nothingPending)
      .max(IDS_MAX, BAD)
      .refine(uniqueIds, 'สินค้าซ้ำกัน'),
    /** '' passes so the shared neededOnError answers "เลือกวันที่". */
    neededOn: zStepDate.optional(),
    /** The order this press creates (required). */
    order: z.object(zOrderFields, { message: BAD }),
  },
  { message: BAD },
)
export type ConfirmBody = z.output<typeof confirmSchema>

/**
 * `updatedAt` = the order the client showed (409 when it moved); the fields sent replace the current ones (an absent
 * key keeps its value; a null / '' manufacturerId, mainContactId, startedOn or productionDays is sent and refused as
 * required).
 */
export const orderEditSchema = z
  .object(
    {
      updatedAt: z.string({ message: BAD }).min(1, BAD),
      referenceNo: zOrderFields.referenceNo,
      manufacturerId: zOrderFields.manufacturerId,
      mainContactId: zOrderFields.mainContactId,
      coContactIds: zOrderFields.coContactIds.optional(),
      startedOn: zOrderFields.startedOn,
      productionDays: zOrderFields.productionDays,
    },
    { message: BAD },
  )
  .refine(
    (v) =>
      v.referenceNo !== undefined ||
      v.manufacturerId !== undefined ||
      v.mainContactId !== undefined ||
      v.coContactIds !== undefined ||
      v.startedOn !== undefined ||
      v.productionDays !== undefined,
    PERR.nothingToSave,
  )
export type OrderEditBody = z.output<typeof orderEditSchema>

export const advanceSchema = z.object(
  {
    productIds: z
      .array(zId, { message: BAD })
      .min(1, PERR.gone)
      .max(IDS_MAX, BAD)
      .transform((v) => [...new Set(v)]),
    from: z.enum(['IN_PRODUCTION', 'PRODUCED'], { message: 'สถานะไม่ถูกต้อง' }),
    to: z.literal('DELIVERED', { message: 'สถานะไม่ถูกต้อง' }).optional(),
    date: zStepDate,
    deliveredOn: zStepDate.optional(),
  },
  { message: BAD },
)
export type AdvanceBody = z.output<typeof advanceSchema>

export const backSchema = z.object({ from: z.enum(['IN_PRODUCTION', 'PRODUCED', 'DELIVERED'], { message: 'สถานะไม่ถูกต้อง' }) }, { message: BAD })
export type BackBody = z.output<typeof backSchema>

export const datesSchema = z
  .object({ neededOn: zRealDate.optional(), producedOn: zRealDate.optional(), deliveredOn: zRealDate.optional() }, { message: BAD })
  .refine((v) => v.neededOn !== undefined || v.producedOn !== undefined || v.deliveredOn !== undefined, PERR.nothingToSave)
export type DatesBody = z.output<typeof datesSchema>

export const cancelSchema = z.object(
  {
    reason: z
      .string({ message: PERR.cancelReason })
      .max(TEXT_CAP, 'ข้อความยาวเกินไป')
      .transform((v) => v.trim()),
    from: z.enum(['PENDING', 'IN_PRODUCTION', 'PRODUCED'], { message: 'สถานะไม่ถูกต้อง' }),
  },
  { message: BAD },
)
export type CancelBody = z.output<typeof cancelSchema>

export const keepSchema = z.object({ storeIds: z.array(zId, { message: BAD }).max(IDS_MAX, BAD) }, { message: BAD })
export type KeepBody = z.output<typeof keepSchema>
