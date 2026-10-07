// "รอผลิต" read side: rows ↔ the shared production shapes and the derived view (PASSED tracks + items + plan). Plain
// functions, so the presentation / proposals services load the same state inside their own transactions and send
// the owner the production notices their writes cause.
import {
  deriveProduction,
  PRODUCTION_EVENTS_MAX,
  PRODUCTION_LEAD_DAYS_DEFAULT,
  productionDiff,
  reduceTrack,
  storeSnapshot,
  type ISODate,
  type ProductionDerived,
  type ProductionEvent,
  type ProductionItem,
  type ProductionItemCore,
  type ProductionPlan,
  type ProductionRow,
  type ProductionView,
  type Proposal,
  type StoreSnapshot,
  type User,
} from '@flowtrade/shared'
import type { ActivityService } from '../../common/activity.service.js'
import { iso, isoOrNull, toDateOnly } from '../../common/dates.js'
import type { Prisma } from '../../generated/prisma/client.js'
import type { Db } from '../../prisma/prisma.service.js'
import { toStoreTrack, trackInclude } from '../presentation/presentation.mappers.js'

export type ItemRow = Prisma.ProductionItemGetPayload<object>
type EventRow = Prisma.ProductionEventGetPayload<object>
type PlanRow = Prisma.ProductionPlanGetPayload<object>

export const productSelect = { id: true, sku: true, name: true, brand: true, size: true, isActive: true } satisfies Prisma.ProductSelect
type ProductRow = Prisma.ProductGetPayload<{ select: typeof productSelect }>

/** Every route of the tab and its notices link here. */
export const productionLink = (proposalId: string) => `/proposals/${proposalId}?tab=production`

export function toProductionItem(row: ItemRow): ProductionItem {
  return {
    id: row.id,
    productId: row.productId,
    quantity: row.quantity,
    status: row.status,
    confirmedAt: isoOrNull(row.confirmedAt),
    confirmedById: row.confirmedById,
    startedOn: toDateOnly(row.startedOn),
    producedOn: toDateOnly(row.producedOn),
    producedById: row.producedById,
    deliveredOn: toDateOnly(row.deliveredOn),
    deliveredById: row.deliveredById,
    dueOn: toDateOnly(row.dueOn),
    cancelledAt: isoOrNull(row.cancelledAt),
    cancelledById: row.cancelledById,
    cancelReason: row.cancelReason,
    keptAt: isoOrNull(row.keptAt),
    keptById: row.keptById,
    ackStoreIds: row.ackStoreIds,
    updatedAt: iso(row.updatedAt),
  }
}

/** The fields deriveProduction reads (home loads only these columns). */
export function toProductionItemCore(row: Pick<ItemRow, 'productId' | 'status' | 'quantity' | 'confirmedAt' | 'deliveredOn' | 'dueOn' | 'ackStoreIds'>): ProductionItemCore {
  return {
    productId: row.productId,
    status: row.status,
    quantity: row.quantity,
    confirmedAt: isoOrNull(row.confirmedAt),
    deliveredOn: toDateOnly(row.deliveredOn),
    dueOn: toDateOnly(row.dueOn),
    ackStoreIds: row.ackStoreIds,
  }
}

function toPlan(row: PlanRow | null): ProductionPlan {
  if (!row) return { leadDays: PRODUCTION_LEAD_DAYS_DEFAULT, note: null, isDefault: true, updatedById: null, updatedAt: null }
  return { leadDays: row.leadDays, note: row.note, isDefault: false, updatedById: row.updatedById, updatedAt: iso(row.updatedAt) }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function toProductionEvent(row: EventRow, productOf: Map<string, string>): ProductionEvent {
  return {
    id: row.id,
    itemId: row.itemId,
    productId: row.itemId ? (productOf.get(row.itemId) ?? null) : null,
    kind: row.kind,
    actorId: row.actorId,
    recordedAt: iso(row.recordedAt),
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    date: toDateOnly(row.date),
    quantityBefore: row.quantityBefore,
    quantityAfter: row.quantityAfter,
    leadDaysBefore: row.leadDaysBefore,
    leadDaysAfter: row.leadDaysAfter,
    reason: row.reason,
    detail: isObject(row.detail) ? row.detail : {},
  }
}

export interface ProductionState {
  derived: ProductionDerived
  /** Every production_items row of the proposal (proposal SKUs and removed ones), by SKU. */
  items: ProductionItem[]
  plan: ProductionPlan
  /** In-proposal stores, proposal store order. */
  stores: StoreSnapshot[]
  /** Proposal SKUs + every item's product. */
  products: Map<string, ProductRow>
  /** SKU text for messages; never throws. */
  skuOf: (productId: string) => string
}

/** The proposal's production, derived. Inside a transaction the reads run one after another on the tx client. */
export async function loadProductionDerived(db: Db, proposal: Proposal, today: ISODate): Promise<ProductionState> {
  const storeRows = await db.store.findMany({ where: { id: { in: proposal.storeIds } }, select: { id: true, name: true, shortName: true, color: true } })
  const stores = proposal.storeIds.flatMap((id) => {
    const s = storeRows.find((r) => r.id === id)
    return s ? [storeSnapshot(s)] : []
  })
  const tracks = await db.presentationTrack.findMany({ where: { proposalId: proposal.id, stage: 'PASSED' }, include: trackInclude })
  const itemRows = await db.productionItem.findMany({ where: { proposalId: proposal.id }, orderBy: [{ product: { sku: 'asc' } }, { id: 'asc' }] })
  const planRow = await db.productionPlan.findUnique({ where: { proposalId: proposal.id } })
  const productIds = [...new Set([...proposal.productIds, ...itemRows.map((i) => i.productId)])]
  const productRows = productIds.length ? await db.product.findMany({ where: { id: { in: productIds } }, select: productSelect }) : []

  const ctx = { proposal: { stores, productIds: proposal.productIds }, packages: [] }
  const views = tracks.map((t) => reduceTrack(toStoreTrack(t), ctx))
  const items = itemRows.map(toProductionItem)
  const plan = toPlan(planRow)
  const derived = deriveProduction({ productIds: proposal.productIds, targetDate: proposal.targetDate, leadDays: plan.leadDays, views, items }, today)
  const products = new Map(productRows.map((p) => [p.id, p]))
  return { derived, items, plan, stores, products, skuOf: (id) => products.get(id)?.sku ?? 'สินค้านี้' }
}

/** + the log: the ProductionView every production route answers. */
export async function loadProductionView(db: Db, proposal: Proposal, today: ISODate): Promise<{ view: ProductionView; state: ProductionState }> {
  const state = await loadProductionDerived(db, proposal, today)
  const eventRows = await db.productionEvent.findMany({ where: { proposalId: proposal.id }, orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }], take: PRODUCTION_EVENTS_MAX })
  const productOf = new Map(state.items.map((i) => [i.id, i.productId]))
  const rows = state.derived.rows.map((row): ProductionRow => {
    const p = state.products.get(row.productId)
    const product = p ?? { id: row.productId, sku: '', name: '', brand: '', size: null, isActive: false }
    return { ...row, product }
  })
  return {
    state,
    view: {
      version: 1,
      proposalId: proposal.id,
      today,
      targetDate: proposal.targetDate,
      plan: state.plan,
      rows,
      summary: state.derived.summary,
      pendingIds: state.derived.pendingIds,
      events: eventRows.map((e) => toProductionEvent(e, productOf)),
    },
  }
}

/**
 * Owner notices after a presentation / proposal write moved the passed set: SKUs newly waiting for confirmation, and
 * confirmed SKUs newly needing review. No activity entry (the presentation / proposal entry already exists).
 */
export async function notifyProductionChanges(
  db: Db,
  activity: ActivityService,
  actor: Pick<User, 'id'>,
  proposal: Pick<Proposal, 'id' | 'code' | 'title' | 'ownerId'>,
  before: Pick<ProductionDerived<ProductionItemCore>, 'pendingIds' | 'flaggedIds'>,
  after: Pick<ProductionDerived<ProductionItemCore>, 'pendingIds' | 'flaggedIds'>,
) {
  const { newPending, newFlagged } = productionDiff(before, after)
  const notice = (title: string) => ({ type: 'PROPOSAL_STATUS' as const, title, body: `${proposal.code} ${proposal.title}`, link: productionLink(proposal.id) })
  if (newPending.length > 0) await activity.notify(db, [proposal.ownerId], notice(`มี ${after.pendingIds.length} SKU ผ่าน Buyer แล้ว — รอยืนยันเริ่มผลิต`), actor.id)
  if (newFlagged.length > 0) await activity.notify(db, [proposal.ownerId], notice(`${after.flaggedIds.length} SKU ที่ยืนยันผลิตแล้วต้องตรวจสอบ`), actor.id)
}
