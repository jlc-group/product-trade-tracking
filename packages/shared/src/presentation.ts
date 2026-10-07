// "นำเสนอ Buyer" presentation track: the persisted shapes, stage rules, the event reducer, validation and
// who may write. The web dialogs and the API run the same checks from here. No clock reads — `today`
// always comes in as an argument. UI looks and derived copy (rows, next action, timeline) stay in the web app.
import { detailFieldsProgress } from './detail-fields.js'
import { formatThaiDate } from './labels.js'
import { canEditProposal, canManageTasks } from './permissions.js'
import type { ISODate, Progress, Proposal, Store, Task, User } from './types.js'

// ---------- persisted shapes ----------

export type PresentationStage = 'AWAITING' | 'IN_REVIEW' | 'NEEDS_INFO' | 'PASSED' | 'REJECTED' | 'WITHDRAWN'
export type RejectReason = 'PRICE' | 'DUPLICATE' | 'CATEGORY_FIT' | 'SHELF_SPACE' | 'DOCUMENTS' | 'OTHER'

/** One bundled level-1 task, frozen when bundled. */
export interface PackageTask {
  taskId: string
  title: string
  completedAt: string | null
  /** detailFieldsProgress(task.detailFields).filled; 0 for TEXT tasks. */
  fieldsFilled: number
  /** 0 for TEXT tasks. */
  fieldsTotal: number
}

export interface PresentationPackage {
  id: string
  proposalId: string
  /** "ชุดนำเสนอ #1"; next = max(seq) + 1. */
  seq: number
  tasks: PackageTask[]
  note: string | null
  createdById: string
  /** ISO datetime. */
  createdAt: string
}

/** Store look frozen on the track, so a store later removed from the proposal still renders. */
export interface StoreSnapshot {
  id: string
  name: string
  shortName: string
  color: string
}

export interface StoreTrack {
  id: string
  proposalId: string
  packageId: string
  /** Unique per (proposalId, store.id). */
  store: StoreSnapshot
  /** Append-only, oldest first: the only source of truth. */
  events: TrackEvent[]
}

export type StageEvent =
  | { kind: 'PRESENTED'; date: ISODate; contactName: string | null; expectedResultDate: ISODate | null; note: string | null }
  | { kind: 'NEEDS_INFO'; date: ISODate; request: string; dueDate: ISODate | null; preparerId: string | null }
  | { kind: 'INFO_SENT'; date: ISODate; sentWhat: string | null; expectedResultDate: ISODate | null }
  /** acceptedProductIds: null = every SKU. */
  | { kind: 'PASSED'; date: ISODate; acceptedProductIds: string[] | null; notAcceptedNote: string | null; note: string | null }
  | { kind: 'REJECTED'; date: ISODate; reason: RejectReason; detail: string }
  | { kind: 'WITHDRAWN'; date: ISODate; reason: string }
  | { kind: 'REPITCH'; tasks: PackageTask[]; changes: string; meetingDate: ISODate | null; presenterIds: string[] }

export type MetaEvent =
  | { kind: 'CREATED'; packageId: string; meetingDate: ISODate | null; presenterIds: string[] }
  | { kind: 'SCHEDULED'; meetingDate: ISODate | null; presenterIds: string[]; contactName: string | null }
  | { kind: 'REVERTED'; targetEventId: string }
  | { kind: 'EDITED'; targetEventId: string; patch: EventPatch }

export type StageEventKind = StageEvent['kind']
export type EventKind = (StageEvent | MetaEvent)['kind']
export type EditableKind = StageEventKind | 'CREATED' | 'SCHEDULED'
export type EventPayload<K extends EventKind> = Omit<Extract<StageEvent | MetaEvent, { kind: K }>, 'kind'>
export type EventPatch = { [K in EditableKind]: Partial<EventPayload<K>> }[EditableKind]

export type TrackEvent = { id: string; actorId: string; recordedAt: string } & (StageEvent | MetaEvent)
export type EventOf<K extends EventKind> = Extract<TrackEvent, { kind: K }>

/** Everything of one proposal (GET /proposals/:id/presentation, and every write's response). */
export interface PresentationData {
  version: 1
  proposalId: string
  packages: PresentationPackage[]
  tracks: StoreTrack[]
}

// ---------- derived (reduceTrack, summarize) ----------

/** One field an EDITED event changed: values as stored. */
export interface EditChange {
  field: string
  label: string
  before: unknown
  after: unknown
}

export interface TimelineItem {
  event: TrackEvent
  /** EDITED patches applied. */
  effective: TrackEvent
  /** Running round at this position (reverted INFO_SENT / REPITCH do not start a round). */
  round: number
  reverted: boolean
  edited: boolean
  /** REVERTED only: what it undid, and the stage before → after the revert. */
  revert: { target: TrackEvent; from: PresentationStage; to: PresentationStage } | null
  /** EDITED only: the target as it was just before this edit, and the changed fields. */
  edit: { target: TrackEvent; changes: EditChange[] } | null
}

export interface TrackPlan {
  meetingDate: ISODate | null
  presenterIds: string[]
  contactName: string | null
}

export interface TrackView {
  track: StoreTrack
  /** Live store if still in the proposal, else track.store. */
  store: StoreSnapshot
  inProposal: boolean
  /** Position in the proposal's store order; -1 when the store left the proposal. */
  storeIndex: number
  package: PresentationPackage | null
  packageSeq: number
  stage: PresentationStage
  round: number
  plan: TrackPlan
  /** Latest effective PRESENTED.date. */
  presentedDate: ISODate | null
  /** From the latest effective PRESENTED / INFO_SENT. */
  expectedResultDate: ISODate | null
  /** Date of the latest effective PRESENTED / INFO_SENT: when the buyer last got everything asked for. */
  reviewSince: ISODate | null
  /** The NEEDS_INFO being answered (stage NEEDS_INFO only). */
  openRequest: EventOf<'NEEDS_INFO'> | null
  /** The event that closed the track (final stages only). */
  outcome: EventOf<'PASSED' | 'REJECTED' | 'WITHDRAWN'> | null
  /** Partial pass: accepted SKUs still in the proposal, of its current SKUs (acceptedSkus); null when every SKU was accepted. */
  accepted: { count: number; total: number } | null
  /** Latest effective stage event — the only one "ย้อนกลับขั้นก่อนหน้า" may target. */
  lastRevertable: TrackEvent | null
  /** Stage after reverting lastRevertable. */
  revertTo: PresentationStage | null
  /** Latest event "แก้ไขรายละเอียดล่าสุด" opens (effective copy): non-reverted, not REVERTED / EDITED. */
  latestEditable: TrackEvent | null
  /** WITHDRAWN only: the stage the track had when it was withdrawn. */
  withdrawnFrom: PresentationStage | null
  /** Latest effective REPITCH (its changes and task snapshot). */
  repitch: EventOf<'REPITCH'> | null
  /** Effective NEEDS_INFO events since the last re-pitch ("↻ ขอข้อมูลเพิ่ม n ครั้ง"). */
  needsInfoCount: number
  /** Latest effective REPITCH.tasks ?? package.tasks. */
  bundle: PackageTask[]
  /** Nothing recorded yet: only CREATED / SCHEDULED (and edits of those). */
  untouched: boolean
  /** Oldest first; the UI groups by round and shows newest first. */
  timeline: TimelineItem[]
}

export interface PresentationSummary {
  /** Stores of the proposal. */
  storesTotal: number
  /** In-proposal tracks. */
  tracked: number
  /** Proposal stores without a track, in proposal order. */
  untracked: StoreSnapshot[]
  byStage: Record<PresentationStage, number>
  /** AWAITING + NEEDS_INFO. */
  waitingOnUs: number
  finalCount: number
  passed: number
  rejected: number
  withdrawn: number
  /** Every proposal store has a final track. */
  allFinal: boolean
  /** Any track at all (including stores that left the proposal). */
  hasTracks: boolean
}

/** Errors keyed by an event's payload field (date, reason, tasks, …). */
export type FieldErrors = Partial<Record<string, string>>

/** What the reducer reads of the proposal (a ProposalDetail fits). */
export interface PresentationProposal {
  /** In the proposal's store order. */
  stores: Pick<Store, 'id' | 'name' | 'shortName' | 'color'>[]
  productIds: string[]
}

// ---------- stages ----------

export const STAGE_ORDER: PresentationStage[] = ['AWAITING', 'IN_REVIEW', 'NEEDS_INFO', 'PASSED', 'REJECTED', 'WITHDRAWN']
export const FINAL_STAGES: PresentationStage[] = ['PASSED', 'REJECTED', 'WITHDRAWN']
export const OPEN_STAGES: PresentationStage[] = ['AWAITING', 'IN_REVIEW', 'NEEDS_INFO']
export const WAITING_ON_US: PresentationStage[] = ['AWAITING', 'NEEDS_INFO']
export const isFinalStage = (stage: PresentationStage) => FINAL_STAGES.includes(stage)

/** Chip text. */
export const STAGE_LABEL: Record<PresentationStage, string> = {
  AWAITING: 'รอนำเสนอ',
  IN_REVIEW: 'เสนอแล้ว · รอพิจารณา',
  NEEDS_INFO: 'ต้องการข้อมูลเพิ่ม',
  PASSED: 'ผ่าน',
  REJECTED: 'ไม่ผ่าน',
  WITHDRAWN: 'ยุตินำเสนอ',
}

/** Sheet / dialog / tooltip text; WITHDRAWN carries "{ห้าง}" — use stageLong(). */
export const STAGE_LONG: Record<PresentationStage, string> = {
  AWAITING: 'รอการนำเสนอ',
  IN_REVIEW: 'เสนอแล้ว อยู่ระหว่างพิจารณา',
  NEEDS_INFO: 'ยังไม่ผ่าน — Buyer ต้องการข้อมูลเพิ่ม',
  PASSED: 'ผ่านการพิจารณา',
  REJECTED: 'ไม่ผ่านการพิจารณา',
  WITHDRAWN: 'ยุติการนำเสนอ{ห้าง}นี้',
}

/** "รอนำเสนอ", or "เสนอแล้ว · รอพิจารณา · รอบที่ 2" from round 2 on. */
export function stageLabel(stage: PresentationStage, round = 1) {
  return round >= 2 ? `${STAGE_LABEL[stage]} · รอบที่ ${round}` : STAGE_LABEL[stage]
}

export function stageLong(stage: PresentationStage, word = 'ห้าง') {
  return STAGE_LONG[stage].replace('{ห้าง}', word)
}

// ---------- reasons, limits ----------

export const REJECT_REASONS: RejectReason[] = ['PRICE', 'DUPLICATE', 'CATEGORY_FIT', 'SHELF_SPACE', 'DOCUMENTS', 'OTHER']

const REJECT_REASON_TEXT: Record<RejectReason, string> = {
  PRICE: 'ราคา/เงื่อนไขการค้าไม่เหมาะสม',
  DUPLICATE: 'มีสินค้าคล้ายกันใน{ห้าง}แล้ว',
  CATEGORY_FIT: 'ไม่ตรงกลุ่มลูกค้าของ{ห้าง}',
  SHELF_SPACE: 'พื้นที่ชั้นวางไม่พอ',
  DOCUMENTS: 'เอกสาร/มาตรฐานไม่ผ่าน',
  OTHER: 'อื่น ๆ',
}

export function rejectReasonLabel(reason: RejectReason, word = 'ห้าง') {
  return (REJECT_REASON_TEXT[reason] ?? REJECT_REASON_TEXT.OTHER).replace('{ห้าง}', word)
}

export const NOTE_MAX = 500
export const NAME_MAX = 80

// ---------- transitions ----------

export const NEXT: Record<PresentationStage, StageEventKind[]> = {
  AWAITING: ['PRESENTED', 'WITHDRAWN'],
  IN_REVIEW: ['NEEDS_INFO', 'PASSED', 'REJECTED', 'WITHDRAWN'],
  NEEDS_INFO: ['INFO_SENT', 'PASSED', 'REJECTED', 'WITHDRAWN'],
  PASSED: [],
  REJECTED: ['REPITCH'],
  WITHDRAWN: [],
}

// SCHEDULED is allowed only in AWAITING. A direct outcome from AWAITING is the sequence
// [PRESENTED, PASSED|NEEDS_INFO|REJECTED], which NEXT validates step by step.
export const STAGE_AFTER: Record<StageEventKind, PresentationStage> = {
  PRESENTED: 'IN_REVIEW',
  NEEDS_INFO: 'NEEDS_INFO',
  INFO_SENT: 'IN_REVIEW',
  PASSED: 'PASSED',
  REJECTED: 'REJECTED',
  WITHDRAWN: 'WITHDRAWN',
  REPITCH: 'AWAITING',
}

export const STAGE_EVENT_KINDS: StageEventKind[] = ['PRESENTED', 'NEEDS_INFO', 'INFO_SENT', 'PASSED', 'REJECTED', 'WITHDRAWN', 'REPITCH']
export const EVENT_KINDS: EventKind[] = [...STAGE_EVENT_KINDS, 'CREATED', 'SCHEDULED', 'REVERTED', 'EDITED']

const STAGE_KINDS = new Set<EventKind>(STAGE_EVENT_KINDS)
const KNOWN_KINDS = new Set<string>(EVENT_KINDS)

export const isStageKind = (kind: EventKind): kind is StageEventKind => STAGE_KINDS.has(kind)
export const isStageEvent = (e: TrackEvent): e is EventOf<StageEventKind> => STAGE_KINDS.has(e.kind)
export const isEditableKind = (kind: EventKind): kind is EditableKind => kind !== 'REVERTED' && kind !== 'EDITED'

/** One step may go to several tracks at once only as "ยังไม่ทราบผล" (PRESENTED alone) or "ผ่าน" with every SKU. */
export function bulkStepAllowed(events: StageEvent[]) {
  return events.every((e) => e.kind === 'PRESENTED' || (e.kind === 'PASSED' && e.acceptedProductIds === null))
}

const PRESENTED_OUTCOMES: StageEventKind[] = ['NEEDS_INFO', 'PASSED', 'REJECTED']

/**
 * The steps one record call may append (what the dialogs send): a single step, or "นำเสนอแล้ว" with its
 * outcome — [PRESENTED, NEEDS_INFO | PASSED | REJECTED] (NEXT limits that to AWAITING). One call is one
 * activity entry and at most one team notice, so a longer chain would hide its earlier outcomes.
 */
export function recordStepsAllowed(events: Pick<StageEvent, 'kind'>[]) {
  if (events.length === 1) return true
  return events.length === 2 && events[0].kind === 'PRESENTED' && PRESENTED_OUTCOMES.includes(events[1].kind)
}

/**
 * A partial pass measured against the proposal's SKUs as they are now: accepted SKUs still in the proposal, of
 * all of them. null = every current SKU was accepted (or `acceptedProductIds` is null: every SKU).
 */
export function acceptedSkus(acceptedProductIds: string[] | null | undefined, productIds: string[]): { count: number; total: number } | null {
  if (!Array.isArray(acceptedProductIds) || productIds.length === 0) return null
  const count = productIds.filter((id) => acceptedProductIds.includes(id)).length
  return count < productIds.length ? { count, total: productIds.length } : null
}

/** The SKUs a pass accepted, of the proposal's current ones in proposal order (same rule as acceptedSkus: null = every SKU). */
export function acceptedProductIdsOf(acceptedProductIds: string[] | null | undefined, productIds: string[]): string[] {
  if (!Array.isArray(acceptedProductIds)) return [...productIds]
  return productIds.filter((id) => acceptedProductIds.includes(id))
}

// ---------- labels ----------

/** Event names (EDITED entries: แก้ไขรายละเอียด “{label}”). */
export const EVENT_LABEL: Record<EventKind, string> = {
  CREATED: 'เพิ่มเข้าชุดนำเสนอ',
  SCHEDULED: 'นัดนำเสนอ',
  PRESENTED: 'นำเสนอแล้ว',
  NEEDS_INFO: 'ต้องการข้อมูลเพิ่ม',
  INFO_SENT: 'ส่งข้อมูลเพิ่ม',
  PASSED: 'ผ่าน',
  REJECTED: 'ไม่ผ่าน',
  WITHDRAWN: 'ยุตินำเสนอ',
  REPITCH: 'นำเสนอใหม่',
  REVERTED: 'ย้อนกลับ',
  EDITED: 'แก้ไขรายละเอียด',
}

/** Payload fields an EDITED patch may change, per kind. */
export const EDITABLE_FIELDS: Record<EditableKind, readonly string[]> = {
  CREATED: ['meetingDate', 'presenterIds'],
  SCHEDULED: ['meetingDate', 'presenterIds', 'contactName'],
  PRESENTED: ['date', 'contactName', 'expectedResultDate', 'note'],
  NEEDS_INFO: ['date', 'request', 'dueDate', 'preparerId'],
  INFO_SENT: ['date', 'sentWhat', 'expectedResultDate'],
  PASSED: ['date', 'acceptedProductIds', 'notAcceptedNote', 'note'],
  REJECTED: ['date', 'reason', 'detail'],
  WITHDRAWN: ['date', 'reason'],
  REPITCH: ['tasks', 'changes', 'meetingDate', 'presenterIds'],
}

const FIELD_LABEL: Record<string, string> = {
  contactName: 'ชื่อ Buyer / ผู้ติดต่อ',
  expectedResultDate: 'คาดว่าจะทราบผลภายใน',
  note: 'หมายเหตุ',
  request: 'ข้อมูลที่ Buyer ต้องการ',
  dueDate: 'ต้องส่งภายใน',
  preparerId: 'ผู้เตรียมข้อมูล',
  sentWhat: 'ส่งอะไรไปบ้าง',
  acceptedProductIds: 'สินค้าที่ Buyer รับ',
  notAcceptedNote: 'เหตุผลที่ไม่รับสินค้าที่เหลือ',
  detail: 'ทำไมถึงไม่ผ่าน',
  tasks: 'งานที่ใช้นำเสนอ',
  changes: 'ปรับอะไรจากครั้งก่อน',
  meetingDate: 'วันนัดนำเสนอ',
  presenterIds: 'ผู้นำเสนอ',
}

const DATE_LABEL: Partial<Record<EventKind, string>> = {
  PRESENTED: 'วันที่นำเสนอ',
  NEEDS_INFO: 'วันที่ได้รับคำขอ',
  INFO_SENT: 'วันที่ส่ง',
  PASSED: 'วันที่ได้รับผล',
  REJECTED: 'วันที่ได้รับผล',
  WITHDRAWN: 'วันที่',
}

/** Thai label of an event field (as named in the dialogs). */
export function fieldLabel(kind: EventKind, field: string) {
  if (field === 'date') return DATE_LABEL[kind] ?? 'วันที่'
  if (field === 'reason') return kind === 'REJECTED' ? 'เหตุผลหลัก' : 'เหตุผล'
  if (field === 'note' && kind === 'PASSED') return 'เงื่อนไข / หมายเหตุ'
  return FIELD_LABEL[field] ?? field
}

// ---------- errors (Thai copy, §5) ----------

/** Formats a business date inside a message. */
export type DateText = (date: ISODate) => string

/** The error copy with dates written by `date`: the web passes its formatDate (the viewer's BE/CE choice). */
export function presentationErrors(date: DateText) {
  return {
    dateRequired: 'เลือกวันที่',
    dateFuture: 'วันที่ต้องไม่เกินวันนี้',
    presentedFuture: 'วันที่นำเสนอต้องไม่เกินวันนี้ — ถ้ายังไม่ถึงวัน ให้ใช้ “นัดวันนำเสนอ”',
    beforePresented: (d: ISODate) => `วันที่ต้องไม่ก่อนวันที่นำเสนอ (${date(d)})`,
    sentBeforeRequest: (d: ISODate) => `วันที่ส่งต้องไม่ก่อนวันที่ Buyer ขอข้อมูล (${date(d)})`,
    dueBeforeRequest: 'วันส่งต้องไม่ก่อนวันที่ได้รับคำขอ',
    expectedBefore: (d: ISODate) => `วันที่คาดว่าจะทราบผลต้องไม่ก่อน ${date(d)}`,
    reason: 'เลือกเหตุผลที่ไม่ผ่าน',
    detail: 'กรุณาระบุว่าทำไมถึงไม่ผ่าน',
    request: 'กรุณาระบุว่า Buyer ต้องการข้อมูลอะไรเพิ่ม',
    skuNone: 'ถ้า Buyer ไม่รับทุกรายการ ให้เลือก “ไม่ผ่าน”',
    skuNote: 'กรุณาระบุเหตุผลที่ไม่รับสินค้าที่เหลือ',
    withdrawReason: 'กรุณาระบุเหตุผลที่ยุติการนำเสนอ',
    repitchChanges: 'กรุณาระบุว่าปรับอะไรจากครั้งก่อน',
    tasks: 'เลือกงานอย่างน้อย 1 งาน',
    stores: (word: string) => `เลือก${word}อย่างน้อย 1 ${word}`,
    tooLong: (max: number) => `ยาวเกิน ${max} ตัวอักษร`,
    /** An edited date no longer fits a later step. */
    conflict: (label: string, d: ISODate) => `วันที่ขัดกับขั้น “${label}” (${date(d)})`,
    stale: (store: string) => `ขั้นตอนของ ${store} เปลี่ยนไปแล้ว — โหลดข้อมูลล่าสุดให้แล้ว ลองอีกครั้ง`,
    gone: 'ข้อมูลนี้เปลี่ยนไปแล้ว — โหลดข้อมูลล่าสุดให้แล้ว ลองอีกครั้ง',
    gate: (p: { done: number; total: number }) => `งานเตรียมยังไม่ครบ (${p.done}/${p.total}) — ทำให้ครบก่อนจึงจะสร้างชุดนำเสนอได้`,
    readOnly: 'เฉพาะเจ้าของและทีมงานบันทึกขั้นตอนได้',
    finalOnly: 'เฉพาะเจ้าของโปรเจกต์หรือผู้จัดการ',
    removeTouched: 'บันทึกขั้นตอนแล้ว นำออกไม่ได้ — ใช้ “ย้อนกลับขั้นก่อนหน้า” แทน',
    deleteBlocked: (word: string) => `มี${word}ที่บันทึกขั้นตอนแล้ว ลบไม่ได้ — ใช้ “ย้อนกลับขั้นก่อนหน้า” แทน`,
    alreadyTracked: (names: string) => `${names} อยู่ในชุดนำเสนออยู่แล้ว`,
    bulk: (word: string) => `ถ้าผลเป็น “ต้องการข้อมูลเพิ่ม” หรือ “ไม่ผ่าน” ให้บันทึกทีละ${word} เพราะ Buyer แต่ละ${word}ให้เหตุผลต่างกัน`,
  }
}

export type PresentationErrors = ReturnType<typeof presentationErrors>

/** Dates as "15 ต.ค. 69" (formatThaiDate): the copy the API answers with. */
export const ERR: PresentationErrors = presentationErrors(formatThaiDate)

// ---------- permissions ----------

type Actor = Pick<User, 'id' | 'role'>
type ProposalLike = Pick<Proposal, 'status' | 'ownerId' | 'memberIds'>

/** Owner, members, MANAGER, ADMIN: create packages, schedule, record steps, re-pitch, revert / edit non-final events, remove untouched stores. */
export const canRecordPresentation = (me: Actor | null | undefined, p: ProposalLike) => p.status !== 'CANCELLED' && canManageTasks(me, p)

/** Owner, MANAGER, ADMIN: revert / edit PASSED · REJECTED · WITHDRAWN, withdraw a store, close the project out. */
export const canFinalizePresentation = (me: Actor | null | undefined, p: ProposalLike) => p.status !== 'CANCELLED' && canEditProposal(me, p)

const FINALIZE_KINDS: ReadonlySet<EventKind> = new Set<EventKind>(['PASSED', 'REJECTED', 'WITHDRAWN'])

/** Reverting or editing an event of this kind needs canFinalize. */
export const needsFinalize = (kind: EventKind) => FINALIZE_KINDS.has(kind)

/** May the viewer revert / edit an event of this kind? */
export function canChangeEvent(kind: EventKind, perms: { canRecord: boolean; canFinalize: boolean }) {
  return needsFinalize(kind) ? perms.canFinalize : perms.canRecord
}

// ---------- gate, snapshots ----------

/** Prep gate: every task done (and at least one task). */
export function canStartPresentation(progress: Pick<Progress, 'done' | 'total'>) {
  return progress.total > 0 && progress.done === progress.total
}

export function storeSnapshot(store: Pick<Store, 'id' | 'name' | 'shortName' | 'color'>): StoreSnapshot {
  return { id: store.id, name: store.name, shortName: store.shortName, color: store.color }
}

/** Freeze a level-1 task for a package / re-pitch. */
export function toPackageTask(task: Pick<Task, 'id' | 'title' | 'completedAt' | 'descriptionFormat' | 'detailFields'>): PackageTask {
  const fields = task.descriptionFormat === 'FIELDS' ? detailFieldsProgress(task.detailFields) : { filled: 0, total: 0 }
  return { taskId: task.id, title: task.title, completedAt: task.completedAt, fieldsFilled: fields.filled, fieldsTotal: fields.total }
}

export function emptyData(proposalId: string): PresentationData {
  return { version: 1, proposalId, packages: [], tracks: [] }
}

export function nextPackageSeq(data: PresentationData) {
  return data.packages.reduce((max, p) => Math.max(max, p.seq), 0) + 1
}

// ---------- parsing (anything unknown or garbled is dropped) ----------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const strOrNull = (v: unknown) => (isStr(v) ? v : null)
const strList = (v: unknown) => (Array.isArray(v) ? v.filter(isStr) : [])
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

function parsePackageTasks(v: unknown): PackageTask[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((t): t is Record<string, unknown> => isObj(t) && isStr(t.taskId) && isStr(t.title))
    .map((t) => ({ taskId: t.taskId as string, title: t.title as string, completedAt: strOrNull(t.completedAt), fieldsFilled: num(t.fieldsFilled), fieldsTotal: num(t.fieldsTotal) }))
}

/** Stored JSON → one event (id, actorId, recordedAt, kind and the payload fields flat), or null when unusable. */
export function parseEvent(v: unknown): TrackEvent | null {
  if (!isObj(v) || !isStr(v.id) || !isStr(v.kind) || !KNOWN_KINDS.has(v.kind)) return null
  const base = { id: v.id, actorId: isStr(v.actorId) ? v.actorId : '', recordedAt: isStr(v.recordedAt) ? v.recordedAt : '' }
  const kind = v.kind as EventKind
  const needsDate = kind === 'PRESENTED' || kind === 'NEEDS_INFO' || kind === 'INFO_SENT' || kind === 'PASSED' || kind === 'REJECTED' || kind === 'WITHDRAWN'
  if (needsDate && !isStr(v.date)) return null
  const date = v.date as ISODate
  switch (kind) {
    case 'CREATED':
      return { ...base, kind, packageId: isStr(v.packageId) ? v.packageId : '', meetingDate: strOrNull(v.meetingDate), presenterIds: strList(v.presenterIds) }
    case 'SCHEDULED':
      return { ...base, kind, meetingDate: strOrNull(v.meetingDate), presenterIds: strList(v.presenterIds), contactName: strOrNull(v.contactName) }
    case 'PRESENTED':
      return { ...base, kind, date, contactName: strOrNull(v.contactName), expectedResultDate: strOrNull(v.expectedResultDate), note: strOrNull(v.note) }
    case 'NEEDS_INFO':
      return { ...base, kind, date, request: isStr(v.request) ? v.request : '', dueDate: strOrNull(v.dueDate), preparerId: strOrNull(v.preparerId) }
    case 'INFO_SENT':
      return { ...base, kind, date, sentWhat: strOrNull(v.sentWhat), expectedResultDate: strOrNull(v.expectedResultDate) }
    case 'PASSED':
      return { ...base, kind, date, acceptedProductIds: Array.isArray(v.acceptedProductIds) ? strList(v.acceptedProductIds) : null, notAcceptedNote: strOrNull(v.notAcceptedNote), note: strOrNull(v.note) }
    case 'REJECTED':
      return { ...base, kind, date, reason: REJECT_REASONS.includes(v.reason as RejectReason) ? (v.reason as RejectReason) : 'OTHER', detail: isStr(v.detail) ? v.detail : '' }
    case 'WITHDRAWN':
      return { ...base, kind, date, reason: isStr(v.reason) ? v.reason : '' }
    case 'REPITCH':
      return { ...base, kind, tasks: parsePackageTasks(v.tasks), changes: isStr(v.changes) ? v.changes : '', meetingDate: strOrNull(v.meetingDate), presenterIds: strList(v.presenterIds) }
    case 'REVERTED':
      return isStr(v.targetEventId) ? { ...base, kind, targetEventId: v.targetEventId } : null
    case 'EDITED':
      return isStr(v.targetEventId) && isObj(v.patch) ? { ...base, kind, targetEventId: v.targetEventId, patch: v.patch as EventPatch } : null
  }
}

/** Stored JSON → PresentationData. Unknown versions or shapes give empty data; bad rows are dropped. */
export function parseData(raw: unknown, proposalId: string): PresentationData {
  if (!isObj(raw) || raw.version !== 1 || !Array.isArray(raw.packages) || !Array.isArray(raw.tracks)) return emptyData(proposalId)
  const packages: PresentationPackage[] = []
  for (const p of raw.packages) {
    if (!isObj(p) || !isStr(p.id) || packages.some((x) => x.id === p.id)) continue
    packages.push({
      id: p.id,
      proposalId,
      seq: num(p.seq) || packages.length + 1,
      tasks: parsePackageTasks(p.tasks),
      note: strOrNull(p.note),
      createdById: isStr(p.createdById) ? p.createdById : '',
      createdAt: isStr(p.createdAt) ? p.createdAt : '',
    })
  }
  const tracks: StoreTrack[] = []
  for (const t of raw.tracks) {
    if (!isObj(t) || !isStr(t.id) || !isStr(t.packageId) || !isObj(t.store) || !isStr(t.store.id) || !Array.isArray(t.events)) continue
    if (!packages.some((p) => p.id === t.packageId)) continue
    const s = t.store
    // One track per store, ever — keep the first.
    if (tracks.some((x) => x.id === t.id || x.store.id === s.id)) continue
    tracks.push({
      id: t.id,
      proposalId,
      packageId: t.packageId,
      store: { id: s.id as string, name: isStr(s.name) ? s.name : '—', shortName: isStr(s.shortName) ? s.shortName : '?', color: isStr(s.color) ? s.color : '#64748b' },
      events: t.events.map(parseEvent).filter((e): e is TrackEvent => !!e),
    })
  }
  return { version: 1, proposalId, packages, tracks }
}

// ---------- reducer ----------

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

function applyPatch<T extends TrackEvent>(event: T, patch: EventPatch | undefined): T {
  const kind: EventKind = event.kind
  if (!isEditableKind(kind) || !isObj(patch)) return event
  const out: Record<string, unknown> = { ...event }
  for (const k of EDITABLE_FIELDS[kind]) if (Object.hasOwn(patch, k)) out[k] = (patch as Record<string, unknown>)[k]
  return out as T
}

function editChanges(before: TrackEvent, after: TrackEvent): EditChange[] {
  const kind = before.kind
  if (!isEditableKind(kind)) return []
  const b = before as unknown as Record<string, unknown>
  const a = after as unknown as Record<string, unknown>
  return EDITABLE_FIELDS[kind].filter((k) => !same(b[k], a[k])).map((k) => ({ field: k, label: fieldLabel(kind, k), before: b[k], after: a[k] }))
}

/** The patch that turns `before` into `after`: allowed fields only, unchanged ones left out. */
export function diffPatch(before: TrackEvent, after: object): EventPatch {
  const kind = before.kind
  if (!isEditableKind(kind)) return {}
  const b = before as unknown as Record<string, unknown>
  const a = after as Record<string, unknown>
  const patch: Record<string, unknown> = {}
  for (const k of EDITABLE_FIELDS[kind]) if (Object.hasOwn(a, k) && !same(a[k], b[k])) patch[k] = a[k]
  return patch as EventPatch
}

export const isEmptyPatch = (patch: EventPatch) => Object.keys(patch).length === 0

interface Folded {
  effective: Map<string, TrackEvent>
  reverted: Set<string>
  edited: Set<string>
  edits: Map<string, { target: TrackEvent; changes: EditChange[] }>
}

function foldEvents(events: TrackEvent[]): Folded {
  const byId = new Map(events.map((e) => [e.id, e]))
  const reverted = new Set<string>()
  for (const e of events) {
    if (e.kind !== 'REVERTED') continue
    const target = byId.get(e.targetEventId)
    if (target && isStageEvent(target)) reverted.add(target.id)
  }
  const effective = new Map(byId)
  const edited = new Set<string>()
  const edits = new Map<string, { target: TrackEvent; changes: EditChange[] }>()
  for (const e of events) {
    if (e.kind !== 'EDITED') continue
    const current = effective.get(e.targetEventId)
    if (!current || !isEditableKind(current.kind)) continue
    const next = applyPatch(current, e.patch)
    edits.set(e.id, { target: current, changes: editChanges(current, next) })
    effective.set(current.id, next)
    edited.add(current.id)
  }
  return { effective, reverted, edited, edits }
}

/** Effective (patched) stage events that were not reverted, oldest first. */
function liveStageEvents(events: TrackEvent[], f: Folded): EventOf<StageEventKind>[] {
  return events.filter(isStageEvent).filter((e) => !f.reverted.has(e.id)).map((e) => (f.effective.get(e.id) as EventOf<StageEventKind>) ?? e)
}

export interface ReduceContext {
  /** Without it every track counts as in the proposal and the frozen store look is used. */
  proposal?: PresentationProposal | null
  packages: PresentationPackage[]
}

export function reduceTrack(track: StoreTrack, ctx: ReduceContext): TrackView {
  const { events } = track
  const f = foldEvents(events)
  const eff = <T extends TrackEvent>(e: T): T => (f.effective.get(e.id) as T | undefined) ?? e

  // Rounds use the final revert set; revert labels replay the stack as it was at the time.
  let round = 1
  const stack: EventOf<StageEventKind>[] = []
  const timeline: TimelineItem[] = []
  for (const e of events) {
    const reverted = f.reverted.has(e.id)
    if (isStageEvent(e)) {
      if (!reverted && (e.kind === 'INFO_SENT' || e.kind === 'REPITCH')) round++
      stack.push(e)
    }
    let revert: TimelineItem['revert'] = null
    if (e.kind === 'REVERTED') {
      const i = stack.findLastIndex((s) => s.id === e.targetEventId)
      if (i >= 0) {
        const target = stack[i]
        stack.splice(i, 1)
        const top = stack.at(-1)
        revert = { target: eff(target), from: STAGE_AFTER[target.kind], to: top ? STAGE_AFTER[top.kind] : 'AWAITING' }
      }
    }
    timeline.push({ event: e, effective: eff(e), round, reverted, edited: f.edited.has(e.id), revert, edit: e.kind === 'EDITED' ? (f.edits.get(e.id) ?? null) : null })
  }

  const live = liveStageEvents(events, f)
  const last = live.at(-1) ?? null
  const prev = live.at(-2) ?? null
  const stage: PresentationStage = last ? STAGE_AFTER[last.kind] : 'AWAITING'
  const revertTo: PresentationStage | null = last ? (prev ? STAGE_AFTER[prev.kind] : 'AWAITING') : null

  const plan: TrackPlan = { meetingDate: null, presenterIds: [], contactName: null }
  for (const raw of events) {
    if (f.reverted.has(raw.id)) continue
    const e = eff(raw)
    if (e.kind === 'CREATED' || e.kind === 'REPITCH') {
      plan.meetingDate = e.meetingDate
      plan.presenterIds = e.presenterIds
    } else if (e.kind === 'SCHEDULED') {
      plan.meetingDate = e.meetingDate
      plan.presenterIds = e.presenterIds
      plan.contactName = e.contactName
    } else if (e.kind === 'PRESENTED' && e.contactName) {
      plan.contactName = e.contactName
    }
  }

  const presented = live.findLast((e) => e.kind === 'PRESENTED')
  const expectedFrom = live.findLast((e) => e.kind === 'PRESENTED' || e.kind === 'INFO_SENT')
  const repitchIndex = live.findLastIndex((e) => e.kind === 'REPITCH')
  const repitch = repitchIndex >= 0 ? (live[repitchIndex] as EventOf<'REPITCH'>) : null
  const outcome = last && (last.kind === 'PASSED' || last.kind === 'REJECTED' || last.kind === 'WITHDRAWN') ? last : null

  const storeIndex = ctx.proposal ? ctx.proposal.stores.findIndex((s) => s.id === track.store.id) : -1
  const liveStore = ctx.proposal && storeIndex >= 0 ? ctx.proposal.stores[storeIndex] : null
  const pkg = ctx.packages.find((p) => p.id === track.packageId) ?? null
  // Against today's SKUs: a SKU dropped from the proposal since no longer counts, one added since was not accepted.
  const accepted = outcome?.kind === 'PASSED' && ctx.proposal ? acceptedSkus(outcome.acceptedProductIds, ctx.proposal.productIds) : null

  const kindOf = new Map(events.map((e) => [e.id, e.kind]))
  const untouched = events.every((e) => e.kind === 'CREATED' || e.kind === 'SCHEDULED' || (e.kind === 'EDITED' && ['CREATED', 'SCHEDULED'].includes(kindOf.get(e.targetEventId) ?? '')))
  const latestEditable = events.findLast((e) => isEditableKind(e.kind) && !f.reverted.has(e.id))

  return {
    track,
    store: liveStore ? storeSnapshot(liveStore) : track.store,
    inProposal: !ctx.proposal || storeIndex >= 0,
    storeIndex,
    package: pkg,
    packageSeq: pkg?.seq ?? 0,
    stage,
    round,
    plan,
    presentedDate: presented?.kind === 'PRESENTED' ? presented.date : null,
    expectedResultDate: expectedFrom && (expectedFrom.kind === 'PRESENTED' || expectedFrom.kind === 'INFO_SENT') ? expectedFrom.expectedResultDate : null,
    reviewSince: expectedFrom && (expectedFrom.kind === 'PRESENTED' || expectedFrom.kind === 'INFO_SENT') ? expectedFrom.date : null,
    openRequest: last?.kind === 'NEEDS_INFO' ? last : null,
    outcome,
    accepted,
    lastRevertable: last,
    revertTo,
    latestEditable: latestEditable ? eff(latestEditable) : null,
    withdrawnFrom: stage === 'WITHDRAWN' ? revertTo : null,
    repitch,
    needsInfoCount: live.slice(repitchIndex + 1).filter((e) => e.kind === 'NEEDS_INFO').length,
    bundle: repitch?.tasks ?? pkg?.tasks ?? [],
    untouched,
    timeline,
  }
}

/** Every track reduced, in proposal store order; tracks of stores that left the proposal appended. */
export function buildViews(data: PresentationData | undefined, proposal?: ReduceContext['proposal']): TrackView[] {
  if (!data) return []
  const views = data.tracks.map((t) => reduceTrack(t, { proposal, packages: data.packages }))
  const offset = proposal?.stores.length ?? 0
  return views
    .map((v, i) => ({ v, key: v.storeIndex >= 0 ? v.storeIndex : offset + i }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.v)
}

export function summarize(views: TrackView[], proposal: Pick<PresentationProposal, 'stores'>): PresentationSummary {
  const byStage: Record<PresentationStage, number> = { AWAITING: 0, IN_REVIEW: 0, NEEDS_INFO: 0, PASSED: 0, REJECTED: 0, WITHDRAWN: 0 }
  const inside = views.filter((v) => v.inProposal)
  for (const v of inside) byStage[v.stage]++
  const trackedIds = new Set(inside.map((v) => v.store.id))
  const untracked = proposal.stores.filter((s) => !trackedIds.has(s.id)).map(storeSnapshot)
  const finalCount = byStage.PASSED + byStage.REJECTED + byStage.WITHDRAWN
  return {
    storesTotal: proposal.stores.length,
    tracked: inside.length,
    untracked,
    byStage,
    waitingOnUs: byStage.AWAITING + byStage.NEEDS_INFO,
    finalCount,
    passed: byStage.PASSED,
    rejected: byStage.REJECTED,
    withdrawn: byStage.WITHDRAWN,
    allFinal: proposal.stores.length > 0 && untracked.length === 0 && finalCount === inside.length,
    hasTracks: views.length > 0,
  }
}

// ---------- validation (the record / schedule / re-pitch / withdraw dialogs and the API) ----------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const isDate = (v: unknown): v is ISODate => isStr(v) && ISO_DATE.test(v)
const blank = (v: unknown) => !isStr(v) || v.trim() === ''

interface SeqContext {
  lastPresented: ISODate | null
  lastRequest: ISODate | null
  today: ISODate
  productCount: number
  err: PresentationErrors
}

function startContext(view: TrackView, today: ISODate, productCount: number, err: PresentationErrors): SeqContext {
  return { lastPresented: view.presentedDate, lastRequest: view.openRequest?.date ?? null, today, productCount, err }
}

function advance(c: SeqContext, e: StageEvent | MetaEvent) {
  if (e.kind === 'PRESENTED' && isDate(e.date)) c.lastPresented = e.date
  if (e.kind === 'NEEDS_INFO' && isDate(e.date)) c.lastRequest = e.date
}

/** Field rules of one event (§3.3), given what came before it. Keys are the event's payload fields. */
function eventErrors(e: StageEvent | MetaEvent, c: SeqContext): FieldErrors {
  const { err } = c
  const out: FieldErrors = {}
  const put = (k: string, msg: string) => {
    out[k] ??= msg
  }
  const text = (k: string, v: unknown, max: number) => {
    if (isStr(v) && v.trim().length > max) put(k, err.tooLong(max))
  }
  const decided = (date: unknown) => {
    if (!isDate(date)) put('date', err.dateRequired)
    else if (c.lastPresented && date < c.lastPresented) put('date', err.beforePresented(c.lastPresented))
    else if (date > c.today) put('date', err.dateFuture)
  }
  const expected = (date: unknown, exp: unknown) => {
    if (isDate(date) && isStr(exp) && exp && exp < date) put('expectedResultDate', err.expectedBefore(date))
  }
  switch (e.kind) {
    case 'PRESENTED':
      if (!isDate(e.date)) put('date', err.dateRequired)
      else if (e.date > c.today) put('date', err.presentedFuture)
      text('contactName', e.contactName, NAME_MAX)
      expected(e.date, e.expectedResultDate)
      text('note', e.note, NOTE_MAX)
      break
    case 'NEEDS_INFO':
      decided(e.date)
      if (blank(e.request)) put('request', err.request)
      text('request', e.request, NOTE_MAX)
      if (isDate(e.date) && e.dueDate && e.dueDate < e.date) put('dueDate', err.dueBeforeRequest)
      break
    case 'INFO_SENT':
      if (!isDate(e.date)) put('date', err.dateRequired)
      else if (c.lastRequest && e.date < c.lastRequest) put('date', err.sentBeforeRequest(c.lastRequest))
      else if (e.date > c.today) put('date', err.dateFuture)
      text('sentWhat', e.sentWhat, NOTE_MAX)
      expected(e.date, e.expectedResultDate)
      break
    case 'PASSED':
      decided(e.date)
      // New passes carry the explicit SKU list (the API turns null into it), so an empty list is "nothing accepted".
      if (Array.isArray(e.acceptedProductIds)) {
        if (e.acceptedProductIds.length === 0) put('acceptedProductIds', err.skuNone)
        else if (c.productCount > 1 && e.acceptedProductIds.length < c.productCount && blank(e.notAcceptedNote)) put('notAcceptedNote', err.skuNote)
      }
      text('notAcceptedNote', e.notAcceptedNote, NOTE_MAX)
      text('note', e.note, NOTE_MAX)
      break
    case 'REJECTED':
      decided(e.date)
      if (!REJECT_REASONS.includes(e.reason)) put('reason', err.reason)
      if (blank(e.detail)) put('detail', err.detail)
      text('detail', e.detail, NOTE_MAX)
      break
    case 'WITHDRAWN':
      if (!isDate(e.date)) put('date', err.dateRequired)
      else if (e.date > c.today) put('date', err.dateFuture)
      if (blank(e.reason)) put('reason', err.withdrawReason)
      text('reason', e.reason, NOTE_MAX)
      break
    case 'REPITCH':
      if (!Array.isArray(e.tasks) || e.tasks.length === 0) put('tasks', err.tasks)
      if (blank(e.changes)) put('changes', err.repitchChanges)
      text('changes', e.changes, NOTE_MAX)
      break
    case 'SCHEDULED':
      text('contactName', e.contactName, NAME_MAX)
      break
  }
  return out
}

/** Errors of one new event appended to the track now (schedule / re-pitch / withdraw dialogs). */
export function validateEvent(view: TrackView, event: StageEvent | MetaEvent, today: ISODate, productCount: number, err: PresentationErrors = ERR): FieldErrors {
  return eventErrors(event, startContext(view, today, productCount, err))
}

/** Field errors of events appended in one go, one entry per event: each is checked against the steps before it. */
export function appendErrors(view: TrackView, events: (StageEvent | MetaEvent)[], today: ISODate, productCount: number, err: PresentationErrors = ERR): FieldErrors[] {
  const c = startContext(view, today, productCount, err)
  return events.map((e) => {
    const out = eventErrors(e, c)
    advance(c, e)
    return out
  })
}

/**
 * Server-side check of events appended in one go: each step must be allowed by NEXT from the stage
 * reached so far, and pass its field rules. Returns the first problem, or null.
 */
export function checkAppend(view: TrackView, events: StageEvent[], today: ISODate, productCount: number, err: PresentationErrors = ERR): string | null {
  let stage = view.stage
  const c = startContext(view, today, productCount, err)
  for (const e of events) {
    if (!NEXT[stage].includes(e.kind)) return err.stale(view.store.name)
    const first = Object.values(eventErrors(e, c)).find(Boolean)
    if (first) return first
    advance(c, e)
    stage = STAGE_AFTER[e.kind]
  }
  return null
}

/** Field rules over a track's whole effective history: [event id, field, message]. */
function historyErrors(track: StoreTrack, today: ISODate, productCount: number, err: PresentationErrors) {
  const f = foldEvents(track.events)
  const c: SeqContext = { lastPresented: null, lastRequest: null, today, productCount, err }
  const out: { event: TrackEvent; field: string; message: string }[] = []
  for (const raw of track.events) {
    if (f.reverted.has(raw.id) || !isEditableKind(raw.kind)) continue
    const e = f.effective.get(raw.id) ?? raw
    for (const [field, message] of Object.entries(eventErrors(e, c))) if (message) out.push({ event: e, field, message })
    advance(c, e)
  }
  return out
}

/** Other payload fields a rule reads besides its own key: an edit of any of them re-checks it. */
const RULE_INPUTS: Record<string, string[]> = { notAcceptedNote: ['acceptedProductIds'], expectedResultDate: ['date'], dueDate: ['date'] }

/**
 * Errors of an edit (keys = the event's payload fields). Dates are revalidated against the neighbouring
 * events: a later step that stops fitting is reported on the edited event's `date`.
 */
export function validateEdit(view: TrackView, targetEventId: string, patch: EventPatch, today: ISODate, productCount: number, err: PresentationErrors = ERR): FieldErrors {
  const target = view.track.events.find((e) => e.id === targetEventId)
  const item = view.timeline.find((i) => i.event.id === targetEventId)
  if (!target || !item || item.reverted || !isEditableKind(target.kind)) return { date: err.gone }
  const edit: TrackEvent = { id: '__edit__', actorId: '', recordedAt: '', kind: 'EDITED', targetEventId, patch }
  const before = historyErrors(view.track, today, productCount, err)
  const after = historyErrors({ ...view.track, events: [...view.track.events, edit] }, today, productCount, err)
  const touched = (field: string) => [field, ...(RULE_INPUTS[field] ?? [])].some((k) => Object.hasOwn(patch, k))
  const out: FieldErrors = {}
  for (const e of after) {
    const old = before.some((b) => b.event.id === e.event.id && b.field === e.field)
    // A problem the edited event already had (e.g. SKUs added after the pass) only blocks an edit that touches it.
    if (e.event.id === targetEventId) {
      if (!old || touched(e.field)) out[e.field] ??= e.message
    } else if (!old) {
      const date = 'date' in e.event ? e.event.date : null
      out.date ??= date ? err.conflict(EVENT_LABEL[e.event.kind], date) : e.message
    }
  }
  return out
}

/** Create-dialog rules (keys: tasks, stores, note). */
export function validatePackage(input: { taskCount: number; storeCount: number; note: string | null }, word: string): FieldErrors {
  const out: FieldErrors = {}
  if (input.taskCount < 1) out.tasks = ERR.tasks
  if (input.storeCount < 1) out.stores = ERR.stores(word)
  if (input.note && input.note.trim().length > NOTE_MAX) out.note = ERR.tooLong(NOTE_MAX)
  return out
}
