// Request schemas for /proposals. Thai messages are shown to users as-is.
import { isLaunchDate, LAUNCH_DAY_OF_MONTH, todayBangkok } from '@flowtrade/shared'
import { z } from 'zod'
import { zChannel, zStatus } from '../../common/zod.js'
import { zResponsible } from '../tasks/tasks.schemas.js'

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** '' in a query string or optional body field means "not given". */
const blankToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v)

/** A reference id; a malformed one is reported like a missing record. */
const zRef = (message: string) => z.string({ message }).regex(UUID_RE, message)

function isRealDate(value: string) {
  const d = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

/** Calendar date (YYYY-MM-DD) that actually exists. */
const zBusinessDate = (requiredMessage: string) =>
  z
    .string({ message: requiredMessage })
    .min(1, requiredMessage)
    .regex(DATE_RE, 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD')
    .refine(isRealDate, 'วันที่ไม่ถูกต้อง')

export const LAUNCH_DAY_MESSAGE = `วันวางขายต้องเป็นวันที่ ${LAUNCH_DAY_OF_MONTH} ของเดือน`

/** Launch (on-shelf) date: always the 15th of a month (see launch.ts in @flowtrade/shared). */
const zLaunchDate = () => zBusinessDate('กรุณาเลือกเดือนที่จะวางขาย').refine(isLaunchDate, LAUNCH_DAY_MESSAGE)

// ---------- GET /proposals ----------

export const listQuerySchema = z.object({
  q: z.string().max(200, 'คำค้นหายาวเกินไป').optional(),
  status: z.preprocess(
    blankToUndefined,
    z.enum(['DRAFT', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED', 'ACTIVE', 'ALL'], { message: 'สถานะไม่ถูกต้อง' }).optional(),
  ),
  channel: z.preprocess(blankToUndefined, zChannel.optional()),
  storeId: z.preprocess(blankToUndefined, z.string().optional()),
  shelfTypeId: z.preprocess(blankToUndefined, z.string().optional()),
  ownerId: z.preprocess(blankToUndefined, z.string().optional()),
  scope: z.preprocess(blankToUndefined, z.enum(['mine', 'all'], { message: 'ขอบเขตการค้นหาไม่ถูกต้อง' }).optional()),
})
export type ProposalListQuery = z.output<typeof listQuerySchema>

// ---------- POST /proposals (wizard) ----------

/** Optional business date inside a wizard plan row: null/'' = no date. */
const zPlanDate = z.preprocess(
  blankToUndefined,
  z.string({ message: 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD' }).regex(DATE_RE, 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD').refine(isRealDate, 'วันที่ไม่ถูกต้อง').optional(),
).transform((v) => v ?? null)

/** One row of the wizard-edited plan (ProposalPlanItemInput); keys are client ids, re-keyed on insert. */
const planItemSchema = z.object(
  {
    key: z.string({ message: 'รายการงานไม่ถูกต้อง' }).max(100, 'รายการงานไม่ถูกต้อง'),
    parentKey: z.preprocess(blankToUndefined, z.string({ message: 'รายการงานไม่ถูกต้อง' }).max(100, 'รายการงานไม่ถูกต้อง').optional()).transform((v) => v ?? null),
    title: z.string({ message: 'กรุณาตั้งชื่องานให้ครบทุกงาน' }).max(500, 'ชื่องานยาวเกินไป (ไม่เกิน 500 ตัวอักษร)'),
    startDate: zPlanDate,
    dueDate: zPlanDate,
    /** Responsible department → tasks.responsible. */
    responsible: zResponsible,
    /** Table row labels from the template → the task starts as a table (normalizePlan cleans them). */
    fieldLabels: z.array(z.string({ message: 'หัวข้อในตารางไม่ถูกต้อง' }).max(1000, 'หัวข้อในตารางยาวเกินไป'), { message: 'หัวข้อในตารางไม่ถูกต้อง' }).max(500, 'ตารางมีแถวมากเกินไป').optional(),
  },
  { message: 'รายการงานไม่ถูกต้อง' },
)

/** The stores of one proposal (create / ADMIN edit / duplicate). */
const zStoreIds = z
  .array(zRef('ไม่พบห้างที่เลือก'), { message: 'กรุณาเลือกห้างหรือแพลตฟอร์มอย่างน้อย 1 แห่ง' })
  .min(1, 'กรุณาเลือกห้างหรือแพลตฟอร์มอย่างน้อย 1 แห่ง')
  .max(50, 'เลือกห้างได้สูงสุด 50 แห่ง')

export const createProposalSchema = z.object({
  productIds: z
    .array(zRef('ไม่พบสินค้าที่เลือก'), { message: 'กรุณาเลือกสินค้าอย่างน้อย 1 รายการ' })
    .min(1, 'กรุณาเลือกสินค้าอย่างน้อย 1 รายการ')
    .max(200, 'เลือกสินค้าได้สูงสุด 200 รายการ'),
  storeIds: zStoreIds,
  // A new proposal can't launch in the past (today in Asia/Bangkok is still allowed).
  targetDate: zLaunchDate().refine((v) => v >= todayBangkok(), `วันวางขายผ่านมาแล้ว — เลือกวันที่ ${LAUNCH_DAY_OF_MONTH} ของเดือนถัดไปแทน`),
  shelfTypeId: zRef('กรุณาเลือกประเภท Shelf'),
  channel: zChannel,
  title: z.string().max(200, 'ชื่องานยาวเกินไป').nullish(),
  note: z.string().max(5000, 'หมายเหตุยาวเกินไป').nullish(),
  templateId: z.preprocess(blankToUndefined, zRef('ไม่พบแม่แบบ').optional()).transform((v) => v ?? null),
  excludedTemplateItemIds: z.array(z.string()).max(1000).optional(),
  /** Wizard-edited task list; when present it replaces template instantiation (normalizePlan checks the tree). */
  plan: z.array(planItemSchema, { message: 'รายการงานไม่ถูกต้อง' }).max(500, 'รายการงานมากเกินไป (สูงสุด 500 งาน)').optional(),
  memberIds: z.array(zRef('ไม่พบผู้ใช้ที่เลือก')).max(200, 'เลือกทีมงานได้สูงสุด 200 คน').optional(),
  status: z.enum(['DRAFT', 'IN_PROGRESS'], { message: 'สถานะไม่ถูกต้อง' }),
})
export type CreateProposalBody = z.output<typeof createProposalSchema>

// ---------- PATCH /proposals/:id ----------

export const updateProposalSchema = z.object({
  title: z.string().max(200, 'ชื่องานยาวเกินไป').optional(),
  note: z.string().max(5000, 'หมายเหตุยาวเกินไป').nullable().optional(),
  productIds: z.array(zRef('ไม่พบสินค้าที่เลือก')).max(200, 'เลือกสินค้าได้สูงสุด 200 รายการ').optional(),
  memberIds: z.array(zRef('ไม่พบผู้ใช้ที่เลือก')).max(200, 'เลือกทีมงานได้สูงสุด 200 คน').optional(),
  ownerId: z.preprocess(blankToUndefined, zRef('ไม่พบผู้ใช้ที่เลือก').optional()),
  shelfTypeId: z.preprocess(blankToUndefined, zRef('ไม่พบประเภท Shelf').optional()),
  /** ADMIN only (checked in the service). */
  storeIds: zStoreIds.optional(),
})
export type UpdateProposalBody = z.output<typeof updateProposalSchema>

// ---------- actions ----------

export const statusSchema = z.object({ status: zStatus })
export type StatusBody = z.output<typeof statusSchema>

export const targetDateSchema = z.object({
  targetDate: zLaunchDate(),
  shiftTasks: z.boolean({ message: 'ค่าการเลื่อนงานไม่ถูกต้อง' }).optional().default(false),
})
export type TargetDateBody = z.output<typeof targetDateSchema>

export const duplicateSchema = z.object({
  storeIds: zStoreIds,
  targetDate: zLaunchDate(),
})
export type DuplicateBody = z.output<typeof duplicateSchema>
