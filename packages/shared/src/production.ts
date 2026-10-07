// "รอผลิต" production step after a buyer pass: the persisted shapes, which SKUs are shown (derived from PASSED
// presentation tracks), deadline math, the status transitions, validation, error copy and who may write. The API,
// the home builder and the web run the same rules from here. No clock reads — `today` always comes in as an argument.
import { formatThaiDate } from './labels.js'
import { canEditProposal, canManageTasks } from './permissions.js'
import { acceptedProductIdsOf, NOTE_MAX, type DateText, type StoreSnapshot, type TrackView } from './presentation.js'
import { addDays, diffDays } from './task-tree.js'
import type { ISODate, ISODateTime, Product, Proposal, User } from './types.js'

// ---------- persisted shapes ----------

export type ProductionStatus = 'PENDING' | 'IN_PRODUCTION' | 'PRODUCED' | 'DELIVERED' | 'CANCELLED'
/** Why a confirmed SKU needs the owner / a manager to look again. */
export type ProductionFlag = 'NOT_PASSED' | 'NOT_IN_PROPOSAL' | 'STORES_CHANGED'
export type ProductionEventKind = 'QUANTITY' | 'PLAN' | 'CONFIRM' | 'ADVANCE' | 'BACK' | 'DATES' | 'CANCEL' | 'RESTORE' | 'KEEP'
/** NONE = nothing passed and no item; CANCELLED = only cancelled / skipped rows. */
export type ProductionState = 'NONE' | 'PENDING' | 'ACTIVE' | 'DONE' | 'CANCELLED'

export interface ProductionPlan {
  leadDays: number
  note: string | null
  /** No production_plans row yet (14 days, no note). */
  isDefault: boolean
  updatedById: string | null
  updatedAt: ISODateTime | null
}

/** A production_items row as the API sends it. */
export interface ProductionItem {
  id: string
  productId: string
  /** null only while PENDING, or on a skipped SKU (CANCELLED, never confirmed). */
  quantity: number | null
  status: ProductionStatus
  /** The real press of "ยืนยันเริ่มผลิต"; null = never confirmed. */
  confirmedAt: ISODateTime | null
  confirmedById: string | null
  /** Production start (business date); may be earlier than confirmedAt. */
  startedOn: ISODate | null
  producedOn: ISODate | null
  producedById: string | null
  deliveredOn: ISODate | null
  deliveredById: string | null
  /** The deadline frozen at delivery (DELIVERED only). */
  dueOn: ISODate | null
  cancelledAt: ISODateTime | null
  cancelledById: string | null
  cancelReason: string | null
  /** Who / when last acknowledged a passing-store change ("ผลิตต่อ" / "จำนวนเดิมใช้ได้"). */
  keptAt: ISODateTime | null
  keptById: string | null
  /** The passing stores the confirmed quantity was decided for; [] while PENDING. */
  ackStoreIds: string[]
  updatedAt: ISODateTime
}

/** What deriveProduction reads of an item (the home builder loads only these). */
export type ProductionItemCore = Pick<ProductionItem, 'productId' | 'status' | 'quantity' | 'confirmedAt' | 'deliveredOn' | 'dueOn' | 'ackStoreIds'>

export interface PassedStore {
  store: StoreSnapshot
  /** Position in the proposal's store order. */
  storeIndex: number
  /** Effective PASSED.date of that store's track. */
  passedOn: ISODate
}

export interface ProductionLate {
  kind: 'OVERDUE' | 'DELIVERED_LATE'
  days: number
}

export interface ProductionRowCore<I extends ProductionItemCore = ProductionItem> {
  productId: string
  /** Still one of the proposal's SKUs. */
  inProposal: boolean
  /** In-proposal stores whose PASSED track accepted this SKU, proposal store order. */
  passedStores: PassedStore[]
  passed: boolean
  item: I | null
  /** item?.status ?? 'PENDING'. */
  status: ProductionStatus
  /** CANCELLED and never confirmed: "ไม่ผลิต". */
  skipped: boolean
  /** Confirmed (IN_PRODUCTION / PRODUCED / DELIVERED) and the passing stores are not what was acknowledged. */
  flag: ProductionFlag | null
  /** NOT_PASSED / NOT_IN_PROPOSAL already acknowledged for exactly the current passing stores. */
  kept: boolean
  /** flag && !kept: the owner / a manager must decide (summary.flagged, flaggedIds, home reviewProduction). */
  needsReview: boolean
  /** Confirmed rows: passing stores that were not acknowledged (STORES_CHANGED), proposal order. */
  storesAdded: StoreSnapshot[]
  /** Confirmed rows: acknowledged stores that no longer pass. */
  storesRemovedCount: number
  late: ProductionLate | null
}

export interface ProductionSummary {
  state: ProductionState
  deadline: ISODate
  leadDays: number
  /** diffDays(today, deadline); negative = passed. */
  daysToDeadline: number
  /** Earliest pass date among shown rows; null when none passed. */
  firstPassedOn: ISODate | null
  /** Shown rows that are passed. */
  passed: number
  pending: number
  /** Pending rows without a saved quantity. */
  missingQty: number
  inProduction: number
  produced: number
  delivered: number
  /** Every CANCELLED row, skipped ones included. */
  cancelled: number
  /** CANCELLED rows never confirmed ("ไม่ผลิต"). */
  skipped: number
  /** IN_PRODUCTION + PRODUCED + DELIVERED. */
  confirmed: number
  /** PENDING + IN_PRODUCTION + PRODUCED. */
  undelivered: number
  /** Rows with needsReview. */
  flagged: number
  /** diffDays(deadline, today) when today > deadline and undelivered > 0, else 0. */
  overdueDays: number
  /** DELIVERED after their frozen deadline (dueOn). */
  deliveredLate: number
  /** Sum of quantities of confirmed rows. */
  confirmedQty: number
  lastDeliveredOn: ISODate | null
}

export interface ProductionDerived<I extends ProductionItemCore = ProductionItem> {
  rows: ProductionRowCore<I>[]
  summary: ProductionSummary
  /** Pending product ids in row order (the confirm set). */
  pendingIds: string[]
  /** needsReview, row order. */
  flaggedIds: string[]
}

export type ProductionTrackView = Pick<TrackView, 'stage' | 'inProposal' | 'store' | 'storeIndex' | 'outcome'>

export interface ProductionInput<I extends ProductionItemCore = ProductionItem> {
  /** Proposal SKUs in proposal order. */
  productIds: string[]
  targetDate: ISODate
  leadDays: number
  /** Tracks reduced WITH ctx.proposal (inProposal / storeIndex must be real); non-PASSED ones are ignored. */
  views: ProductionTrackView[]
  /** Every production_items row of the proposal; rows of SKUs no longer in the proposal last, by SKU. */
  items: I[]
}

/** One log entry as the API sends it (productId resolved from the item). */
export interface ProductionEvent {
  id: string
  itemId: string | null
  productId: string | null
  kind: ProductionEventKind
  actorId: string
  recordedAt: ISODateTime
  fromStatus: ProductionStatus | null
  toStatus: ProductionStatus | null
  date: ISODate | null
  quantityBefore: number | null
  quantityAfter: number | null
  leadDaysBefore: number | null
  leadDaysAfter: number | null
  reason: string | null
  /** DATES: { producedOn?: [before, after], deliveredOn?: [before, after] }; PLAN: { noteChanged }; KEEP: { storeIds }; else {}. */
  detail: Record<string, unknown>
}

export interface ProductionRow extends ProductionRowCore<ProductionItem> {
  product: Pick<Product, 'id' | 'sku' | 'name' | 'brand' | 'size' | 'isActive'>
}

/** GET /proposals/:id/production and every production write. */
export interface ProductionView {
  version: 1
  proposalId: string
  /** The server's todayBangkok() used for late / overdue. */
  today: ISODate
  targetDate: ISODate
  plan: ProductionPlan
  /** Proposal SKU order, then SKUs no longer in the proposal by SKU. */
  rows: ProductionRow[]
  summary: ProductionSummary
  /** = ProductionDerived.pendingIds: send these back to confirm. */
  pendingIds: string[]
  /** Newest first, at most PRODUCTION_EVENTS_MAX. */
  events: ProductionEvent[]
}

// ---------- request bodies (every route answers the whole ProductionView) ----------

/** PUT …/production/quantities; `before` = the saved value the client showed (409 when it moved). */
export interface ProductionQuantitiesInput {
  items: { productId: string; quantity: number | null; before: number | null }[]
}

/** PATCH …/production/plan (≥ 1 key); leadDays needs canDecide, note is team. */
export interface ProductionPlanInput {
  leadDays?: number
  note?: string | null
}

/** POST …/production/confirm: exactly the pending set; `saved` = the saved quantity the client showed. */
export interface ProductionConfirmInput {
  items: { productId: string; quantity: number; saved: number | null }[]
  /** Production start; default today, ≤ today, ≥ the earliest pass of these SKUs. */
  startedOn?: ISODate
}

/** POST …/production/advance: one step, or IN_PRODUCTION → PRODUCED → DELIVERED with `to` + `deliveredOn`. */
export interface ProductionAdvanceInput {
  productIds: string[]
  from: 'IN_PRODUCTION' | 'PRODUCED'
  to?: 'DELIVERED'
  /** Produced date (from IN_PRODUCTION) or delivered date (from PRODUCED). */
  date: ISODate
  /** With from IN_PRODUCTION + to DELIVERED. */
  deliveredOn?: ISODate
}

export interface ProductionBackInput {
  from: 'IN_PRODUCTION' | 'PRODUCED' | 'DELIVERED'
}

/** PATCH …/items/:productId/dates (≥ 1 key). */
export interface ProductionDatesInput {
  producedOn?: ISODate
  deliveredOn?: ISODate
}

/** POST …/items/:productId/cancel; from PENDING = "ไม่ผลิต". */
export interface ProductionCancelInput {
  reason: string
  from: 'PENDING' | 'IN_PRODUCTION' | 'PRODUCED'
}

/** POST …/items/:productId/keep: the passing store ids the client showed (409 when they moved). */
export interface ProductionKeepInput {
  storeIds: string[]
}

// ---------- constants, transitions ----------

export const PRODUCTION_LEAD_DAYS_DEFAULT = 14
export const PRODUCTION_LEAD_DAYS_MAX = 90
export const PRODUCTION_QTY_MAX = 1_000_000
/** Alarm window before the production deadline (home deliver rows, health "อีก n วันถึงกำหนดผลิต"). */
export const PRODUCTION_SOON_DAYS = 7
export const PRODUCTION_EVENTS_MAX = 200
export const PRODUCTION_LEAD_QUICK = [7, 14, 21, 30]
/** A COMPLETED project past launch with passed but never-confirmed SKUs stays on home this many days after launch. */
export const PRODUCTION_HOME_AFTER_LAUNCH_DAYS = 60

export const PRODUCTION_STATUSES: ProductionStatus[] = ['PENDING', 'IN_PRODUCTION', 'PRODUCED', 'DELIVERED', 'CANCELLED']
export const CONFIRMED_STATUSES: ProductionStatus[] = ['IN_PRODUCTION', 'PRODUCED', 'DELIVERED']
export const UNDELIVERED_STATUSES: ProductionStatus[] = ['PENDING', 'IN_PRODUCTION', 'PRODUCED']
/** Cancel may start here; from PENDING it is "ไม่ผลิต" (skip). DELIVERED must be stepped back first. */
export const CANCELLABLE_STATUSES: ProductionStatus[] = ['PENDING', 'IN_PRODUCTION', 'PRODUCED']
/** Forward step (team), one at a time. */
export const NEXT_PRODUCTION: Partial<Record<ProductionStatus, ProductionStatus>> = { IN_PRODUCTION: 'PRODUCED', PRODUCED: 'DELIVERED' }
/** Step back (owner / manager); IN_PRODUCTION → PENDING = ย้อนกลับเป็น “รอยืนยัน”. */
export const PREV_PRODUCTION: Partial<Record<ProductionStatus, ProductionStatus>> = { IN_PRODUCTION: 'PENDING', PRODUCED: 'IN_PRODUCTION', DELIVERED: 'PRODUCED' }

export const isConfirmedStatus = (status: ProductionStatus) => CONFIRMED_STATUSES.includes(status)

/** CANCELLED and never confirmed: the SKU was skipped ("ไม่ผลิต"), not a cancelled production. */
export const isSkipped = (item: Pick<ProductionItem, 'status' | 'confirmedAt'> | null | undefined) => item?.status === 'CANCELLED' && !item.confirmedAt

/** Where restore lands: never confirmed → PENDING, else PRODUCED when it was produced, else IN_PRODUCTION. */
export function restoreTarget(item: Pick<ProductionItem, 'confirmedAt' | 'producedOn'>): ProductionStatus {
  if (!item.confirmedAt) return 'PENDING'
  return item.producedOn ? 'PRODUCED' : 'IN_PRODUCTION'
}

// ---------- labels ----------

/** Chip text. */
export const PRODUCTION_STATUS_LABEL: Record<ProductionStatus, string> = {
  PENDING: 'รอยืนยัน',
  IN_PRODUCTION: 'กำลังผลิต',
  PRODUCED: 'ผลิตเสร็จ',
  DELIVERED: 'ส่งแล้ว',
  CANCELLED: 'ยกเลิกผลิต',
}
export const PRODUCTION_SKIPPED_LABEL = 'ไม่ผลิต'

/** Tooltips / dialogs; "{ห้าง}" → productionStatusLong(status, word). */
export const PRODUCTION_STATUS_LONG: Record<ProductionStatus, string> = {
  PENDING: 'ผ่าน Buyer แล้ว · รอยืนยันเริ่มผลิต',
  IN_PRODUCTION: 'ยืนยันแล้ว · กำลังผลิต',
  PRODUCED: 'ผลิตเสร็จ · รอส่งเข้าคลัง/{ห้าง}',
  DELIVERED: 'ส่งเข้าคลัง/{ห้าง}แล้ว',
  CANCELLED: 'ยกเลิกการผลิต',
}
const SKIPPED_LONG = 'ไม่ผลิต SKU นี้'

/** "{ห้าง}" → productionFlagLabel(flag, word). */
export const PRODUCTION_FLAG_LABEL: Record<ProductionFlag, string> = {
  NOT_PASSED: 'ไม่มี{ห้าง}ที่ผ่านแล้ว',
  NOT_IN_PROPOSAL: 'นำออกจากโปรเจกต์แล้ว',
  STORES_CHANGED: '{ห้าง}ที่ผ่านเปลี่ยนไป',
}

export function productionStatusLabel(status: ProductionStatus, skipped = false) {
  return skipped ? PRODUCTION_SKIPPED_LABEL : PRODUCTION_STATUS_LABEL[status]
}

export function productionStatusLong(status: ProductionStatus, word = 'ห้าง', skipped = false) {
  return skipped ? SKIPPED_LONG : PRODUCTION_STATUS_LONG[status].replace('{ห้าง}', word)
}

export function productionFlagLabel(flag: ProductionFlag, word = 'ห้าง') {
  return PRODUCTION_FLAG_LABEL[flag].replace('{ห้าง}', word)
}

/** "1,200" (en-US grouping, the same in Node and every browser). */
export function formatQty(n: number): string {
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** "SKU-1, SKU-2, SKU-3 และอีก 2 SKU". */
export function skuListLabel(skus: readonly string[], max = 3): string {
  return skus.length <= max ? skus.join(', ') : `${skus.slice(0, max).join(', ')} และอีก ${skus.length - max} SKU`
}

// ---------- derivation ----------

export function productionDeadline(targetDate: ISODate, leadDays: number): ISODate {
  return addDays(targetDate, -leadDays)
}

/** Same ids, any order (duplicates ignored). */
export function sameIdSet(a: readonly string[], b: readonly string[]) {
  const sa = new Set(a)
  const sb = new Set(b)
  return sa.size === sb.size && [...sa].every((id) => sb.has(id))
}

/** productId → passing stores (proposal store order) from in-proposal PASSED views. */
export function passedProducts(views: ProductionTrackView[], productIds: string[]): Map<string, PassedStore[]> {
  const out = new Map<string, PassedStore[]>()
  const passed = views.filter((v) => v.inProposal && v.stage === 'PASSED' && v.outcome?.kind === 'PASSED').sort((a, b) => a.storeIndex - b.storeIndex)
  for (const v of passed) {
    if (v.outcome?.kind !== 'PASSED') continue
    const entry: PassedStore = { store: v.store, storeIndex: v.storeIndex, passedOn: v.outcome.date }
    for (const id of acceptedProductIdsOf(v.outcome.acceptedProductIds, productIds)) {
      const list = out.get(id)
      if (list) list.push(entry)
      else out.set(id, [entry])
    }
  }
  return out
}

/** Passing stores of several rows, unique, proposal store order. */
export function passedStoresOf(rows: Pick<ProductionRowCore<ProductionItemCore>, 'passedStores'>[]): StoreSnapshot[] {
  const seen = new Map<string, PassedStore>()
  for (const r of rows) for (const s of r.passedStores) if (!seen.has(s.store.id)) seen.set(s.store.id, s)
  return [...seen.values()].sort((a, b) => a.storeIndex - b.storeIndex).map((s) => s.store)
}

/** Earliest pass date of the rows (the lowest production start a confirm may record); null when none passed. */
export function earliestPassedOn(rows: Pick<ProductionRowCore<ProductionItemCore>, 'passedStores'>[]): ISODate | null {
  let min: ISODate | null = null
  for (const r of rows) for (const s of r.passedStores) if (!min || s.passedOn < min) min = s.passedOn
  return min
}

function lateOf(status: ProductionStatus, item: ProductionItemCore | null, deadline: ISODate, today: ISODate): ProductionLate | null {
  if (UNDELIVERED_STATUSES.includes(status)) return today > deadline ? { kind: 'OVERDUE', days: diffDays(deadline, today) } : null
  if (status === 'DELIVERED' && item?.deliveredOn) {
    const due = item.dueOn ?? deadline
    return item.deliveredOn > due ? { kind: 'DELIVERED_LATE', days: diffDays(due, item.deliveredOn) } : null
  }
  return null
}

/**
 * The tab's rows and counts. Shown: every passed SKU (status from its row, PENDING without one), confirmed rows
 * that no longer pass (flagged, never dropped) and cancelled rows that were confirmed. Hidden: PENDING drafts and
 * skips ("ไม่ผลิต") of SKUs that no longer pass.
 */
export function deriveProduction<I extends ProductionItemCore>(input: ProductionInput<I>, today: ISODate): ProductionDerived<I> {
  const deadline = productionDeadline(input.targetDate, input.leadDays)
  const passed = passedProducts(input.views, input.productIds)
  const byProduct = new Map(input.items.map((i) => [i.productId, i]))
  const inProposal = new Set(input.productIds)

  const make = (productId: string, inside: boolean): ProductionRowCore<I> | null => {
    const passedStores = inside ? (passed.get(productId) ?? []) : []
    const item = byProduct.get(productId) ?? null
    const status: ProductionStatus = item?.status ?? 'PENDING'
    const skipped = isSkipped(item)
    if (passedStores.length === 0 && (status === 'PENDING' || skipped)) return null
    let flag: ProductionFlag | null = null
    let kept = false
    let storesAdded: StoreSnapshot[] = []
    let storesRemovedCount = 0
    if (isConfirmedStatus(status)) {
      const cur = passedStores.map((s) => s.store.id)
      const ack = item?.ackStoreIds ?? []
      flag = !inside ? 'NOT_IN_PROPOSAL' : cur.length === 0 ? 'NOT_PASSED' : !sameIdSet(cur, ack) ? 'STORES_CHANGED' : null
      kept = (flag === 'NOT_PASSED' || flag === 'NOT_IN_PROPOSAL') && sameIdSet(cur, ack)
      storesAdded = passedStores.filter((s) => !ack.includes(s.store.id)).map((s) => s.store)
      storesRemovedCount = new Set(ack.filter((id) => !cur.includes(id))).size
    }
    return {
      productId,
      inProposal: inside,
      passedStores,
      passed: passedStores.length > 0,
      item,
      status,
      skipped,
      flag,
      kept,
      needsReview: flag !== null && !kept,
      storesAdded,
      storesRemovedCount,
      late: lateOf(status, item, deadline, today),
    }
  }

  const rows: ProductionRowCore<I>[] = []
  for (const id of input.productIds) {
    const row = make(id, true)
    if (row) rows.push(row)
  }
  for (const item of input.items) {
    if (inProposal.has(item.productId)) continue
    const row = make(item.productId, false)
    if (row) rows.push(row)
  }

  const count = (status: ProductionStatus) => rows.filter((r) => r.status === status).length
  const pending = count('PENDING')
  const inProduction = count('IN_PRODUCTION')
  const produced = count('PRODUCED')
  const delivered = count('DELIVERED')
  const cancelled = count('CANCELLED')
  const undelivered = pending + inProduction + produced
  const confirmedRows = rows.filter((r) => isConfirmedStatus(r.status))
  const lastDelivered = rows.map((r) => (r.status === 'DELIVERED' ? r.item?.deliveredOn : null)).filter((d): d is ISODate => !!d)

  const state: ProductionState =
    rows.length === 0 ? 'NONE' : pending > 0 ? 'PENDING' : inProduction + produced > 0 ? 'ACTIVE' : delivered > 0 ? 'DONE' : 'CANCELLED'

  const summary: ProductionSummary = {
    state,
    deadline,
    leadDays: input.leadDays,
    daysToDeadline: diffDays(today, deadline),
    firstPassedOn: earliestPassedOn(rows),
    passed: rows.filter((r) => r.passed).length,
    pending,
    missingQty: rows.filter((r) => r.status === 'PENDING' && r.item?.quantity == null).length,
    inProduction,
    produced,
    delivered,
    cancelled,
    skipped: rows.filter((r) => r.skipped).length,
    confirmed: confirmedRows.length,
    undelivered,
    flagged: rows.filter((r) => r.needsReview).length,
    overdueDays: today > deadline && undelivered > 0 ? diffDays(deadline, today) : 0,
    deliveredLate: rows.filter((r) => r.late?.kind === 'DELIVERED_LATE').length,
    confirmedQty: confirmedRows.reduce((sum, r) => sum + (r.item?.quantity ?? 0), 0),
    lastDeliveredOn: lastDelivered.length > 0 ? lastDelivered.reduce((a, b) => (b > a ? b : a)) : null,
  }

  return {
    rows,
    summary,
    pendingIds: rows.filter((r) => r.status === 'PENDING').map((r) => r.productId),
    flaggedIds: rows.filter((r) => r.needsReview).map((r) => r.productId),
  }
}

/** What a presentation / proposal write changed for production (owner notices). */
export function productionDiff(
  before: Pick<ProductionDerived<ProductionItemCore>, 'pendingIds' | 'flaggedIds'>,
  after: Pick<ProductionDerived<ProductionItemCore>, 'pendingIds' | 'flaggedIds'>,
): { newPending: string[]; newFlagged: string[] } {
  return {
    newPending: after.pendingIds.filter((id) => !before.pendingIds.includes(id)),
    newFlagged: after.flaggedIds.filter((id) => !before.flaggedIds.includes(id)),
  }
}

// ---------- errors (Thai copy) ----------

/** The error copy with dates written by `date`: the web passes its formatDate (the viewer's BE/CE choice). */
export function productionErrors(date: DateText) {
  return {
    cancelled: 'โปรเจกต์นี้ถูกยกเลิกแล้ว',
    readOnly: 'เฉพาะเจ้าของและทีมงานบันทึกการผลิตได้',
    decideOnly: 'เฉพาะเจ้าของโปรเจกต์หรือผู้จัดการ',
    confirmOnly: 'ยืนยันเริ่มผลิตได้เฉพาะเจ้าของโปรเจกต์หรือผู้จัดการ',
    confirmedQtyOnly: 'จำนวนผลิตที่ยืนยันแล้วแก้ได้เฉพาะเจ้าของโปรเจกต์หรือผู้จัดการ',
    leadDaysOnly: 'ตั้ง deadline ได้เฉพาะเจ้าของโปรเจกต์หรือผู้จัดการ',
    qty: 'จำนวนผลิตต้องเป็นจำนวนเต็ม 1–1,000,000 ชิ้น',
    qtyRequired: 'SKU ที่ยืนยันแล้วต้องมีจำนวนผลิต',
    qtyChanged: (sku: string) => `จำนวนผลิตของ ${sku} ถูกแก้ไขโดยผู้อื่นแล้ว — โหลดข้อมูลล่าสุดให้แล้ว ตรวจสอบแล้วลองอีกครั้ง`,
    missingQty: (n: number) => `กรอกจำนวนผลิตให้ครบทุก SKU ก่อนยืนยัน (ยังขาด ${n} SKU)`,
    nothingPending: 'ไม่มี SKU ที่รอยืนยันแล้ว — โหลดข้อมูลล่าสุดให้แล้ว',
    pendingChanged: 'รายการ SKU ที่รอยืนยันเปลี่ยนไปแล้ว — โหลดข้อมูลล่าสุดให้แล้ว ตรวจสอบแล้วกดยืนยันอีกครั้ง',
    stale: (sku: string) => `สถานะของ ${sku} เปลี่ยนไปแล้ว — โหลดข้อมูลล่าสุดให้แล้ว ลองอีกครั้ง`,
    notListed: (sku: string) => `${sku} ไม่ได้อยู่ในรายการรอผลิตแล้ว — โหลดข้อมูลล่าสุดให้แล้ว`,
    leadDays: 'จำนวนวันต้องเป็นจำนวนเต็ม 0–90 วัน',
    nothingToSave: 'ไม่มีข้อมูลที่จะแก้ไข',
    dateRequired: 'เลือกวันที่',
    dateInvalid: 'วันที่ไม่ถูกต้อง',
    dateFuture: 'วันที่ต้องไม่เกินวันนี้',
    startBeforePass: (d: ISODate) => `วันที่เริ่มผลิตต้องไม่ก่อนวันที่ผ่าน Buyer (${date(d)})`,
    producedBeforeStart: (d: ISODate) => `วันที่ผลิตเสร็จต้องไม่ก่อนวันที่เริ่มผลิต (${date(d)})`,
    deliveredBeforeProduced: (d: ISODate) => `วันที่ส่งต้องไม่ก่อนวันที่ผลิตเสร็จ (${date(d)})`,
    producedAfterDelivered: (d: ISODate) => `วันที่ผลิตเสร็จต้องไม่หลังวันที่ส่ง (${date(d)})`,
    dateNotRecorded: 'ยังไม่ได้บันทึกขั้นนี้ จึงแก้วันที่ไม่ได้',
    cancelReason: 'กรุณาระบุเหตุผลที่ยกเลิกการผลิต',
    skipReason: 'กรุณาระบุเหตุผลที่ไม่ผลิต SKU นี้',
    cancelDelivered: 'ส่งแล้ว ยกเลิกไม่ได้ — ย้อนสถานะก่อน',
    tooLong: (max: number) => `ยาวเกิน ${max} ตัวอักษร`,
    gone: 'ข้อมูลนี้เปลี่ยนไปแล้ว — โหลดข้อมูลล่าสุดให้แล้ว ลองอีกครั้ง',
  }
}

export type ProductionErrors = ReturnType<typeof productionErrors>

/** Dates as "15 ต.ค. 69" (formatThaiDate): the copy the API answers with. */
export const PERR: ProductionErrors = productionErrors(formatThaiDate)

// ---------- validation (dialogs and the API) ----------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
/** YYYY-MM-DD of a real calendar day. */
export function isRealDate(v: unknown): v is ISODate {
  if (typeof v !== 'string' || !ISO_DATE.test(v)) return false
  const t = Date.parse(`${v}T00:00:00Z`)
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v
}

/** '' / spaces → null; "1,200" or "1200" → 1200; anything else → 'invalid'. Range is quantityError's job. */
export function parseQtyText(text: string): number | null | 'invalid' {
  const t = text.trim()
  if (t === '') return null
  if (!/^\d+$/.test(t) && !/^\d{1,3}(,\d{3})+$/.test(t)) return 'invalid'
  const n = Number(t.replaceAll(',', ''))
  return Number.isSafeInteger(n) ? n : 'invalid'
}

/** Integer 1 … PRODUCTION_QTY_MAX. */
export function quantityError(q: unknown, err: ProductionErrors = PERR): string | null {
  return typeof q === 'number' && Number.isInteger(q) && q >= 1 && q <= PRODUCTION_QTY_MAX ? null : err.qty
}

/** Integer 0 … PRODUCTION_LEAD_DAYS_MAX. */
export function leadDaysError(v: unknown, err: ProductionErrors = PERR): string | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= PRODUCTION_LEAD_DAYS_MAX ? null : err.leadDays
}

/** Trimmed ≤ NOTE_MAX; empty / null is fine (clears the note). */
export function noteError(v: string | null | undefined, err: ProductionErrors = PERR): string | null {
  return typeof v === 'string' && v.trim().length > NOTE_MAX ? err.tooLong(NOTE_MAX) : null
}

function stepDateError(date: unknown, today: ISODate, err: ProductionErrors): string | null {
  if (typeof date !== 'string' || date === '') return err.dateRequired
  if (!isRealDate(date)) return err.dateInvalid
  return date > today ? err.dateFuture : null
}

/** Production start of a confirm: ≤ today and not before the earliest pass of the confirmed SKUs. */
export function startedOnError(date: string | null | undefined, firstPassedOn: ISODate | null, today: ISODate, err: ProductionErrors = PERR): string | null {
  const base = stepDateError(date, today, err)
  if (base) return base
  return firstPassedOn && (date as ISODate) < firstPassedOn ? err.startBeforePass(firstPassedOn) : null
}

/** Date of advancing `item` to `to` on `date`: ≤ today, produced ≥ startedOn, delivered ≥ producedOn. */
export function advanceDateError(
  to: 'PRODUCED' | 'DELIVERED',
  date: string | null | undefined,
  item: Pick<ProductionItem, 'startedOn' | 'producedOn'>,
  today: ISODate,
  err: ProductionErrors = PERR,
): string | null {
  const base = stepDateError(date, today, err)
  if (base) return base
  const d = date as ISODate
  if (to === 'PRODUCED') return item.startedOn && d < item.startedOn ? err.producedBeforeStart(item.startedOn) : null
  return item.producedOn && d < item.producedOn ? err.deliveredBeforeProduced(item.producedOn) : null
}

/** Edited dates of a PRODUCED / DELIVERED item: startedOn ≤ producedOn ≤ deliveredOn ≤ today. */
export function datesErrors(
  item: Pick<ProductionItem, 'status' | 'startedOn' | 'producedOn' | 'deliveredOn'>,
  patch: { producedOn?: string; deliveredOn?: string },
  today: ISODate,
  err: ProductionErrors = PERR,
): Partial<Record<'producedOn' | 'deliveredOn', string>> {
  const out: Partial<Record<'producedOn' | 'deliveredOn', string>> = {}
  const hasProduced = item.status === 'PRODUCED' || item.status === 'DELIVERED'
  const hasDelivered = item.status === 'DELIVERED'
  let produced = item.producedOn
  if (patch.producedOn !== undefined) {
    const e = hasProduced ? advanceDateError('PRODUCED', patch.producedOn, item, today, err) : err.dateNotRecorded
    if (e) out.producedOn = e
    else produced = patch.producedOn
  }
  if (patch.deliveredOn !== undefined) {
    const e = hasDelivered ? advanceDateError('DELIVERED', patch.deliveredOn, { startedOn: item.startedOn, producedOn: produced }, today, err) : err.dateNotRecorded
    if (e) out.deliveredOn = e
  } else if (!out.producedOn && hasDelivered && produced && item.deliveredOn && produced > item.deliveredOn) {
    out.producedOn = err.producedAfterDelivered(item.deliveredOn)
  }
  return out
}

/** Required, trimmed ≤ NOTE_MAX; `skip` = the "ไม่ผลิต" wording (cancel from PENDING). */
export function cancelReasonError(v: unknown, err: ProductionErrors = PERR, skip = false): string | null {
  if (typeof v !== 'string' || v.trim() === '') return skip ? err.skipReason : err.cancelReason
  return v.trim().length > NOTE_MAX ? err.tooLong(NOTE_MAX) : null
}

// ---------- permissions ----------

type Actor = Pick<User, 'id' | 'role'>
type ProposalLike = Pick<Proposal, 'status' | 'ownerId' | 'memberIds'>

export interface ProductionPerms {
  canWork: boolean
  canDecide: boolean
}

/** Owner, members, MANAGER, ADMIN: draft quantities, the note, advance, edit dates. */
export const canWorkProduction = (me: Actor | null | undefined, p: ProposalLike) => p.status !== 'CANCELLED' && canManageTasks(me, p)

/** Owner, MANAGER, ADMIN: confirm, lead days, confirmed quantities, back, cancel / skip, restore, keep. */
export const canDecideProduction = (me: Actor | null | undefined, p: ProposalLike) => p.status !== 'CANCELLED' && canEditProposal(me, p)

export function productionPerms(me: Actor | null | undefined, p: ProposalLike): ProductionPerms {
  return { canWork: canWorkProduction(me, p), canDecide: canDecideProduction(me, p) }
}

/** CANCELLED → nobody; PENDING → team; confirmed → owner / manager (production started on that number). */
export function canEditQuantity(status: ProductionStatus, perms: ProductionPerms): boolean {
  if (status === 'CANCELLED') return false
  return status === 'PENDING' ? perms.canWork : perms.canDecide
}

export interface ProductionRowActions {
  editQuantity: boolean
  /** The forward step (team): IN_PRODUCTION → PRODUCED, PRODUCED → DELIVERED. */
  advanceTo: ProductionStatus | null
  /** The step back (owner / manager). */
  backTo: ProductionStatus | null
  editDates: boolean
  /** Cancel a confirmed SKU (IN_PRODUCTION / PRODUCED). */
  cancel: boolean
  /** "ไม่ผลิต" a passed PENDING SKU. */
  skip: boolean
  restoreTo: ProductionStatus | null
  /** needsReview: "ผลิตต่อ" / "ส่งต่อตามแผน" / "รับทราบ" / "จำนวนเดิมใช้ได้". */
  keep: boolean
}

/** What a viewer may do with one row (menus, buttons; the API checks the same). */
export function productionRowActions(row: Pick<ProductionRowCore, 'status' | 'item' | 'needsReview' | 'passed'>, perms: ProductionPerms): ProductionRowActions {
  const { status } = row
  const { canWork, canDecide } = perms
  return {
    editQuantity: canEditQuantity(status, perms),
    advanceTo: canWork ? (NEXT_PRODUCTION[status] ?? null) : null,
    backTo: canDecide ? (PREV_PRODUCTION[status] ?? null) : null,
    editDates: canWork && (status === 'PRODUCED' || status === 'DELIVERED'),
    cancel: canDecide && (status === 'IN_PRODUCTION' || status === 'PRODUCED'),
    skip: canDecide && status === 'PENDING' && row.passed,
    restoreTo: canDecide && status === 'CANCELLED' && row.item ? restoreTarget(row.item) : null,
    keep: canDecide && row.needsReview,
  }
}
