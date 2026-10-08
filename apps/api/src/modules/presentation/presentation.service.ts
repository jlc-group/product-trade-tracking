// "นำเสนอ Buyer": presentation packages, one track per store and each track's append-only events. Every rule is
// the shared one (packages/shared/src/presentation.ts), the same checks the web dialogs run before sending, so a
// refusal reads exactly like the dialog's own message. Each write answers the proposal's whole PresentationData.
import { randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import {
  acceptedSkus,
  bulkStepAllowed,
  canFinalizePresentation,
  canRecordPresentation,
  canStartPresentation,
  checkAppend,
  computeProgress,
  diffPatch,
  ERR,
  EVENT_LABEL,
  fieldLabel,
  formatThaiDate,
  isEditableKind,
  isEmptyPatch,
  needsFinalize,
  nextPackageSeq,
  readDetailFields,
  recordStepsAllowed,
  reduceTrack,
  rejectReasonLabel,
  ROLE_PERMISSIONS,
  STAGE_LABEL,
  stageLong,
  storeNamesLabel,
  storeSnapshot,
  storeWord,
  todayBangkok,
  toPackageTask,
  validateEdit,
  validateEvent,
  validatePackage,
  type FieldErrors,
  type EventOf,
  type MetaEvent,
  type PackageTask,
  type PresentationData,
  type PresentationStage,
  type ProductionDerived,
  type Proposal,
  type Role,
  type StageEvent,
  type TrackView,
  type User,
} from '@flowtrade/shared'
import { ActivityService } from '../../common/activity.service.js'
import { isoOrNull } from '../../common/dates.js'
import { ApiError, conflict, forbidden, invalid } from '../../common/errors.js'
import { ProposalAccessService } from '../../common/proposal-access.service.js'
import { config } from '../../config.js'
import { Prisma } from '../../generated/prisma/client.js'
import { PrismaService, type Db } from '../../prisma/prisma.service.js'
import { loadProductionDerived, notifyProductionChanges } from '../production/production.state.js'
import { lockProposal } from '../tasks/task-tree.js'
import { eventRow, loadPresentation, packageTaskRows } from './presentation.mappers.js'
import type { CreatePackageBody, EditBody, PatchBody, RecordBody, ScheduleBody, StageEventBody } from './presentation.schemas.js'

type Tx = Prisma.TransactionClient

const firstError = (errors: FieldErrors) => Object.values(errors).find(Boolean)
const clip = (text: string, max = 80) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)
/** A track / package / event that is not (or no longer) part of this proposal. */
const gone = () => new ApiError(404, 'NOT_FOUND', ERR.gone)
/** The track moved on since the dialog opened; the web refetches on any error. */
const stale = (message: string) => conflict(message, 'STALE')
const TASKS_CHANGED = 'งานที่เลือกบางงานถูกลบหรือเปิดใหม่แล้ว — โหลดหน้าใหม่แล้วลองอีกครั้ง'
/** A record call that is neither one step nor [PRESENTED, outcome] (recordStepsAllowed). */
const BAD_STEPS = 'ขั้นตอนไม่ถูกต้อง'
const CAN_VIEW_ONLY = 'เลือกได้เฉพาะคนที่เปิดดูโปรเจกต์นี้ได้ (เจ้าของ สมาชิก หรือผู้รับผิดชอบงาน)'
/** Roles that see every proposal (canViewProposal). */
const READ_ALL_ROLES = (Object.keys(ROLE_PERMISSIONS) as Role[]).filter((role) => ROLE_PERMISSIONS[role].includes('proposal.read.all'))
/** ?store= opens that store's sheet on the presentation tab. */
const presentLink = (proposalId: string, storeId?: string) => (storeId ? `/proposals/${proposalId}?store=${storeId}` : `/proposals/${proposalId}?tab=present`)

/** Each read replays a track's whole timeline, so one track can't grow without bound (normal use stays far below). */
const MAX_TRACK_EVENTS = 500
function assertRoomForEvents(lastSeq: number, adding: number) {
  if (lastSeq + adding > MAX_TRACK_EVENTS) throw conflict(`ไทม์ไลน์นี้มีรายการครบ ${MAX_TRACK_EVENTS} รายการแล้ว — ติดต่อผู้ดูแลระบบ`)
}

const tracksTable = Prisma.raw(`"${config.dbSchema.replaceAll('"', '""')}"."presentation_tracks"`)

/** SELECT … FOR UPDATE on the tracks a write touches, always after lockProposal (same lock order everywhere). */
async function lockTracks(tx: Tx, proposalId: string, where: { ids: string[] } | { packageId: string }) {
  const filter =
    'ids' in where ? Prisma.sql`"id" IN (${Prisma.join(where.ids.map((id) => Prisma.sql`${id}::uuid`))})` : Prisma.sql`"package_id" = ${where.packageId}::uuid`
  await tx.$queryRaw`SELECT "id" FROM ${tracksTable} WHERE "proposal_id" = ${proposalId}::uuid AND ${filter} ORDER BY "id" FOR UPDATE`
}

function assertProducts(proposal: Proposal, ids: string[] | null | undefined) {
  if (ids?.some((id) => !proposal.productIds.includes(id))) throw invalid('สินค้าที่เลือกไม่ได้อยู่ในโปรเจกต์นี้แล้ว — โหลดหน้าใหม่แล้วลองอีกครั้ง')
}

@Injectable()
export class PresentationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProposalAccessService,
    private readonly activity: ActivityService,
  ) {}

  // ---------- helpers ----------

  /**
   * Proposal row lock first: presentation writes of one proposal run one after another, and task toggles
   * (same lock) can't reopen a task while the prep gate is checked. Then view + canRecord.
   */
  private async openForWrite(tx: Tx, user: User, proposalId: string) {
    // Visibility before the lock: someone who can't see the proposal gets 404, never a lock wait or a 409.
    await this.access.loadVisible(tx, user, proposalId)
    await lockProposal(tx, proposalId)
    const proposal = await this.access.loadVisible(tx, user, proposalId)
    if (proposal.status === 'CANCELLED') throw invalid('โปรเจกต์นี้ถูกยกเลิกแล้ว')
    if (!canRecordPresentation(user, proposal)) throw forbidden(ERR.readOnly)
    return { proposal, canFinalize: canFinalizePresentation(user, proposal), word: storeWord(proposal.channel) }
  }

  /** openForWrite + the track's row lock, fresh data and the track as the reducer sees it. */
  private async openTrack(tx: Tx, user: User, proposalId: string, trackId: string) {
    const opened = await this.openForWrite(tx, user, proposalId)
    await lockTracks(tx, proposalId, { ids: [trackId] })
    const { data, lastSeq } = await loadPresentation(tx, proposalId)
    const last = lastSeq.get(trackId) ?? 0
    assertRoomForEvents(last, 1)
    return { ...opened, data, view: this.viewOf(data, trackId), nextSeq: last + 1 }
  }

  private viewOf(data: PresentationData, trackId: string): TrackView {
    const track = data.tracks.find((t) => t.id === trackId)
    if (!track) throw gone()
    return reduceTrack(track, { packages: data.packages })
  }

  /** Prep gate: every work unit of the proposal done (computeProgress, as the proposal page counts it). */
  private async assertGate(db: Db, proposalId: string) {
    const rows = await db.task.findMany({ where: { proposalId }, select: { id: true, parentId: true, isDone: true, descriptionFormat: true, detailFields: true } })
    const progress = computeProgress(rows.map((r) => ({ ...r, detailFields: readDetailFields(r.detailFields) })))
    if (!canStartPresentation(progress)) throw invalid(ERR.gate(progress))
  }

  /** Frozen copies of done level-1 tasks of this proposal, in task order; any other id → 409. */
  private async snapshotTasks(db: Db, proposalId: string, ids: string[]): Promise<PackageTask[]> {
    if (ids.length === 0) return []
    const rows = await db.task.findMany({
      where: { proposalId, id: { in: ids } },
      select: { id: true, title: true, level: true, isDone: true, completedAt: true, descriptionFormat: true, detailFields: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    })
    if (rows.length !== ids.length || rows.some((t) => t.level !== 1 || !t.isDone)) throw conflict(TASKS_CHANGED)
    return rows.map((t) =>
      toPackageTask({ id: t.id, title: t.title, completedAt: isoOrNull(t.completedAt), descriptionFormat: t.descriptionFormat, detailFields: readDetailFields(t.detailFields) }),
    )
  }

  /**
   * Presenters / the preparer must be able to open the proposal, or the step never reaches their home page: the
   * owner, members, assignees of its tasks, or active users who see every proposal. `keep` = people already on the
   * track's plan, who may stay (a member removed since, a deactivated manager); stored events are never changed.
   */
  private async assertCanView(db: Db, proposal: Proposal, ids: (string | null | undefined)[], keep: (string | null | undefined)[] = []) {
    const known = new Set([proposal.ownerId, ...proposal.memberIds, ...keep])
    const rest = [...new Set(ids.filter((id): id is string => !!id && !known.has(id)))]
    if (rest.length === 0) return
    const allowed = await db.user.count({
      where: { id: { in: rest }, OR: [{ isActive: true, role: { in: READ_ALL_ROLES } }, { assignments: { some: { task: { proposalId: proposal.id } } } }] },
    })
    if (allowed !== rest.length) throw invalid(CAN_VIEW_ONLY)
  }

  /** Steps as stored: a re-pitch's taskIds become the task snapshot. */
  private async toStageEvents(db: Db, proposalId: string, events: StageEventBody[]): Promise<StageEvent[]> {
    const out: StageEvent[] = []
    for (const e of events) {
      if (e.kind === 'REPITCH') {
        const { taskIds, ...rest } = e
        out.push({ ...rest, tasks: await this.snapshotTasks(db, proposalId, taskIds) })
      } else out.push(e)
    }
    return out
  }

  /**
   * A write that may move the passed set ("รอผลิต"): the production state before it (null = not such a write), then
   * after finish() cached the new stages, the owner's notices for SKUs newly pending / newly needing review.
   */
  private async productionBefore(tx: Tx, proposal: Proposal, touchesPass: boolean): Promise<ProductionDerived | null> {
    return touchesPass ? (await loadProductionDerived(tx, proposal, todayBangkok())).derived : null
  }

  private async productionAfter(tx: Tx, user: User, proposal: Proposal, before: ProductionDerived | null) {
    if (!before) return
    const after = (await loadProductionDerived(tx, proposal, todayBangkok())).derived
    await notifyProductionChanges(tx, this.activity, user, proposal, before, after)
  }

  /** Re-reads everything and caches stage / round of the touched tracks (the events stay the truth). */
  private async finish(tx: Tx, proposalId: string, trackIds: string[]): Promise<PresentationData> {
    const { data } = await loadPresentation(tx, proposalId)
    for (const id of trackIds) {
      const track = data.tracks.find((t) => t.id === id)
      if (!track) continue
      const { stage, round } = reduceTrack(track, { packages: data.packages })
      await tx.presentationTrack.update({ where: { id }, data: { stage, round } })
    }
    return data
  }

  private notifyTeam(tx: Tx, user: User, proposal: Proposal, title: string, storeId?: string) {
    return this.activity.notify(
      tx,
      [proposal.ownerId, ...proposal.memberIds],
      { type: 'PROPOSAL_STATUS', title, body: `${proposal.code} ${proposal.title}`, link: presentLink(proposal.id, storeId) },
      user.id,
    )
  }

  /**
   * Activity entry of a recorded step (and the team notice on pass / reject / needs info). `events` is one step
   * or [PRESENTED, outcome] (recordStepsAllowed), so the last one is the only outcome.
   */
  private async logStep(tx: Tx, user: User, proposal: Proposal, views: TrackView[], events: StageEvent[]) {
    const word = storeWord(proposal.channel)
    const names = storeNamesLabel(views.map((v) => v.store.name))
    const last = events.at(-1)!
    // [PRESENTED, outcome] in one go: "นำเสนอแล้ว → ผ่าน".
    const via = events.length > 1 && events[0].kind === 'PRESENTED' ? 'นำเสนอแล้ว → ' : ''
    let action: string
    let summary: string
    let notice: PresentationStage | null = null
    switch (last.kind) {
      case 'PRESENTED':
        action = 'present'
        summary = `บันทึกการนำเสนอ ${names}: นำเสนอแล้ว ${formatThaiDate(last.date)} · รอพิจารณา`
        break
      case 'NEEDS_INFO':
        action = 'needsInfo'
        summary = `บันทึกผล ${names}: ${via}ต้องการข้อมูลเพิ่ม (${clip(last.request)})`
        notice = 'NEEDS_INFO'
        break
      case 'INFO_SENT':
        action = 'infoSent'
        summary = `ส่งข้อมูลเพิ่มให้ ${names}${last.sentWhat ? ` (${clip(last.sentWhat)})` : ''}`
        break
      case 'PASSED': {
        const partial = acceptedSkus(last.acceptedProductIds, proposal.productIds)
        action = 'pass'
        summary = `บันทึกผล ${names}: ${via}ผ่าน${partial ? ` (รับ ${partial.count} จาก ${partial.total} SKU)` : ''}`
        notice = 'PASSED'
        break
      }
      case 'REJECTED':
        action = 'reject'
        summary = `บันทึกผล ${names}: ${via}ไม่ผ่าน (${rejectReasonLabel(last.reason, word)})`
        notice = 'REJECTED'
        break
      case 'WITHDRAWN':
        action = 'withdraw'
        summary = `ยุติการนำเสนอ ${names} (${clip(last.reason)})`
        break
      case 'REPITCH':
        action = 'repitch'
        summary = `นำเสนอใหม่ ${names}: รอบที่ ${views[0].round + 1} (${clip(last.changes)})`
        break
    }
    await this.activity.log(tx, user, `presentation.${action}`, 'PROPOSAL', proposal.id, proposal.id, summary)
    if (notice) await this.notifyTeam(tx, user, proposal, `${names}: ${stageLong(notice, word)}`, views.length === 1 ? views[0].store.id : undefined)
  }

  // ---------- reads ----------

  async get(user: User, proposalId: string): Promise<PresentationData> {
    await this.access.loadVisible(this.prisma, user, proposalId)
    // Packages and tracks from one snapshot: a write committing between the two reads would otherwise give a
    // track whose package is missing, or a package without its tracks.
    const { data } = await this.prisma.$transaction((tx) => loadPresentation(tx, proposalId), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
    return data
  }

  // ---------- writes ----------

  /** Bundles done level-1 tasks and opens one AWAITING track per chosen store (proposal store order). */
  createPackage(user: User, proposalId: string, input: CreatePackageBody): Promise<PresentationData> {
    return this.prisma.$transaction(async (tx) => {
      const { proposal, word } = await this.openForWrite(tx, user, proposalId)
      await this.assertGate(tx, proposal.id)
      const problem = firstError(validatePackage({ taskCount: input.taskIds.length, storeCount: input.storeIds.length, note: input.note }, word))
      if (problem) throw invalid(problem)
      const tasks = await this.snapshotTasks(tx, proposal.id, input.taskIds)
      if (input.storeIds.some((id) => !proposal.storeIds.includes(id))) throw conflict(`${word}ที่เลือกไม่ได้อยู่ในโปรเจกต์นี้แล้ว — โหลดหน้าใหม่แล้วลองอีกครั้ง`)
      const storeRows = await tx.store.findMany({ where: { id: { in: input.storeIds } } })
      const stores = proposal.storeIds.flatMap((id) => {
        const row = input.storeIds.includes(id) ? storeRows.find((s) => s.id === id) : undefined
        return row ? [storeSnapshot(row)] : []
      })
      await this.assertCanView(tx, proposal, input.presenterIds)
      const { data } = await loadPresentation(tx, proposal.id)
      // One track per store, ever (a REJECTED store comes back by re-pitch, a WITHDRAWN one by revert).
      const taken = stores.filter((s) => data.tracks.some((t) => t.store.id === s.id))
      if (taken.length) throw conflict(ERR.alreadyTracked(taken.map((s) => s.name).join(', ')))

      const seq = nextPackageSeq(data)
      const now = new Date()
      const packageId = randomUUID()
      await tx.presentationPackage.create({
        data: { id: packageId, proposalId: proposal.id, seq, note: input.note?.trim() || null, createdById: user.id, createdAt: now, tasks: { create: packageTaskRows(tasks) } },
      })
      const trackIds = stores.map(() => randomUUID())
      // 1 ms apart so the tracks list in the order they were picked.
      await tx.presentationTrack.createMany({
        data: stores.map((s, i) => ({
          id: trackIds[i],
          proposalId: proposal.id,
          packageId,
          storeId: s.id,
          storeName: s.name,
          storeShortName: s.shortName,
          storeColor: s.color,
          createdAt: new Date(now.getTime() + i),
        })),
      })
      const created: MetaEvent = { kind: 'CREATED', packageId, meetingDate: input.meetingDate, presenterIds: input.presenterIds }
      await tx.presentationEvent.createMany({ data: trackIds.map((id) => eventRow(id, 1, created, user.id, now)) })
      const meeting = input.meetingDate ? `, นัด ${formatThaiDate(input.meetingDate)}` : ''
      await this.activity.log(tx, user, 'presentation.create', 'PROPOSAL', proposal.id, proposal.id, `สร้างชุดนำเสนอ #${seq}: ${storeNamesLabel(stores.map((s) => s.name))} (${tasks.length} งาน${meeting})`)
      return (await loadPresentation(tx, proposal.id)).data
    })
  }

  /** Appends the same step(s) to every track; each must still be in `expectStage` (else 409). */
  record(user: User, proposalId: string, input: RecordBody): Promise<PresentationData> {
    return this.prisma.$transaction(async (tx) => {
      const { proposal, canFinalize, word } = await this.openForWrite(tx, user, proposalId)
      // Only what the dialogs send: each call is one activity entry and at most one notice (logStep).
      if (!recordStepsAllowed(input.events)) throw invalid(BAD_STEPS)
      if (input.events.some((e) => e.kind === 'WITHDRAWN') && !canFinalize) throw forbidden(ERR.finalOnly)
      if (input.events.some((e) => e.kind === 'REPITCH')) await this.assertGate(tx, proposal.id)
      const steps = await this.toStageEvents(tx, proposal.id, input.events)
      // Same result for several stores: "นำเสนอแล้ว", or "ผ่าน" with every SKU.
      if (input.trackIds.length > 1 && !bulkStepAllowed(steps)) throw invalid(ERR.bulk(word))
      // "Every SKU" is stored as the explicit list: a SKU added to the proposal later was not seen by this buyer.
      const events = steps.map((e) => (e.kind === 'PASSED' && e.acceptedProductIds === null ? { ...e, acceptedProductIds: [...proposal.productIds] } : e))
      for (const e of events) if (e.kind === 'PASSED') assertProducts(proposal, e.acceptedProductIds)
      const production = await this.productionBefore(tx, proposal, events.some((e) => e.kind === 'PASSED'))

      await lockTracks(tx, proposal.id, { ids: input.trackIds })
      const { data, lastSeq } = await loadPresentation(tx, proposal.id)
      const views = input.trackIds.map((id) => this.viewOf(data, id))
      await this.assertCanView(
        tx,
        proposal,
        events.flatMap((e) => (e.kind === 'REPITCH' ? e.presenterIds : e.kind === 'NEEDS_INFO' ? [e.preparerId] : [])),
        views.flatMap((v) => [...v.plan.presenterIds, v.openRequest?.preparerId]),
      )
      const today = todayBangkok()
      const now = new Date()
      const rows = views.flatMap((view, index) => {
        if (view.stage !== input.expectStage) throw stale(ERR.stale(view.store.name))
        const problem = checkAppend(view, events, today, proposal.productIds.length)
        if (problem) throw problem === ERR.stale(view.store.name) ? stale(problem) : invalid(problem)
        // The buyer name is never copied to the other stores.
        const own = events.map((e) => (index > 0 && e.kind === 'PRESENTED' ? { ...e, contactName: null } : e))
        const seq = lastSeq.get(view.track.id) ?? 0
        assertRoomForEvents(seq, own.length)
        return own.map((e, i) => eventRow(view.track.id, seq + 1 + i, e, user.id, now))
      })
      await tx.presentationEvent.createMany({ data: rows })
      await this.logStep(tx, user, proposal, views, events)
      const result = await this.finish(tx, proposal.id, input.trackIds)
      await this.productionAfter(tx, user, proposal, production)
      return result
    })
  }

  /** Meeting date / presenters / buyer contact of an AWAITING track. */
  schedule(user: User, proposalId: string, trackId: string, input: ScheduleBody): Promise<PresentationData> {
    return this.prisma.$transaction(async (tx) => {
      const { proposal, view, nextSeq } = await this.openTrack(tx, user, proposalId, trackId)
      if (view.stage !== 'AWAITING') throw stale(ERR.stale(view.store.name))
      const event: MetaEvent = { kind: 'SCHEDULED', meetingDate: input.meetingDate, presenterIds: input.presenterIds, contactName: input.contactName?.trim() || null }
      const problem = firstError(validateEvent(view, event, todayBangkok(), 0))
      if (problem) throw invalid(problem)
      await this.assertCanView(tx, proposal, input.presenterIds, view.plan.presenterIds)
      await tx.presentationEvent.createMany({ data: [eventRow(trackId, nextSeq, event, user.id, new Date())] })
      const when = input.meetingDate ? formatThaiDate(input.meetingDate) : 'ยังไม่ได้นัดวัน'
      await this.activity.log(tx, user, 'presentation.schedule', 'PROPOSAL', proposal.id, proposal.id, `นัดนำเสนอ ${view.store.name}: ${when}`)
      return this.finish(tx, proposal.id, [trackId])
    })
  }

  /** Undo the latest effective stage event (it stays in the timeline as reverted). */
  revert(user: User, proposalId: string, trackId: string, targetEventId: string): Promise<PresentationData> {
    return this.prisma.$transaction(async (tx) => {
      const { proposal, canFinalize, view, nextSeq } = await this.openTrack(tx, user, proposalId, trackId)
      const target = view.lastRevertable
      if (!target || target.id !== targetEventId) throw stale(ERR.stale(view.store.name))
      if (needsFinalize(target.kind) && !canFinalize) throw forbidden(ERR.finalOnly)
      const production = await this.productionBefore(tx, proposal, target.kind === 'PASSED')
      await tx.presentationEvent.createMany({ data: [eventRow(trackId, nextSeq, { kind: 'REVERTED', targetEventId: target.id }, user.id, new Date())] })
      const to = STAGE_LABEL[view.revertTo ?? 'AWAITING']
      await this.activity.log(tx, user, 'presentation.revert', 'PROPOSAL', proposal.id, proposal.id, `ย้อนกลับ ${view.store.name}: ${STAGE_LABEL[view.stage]} → ${to}`)
      const result = await this.finish(tx, proposal.id, [trackId])
      await this.productionAfter(tx, user, proposal, production)
      return result
    })
  }

  /** Patch an event's details (kind and store never change). A patch that changes nothing writes nothing. */
  edit(user: User, proposalId: string, trackId: string, input: EditBody): Promise<PresentationData> {
    return this.prisma.$transaction(async (tx) => {
      const { proposal, canFinalize, data, view, nextSeq } = await this.openTrack(tx, user, proposalId, trackId)
      const item = view.timeline.find((t) => t.event.id === input.targetEventId)
      if (!item || item.reverted || !isEditableKind(item.event.kind)) throw stale(ERR.gone)
      const kind = item.event.kind
      if (needsFinalize(kind) && !canFinalize) throw forbidden(ERR.finalOnly)
      const resolved = (await this.resolvePatch(tx, proposal.id, kind === 'REPITCH', input.patch)) as Record<string, unknown>
      // "Every SKU" becomes the explicit list, except on a legacy all-SKU pass that stays all-SKU (no change).
      if (kind === 'PASSED' && resolved.acceptedProductIds === null) {
        resolved.acceptedProductIds = (item.effective as EventOf<'PASSED'>).acceptedProductIds === null ? null : [...proposal.productIds]
      }
      const patch = diffPatch(item.effective, resolved)
      if (isEmptyPatch(patch)) return data
      const problem = firstError(validateEdit(view, input.targetEventId, patch, todayBangkok(), proposal.productIds.length))
      if (problem) throw invalid(problem)
      const changed = patch as Record<string, unknown>
      const before = item.effective as Record<string, unknown>
      const people = (v: Record<string, unknown>) => [...(Array.isArray(v.presenterIds) ? (v.presenterIds as string[]) : []), v.preparerId as string | null | undefined]
      await this.assertCanView(tx, proposal, people(changed), people(before))
      if (Array.isArray(changed.acceptedProductIds)) assertProducts(proposal, changed.acceptedProductIds as string[])

      const production = await this.productionBefore(tx, proposal, kind === 'PASSED' && Object.hasOwn(patch, 'acceptedProductIds'))
      await tx.presentationEvent.createMany({ data: [eventRow(trackId, nextSeq, { kind: 'EDITED', targetEventId: input.targetEventId, patch }, user.id, new Date())] })
      const fields = Object.keys(patch).map((k) => fieldLabel(kind, k))
      await this.activity.log(tx, user, 'presentation.edit', 'PROPOSAL', proposal.id, proposal.id, `แก้ไขรายละเอียด ${view.store.name}: ${EVENT_LABEL[kind]} (${fields.join(', ')})`)
      const result = await this.finish(tx, proposal.id, [trackId])
      await this.productionAfter(tx, user, proposal, production)
      return result
    })
  }

  /** The edit as the reducer stores it: a re-pitch's taskIds become a fresh task snapshot. */
  private async resolvePatch(db: Db, proposalId: string, repitch: boolean, patch: PatchBody): Promise<object> {
    const { taskIds, ...rest } = patch
    return repitch && taskIds ? { ...rest, tasks: await this.snapshotTasks(db, proposalId, [...new Set(taskIds)]) } : rest
  }

  /** Take an untouched store out of its package; the package goes with its last store. */
  removeTrack(user: User, proposalId: string, trackId: string): Promise<PresentationData> {
    return this.prisma.$transaction(async (tx) => {
      const { proposal, data, view } = await this.openTrack(tx, user, proposalId, trackId)
      if (!view.untouched) throw conflict(ERR.removeTouched)
      await tx.presentationTrack.delete({ where: { id: trackId } })
      const packageLeft = data.tracks.some((t) => t.id !== trackId && t.packageId === view.track.packageId)
      if (!packageLeft) await tx.presentationPackage.delete({ where: { id: view.track.packageId } })
      await this.activity.log(
        tx,
        user,
        'presentation.remove',
        'PROPOSAL',
        proposal.id,
        proposal.id,
        `นำ ${view.store.name} ออกจากชุดนำเสนอ #${view.packageSeq}${packageLeft ? '' : ' (ลบชุดนำเสนอนี้ด้วย)'}`,
      )
      return (await loadPresentation(tx, proposal.id)).data
    })
  }

  /** Delete a package whose stores are all untouched (its tracks and events go with it). */
  deletePackage(user: User, proposalId: string, packageId: string): Promise<PresentationData> {
    return this.prisma.$transaction(async (tx) => {
      const { proposal, word } = await this.openForWrite(tx, user, proposalId)
      await lockTracks(tx, proposal.id, { packageId })
      const { data } = await loadPresentation(tx, proposal.id)
      const pkg = data.packages.find((p) => p.id === packageId)
      if (!pkg) throw gone()
      const own = data.tracks.filter((t) => t.packageId === packageId)
      if (own.some((t) => !reduceTrack(t, { packages: data.packages }).untouched)) throw conflict(ERR.deleteBlocked(word))
      await tx.presentationPackage.delete({ where: { id: packageId } })
      const stores = own.length ? ` (${storeNamesLabel(own.map((t) => t.store.name))})` : ''
      await this.activity.log(tx, user, 'presentation.deletePackage', 'PROPOSAL', proposal.id, proposal.id, `ลบชุดนำเสนอ #${pkg.seq}${stores}`)
      return (await loadPresentation(tx, proposal.id)).data
    })
  }
}
