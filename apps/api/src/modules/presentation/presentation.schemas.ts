import { ERR, REJECT_REASONS, STAGE_ORDER } from '@flowtrade/shared'
import { z } from 'zod'
import { zDate, zId } from '../../common/zod.js'

// Shape and size only. The business rules (required fields, NOTE_MAX / NAME_MAX, date order, transitions) are
// the shared validators', so the API answers with the same Thai copy the dialogs show. Text caps here are
// well above those limits and only stop oversized bodies. Free text of a step is trimmed here (blank optional
// text → null), as the dialogs send it: the shared limits count trimmed text, so padding can't get past them.

const TEXT_CAP = 5000
const IDS_MAX = 200

export const realDate = (v: string) => {
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

/** A step's own date: '' is let through so the shared validator answers "เลือกวันที่". */
export const zStepDate = z
  .string({ message: ERR.dateRequired })
  .max(10, 'วันที่ไม่ถูกต้อง')
  .refine((v) => v === '' || realDate(v), 'วันที่ไม่ถูกต้อง')
/** Optional business dates (meeting, due, expected result): a real YYYY-MM-DD or null. */
const zOptDate = zDate.refine(realDate, 'วันที่ไม่ถูกต้อง').nullable()
const zText = z.string({ message: 'ข้อความไม่ถูกต้อง' }).max(TEXT_CAP, 'ข้อความยาวเกินไป')
/** Required free text, trimmed ('' is let through so the shared validator answers with the field's own copy). */
const zTrimmed = (message: string) =>
  z
    .string({ message })
    .max(TEXT_CAP, 'ข้อความยาวเกินไป')
    .transform((v) => v.trim())
/** Optional free text: trimmed, blank → null (missing → null). */
const zOptTrimmed = zText.nullish().transform((v) => v?.trim() || null)
const unique = <T>(v: T[]) => [...new Set(v)]
const zUserIds = z.array(zId, { message: 'ผู้นำเสนอไม่ถูกต้อง' }).max(50, 'เลือกผู้นำเสนอได้ไม่เกิน 50 คน').transform(unique)
const zTaskIds = z.array(zId, { message: 'งานที่เลือกไม่ถูกต้อง' }).max(IDS_MAX, `เลือกงานได้ไม่เกิน ${IDS_MAX} งาน`).transform(unique)
const zProductIds = z
  .array(zId, { message: 'สินค้าที่เลือกไม่ถูกต้อง' })
  .max(IDS_MAX, 'สินค้าที่เลือกไม่ถูกต้อง')
  .refine((v) => new Set(v).size === v.length, 'สินค้าที่เลือกซ้ำกัน')

const nullish = <T extends z.ZodType>(schema: T) => schema.nullish().transform((v) => v ?? null)

export const zStage = z.enum(STAGE_ORDER, { message: 'ขั้นตอนไม่ถูกต้อง' })

/** A step from the record / withdraw / re-pitch dialogs. REPITCH carries taskIds; the server snapshots the tasks. */
const zStageEvent = z.discriminatedUnion(
  'kind',
  [
    z.object({ kind: z.literal('PRESENTED'), date: zStepDate, contactName: zOptTrimmed, expectedResultDate: nullish(zOptDate), note: zOptTrimmed }),
    z.object({ kind: z.literal('NEEDS_INFO'), date: zStepDate, request: zTrimmed(ERR.request), dueDate: nullish(zOptDate), preparerId: nullish(zId) }),
    z.object({ kind: z.literal('INFO_SENT'), date: zStepDate, sentWhat: zOptTrimmed, expectedResultDate: nullish(zOptDate) }),
    z.object({ kind: z.literal('PASSED'), date: zStepDate, acceptedProductIds: nullish(zProductIds), notAcceptedNote: zOptTrimmed, note: zOptTrimmed }),
    z.object({ kind: z.literal('REJECTED'), date: zStepDate, reason: z.enum(REJECT_REASONS, { message: ERR.reason }), detail: zTrimmed(ERR.detail) }),
    z.object({ kind: z.literal('WITHDRAWN'), date: zStepDate, reason: zTrimmed(ERR.withdrawReason) }),
    z.object({ kind: z.literal('REPITCH'), taskIds: zTaskIds, changes: zTrimmed(ERR.repitchChanges), meetingDate: nullish(zOptDate), presenterIds: zUserIds }),
  ],
  { message: 'ขั้นตอนไม่ถูกต้อง' },
)
export type StageEventBody = z.output<typeof zStageEvent>

export const createPackageSchema = z.object(
  {
    taskIds: zTaskIds,
    storeIds: z.array(zId, { message: 'ห้างที่เลือกไม่ถูกต้อง' }).max(IDS_MAX, 'ห้างที่เลือกไม่ถูกต้อง').transform(unique),
    meetingDate: nullish(zOptDate),
    presenterIds: zUserIds,
    note: nullish(zText),
  },
  { message: 'ข้อมูลไม่ถูกต้อง' },
)
export type CreatePackageBody = z.output<typeof createPackageSchema>

export const recordSchema = z.object(
  {
    trackIds: z.array(zId, { message: ERR.gone }).min(1, ERR.gone).max(IDS_MAX, ERR.gone).transform(unique),
    expectStage: zStage,
    // One step, or [PRESENTED, outcome] (recordStepsAllowed, checked again in the service).
    events: z.array(zStageEvent, { message: ERR.gone }).min(1, ERR.gone).max(2, 'ขั้นตอนไม่ถูกต้อง'),
  },
  { message: 'ข้อมูลไม่ถูกต้อง' },
)
export type RecordBody = z.output<typeof recordSchema>

export const scheduleSchema = z.object(
  { meetingDate: nullish(zOptDate), presenterIds: zUserIds, contactName: nullish(zText) },
  { message: 'ข้อมูลไม่ถูกต้อง' },
)
export type ScheduleBody = z.output<typeof scheduleSchema>

export const revertSchema = z.object({ targetEventId: zId }, { message: 'ข้อมูลไม่ถูกต้อง' })
export type RevertBody = z.output<typeof revertSchema>

/**
 * The fields to change (any kind's; diffPatch keeps the target kind's EDITABLE_FIELDS and drops unchanged ones).
 * A field left out must stay out: text is trimmed inside `.optional()`, so a missing key stays missing.
 * A re-pitch's task list is sent as taskIds and re-snapshotted.
 */
const zPatchText = zText.transform((v) => v.trim()).optional()
const zPatchOptText = zText
  .nullable()
  .transform((v) => v?.trim() || null)
  .optional()
const zPatch = z.object(
  {
    date: zStepDate.optional(),
    contactName: zPatchOptText,
    expectedResultDate: zOptDate.optional(),
    note: zPatchOptText,
    request: zPatchText,
    dueDate: zOptDate.optional(),
    preparerId: zId.nullable().optional(),
    sentWhat: zPatchOptText,
    acceptedProductIds: zProductIds.nullable().optional(),
    notAcceptedNote: zPatchOptText,
    reason: zPatchText,
    detail: zPatchText,
    changes: zPatchText,
    meetingDate: zOptDate.optional(),
    presenterIds: zUserIds.optional(),
    taskIds: z.array(zId, { message: 'งานที่เลือกไม่ถูกต้อง' }).max(IDS_MAX, `เลือกงานได้ไม่เกิน ${IDS_MAX} งาน`).optional(),
  },
  { message: 'ข้อมูลที่แก้ไขไม่ถูกต้อง' },
)
export type PatchBody = z.output<typeof zPatch>

export const editSchema = z.object({ targetEventId: zId, patch: zPatch }, { message: 'ข้อมูลไม่ถูกต้อง' })
export type EditBody = z.output<typeof editSchema>
