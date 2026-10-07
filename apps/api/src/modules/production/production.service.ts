// "รอผลิต": production of the SKUs that passed buyer consideration. Which SKUs are listed is derived on every read
// from the PASSED presentation tracks (packages/shared/src/production.ts); production_items only holds what people
// recorded (confirmation with its quantity and start, produced / delivered dates, cancel / skip, acknowledgements, a
// quantity kept from a stepped-back confirm). Every write
// locks the proposal row first — the same lock presentation writes, task toggles and proposal edits take — so the
// passed set can't move under a confirm. Each route answers the whole ProductionView.
import { Injectable } from '@nestjs/common'
import {
  advanceDateError,
  cancelReasonError,
  datesErrors,
  diffDays,
  earliestPassedOn,
  formatQty,
  formatThaiDate,
  leadDaysError,
  NEXT_PRODUCTION,
  noteError,
  PERR,
  PREV_PRODUCTION,
  PRODUCTION_STATUS_LABEL,
  productionDeadline,
  productionFlagLabel,
  productionPerms,
  restoreTarget,
  sameIdSet,
  skuListLabel,
  defaultNeededOn,
  neededOnError,
  storeWord,
  todayBangkok,
  type ISODate,
  type ProductionEventKind,
  type ProductionRowCore,
  type ProductionStatus,
  type ProductionView,
  type Proposal,
  type User,
} from '@flowtrade/shared'
import { ActivityService } from '../../common/activity.service.js'
import { fromDateOnly } from '../../common/dates.js'
import { ApiError, conflict, forbidden, invalid } from '../../common/errors.js'
import { ProposalAccessService } from '../../common/proposal-access.service.js'
import { Prisma } from '../../generated/prisma/client.js'
import { PrismaService } from '../../prisma/prisma.service.js'
import { lockProposal } from '../tasks/task-tree.js'
import type { AdvanceBody, BackBody, CancelBody, ConfirmBody, DatesBody, KeepBody, PlanBody, QuantitiesBody } from './production.schemas.js'
import { loadProductionDerived, loadProductionView, productionLink, type ProductionState } from './production.state.js'

type Tx = Prisma.TransactionClient
type Row = ProductionRowCore
/** Columns a write sets; the same object creates a virtual row or updates a stored one. */
type ItemData = Pick<
  Prisma.ProductionItemUncheckedCreateInput,
  'quantity' | 'status' | 'confirmedAt' | 'confirmedById' | 'startedOn' | 'neededOn' | 'keptAt' | 'keptById' | 'ackStoreIds' | 'cancelledAt' | 'cancelledById' | 'cancelReason'
>

/** The row moved on since the client loaded the view; the web refetches on any error. */
const stale = (message: string) => conflict(message, 'STALE')
/** /items/:productId of a SKU the tab does not list (any more). */
const gone = () => new ApiError(404, 'NOT_FOUND', PERR.gone)
const clip = (text: string, max = 80) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)
const pieces = (n: number) => `${formatQty(n)} ชิ้น`
const SHOWN_SKUS = 3

/** One production_events row (events() spaces the rows of one call 1 ms apart, so the log keeps their order). */
interface EventInput {
  itemId: string | null
  kind: ProductionEventKind
  fromStatus?: ProductionStatus | null
  toStatus?: ProductionStatus | null
  date?: ISODate | null
  quantityBefore?: number | null
  quantityAfter?: number | null
  leadDaysBefore?: number | null
  leadDaysAfter?: number | null
  reason?: string | null
  detail?: Prisma.InputJsonObject
}

@Injectable()
export class ProductionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProposalAccessService,
    private readonly activity: ActivityService,
  ) {}

  // ---------- helpers ----------

  /** 404 → proposal lock → CANCELLED 422 → team 403 (same order as presentation writes), then the derived state. */
  private async open(tx: Tx, user: User, proposalId: string) {
    // Visibility before the lock: someone who can't see the proposal gets 404, never a lock wait or a 409.
    await this.access.loadVisible(tx, user, proposalId)
    await lockProposal(tx, proposalId)
    const proposal = await this.access.loadVisible(tx, user, proposalId)
    if (proposal.status === 'CANCELLED') throw invalid(PERR.cancelled)
    const perms = productionPerms(user, proposal)
    if (!perms.canWork) throw forbidden(PERR.readOnly)
    const today = todayBangkok()
    const state = await loadProductionDerived(tx, proposal, today)
    return { proposal, perms, today, state, word: storeWord(proposal.channel), now: new Date() }
  }

  private rowOf(state: ProductionState, productId: string): Row {
    const row = state.derived.rows.find((r) => r.productId === productId)
    if (!row) throw gone()
    return row
  }

  private async view(tx: Tx, proposal: Proposal, today: ISODate): Promise<ProductionView> {
    return (await loadProductionView(tx, proposal, today)).view
  }

  private async events(tx: Tx, proposalId: string, actorId: string, now: Date, events: EventInput[]) {
    if (events.length === 0) return
    await tx.productionEvent.createMany({
      data: events.map(({ date, ...e }, i) => ({ proposalId, actorId, recordedAt: new Date(now.getTime() + i), detail: {}, ...e, date: fromDateOnly(date) })),
    })
  }

  private log(tx: Tx, user: User, proposal: Proposal, action: string, summary: string) {
    return this.activity.log(tx, user, `production.${action}`, 'PROPOSAL', proposal.id, proposal.id, summary)
  }

  private notifyTeam(tx: Tx, user: User, proposal: Proposal, title: string) {
    return this.activity.notify(
      tx,
      [proposal.ownerId, ...proposal.memberIds],
      { type: 'PROPOSAL_STATUS', title, body: `${proposal.code} ${proposal.title}`, link: productionLink(proposal.id) },
      user.id,
    )
  }

  /** An existing row's id, or a new row in `status` (a skip, a confirm of a virtual row). */
  private async ensureItem(tx: Tx, proposal: Proposal, row: Row, data: ItemData): Promise<string> {
    if (row.item) {
      await tx.productionItem.update({ where: { id: row.item.id }, data })
      return row.item.id
    }
    const created = await tx.productionItem.create({ data: { ...data, proposalId: proposal.id, productId: row.productId }, select: { id: true } })
    return created.id
  }

  // ---------- read ----------

  async get(user: User, proposalId: string): Promise<ProductionView> {
    // One snapshot: tracks, items, plan and the log can't disagree with each other.
    return this.prisma.$transaction(
      async (tx) => {
        const proposal = await this.access.loadVisible(tx, user, proposalId)
        return this.view(tx, proposal, todayBangkok())
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    )
  }

  // ---------- writes ----------

  /** Quantities of confirmed SKUs (owner / manager); a pending SKU gets its quantity at confirm. Unchanged values are skipped. */
  saveQuantities(user: User, proposalId: string, input: QuantitiesBody): Promise<ProductionView> {
    return this.prisma.$transaction(async (tx) => {
      const { proposal, perms, today, state, now } = await this.open(tx, user, proposalId)
      if (!perms.canDecide) throw forbidden(PERR.confirmedQtyOnly)
      const changes: { row: Row; before: number | null; after: number }[] = []
      for (const it of input.items) {
        const row = state.derived.rows.find((r) => r.productId === it.productId)
        const sku = state.skuOf(it.productId)
        if (!row) throw stale(PERR.notListed(sku))
        if (row.status === 'CANCELLED') throw stale(PERR.stale(sku))
        // The dialog only offers confirmed SKUs: a pending one was stepped back since the client loaded it.
        if (row.status === 'PENDING') throw stale(PERR.stale(sku))
        const before = row.item?.quantity ?? null
        if (before !== it.before) throw stale(PERR.qtyChanged(sku))
        if (before !== it.quantity) changes.push({ row, before, after: it.quantity })
      }
      if (changes.length === 0) return this.view(tx, proposal, today)

      const events: EventInput[] = []
      for (const { row, before, after } of changes) {
        const data: ItemData = { quantity: after }
        // A confirmed number decided again for the stores passing now acknowledges a change of those stores.
        const cur = row.passedStores.map((s) => s.store.id)
        if (cur.length > 0) {
          data.ackStoreIds = cur
          if (row.needsReview) Object.assign(data, { keptAt: now, keptById: user.id })
        }
        const itemId = await this.ensureItem(tx, proposal, row, data)
        events.push({ itemId, kind: 'QUANTITY', fromStatus: row.status, toStatus: row.status, quantityBefore: before, quantityAfter: after })
      }
      await this.events(tx, proposal.id, user.id, now, events)
      const parts = changes.map(({ row, before, after }) => {
        const sku = state.skuOf(row.productId)
        return before === null ? `${sku} ${pieces(after)}` : `${sku} ${formatQty(before)} → ${pieces(after)}`
      })
      const more = parts.length > SHOWN_SKUS ? ` และอีก ${parts.length - SHOWN_SKUS} SKU` : ''
      await this.log(tx, user, proposal, 'quantity', `บันทึกจำนวนผลิต ${parts.slice(0, SHOWN_SKUS).join(', ')}${more}`)
      return this.view(tx, proposal, today)
    })
  }

  /** Lead days (owner / manager) and the note (team); no change writes nothing. */
  savePlan(user: User, proposalId: string, input: PlanBody): Promise<ProductionView> {
    return this.prisma.$transaction(async (tx) => {
      const { proposal, perms, today, state, now } = await this.open(tx, user, proposalId)
      const plan = state.plan
      const leadDays = input.leadDays ?? plan.leadDays
      const note = input.note === undefined ? plan.note : input.note
      const leadChanged = leadDays !== plan.leadDays
      const noteChanged = note !== plan.note
      if (leadChanged && !perms.canDecide) throw forbidden(PERR.leadDaysOnly)
      const problem = leadDaysError(leadDays) ?? noteError(note)
      if (problem) throw invalid(problem)
      if (!leadChanged && !noteChanged) return this.view(tx, proposal, today)

      await tx.productionPlan.upsert({
        where: { proposalId: proposal.id },
        create: { proposalId: proposal.id, leadDays, note, updatedById: user.id },
        update: { leadDays, note, updatedById: user.id },
      })
      await this.events(tx, proposal.id, user.id, now, [{ itemId: null, kind: 'PLAN', leadDaysBefore: plan.leadDays, leadDaysAfter: leadDays, detail: { noteChanged } }])
      const lead = `ตั้ง deadline ผลิต ${leadDays} วันก่อนวางขาย (${formatThaiDate(productionDeadline(proposal.targetDate, leadDays))})`
      await this.log(tx, user, proposal, 'plan', leadChanged ? `${lead}${noteChanged ? ' และแก้หมายเหตุ' : ''}` : 'แก้หมายเหตุการผลิต')
      return this.view(tx, proposal, today)
    })
  }

  /** Exactly the pending set, in one press (owner / manager); the quantities the confirmer saw are what is stored. */
  confirm(user: User, proposalId: string, input: ConfirmBody): Promise<ProductionView> {
    return this.prisma.$transaction(async (tx) => {
      const { proposal, perms, today, state, now } = await this.open(tx, user, proposalId)
      if (!perms.canDecide) throw forbidden(PERR.confirmOnly)
      const { pendingIds, summary } = state.derived
      if (pendingIds.length === 0) throw stale(PERR.nothingPending)
      if (input.items.length !== pendingIds.length || !sameIdSet(input.items.map((i) => i.productId), pendingIds)) throw stale(PERR.pendingChanged)
      const rows = pendingIds.map((id) => this.rowOf(state, id))
      for (const row of rows) {
        const sent = input.items.find((i) => i.productId === row.productId)!
        if ((row.item?.quantity ?? null) !== sent.saved) throw stale(PERR.qtyChanged(state.skuOf(row.productId)))
      }
      const neededOn = input.neededOn ?? defaultNeededOn(summary.planDeadline, today, proposal.targetDate)
      const problem = neededOnError(neededOn, today, proposal.targetDate)
      if (problem) throw invalid(problem)
      // Production can't be finished before the buyer passed it: the start is the set's earliest pass.
      const startedOn = earliestPassedOn(rows) ?? today

      const events: EventInput[] = []
      let total = 0
      for (const row of rows) {
        const quantity = input.items.find((i) => i.productId === row.productId)!.quantity
        const before = row.item?.quantity ?? null
        total += quantity
        const itemId = await this.ensureItem(tx, proposal, row, {
          quantity,
          status: 'IN_PRODUCTION',
          confirmedAt: now,
          confirmedById: user.id,
          startedOn: fromDateOnly(startedOn),
          neededOn: fromDateOnly(neededOn),
          keptAt: null,
          keptById: null,
          ackStoreIds: row.passedStores.map((s) => s.store.id),
        })
        if (before !== quantity) events.push({ itemId, kind: 'QUANTITY', fromStatus: 'PENDING', toStatus: 'PENDING', quantityBefore: before, quantityAfter: quantity })
        events.push({ itemId, kind: 'CONFIRM', fromStatus: 'PENDING', toStatus: 'IN_PRODUCTION', date: startedOn, quantityBefore: before, quantityAfter: quantity, detail: { neededOn } })
      }
      await this.events(tx, proposal.id, user.id, now, events)
      const skus = skuListLabel(rows.map((r) => state.skuOf(r.productId)))
      const need = formatThaiDate(neededOn)
      await this.log(tx, user, proposal, 'confirm', `ยืนยันเริ่มผลิต ${rows.length} SKU (${skus}) รวม ${pieces(total)} · ต้องการสินค้า ${need}`)
      await this.notifyTeam(tx, user, proposal, `ยืนยันเริ่มผลิต ${rows.length} SKU แล้ว · ต้องการสินค้า ${need}`)
      return this.view(tx, proposal, today)
    })
  }

  /** One step forward for several SKUs (team); from IN_PRODUCTION with to DELIVERED = produced and delivered at once. */
  advance(user: User, proposalId: string, input: AdvanceBody): Promise<ProductionView> {
    return this.prisma.$transaction(async (tx) => {
      const { proposal, today, state, now, word } = await this.open(tx, user, proposalId)
      const to = NEXT_PRODUCTION[input.from] as 'PRODUCED' | 'DELIVERED'
      const both = input.from === 'IN_PRODUCTION' && input.to === 'DELIVERED'
      const rows = input.productIds.map((id) => {
        const row = state.derived.rows.find((r) => r.productId === id)
        if (!row || row.status !== input.from || !row.item) throw stale(PERR.stale(state.skuOf(id)))
        return row
      })
      // Date rules every row shares (required, real, not in the future) answer unprefixed; per-row bounds name the SKU.
      const empty = { startedOn: null, producedOn: null }
      const common = advanceDateError(to, input.date, empty, today) ?? (both ? advanceDateError('DELIVERED', input.deliveredOn, empty, today) : null)
      if (common) throw invalid(common)
      for (const row of rows) {
        const item = row.item!
        const problem =
          advanceDateError(to, input.date, item, today) ??
          (both ? advanceDateError('DELIVERED', input.deliveredOn, { startedOn: item.startedOn, producedOn: input.date }, today) : null)
        if (problem) throw invalid(rows.length > 1 ? `${state.skuOf(row.productId)}: ${problem}` : problem)
      }

      const deliveredOn = both ? input.deliveredOn! : to === 'DELIVERED' ? input.date : null
      const events: EventInput[] = []
      for (const row of rows) {
        const data: Prisma.ProductionItemUncheckedUpdateInput =
          to === 'PRODUCED'
            ? { status: both ? 'DELIVERED' : 'PRODUCED', producedOn: fromDateOnly(input.date), producedById: user.id }
            : { status: 'DELIVERED' }
        // Delivery freezes the row's own due date ("วันที่ต้องการสินค้า", else the plan deadline).
        if (deliveredOn) Object.assign(data, { deliveredOn: fromDateOnly(deliveredOn), deliveredById: user.id, dueOn: fromDateOnly(row.dueOn) })
        await tx.productionItem.update({ where: { id: row.item!.id }, data })
        events.push({ itemId: row.item!.id, kind: 'ADVANCE', fromStatus: input.from, toStatus: to, date: input.date })
        if (both) events.push({ itemId: row.item!.id, kind: 'ADVANCE', fromStatus: 'PRODUCED', toStatus: 'DELIVERED', date: deliveredOn })
      }
      await this.events(tx, proposal.id, user.id, now, events)

      const skus = `${rows.length} SKU (${skuListLabel(rows.map((r) => state.skuOf(r.productId)))})`
      const lateDays = deliveredOn ? Math.max(0, ...rows.map((r) => diffDays(r.dueOn, deliveredOn))) : 0
      const late = lateDays > 0 ? ` · ช้ากว่ากำหนด ${lateDays} วัน` : ''
      if (both) {
        await this.log(tx, user, proposal, 'delivered', `บันทึกผลิตเสร็จและส่งเข้าคลัง/${word}แล้ว ${skus} · ผลิตเสร็จ ${formatThaiDate(input.date)} · ส่ง ${formatThaiDate(deliveredOn!)}${late}`)
      } else if (to === 'PRODUCED') {
        await this.log(tx, user, proposal, 'produced', `บันทึกผลิตเสร็จ ${skus} · ${formatThaiDate(input.date)}`)
      } else {
        await this.log(tx, user, proposal, 'delivered', `บันทึกส่งเข้าคลัง/${word}แล้ว ${skus} · ${formatThaiDate(input.date)}${late}`)
      }
      const { view } = await loadProductionView(tx, proposal, today)
      if (state.derived.summary.state !== 'DONE' && view.summary.state === 'DONE') {
        await this.notifyTeam(tx, user, proposal, `ส่งสินค้าเข้าคลัง/${word}ครบ ${view.summary.delivered} SKU แล้ว`)
      }
      return view
    })
  }

  /** One step back (owner / manager); IN_PRODUCTION → PENDING = ย้อนกลับเป็น “รอยืนยัน” (the quantity is kept and prefilled at the next confirm). */
  back(user: User, proposalId: string, productId: string, input: BackBody): Promise<ProductionView> {
    return this.prisma.$transaction(async (tx) => {
      const { proposal, perms, today, state, now } = await this.open(tx, user, proposalId)
      if (!perms.canDecide) throw forbidden(PERR.decideOnly)
      const row = this.rowOf(state, productId)
      const sku = state.skuOf(productId)
      if (row.status !== input.from || !row.item) throw stale(PERR.stale(sku))
      const item = row.item
      const to = PREV_PRODUCTION[input.from]!
      let cleared: ISODate | null
      if (input.from === 'DELIVERED') {
        cleared = item.deliveredOn
        await tx.productionItem.update({ where: { id: item.id }, data: { status: to, deliveredOn: null, deliveredById: null, dueOn: null } })
      } else if (input.from === 'PRODUCED') {
        cleared = item.producedOn
        await tx.productionItem.update({ where: { id: item.id }, data: { status: to, producedOn: null, producedById: null } })
      } else {
        cleared = item.startedOn
        const reset = { status: to, confirmedAt: null, confirmedById: null, startedOn: null, neededOn: null, keptAt: null, keptById: null, ackStoreIds: [] }
        await tx.productionItem.update({ where: { id: item.id }, data: reset })
      }
      // A draft of a SKU no longer in the proposal would be invisible and block deleting the product: drop it (and its log).
      if (to === 'PENDING' && !row.inProposal) await tx.productionItem.delete({ where: { id: item.id } })
      else await this.events(tx, proposal.id, user.id, now, [{ itemId: item.id, kind: 'BACK', fromStatus: input.from, toStatus: to, date: cleared }])
      const summary =
        to === 'PENDING'
          ? `ย้อนการยืนยันผลิต ${sku} กลับเป็นรอยืนยัน`
          : `ย้อนสถานะ ${sku}: ${PRODUCTION_STATUS_LABEL[input.from]} → ${PRODUCTION_STATUS_LABEL[to]}`
      await this.log(tx, user, proposal, 'back', summary)
      return this.view(tx, proposal, today)
    })
  }

  /**
   * Produced / delivered dates once recorded (team), and "วันที่ต้องการสินค้า" of a SKU not yet delivered (owner /
   * manager: it is the due date, like lead days); a frozen dueOn stays.
   */
  editDates(user: User, proposalId: string, productId: string, input: DatesBody): Promise<ProductionView> {
    return this.prisma.$transaction(async (tx) => {
      const { proposal, perms, today, state, now } = await this.open(tx, user, proposalId)
      if (input.neededOn !== undefined && !perms.canDecide) throw forbidden(PERR.neededOnly)
      const row = this.rowOf(state, productId)
      const sku = state.skuOf(productId)
      const item = row.item ?? { status: row.status, startedOn: null, producedOn: null, deliveredOn: null }
      const errors = datesErrors(item, input, today, proposal.targetDate)
      const problem = errors.neededOn ?? errors.producedOn ?? errors.deliveredOn
      if (problem) throw invalid(problem, errors as Record<string, string>)
      const changed: Partial<Record<'neededOn' | 'producedOn' | 'deliveredOn', [ISODate | null, ISODate]>> = {}
      // A row confirmed before the field existed was due on the plan deadline: that is its "before".
      if (input.neededOn !== undefined && input.neededOn !== row.dueOn) changed.neededOn = [row.dueOn, input.neededOn]
      if (input.producedOn !== undefined && input.producedOn !== item.producedOn) changed.producedOn = [item.producedOn, input.producedOn]
      if (input.deliveredOn !== undefined && input.deliveredOn !== item.deliveredOn) changed.deliveredOn = [item.deliveredOn, input.deliveredOn]
      if (!row.item || Object.keys(changed).length === 0) return this.view(tx, proposal, today)

      await tx.productionItem.update({
        where: { id: row.item.id },
        data: {
          ...(changed.neededOn ? { neededOn: fromDateOnly(changed.neededOn[1]) } : {}),
          ...(changed.producedOn ? { producedOn: fromDateOnly(changed.producedOn[1]) } : {}),
          ...(changed.deliveredOn ? { deliveredOn: fromDateOnly(changed.deliveredOn[1]) } : {}),
        },
      })
      await this.events(tx, proposal.id, user.id, now, [{ itemId: row.item.id, kind: 'DATES', fromStatus: row.status, toStatus: row.status, detail: changed }])
      const part = (label: string, pair?: [ISODate | null, ISODate]) => (pair ? [`${label} ${formatThaiDate(pair[0])} → ${formatThaiDate(pair[1])}`] : [])
      await this.log(tx, user, proposal, 'dates', `แก้วันที่ ${sku}: ${[...part('ต้องการสินค้า', changed.neededOn), ...part('ผลิตเสร็จ', changed.producedOn), ...part('ส่ง', changed.deliveredOn)].join(', ')}`)
      return this.view(tx, proposal, today)
    })
  }

  /** Owner / manager: cancel a confirmed SKU (IN_PRODUCTION / PRODUCED), or "ไม่ผลิต" a pending one. */
  cancel(user: User, proposalId: string, productId: string, input: CancelBody): Promise<ProductionView> {
    return this.prisma.$transaction(async (tx) => {
      const { proposal, perms, today, state, now } = await this.open(tx, user, proposalId)
      if (!perms.canDecide) throw forbidden(PERR.decideOnly)
      const row = this.rowOf(state, productId)
      const sku = state.skuOf(productId)
      const skip = input.from === 'PENDING'
      const problem = cancelReasonError(input.reason, PERR, skip)
      if (problem) throw invalid(problem)
      if (row.status === 'DELIVERED') throw invalid(PERR.cancelDelivered)
      if (row.status !== input.from) throw stale(PERR.stale(sku))

      const itemId = await this.ensureItem(tx, proposal, row, { status: 'CANCELLED', cancelledAt: now, cancelledById: user.id, cancelReason: input.reason })
      await this.events(tx, proposal.id, user.id, now, [{ itemId, kind: 'CANCEL', fromStatus: row.status, toStatus: 'CANCELLED', reason: input.reason }])
      if (skip) await this.log(tx, user, proposal, 'skip', `ไม่ผลิต ${sku} (${clip(input.reason)})`)
      else await this.log(tx, user, proposal, 'cancel', `ยกเลิกการผลิต ${sku} (${clip(input.reason)})`)
      return this.view(tx, proposal, today)
    })
  }

  /** Owner / manager: a skip back to PENDING, a cancelled production back to PRODUCED / IN_PRODUCTION. */
  restore(user: User, proposalId: string, productId: string): Promise<ProductionView> {
    return this.prisma.$transaction(async (tx) => {
      const { proposal, perms, today, state, now } = await this.open(tx, user, proposalId)
      if (!perms.canDecide) throw forbidden(PERR.decideOnly)
      const row = this.rowOf(state, productId)
      const sku = state.skuOf(productId)
      if (row.status !== 'CANCELLED' || !row.item) throw stale(PERR.stale(sku))
      const to = restoreTarget(row.item)
      await tx.productionItem.update({ where: { id: row.item.id }, data: { status: to, cancelledAt: null, cancelledById: null, cancelReason: null } })
      await this.events(tx, proposal.id, user.id, now, [{ itemId: row.item.id, kind: 'RESTORE', fromStatus: 'CANCELLED', toStatus: to }])
      await this.log(tx, user, proposal, 'restore', `กู้คืนการผลิต ${sku} → ${PRODUCTION_STATUS_LABEL[to]}`)
      return this.view(tx, proposal, today)
    })
  }

  /** Owner / manager: carry on with a confirmed SKU whose passing stores changed, for exactly the stores the client saw. */
  keep(user: User, proposalId: string, productId: string, input: KeepBody): Promise<ProductionView> {
    return this.prisma.$transaction(async (tx) => {
      const { proposal, perms, today, state, now, word } = await this.open(tx, user, proposalId)
      if (!perms.canDecide) throw forbidden(PERR.decideOnly)
      const row = this.rowOf(state, productId)
      const sku = state.skuOf(productId)
      const cur = row.passedStores.map((s) => s.store.id)
      if (!row.needsReview || !row.flag || !row.item || !sameIdSet(input.storeIds, cur)) throw stale(PERR.stale(sku))
      await tx.productionItem.update({ where: { id: row.item.id }, data: { keptAt: now, keptById: user.id, ackStoreIds: cur } })
      await this.events(tx, proposal.id, user.id, now, [{ itemId: row.item.id, kind: 'KEEP', fromStatus: row.status, toStatus: row.status, detail: { storeIds: cur } }])
      let summary: string
      if (row.flag === 'STORES_CHANGED') summary = `ใช้จำนวนผลิต ${sku} เดิมหลัง${word}ที่ผ่านเปลี่ยน`
      else if (row.status === 'DELIVERED') summary = `รับทราบ ${sku}: ${productionFlagLabel(row.flag, word)}`
      else summary = `${row.status === 'PRODUCED' ? 'ส่งต่อตามแผน' : 'ผลิตต่อ'} ${sku} แม้${productionFlagLabel(row.flag, word)}`
      await this.log(tx, user, proposal, 'keep', summary)
      return this.view(tx, proposal, today)
    })
  }
}
