// "รอผลิต": production of the SKUs that passed buyer consideration. Which SKUs are listed is derived on every read
// from the PASSED presentation tracks (packages/shared/src/production.ts); production_items only holds what people
// recorded (confirmation with its quantity and start, produced / delivered dates, cancel / skip, acknowledgements, a
// quantity kept from a stepped-back confirm, the "ใบสั่งผลิต" each SKU was confirmed under). Every write
// locks the proposal row first — the same lock presentation writes, task toggles and proposal edits take — so the
// passed set can't move under a confirm. Each route answers the whole ProductionView.
import { Injectable } from '@nestjs/common'
import {
  addDays,
  advanceDateError,
  cancelReasonError,
  cleanReferenceNo,
  datesErrors,
  diffDays,
  earliestPassedOn,
  formatQty,
  formatThaiDate,
  leadDaysError,
  NEXT_PRODUCTION,
  noteError,
  orderFieldErrors,
  orderLabel,
  orderEditStartFloor,
  orderStartBounds,
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
  type OrderStartRules,
  type ProductionEventKind,
  type ProductionOrderFields,
  type ProductionRowCore,
  type ProductionStatus,
  type ProductionView,
  type Proposal,
  type User,
} from '@flowtrade/shared'
import { ActivityService } from '../../common/activity.service.js'
import { fromDateOnly, iso, toDateOnly } from '../../common/dates.js'
import { ApiError, conflict, forbidden, invalid } from '../../common/errors.js'
import { ProposalAccessService } from '../../common/proposal-access.service.js'
import { config } from '../../config.js'
import { Prisma } from '../../generated/prisma/client.js'
import { PrismaService } from '../../prisma/prisma.service.js'
import { lockProposal } from '../tasks/task-tree.js'
import type { AdvanceBody, BackBody, CancelBody, ConfirmBody, DatesBody, KeepBody, OrderEditBody, PlanBody, QuantitiesBody } from './production.schemas.js'
import { itemsOfOrder, loadProductionDerived, loadProductionView, orderInclude, productionLink, type ProductionState } from './production.state.js'

type Tx = Prisma.TransactionClient
type Row = ProductionRowCore
/** Columns a write sets; the same object creates a virtual row or updates a stored one. */
type ItemData = Pick<
  Prisma.ProductionItemUncheckedCreateInput,
  'quantity' | 'status' | 'confirmedAt' | 'confirmedById' | 'startedOn' | 'neededOn' | 'orderId' | 'keptAt' | 'keptById' | 'ackStoreIds' | 'cancelledAt' | 'cancelledById' | 'cancelReason'
>
/** An order being edited: its manufacturer, and each person in the role they hold, may stay even when deactivated (or no longer on the team) since. */
interface OrderCurrent {
  manufacturerId: string
  mainContactId: string
  coContactIds: string[]
}
/**
 * Order fields as sent: a missing manufacturer / main contact is refused by orderFieldErrors (PERR copy, `fields`); the
 * schedule is checked only when not undefined (a confirm always sends it, an edit only what changed; null → required).
 */
type OrderFieldsInput = Omit<ProductionOrderFields, 'manufacturerId' | 'mainContactId' | 'startedOn' | 'productionDays'> & {
  manufacturerId: string | null
  mainContactId: string | null
  startedOn?: string | null
  productionDays?: number | null
}
/** What passed checkOrderFields: undefined schedule fields were not sent / unchanged. */
type OrderFieldsChecked = Omit<ProductionOrderFields, 'startedOn' | 'productionDays'> & { startedOn?: ISODate; productionDays?: number }
type Named = { name: string; nickname: string | null }

/** The row moved on since the client loaded the view; the web refetches on any error. */
const stale = (message: string) => conflict(message, 'STALE')
/** /items/:productId of a SKU the tab does not list (any more). */
const gone = () => new ApiError(404, 'NOT_FOUND', PERR.gone)
const clip = (text: string, max = 80) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)
const pieces = (n: number) => `${formatQty(n)} ชิ้น`
const shortName = (u: Named) => u.nickname || u.name
const SHOWN_SKUS = 3
const table = (name: string) => Prisma.raw(`"${config.dbSchema.replaceAll('"', '""')}"."${name}"`)
const ORDERS = table('production_orders')
const EVENTS = table('production_events')

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

  /** `except` = people who get a notice of their own for the same write (an order's contacts). */
  private notifyTeam(tx: Tx, user: User, proposal: Proposal, title: string, except: string[] = []) {
    return this.activity.notify(
      tx,
      [proposal.ownerId, ...proposal.memberIds].filter((id) => !except.includes(id)),
      { type: 'PROPOSAL_STATUS', title, body: `${proposal.code} ${proposal.title}`, link: productionLink(proposal.id) },
      user.id,
    )
  }

  /** "… · คุณเป็นผู้ติดต่อหลัก / ร่วม" to people an order newly names (never the actor). */
  private async notifyContacts(tx: Tx, user: User, proposal: Proposal, title: string, manufacturerName: string, mainIds: string[], coIds: string[]) {
    const notice = (role: string) => ({
      type: 'PROPOSAL_STATUS' as const,
      title: `${title} · คุณเป็น${role}`,
      body: `${proposal.code} ${proposal.title} · ${manufacturerName}`,
      link: productionLink(proposal.id),
    })
    await this.activity.notify(tx, mainIds, notice('ผู้ติดต่อหลัก'), user.id)
    await this.activity.notify(tx, coIds, notice('ผู้ติดต่อร่วม'), user.id)
  }

  /**
   * The "ใบสั่งผลิต" fields of a confirm (no `current`) or an order edit, in dialog order: the shared rules (the start
   * against `start`), then an existing manufacturer (active unless it is the order's current one), then the main
   * contact and then the co-contacts — each one newly in that role an existing active user who can open the proposal.
   * Only someone who keeps their role (stays the main contact / stays a co-contact) may be deactivated or off the team
   * since; a role change (co ↔ main) is checked like a new pick. Every refusal is a 422 with `fields` keyed by the
   * control. Returns the checked fields, the manufacturer and the people newly in a role (their names go into the log).
   */
  private async checkOrderFields(tx: Tx, proposal: Proposal, f: OrderFieldsInput, current: OrderCurrent | undefined, start: OrderStartRules) {
    const errors = orderFieldErrors(f, PERR, start)
    const first = Object.values(errors)[0]
    if (first) throw invalid(first, errors as Record<string, string>)
    // orderFieldErrors refused a missing manufacturer / main contact and a null / invalid schedule value it was given.
    const fields = f as OrderFieldsChecked
    const manufacturer = await tx.manufacturer.findUnique({ where: { id: fields.manufacturerId }, select: { id: true, name: true, isActive: true } })
    if (!manufacturer) throw invalid(PERR.manufacturerGone, { manufacturerId: PERR.manufacturerGone })
    if (!manufacturer.isActive && manufacturer.id !== current?.manufacturerId) {
      const message = PERR.manufacturerInactive(manufacturer.name)
      throw invalid(message, { manufacturerId: message })
    }
    const newMain = fields.mainContactId === current?.mainContactId ? [] : [fields.mainContactId]
    const newCo = fields.coContactIds.filter((id) => !current?.coContactIds.includes(id))
    const checked = [...newMain, ...newCo]
    const people = checked.length
      ? await tx.user.findMany({ where: { id: { in: checked } }, select: { id: true, name: true, nickname: true, isActive: true } })
      : []
    for (const [field, ids] of [['mainContactId', newMain], ['coContactIds', newCo]] as const) {
      for (const id of ids) {
        const u = people.find((p) => p.id === id)
        const message = !u ? 'ไม่พบผู้ใช้ที่เลือก' : !u.isActive ? PERR.contactInactive(u.name) : null
        if (message) throw invalid(message, { [field]: message })
      }
      await this.access.assertCanView(tx, proposal, ids, [], PERR.contactNotTeam, field)
    }
    return { fields, manufacturer, named: new Map<string, Named>(people.map((p) => [p.id, p])) }
  }

  /** The next "ใบสั่งผลิตที่ n": numbers are never reused, so one the history still shows (a deleted order's CONFIRM / ORDER events) is skipped. Under the proposal lock. */
  private async nextOrderSeq(tx: Tx, proposalId: string): Promise<number> {
    const rows = await tx.$queryRaw<{ seq: number }[]>`
      SELECT COALESCE(GREATEST(
        (SELECT MAX(o.seq) FROM ${ORDERS} o WHERE o.proposal_id = ${proposalId}::uuid),
        (SELECT MAX((e.detail->>'orderSeq')::int) FROM ${EVENTS} e
          WHERE e.proposal_id = ${proposalId}::uuid AND jsonb_typeof(e.detail->'orderSeq') = 'number')
      ), 0)::int + 1 AS seq`
    return rows[0]?.seq ?? 1
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
      // "วันที่ดำเนินการ" (the production start of the whole set): from the set's earliest pass — production can't
      // start before the buyer passed it — up to the launch date (today once the launch has passed).
      const { fields, manufacturer, named } = await this.checkOrderFields(
        tx,
        proposal,
        {
          referenceNo: cleanReferenceNo(input.order.referenceNo),
          manufacturerId: input.order.manufacturerId ?? null,
          mainContactId: input.order.mainContactId ?? null,
          coContactIds: [...new Set(input.order.coContactIds)],
          startedOn: input.order.startedOn ?? null,
          productionDays: input.order.productionDays ?? null,
        },
        undefined,
        { bounds: orderStartBounds(earliestPassedOn(rows), today, proposal.targetDate) },
      )
      // Both were sent non-null (else orderFieldErrors refused them as required).
      const startedOn = fields.startedOn!
      const productionDays = fields.productionDays!
      const expectedOn = addDays(startedOn, productionDays)

      // One "ใบสั่งผลิต" per press, numbered per proposal (the proposal lock keeps the number unique).
      const order = await tx.productionOrder.create({
        data: {
          proposalId: proposal.id,
          seq: await this.nextOrderSeq(tx, proposal.id),
          referenceNo: fields.referenceNo,
          manufacturerId: manufacturer.id,
          mainContactId: fields.mainContactId,
          confirmedAt: now,
          confirmedById: user.id,
          startedOn: fromDateOnly(startedOn),
          productionDays,
          contacts: { create: fields.coContactIds.map((userId) => ({ userId })) },
        },
        select: { id: true, seq: true },
      })

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
          orderId: order.id,
          keptAt: null,
          keptById: null,
          ackStoreIds: row.passedStores.map((s) => s.store.id),
        })
        if (before !== quantity) events.push({ itemId, kind: 'QUANTITY', fromStatus: 'PENDING', toStatus: 'PENDING', quantityBefore: before, quantityAfter: quantity })
        // The order as confirmed: the history keeps it even after the order is edited or dropped.
        const detail = {
          neededOn,
          orderId: order.id,
          orderSeq: order.seq,
          manufacturerName: manufacturer.name,
          referenceNo: fields.referenceNo,
          startedOn,
          productionDays,
          expectedOn,
          // Who the order named, with names as of the confirm: the history keeps them if the order is dropped later.
          mainContactId: fields.mainContactId,
          mainContactName: shortName(named.get(fields.mainContactId)!),
          coContactIds: fields.coContactIds,
          coContactNames: fields.coContactIds.map((id) => shortName(named.get(id)!)),
        }
        events.push({ itemId, kind: 'CONFIRM', fromStatus: 'PENDING', toStatus: 'IN_PRODUCTION', date: startedOn, quantityBefore: before, quantityAfter: quantity, detail })
      }
      await this.events(tx, proposal.id, user.id, now, events)
      const skus = skuListLabel(rows.map((r) => state.skuOf(r.productId)))
      const need = formatThaiDate(neededOn)
      const ref = fields.referenceNo ? ` · เอกสาร ${fields.referenceNo}` : ''
      const schedule = ` · เริ่มผลิต ${formatThaiDate(startedOn)} · ประมาณ ${productionDays} วัน · ของถึง ${formatThaiDate(expectedOn)}`
      await this.log(
        tx,
        user,
        proposal,
        'confirm',
        `ยืนยันเริ่มผลิต ${rows.length} SKU (${skus}) รวม ${pieces(total)} · ต้องการสินค้า ${need} · ผลิตที่ ${manufacturer.name}${ref}${schedule}`,
      )
      // The contacts get their own notice instead of the team one.
      await this.notifyTeam(tx, user, proposal, `ยืนยันเริ่มผลิต ${rows.length} SKU แล้ว · ต้องการสินค้า ${need}`, [fields.mainContactId, ...fields.coContactIds])
      await this.notifyContacts(tx, user, proposal, `ยืนยันเริ่มผลิต ${rows.length} SKU`, manufacturer.name, [fields.mainContactId], fields.coContactIds)
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
        const reset = { status: to, confirmedAt: null, confirmedById: null, startedOn: null, neededOn: null, orderId: null, keptAt: null, keptById: null, ackStoreIds: [] }
        await tx.productionItem.update({ where: { id: item.id }, data: reset })
      }
      // A draft of a SKU no longer in the proposal would be invisible and block deleting the product: drop it (and its log).
      if (to === 'PENDING' && !row.inProposal) await tx.productionItem.delete({ where: { id: item.id } })
      else await this.events(tx, proposal.id, user.id, now, [{ itemId: item.id, kind: 'BACK', fromStatus: input.from, toStatus: to, date: cleared }])
      // A "ใบสั่งผลิต" left without SKUs goes (its co-contacts with it); its CONFIRM events keep their snapshot and the
      // activity entry says which order went, so the log still accounts for it.
      let dropped = ''
      if (to === 'PENDING' && item.orderId) {
        const empty = await tx.productionOrder.findFirst({ where: { id: item.orderId, items: { none: {} } }, include: { manufacturer: { select: { name: true } } } })
        if (empty) {
          await tx.productionOrder.delete({ where: { id: empty.id } })
          dropped = ` · ลบ${orderLabel(empty)} (${empty.manufacturer.name}${empty.referenceNo ? ` · เอกสาร ${empty.referenceNo}` : ''}) ที่ไม่เหลือ SKU`
        }
      }
      const summary =
        to === 'PENDING'
          ? `ย้อนการยืนยันผลิต ${sku} กลับเป็นรอยืนยัน${dropped}`
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

  /**
   * Owner / manager: the "ใบสั่งผลิต" of one press, any time (a SKU of any status, cancelled ones too — fixing a
   * document number is always allowed). The fields sent replace the current ones; nothing changed writes nothing.
   * One ORDER event per SKU of the order keeps the change in each SKU's history.
   */
  editOrder(user: User, proposalId: string, orderId: string, input: OrderEditBody): Promise<ProductionView> {
    return this.prisma.$transaction(async (tx) => {
      const { proposal, perms, today, state, now } = await this.open(tx, user, proposalId)
      if (!perms.canDecide) throw forbidden(PERR.orderOnly)
      const order = await tx.productionOrder.findFirst({ where: { id: orderId, proposalId: proposal.id }, include: orderInclude })
      if (!order) throw new ApiError(404, 'NOT_FOUND', PERR.orderGone)
      if (iso(order.updatedAt) !== input.updatedAt) throw stale(PERR.orderChanged)
      const coBefore = order.contacts.map((c) => c.user.id)
      const items = itemsOfOrder(state, order.id)
      // An absent key keeps the current value; a null id is sent and refused as required.
      const mainContactId = input.mainContactId === undefined ? order.mainContactId : input.mainContactId
      // The schedule is both fields or neither: an order without one yet (confirmed before schedules existed) gets both at
      // once, so the one not sent is refused as required. Only a changed value is checked — a start kept as it is stays
      // even when a pass was re-recorded later since.
      const startBefore = toDateOnly(order.startedOn)
      const daysBefore = order.productionDays
      const unscheduled = startBefore === null && (input.startedOn !== undefined || input.productionDays !== undefined)
      const startSent = input.startedOn !== undefined ? input.startedOn : unscheduled ? null : undefined
      const daysSent = input.productionDays !== undefined ? input.productionDays : unscheduled ? null : undefined
      const { fields: next, manufacturer, named } = await this.checkOrderFields(
        tx,
        proposal,
        {
          referenceNo: input.referenceNo === undefined ? order.referenceNo : cleanReferenceNo(input.referenceNo),
          manufacturerId: input.manufacturerId === undefined ? order.manufacturerId : input.manufacturerId,
          mainContactId,
          // A co-contact made the main contact leaves the co-contacts (a list sent with them in is refused instead).
          coContactIds: input.coContactIds ? [...new Set(input.coContactIds)] : coBefore.filter((id) => id !== mainContactId),
          // Unchanged = not checked; a null is always checked (refused as required), also on an order without a schedule.
          startedOn: startSent === undefined || (startSent !== null && startSent === startBefore) ? undefined : startSent,
          productionDays: daysSent === undefined || (daysSent !== null && daysSent === daysBefore) ? undefined : daysSent,
        },
        { manufacturerId: order.manufacturerId, mainContactId: order.mainContactId, coContactIds: coBefore },
        // The start of every SKU on the order moves with it: within the bounds of their passes, never after one was produced.
        { bounds: orderStartBounds(orderEditStartFloor(earliestPassedOn(state.derived.rows.filter((r) => items.some((i) => i.productId === r.productId))), items), today, proposal.targetDate), items },
      )
      const startAfter = next.startedOn ?? startBefore
      const daysAfter = next.productionDays ?? daysBefore
      // Names as of the edit, kept in the event so the history still reads them once a person can't be looked up:
      // co-contacts removed are on the order, people newly in a role were loaded by the check.
      const people = new Map<string, Named>([...order.contacts.map((c) => [c.user.id, c.user] as const), ...named])
      const nameOf = (id: string) => shortName(people.get(id)!)

      const added = next.coContactIds.filter((id) => !coBefore.includes(id))
      const removed = coBefore.filter((id) => !next.coContactIds.includes(id))
      const detail: Record<string, Prisma.InputJsonValue | null> = { orderId: order.id, orderSeq: order.seq }
      const parts: string[] = []
      if (next.manufacturerId !== order.manufacturerId) {
        detail.manufacturer = [order.manufacturer.name, manufacturer.name]
        parts.push(`บริษัท ${order.manufacturer.name} → ${manufacturer.name}`)
      }
      if (next.referenceNo !== order.referenceNo) {
        detail.referenceNo = [order.referenceNo, next.referenceNo]
        parts.push(`เอกสาร ${order.referenceNo ?? '—'} → ${next.referenceNo ?? '—'}`)
      }
      if (startAfter !== startBefore) {
        detail.startedOn = [startBefore, startAfter]
        parts.push(`เริ่มผลิต ${formatThaiDate(startBefore)} → ${formatThaiDate(startAfter)}`)
      }
      if (daysAfter !== daysBefore) {
        detail.productionDays = [daysBefore, daysAfter]
        parts.push(`ระยะเวลาผลิต ${daysBefore ?? '—'} → ${daysAfter} วัน`)
      }
      if (next.mainContactId !== order.mainContactId) {
        const names = [shortName(order.mainContact), nameOf(next.mainContactId)]
        detail.mainContactId = [order.mainContactId, next.mainContactId]
        detail.mainContactName = names
        parts.push(`ผู้ติดต่อหลัก ${names[0]} → ${names[1]}`)
      }
      if (added.length > 0 || removed.length > 0) {
        detail.coContacts = { added, removed }
        detail.coContactNames = { added: added.map(nameOf), removed: removed.map(nameOf) }
        parts.push(`ผู้ติดต่อร่วม ${[added.length ? `+${added.length}` : '', removed.length ? `−${removed.length}` : ''].filter(Boolean).join(' / ')}`)
      }
      if (parts.length === 0) return this.view(tx, proposal, today)

      // updatedAt is the stale guard: touched even when only the co-contacts change.
      await tx.productionOrder.update({
        where: { id: order.id },
        data: {
          referenceNo: next.referenceNo,
          manufacturerId: next.manufacturerId,
          mainContactId: next.mainContactId,
          startedOn: fromDateOnly(startAfter),
          productionDays: daysAfter,
          updatedAt: now,
        },
      })
      if (removed.length > 0) await tx.productionOrderContact.deleteMany({ where: { orderId: order.id, userId: { in: removed } } })
      if (added.length > 0) await tx.productionOrderContact.createMany({ data: added.map((userId) => ({ orderId: order.id, userId })) })
      // "วันที่ดำเนินการ" is the production start of every SKU on the order (cancelled ones too, so a restore keeps it).
      if (startAfter !== startBefore) await tx.productionItem.updateMany({ where: { orderId: order.id }, data: { startedOn: fromDateOnly(startAfter) } })
      await this.events(tx, proposal.id, user.id, now, items.map((i) => ({ itemId: i.id, kind: 'ORDER', fromStatus: i.status, toStatus: i.status, detail })))
      const skus = skuListLabel(items.map((i) => state.skuOf(i.productId)))
      await this.log(tx, user, proposal, 'order', `แก้ข้อมูล${orderLabel(order)} (${skus}): ${parts.join(', ')}`)
      // People newly in a role hear about it (a co-contact made the main contact, a main contact made a co-contact too).
      const newMain = next.mainContactId !== order.mainContactId ? [next.mainContactId] : []
      await this.notifyContacts(tx, user, proposal, `แก้ข้อมูล${orderLabel(order)}`, manufacturer.name, newMain, added)
      return this.view(tx, proposal, today)
    })
  }
}
