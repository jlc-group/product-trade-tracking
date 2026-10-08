// "รอผลิต" production step after a buyer pass: the persisted shapes, which SKUs are shown (derived from PASSED
// presentation tracks), deadline math, the status transitions, the production orders ("ใบสั่งผลิต"), validation, error
// copy and who may write. The API, the home builder and the web run the same rules from here. No clock reads — `today`
// always comes in as an argument.
import { formatThaiDate } from './labels.js'
import { canEditProposal, canManageTasks } from './permissions.js'
import { acceptedProductIdsOf, NOTE_MAX, type DateText, type StoreSnapshot, type TrackView } from './presentation.js'
import { addDays, diffDays } from './task-tree.js'
import type { ISODate, ISODateTime, Manufacturer, Product, Proposal, User } from './types.js'

// ---------- persisted shapes ----------

export type ProductionStatus = 'PENDING' | 'IN_PRODUCTION' | 'PRODUCED' | 'DELIVERED' | 'CANCELLED'
/** Why a confirmed SKU needs the owner / a manager to look again. */
export type ProductionFlag = 'NOT_PASSED' | 'NOT_IN_PROPOSAL' | 'STORES_CHANGED'
export type ProductionEventKind = 'QUANTITY' | 'PLAN' | 'CONFIRM' | 'ADVANCE' | 'BACK' | 'DATES' | 'CANCEL' | 'RESTORE' | 'KEEP' | 'ORDER'
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
  /**
   * Production start (business date): its order's "วันที่ดำเนินการ" (ProductionOrder.startedOn; may be after today —
   * futureStartOf); rows confirmed before that existed: the earliest pass of the confirmed set (older: a picked start).
   */
  startedOn: ISODate | null
  /** "วันที่ต้องการสินค้า" picked at confirm: this SKU's delivery due date; null = the plan deadline (older rows). */
  neededOn: ISODate | null
  /** The "ใบสั่งผลิต" of the press that confirmed it (ProductionView.orders); null = never confirmed, or confirmed before orders existed. */
  orderId: string | null
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
export type ProductionItemCore = Pick<ProductionItem, 'productId' | 'status' | 'quantity' | 'confirmedAt' | 'neededOn' | 'deliveredOn' | 'dueOn' | 'ackStoreIds'>

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
  /** Delivery due date: dueOn frozen at delivery, else the item's neededOn, else the plan deadline. */
  dueOn: ISODate
  late: ProductionLate | null
}

export interface ProductionSummary {
  state: ProductionState
  /** The earliest due date of the SKUs not delivered yet (their "วันที่ต้องการสินค้า", else planDeadline); planDeadline when none. */
  deadline: ISODate
  /** launch − leadDays: the default due date and the confirm dialog's starting value. */
  planDeadline: ISODate
  leadDays: number
  /** diffDays(today, deadline); negative = passed. */
  daysToDeadline: number
  /** Earliest pass date among shown rows; null when none passed. */
  firstPassedOn: ISODate | null
  /** Shown rows that are passed. */
  passed: number
  pending: number
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
  /**
   * DATES: { neededOn? | producedOn? | deliveredOn? (startedOn? in older rows): [before, after] };
   * CONFIRM (date = the production start): { neededOn, orderId?, orderSeq?, manufacturerName?, referenceNo?, startedOn?,
   * productionDays?, expectedOn?, mainContactId?, mainContactName?, coContactIds?, coContactNames? } (the order fields from
   * when orders exist, the schedule from when it exists, the contacts with their names as of the confirm from 2026-10-08);
   * ORDER (an order edit, one event per item of it, fromStatus = toStatus): { orderId, orderSeq, referenceNo?: [before | null,
   * after | null], manufacturer?: [beforeName, afterName], startedOn?: [before | null, after], productionDays?: [before |
   * null, after], mainContactId?: [before, after], mainContactName?: [before, after], coContacts?: { added: string[],
   * removed: string[] }, coContactNames?: { added: string[], removed: string[] } } — the names (nickname || name, as of
   * the edit; same order as the ids) are absent in events written before they were stored; a null schedule "before" is
   * an order confirmed before schedules existed; PLAN: { noteChanged }; KEEP: { storeIds }; else {}. An orderSeq here is
   * never given to a later order.
   */
  detail: Record<string, unknown>
}

export interface ProductionRow extends ProductionRowCore<ProductionItem> {
  product: Pick<Product, 'id' | 'sku' | 'name' | 'brand' | 'size' | 'isActive'>
}

/** Who an order names (embedded so deactivated people still show). */
export type ProductionPerson = Pick<User, 'id' | 'name' | 'nickname' | 'avatarColor' | 'isActive' | 'department' | 'position'>

/** "ใบสั่งผลิต": one press of "ยืนยันเริ่มผลิต" and the SKUs it confirmed; the owner / a manager may edit it later. */
export interface ProductionOrder {
  id: string
  /** 1, 2, … per proposal: "ใบสั่งผลิตที่ n"; never reused, even after the order holding a number was deleted. */
  seq: number
  /** "รหัสเอกสารอ้างอิง" (e.g. a PO / PR number); null = none. */
  referenceNo: string | null
  /** "บริษัทรับผลิต" (embedded so a deactivated one still shows). */
  manufacturer: Pick<Manufacturer, 'id' | 'name' | 'isActive'>
  /** "ผู้ติดต่อหลัก". */
  mainContact: ProductionPerson
  /** "ผู้ติดต่อร่วม": name order (Thai locale), never containing the main contact. */
  coContacts: ProductionPerson[]
  confirmedAt: ISODateTime
  confirmedById: string
  /** Who pressed confirm (embedded like the contacts, so a deactivated / non-team confirmer still shows). */
  confirmedBy: ProductionPerson
  /**
   * "วันที่ดำเนินการ" = the production start of every SKU on the order (their item.startedOn); may be after today.
   * startedOn / productionDays / expectedOn are all null on an order confirmed before schedules existed.
   */
  startedOn: ISODate | null
  /** "ระยะเวลาผลิตทั้งหมด (ประมาณ)": 1–PRODUCTION_DAYS_MAX days. */
  productionDays: number | null
  /** "ของถึงประมาณ" = orderExpectedOn(startedOn, productionDays), filled by the server (never stored). */
  expectedOn: ISODate | null
  /** The items carrying this order (any status, cancelled included), proposal row order. */
  productIds: string[]
  /** Stale guard for PATCH …/orders/:orderId. */
  updatedAt: ISODateTime
}

/** What a confirm press and an order edit carry. */
export interface ProductionOrderFields {
  /** Cleaned with cleanReferenceNo (blank → null). */
  referenceNo: string | null
  manufacturerId: string
  mainContactId: string
  /** Not containing mainContactId; ≤ ORDER_CO_CONTACTS_MAX. */
  coContactIds: string[]
  /**
   * "วันที่ดำเนินการ" (production start): within orderStartBounds() of the order's SKUs; on an edit also not after their
   * earliest produced date (orderStartAfterProducedError). Becomes the startedOn of every SKU on the order.
   */
  startedOn: ISODate
  /** "ระยะเวลาผลิตทั้งหมด (ประมาณ)": integer 1–PRODUCTION_DAYS_MAX days. */
  productionDays: number
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
  /** The proposal's production orders, seq ascending. */
  orders: ProductionOrder[]
}

// ---------- request bodies (every route answers the whole ProductionView) ----------

/** PUT …/production/quantities: confirmed SKUs only (a pending SKU gets its quantity at confirm); `before` = the saved value the client showed (409 when it moved). */
export interface ProductionQuantitiesInput {
  items: { productId: string; quantity: number; before: number | null }[]
}

/** PATCH …/production/plan (≥ 1 key); leadDays needs canDecide, note is team. */
export interface ProductionPlanInput {
  leadDays?: number
  note?: string | null
}

/** POST …/production/confirm: exactly the pending set; `saved` = the saved quantity the client showed. */
export interface ProductionConfirmInput {
  items: { productId: string; quantity: number; saved: number | null }[]
  /** "วันที่ต้องการสินค้า" (the delivery due date of these SKUs): today … latestNeededOn(); default defaultNeededOn(). */
  neededOn?: ISODate
  /**
   * The "ใบสั่งผลิต" this press creates (orderFieldErrors; the manufacturer must be active, contacts active team members;
   * startedOn within orderStartBounds(earliestPassedOn(pending rows), today, targetDate), productionDays required).
   */
  order: ProductionOrderFields
}

/**
 * PATCH …/production/orders/:orderId (≥ 1 field besides updatedAt); `updatedAt` = the order the client showed (409 when
 * it moved). startedOn / productionDays may be sent alone or together, except on an order without a schedule yet
 * (confirmed before schedules existed): then both or neither.
 */
export interface ProductionOrderEditInput extends Partial<ProductionOrderFields> {
  updatedAt: ISODateTime
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
  neededOn?: ISODate
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
/** "รหัสเอกสารอ้างอิง" of a production order, after cleanReferenceNo. */
export const PRODUCTION_REF_MAX = 100
export const MANUFACTURER_NAME_MAX = 120
export const MANUFACTURER_NOTE_MAX = 500
/** "ผู้ติดต่อร่วม" per production order. */
export const ORDER_CO_CONTACTS_MAX = 20
/** "ระยะเวลาผลิตทั้งหมด" of a production order, in days (1 … this). */
export const PRODUCTION_DAYS_MAX = 365

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

/**
 * Why a proposal can't be deleted: `live` SKUs still confirmed (IN_PRODUCTION / PRODUCED / DELIVERED). Once every
 * confirmed SKU was cancelled an Admin may delete it, its production history with it (others: PRODUCTION_HISTORY_DELETE).
 * Same copy in the API and the menu.
 */
export function productionDeleteBlock(live: number, cancelledProposal: boolean): string {
  const how = 'ยกเลิกการผลิตในแท็บ “รอผลิต” ก่อน'
  return `มีสินค้าที่ยืนยันผลิตอยู่ ${live} SKU ลบไม่ได้ — ${cancelledProposal ? `เปลี่ยนสถานะโปรเจกต์กลับ แล้ว${how}` : `${how} หรือเปลี่ยนสถานะโปรเจกต์เป็น “ยกเลิก” แทน`}`
}

/** A proposal that ever confirmed production keeps that history: only `proposal.delete.any` (Admin) may delete it. */
export const PRODUCTION_HISTORY_DELETE = 'โปรเจกต์นี้มีประวัติการผลิต — ลบได้เฉพาะ Admin (เปลี่ยนสถานะเป็น “ยกเลิก” แทนได้)'

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

/** "ใบสั่งผลิตที่ 2" (API log copy and the web). */
export const orderLabel = (o: Pick<ProductionOrder, 'seq'>) => `ใบสั่งผลิตที่ ${o.seq}`

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

/** A row's delivery due date: dueOn frozen at delivery, else its "วันที่ต้องการสินค้า", else the plan deadline. */
export const dueOf = (item: Pick<ProductionItemCore, 'neededOn' | 'dueOn'> | null, planDeadline: ISODate): ISODate => item?.dueOn ?? item?.neededOn ?? planDeadline

function lateOf(status: ProductionStatus, item: ProductionItemCore | null, due: ISODate, today: ISODate): ProductionLate | null {
  if (UNDELIVERED_STATUSES.includes(status)) return today > due ? { kind: 'OVERDUE', days: diffDays(due, today) } : null
  if (status === 'DELIVERED' && item?.deliveredOn) return item.deliveredOn > due ? { kind: 'DELIVERED_LATE', days: diffDays(due, item.deliveredOn) } : null
  return null
}

/**
 * The tab's rows and counts. Shown: every passed SKU (status from its row, PENDING without one), confirmed rows
 * that no longer pass (flagged, never dropped) and cancelled rows that were confirmed. Hidden: PENDING drafts and
 * skips ("ไม่ผลิต") of SKUs that no longer pass.
 */
export function deriveProduction<I extends ProductionItemCore>(input: ProductionInput<I>, today: ISODate): ProductionDerived<I> {
  const planDeadline = productionDeadline(input.targetDate, input.leadDays)
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
      dueOn: dueOf(item, planDeadline),
      late: lateOf(status, item, dueOf(item, planDeadline), today),
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

  // The date to beat: the earliest due date still open (SKUs confirmed with a "วันที่ต้องการสินค้า" carry their own).
  const open = rows.filter((r) => UNDELIVERED_STATUSES.includes(r.status))
  const deadline = open.reduce<ISODate>((min, r) => (r.dueOn < min ? r.dueOn : min), open[0]?.dueOn ?? planDeadline)
  const summary: ProductionSummary = {
    state,
    deadline,
    planDeadline,
    leadDays: input.leadDays,
    daysToDeadline: diffDays(today, deadline),
    firstPassedOn: earliestPassedOn(rows),
    passed: rows.filter((r) => r.passed).length,
    pending,
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
    qtyRequired: 'กรอกจำนวนผลิต',
    qtyChanged: (sku: string) => `จำนวนผลิตของ ${sku} ถูกแก้ไขโดยผู้อื่นแล้ว — โหลดข้อมูลล่าสุดให้แล้ว ตรวจสอบแล้วลองอีกครั้ง`,
    nothingPending: 'ไม่มี SKU ที่รอยืนยันแล้ว — โหลดข้อมูลล่าสุดให้แล้ว',
    pendingChanged: 'รายการ SKU ที่รอยืนยันเปลี่ยนไปแล้ว — โหลดข้อมูลล่าสุดให้แล้ว ตรวจสอบแล้วกดยืนยันอีกครั้ง',
    stale: (sku: string) => `สถานะของ ${sku} เปลี่ยนไปแล้ว — โหลดข้อมูลล่าสุดให้แล้ว ลองอีกครั้ง`,
    notListed: (sku: string) => `${sku} ไม่ได้อยู่ในรายการรอผลิตแล้ว — โหลดข้อมูลล่าสุดให้แล้ว`,
    leadDays: 'จำนวนวันต้องเป็นจำนวนเต็ม 0–90 วัน',
    nothingToSave: 'ไม่มีข้อมูลที่จะแก้ไข',
    dateRequired: 'เลือกวันที่',
    dateInvalid: 'วันที่ไม่ถูกต้อง',
    dateFuture: 'วันที่ต้องไม่เกินวันนี้',
    neededPast: 'วันที่ต้องการสินค้าต้องไม่ก่อนวันนี้',
    neededTooLate: (d: ISODate) => `วันที่ต้องการสินค้าต้องไม่เกินวันวางขาย (${date(d)})`,
    neededLaunchPassed: 'เลยวันวางขายแล้ว — วันที่ต้องการสินค้าเลือกได้แค่วันนี้',
    neededDelivered: 'ส่งแล้ว — แก้วันที่ต้องการสินค้าไม่ได้',
    neededOnly: 'แก้วันที่ต้องการสินค้าได้เฉพาะเจ้าของโปรเจกต์หรือผู้จัดการ',
    producedBeforeStart: (d: ISODate) => `วันที่ผลิตเสร็จต้องไม่ก่อน ${date(d)}`,
    deliveredBeforeProduced: (d: ISODate) => `วันที่ส่งต้องไม่ก่อนวันที่ผลิตเสร็จ (${date(d)})`,
    producedAfterDelivered: (d: ISODate) => `วันที่ผลิตเสร็จต้องไม่หลังวันที่ส่ง (${date(d)})`,
    dateNotRecorded: 'ยังไม่ได้บันทึกขั้นนี้ จึงแก้วันที่ไม่ได้',
    cancelReason: 'กรุณาระบุเหตุผลที่ยกเลิกการผลิต',
    skipReason: 'กรุณาระบุเหตุผลที่ไม่ผลิต SKU นี้',
    cancelDelivered: 'ส่งแล้ว ยกเลิกไม่ได้ — ย้อนสถานะก่อน',
    tooLong: (max: number) => `ยาวเกิน ${max} ตัวอักษร`,
    gone: 'ข้อมูลนี้เปลี่ยนไปแล้ว — โหลดข้อมูลล่าสุดให้แล้ว ลองอีกครั้ง',
    refTooLong: `รหัสเอกสารอ้างอิงยาวเกิน ${PRODUCTION_REF_MAX} ตัวอักษร`,
    manufacturerRequired: 'เลือกบริษัทรับผลิต',
    manufacturerGone: 'ไม่พบบริษัทรับผลิตที่เลือก',
    manufacturerInactive: (name: string) => `${name} ถูกปิดการใช้งานแล้ว — เลือกบริษัทอื่น`,
    mainContactRequired: 'เลือกผู้ติดต่อหลัก',
    contactDuplicate: 'ผู้ติดต่อหลักอยู่ในรายชื่อผู้ติดต่อร่วมด้วย — เลือกคนละคน',
    coContactsMax: `เลือกผู้ติดต่อร่วมได้ไม่เกิน ${ORDER_CO_CONTACTS_MAX} คน`,
    contactNotTeam: 'เลือกผู้ติดต่อได้เฉพาะทีมโปรเจกต์ ผู้รับผิดชอบงาน หรือผู้จัดการ — เพิ่มสมาชิกได้ที่หัวโปรเจกต์',
    contactInactive: (name: string) => `${name} ถูกปิดการใช้งานแล้ว — เลือกคนอื่น`,
    orderOnly: 'แก้ข้อมูลใบสั่งผลิตได้เฉพาะเจ้าของโปรเจกต์หรือผู้จัดการ',
    orderChanged: 'ข้อมูลใบสั่งผลิตถูกแก้ไขโดยผู้อื่นแล้ว — โหลดข้อมูลล่าสุดให้แล้ว ตรวจสอบแล้วลองอีกครั้ง',
    orderGone: 'ไม่พบใบสั่งผลิตนี้แล้ว — โหลดข้อมูลล่าสุดให้แล้ว',
    startRequired: 'เลือกวันที่เริ่มผลิต',
    startBeforePass: (d: ISODate) => `วันที่เริ่มผลิตต้องไม่ก่อนวันที่ผ่าน Buyer (${date(d)})`,
    startTooLate: (d: ISODate) => `วันที่เริ่มผลิตต้องไม่เกิน ${date(d)}`,
    startAfterProduced: (d: ISODate) => `วันที่เริ่มผลิตต้องไม่หลังวันที่ผลิตเสร็จ (${date(d)})`,
    daysRequired: 'กรอกระยะเวลาผลิต',
    days: `ระยะเวลาผลิตต้องเป็นจำนวนเต็ม 1–${PRODUCTION_DAYS_MAX} วัน`,
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

/** Latest "วันที่ต้องการสินค้า": the launch date, or today once the launch has passed. */
export const latestNeededOn = (today: ISODate, targetDate: ISODate): ISODate => (targetDate > today ? targetDate : today)

/** The confirm dialog's starting value: the plan deadline, kept within today … latestNeededOn(). */
export function defaultNeededOn(planDeadline: ISODate, today: ISODate, targetDate: ISODate): ISODate {
  const latest = latestNeededOn(today, targetDate)
  return planDeadline < today ? today : planDeadline > latest ? latest : planDeadline
}

/** "วันที่ต้องการสินค้า" (confirm, edit dates): today … the launch date (only today once the launch has passed). */
export function neededOnError(date: string | null | undefined, today: ISODate, targetDate: ISODate, err: ProductionErrors = PERR): string | null {
  if (typeof date !== 'string' || date === '') return err.dateRequired
  if (!isRealDate(date)) return err.dateInvalid
  if (date < today) return err.neededPast
  if (date <= latestNeededOn(today, targetDate)) return null
  return targetDate > today ? err.neededTooLate(targetDate) : err.neededLaunchPassed
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

/**
 * Edited dates of a confirmed item: neededOn while not yet delivered (neededOnError; delivered → frozen), and
 * startedOn ≤ producedOn ≤ deliveredOn ≤ today once those steps are recorded.
 */
export function datesErrors(
  item: Pick<ProductionItem, 'status' | 'startedOn' | 'producedOn' | 'deliveredOn'>,
  patch: { neededOn?: string; producedOn?: string; deliveredOn?: string },
  today: ISODate,
  targetDate: ISODate,
  err: ProductionErrors = PERR,
): Partial<Record<'neededOn' | 'producedOn' | 'deliveredOn', string>> {
  const out: Partial<Record<'neededOn' | 'producedOn' | 'deliveredOn', string>> = {}
  const hasProduced = item.status === 'PRODUCED' || item.status === 'DELIVERED'
  const hasDelivered = item.status === 'DELIVERED'
  if (patch.neededOn !== undefined) {
    const e = hasDelivered ? err.neededDelivered : !isConfirmedStatus(item.status) ? err.dateNotRecorded : neededOnError(patch.neededOn, today, targetDate, err)
    if (e) out.neededOn = e
  }
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

/** "รหัสเอกสารอ้างอิง" as stored: trimmed, runs of whitespace → one space; blank → null. */
export function cleanReferenceNo(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim().replace(/\s+/g, ' ')
  return v === '' ? null : v
}

/** Optional; ≤ PRODUCTION_REF_MAX once cleaned. */
export function referenceNoError(raw: string | null | undefined, err: ProductionErrors = PERR): string | null {
  return (cleanReferenceNo(raw)?.length ?? 0) > PRODUCTION_REF_MAX ? err.refTooLong : null
}

// ---------- production order schedule ("วันที่ดำเนินการ", "ระยะเวลาผลิต", "ของถึงประมาณ") ----------

/** The range a production order's start ("วันที่ดำเนินการ") may take. */
export interface OrderStartBounds {
  min: ISODate
  max: ISODate
}

/**
 * min = the earliest buyer pass of the order's SKUs (today when none passes), max = latestNeededOn() (the launch date,
 * or today once the launch has passed). The confirm dialog starts at defaultOrderStart().
 */
export function orderStartBounds(earliestPass: ISODate | null, today: ISODate, targetDate: ISODate): OrderStartBounds {
  const max = latestNeededOn(today, targetDate)
  const min = earliestPass ?? today
  return { min: min > max ? max : min, max }
}

/**
 * Lower bound of an order edit's start: the earliest buyer pass of its SKUs; when none passes any more (a pass was
 * reverted, a SKU left the proposal) the earliest start already recorded on them, so a past start can still be corrected.
 */
export function orderEditStartFloor(earliestPass: ISODate | null, items: readonly Pick<ProductionItem, 'startedOn'>[]): ISODate | null {
  if (earliestPass) return earliestPass
  return items.reduce<ISODate | null>((min, i) => (i.startedOn && (!min || i.startedOn < min) ? i.startedOn : min), null)
}

/** The confirm dialog's starting "วันที่ดำเนินการ": today, kept within the bounds. */
export const defaultOrderStart = (bounds: OrderStartBounds, today: ISODate): ISODate => (today < bounds.min ? bounds.min : today > bounds.max ? bounds.max : today)

/** "ของถึงประมาณ" = start + days; null while either is missing or invalid (a dialog's live line, a legacy order). */
export function orderExpectedOn(startedOn: ISODate | null | undefined, days: number | null | undefined): ISODate | null {
  return isRealDate(startedOn) && productionDaysError(days) === null ? addDays(startedOn, days as number) : null
}

/** The earliest produced / delivered date of an order's items: a start may not follow it (null = none recorded). */
export function earliestProducedOn(items: readonly Pick<ProductionItem, 'producedOn' | 'deliveredOn'>[]): ISODate | null {
  let min: ISODate | null = null
  for (const i of items) for (const d of [i.producedOn, i.deliveredOn]) if (d && (!min || d < min)) min = d
  return min
}

/** How late an expected arrival is: after the launch ("หลังวันวางขาย", red) wins over after the needed date (yellow). */
export interface ArrivalLate {
  kind: 'LAUNCH' | 'NEEDED'
  /** Days after that date (≥ 1). */
  days: number
}

/** null = in time, or nothing to compare (no expected date). `neededOn` = the SKU set's "วันที่ต้องการสินค้า" (row.dueOn). */
export function arrivalLate(expectedOn: ISODate | null, neededOn: ISODate | null, targetDate: ISODate): ArrivalLate | null {
  if (!expectedOn) return null
  if (expectedOn > targetDate) return { kind: 'LAUNCH', days: diffDays(targetDate, expectedOn) }
  if (neededOn && expectedOn > neededOn) return { kind: 'NEEDED', days: diffDays(neededOn, expectedOn) }
  return null
}

/** A confirmed SKU whose production start is still ahead: that start ("เริ่มผลิต {date}"; no "ผลิตเสร็จ" until then), else null. */
export function futureStartOf(item: Pick<ProductionItem, 'status' | 'startedOn'> | null | undefined, today: ISODate): ISODate | null {
  return item?.status === 'IN_PRODUCTION' && item.startedOn && item.startedOn > today ? item.startedOn : null
}

/** "วันที่ดำเนินการ": required, a real date within the bounds (null bounds = only required / real). */
export function orderStartError(startedOn: string | null | undefined, bounds: OrderStartBounds | null, err: ProductionErrors = PERR): string | null {
  if (typeof startedOn !== 'string' || startedOn === '') return err.startRequired
  if (!isRealDate(startedOn)) return err.dateInvalid
  if (bounds && startedOn < bounds.min) return err.startBeforePass(bounds.min)
  if (bounds && startedOn > bounds.max) return err.startTooLate(bounds.max)
  return null
}

/** An edited start may not follow a produced / delivered date already recorded on the order's items. */
export function orderStartAfterProducedError(
  startedOn: ISODate,
  items: readonly Pick<ProductionItem, 'producedOn' | 'deliveredOn'>[],
  err: ProductionErrors = PERR,
): string | null {
  const floor = earliestProducedOn(items)
  return floor && startedOn > floor ? err.startAfterProduced(floor) : null
}

/** "ระยะเวลาผลิตทั้งหมด": required, integer 1 … PRODUCTION_DAYS_MAX. */
export function productionDaysError(n: unknown, err: ProductionErrors = PERR): string | null {
  if (n === null || n === undefined || n === '') return err.daysRequired
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= PRODUCTION_DAYS_MAX ? null : err.days
}

/** The keys of orderFieldErrors, in dialog order. */
export type OrderField = 'manufacturerId' | 'referenceNo' | 'startedOn' | 'productionDays' | 'mainContactId' | 'coContactIds'

/** What orderFieldErrors checks a start against: its bounds, and on an edit the order's items (the start can't follow a produced date). */
export interface OrderStartRules {
  bounds: OrderStartBounds
  items?: readonly Pick<ProductionItem, 'producedOn' | 'deliveredOn'>[]
}

/**
 * The order fields of a confirm / an order edit, keyed in dialog order (the first is the one to report or focus):
 * manufacturer and main contact required, ≤ PRODUCTION_REF_MAX reference, the start (orderStartError with
 * `start.bounds`, then orderStartAfterProducedError with `start.items`) and the days (productionDaysError) — each
 * checked only when its key is not undefined (a confirm sends both; an edit only what changed, null = cleared → required),
 * the main contact not also a co-contact, ≤ ORDER_CO_CONTACTS_MAX co-contacts. Whether the ids exist, are active and on
 * the team is the API's check.
 */
export function orderFieldErrors(
  f: {
    manufacturerId: string | null
    mainContactId: string | null
    coContactIds: string[]
    referenceNo: string | null
    startedOn?: string | null
    productionDays?: number | null
  },
  err: ProductionErrors = PERR,
  start?: OrderStartRules,
): Partial<Record<OrderField, string>> {
  const out: Partial<Record<OrderField, string>> = {}
  if (!f.manufacturerId) out.manufacturerId = err.manufacturerRequired
  const ref = referenceNoError(f.referenceNo, err)
  if (ref) out.referenceNo = ref
  if (f.startedOn !== undefined) {
    const e =
      orderStartError(f.startedOn, start?.bounds ?? null, err) ??
      (start?.items ? orderStartAfterProducedError(f.startedOn as ISODate, start.items, err) : null)
    if (e) out.startedOn = e
  }
  if (f.productionDays !== undefined) {
    const e = productionDaysError(f.productionDays, err)
    if (e) out.productionDays = e
  }
  if (!f.mainContactId) out.mainContactId = err.mainContactRequired
  if (f.mainContactId && f.coContactIds.includes(f.mainContactId)) out.coContactIds = err.contactDuplicate
  else if (new Set(f.coContactIds).size > ORDER_CO_CONTACTS_MAX) out.coContactIds = err.coContactsMax
  return out
}

// ---------- permissions ----------

type Actor = Pick<User, 'id' | 'role'>
type ProposalLike = Pick<Proposal, 'status' | 'ownerId' | 'memberIds'>

export interface ProductionPerms {
  canWork: boolean
  canDecide: boolean
}

/** Owner, members, MANAGER, ADMIN: the note, advance, edit dates. */
export const canWorkProduction = (me: Actor | null | undefined, p: ProposalLike) => p.status !== 'CANCELLED' && canManageTasks(me, p)

/** Owner, MANAGER, ADMIN: confirm (with the quantities and the order), lead days, confirmed quantities, back, cancel / skip, restore, keep, order edits. */
export const canDecideProduction = (me: Actor | null | undefined, p: ProposalLike) => p.status !== 'CANCELLED' && canEditProposal(me, p)

export function productionPerms(me: Actor | null | undefined, p: ProposalLike): ProductionPerms {
  return { canWork: canWorkProduction(me, p), canDecide: canDecideProduction(me, p) }
}

/** A confirmed SKU's quantity (owner / manager); a pending SKU gets its quantity in the confirm dialog only. */
export function canEditQuantity(status: ProductionStatus, perms: ProductionPerms): boolean {
  return isConfirmedStatus(status) && perms.canDecide
}

export interface ProductionRowActions {
  editQuantity: boolean
  /** The forward step (team): IN_PRODUCTION → PRODUCED (once its start is not after today), PRODUCED → DELIVERED. */
  advanceTo: ProductionStatus | null
  /** futureStartOf(): an IN_PRODUCTION SKU whose start is after today ("เริ่มผลิต {date}", no "ผลิตเสร็จ" yet), any viewer. */
  startsOn: ISODate | null
  /** The step back (owner / manager). */
  backTo: ProductionStatus | null
  /** Any date this viewer may edit: produced / delivered (team, once recorded) or the need date (editNeededOn). */
  editDates: boolean
  /** "วันที่ต้องการสินค้า" of a SKU not delivered yet (owner / manager, like lead days). */
  editNeededOn: boolean
  /** Cancel a confirmed SKU (IN_PRODUCTION / PRODUCED). */
  cancel: boolean
  /** "ไม่ผลิต" a passed PENDING SKU. */
  skip: boolean
  restoreTo: ProductionStatus | null
  /** needsReview: "ผลิตต่อ" / "ส่งต่อตามแผน" / "รับทราบ" / "จำนวนเดิมใช้ได้". */
  keep: boolean
  /** "แก้ข้อมูลใบสั่งผลิต…" (owner / manager) of a SKU that carries an order, any status — fixing a document number is always allowed. */
  editOrder: boolean
}

/** What a viewer may do with one row on `today` (menus, buttons; the API checks the same). */
export function productionRowActions(
  row: Pick<ProductionRowCore, 'status' | 'item' | 'needsReview' | 'passed'>,
  perms: ProductionPerms,
  today: ISODate,
): ProductionRowActions {
  const { status } = row
  const { canWork, canDecide } = perms
  const editNeededOn = canDecide && (status === 'IN_PRODUCTION' || status === 'PRODUCED')
  const startsOn = futureStartOf(row.item, today)
  return {
    editQuantity: canEditQuantity(status, perms),
    // Not produced before it started: the advance date (≤ today) could not be ≥ the start anyway.
    advanceTo: canWork && !startsOn ? (NEXT_PRODUCTION[status] ?? null) : null,
    startsOn,
    backTo: canDecide ? (PREV_PRODUCTION[status] ?? null) : null,
    editDates: (canWork && (status === 'PRODUCED' || status === 'DELIVERED')) || editNeededOn,
    editNeededOn,
    cancel: canDecide && (status === 'IN_PRODUCTION' || status === 'PRODUCED'),
    skip: canDecide && status === 'PENDING' && row.passed,
    restoreTo: canDecide && status === 'CANCELLED' && row.item ? restoreTarget(row.item) : null,
    keep: canDecide && row.needsReview,
    editOrder: canDecide && row.item?.orderId != null,
  }
}
