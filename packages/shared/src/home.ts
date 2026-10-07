// Home dashboard rules ("วันนี้ฉันต้องทำอะไร") shared by GET /dashboard/home, the Monitor summary and the web:
// agenda buckets, who a buyer step belongs to, merging, sort order, project phase and health. No clock reads —
// `today` is always todayBangkok() on the server or HomeDashboard.today on the client.
import type {
  AgendaBucket,
  AgendaItem,
  BuyerAction,
  BuyerAgendaItem,
  Health,
  HomeProject,
  ProductionAction,
  ProductionBrief,
  ProjectPhase,
  ProposalAction,
  ProposalBrief,
  StoreStage,
  TrackBrief,
} from './api-types.js'
import { PRIORITY_ORDER, storeWord } from './labels.js'
import { canEditProposal } from './permissions.js'
import { canStartPresentation, isFinalStage, OPEN_STAGES, storeSnapshot, type PresentationStage, type PresentationSummary, type TrackView } from './presentation.js'
import { PRODUCTION_SOON_DAYS, type ProductionItemCore, type ProductionRowCore, type ProductionSummary } from './production.js'
import { addDays, diffDays } from './task-tree.js'
import type { Channel, ISODate, Progress, ProposalStatus, User } from './types.js'

/** "7 วันข้างหน้า" is (today, today + 7]. */
export const AGENDA_WEEK_DAYS = 7
/** "ผลจาก Buyer · 14 วันล่าสุด" is [today − 13, today]. */
export const RESULTS_WINDOW_DAYS = 14
/** The results feed sends at most this many rows (the counts stay exact). */
export const RESULTS_MAX_ITEMS = 50
/** AT_RISK when a store still waits for a result this close to launch. */
export const HEALTH_RESULT_BY_DAYS = 14
/** AT_RISK when a store is not presented yet this close to launch (the default template ends prep at D-34). */
export const HEALTH_PRESENT_BY_DAYS = 30
/** IN_REVIEW with no expected date: a follow-up nudge after this many days (same as rowDetail). */
export const REVIEW_STALE_DAYS = 14

export const AGENDA_BUCKETS: AgendaBucket[] = ['overdue', 'today', 'week', 'next', 'waiting']
/** Row order inside a launch round, after health. */
export const PHASE_ORDER: ProjectPhase[] = ['BUYER', 'READY', 'PREP', 'LISTED', 'NOT_LISTED', 'CLOSED']

// ---------- statuses, dates ----------

/** Only IN_PROGRESS proposals count overdue tasks and raise health alarms (DRAFT / ON_HOLD are parked). */
export function isCountableStatus(status: ProposalStatus) {
  return status === 'IN_PROGRESS'
}

/** Buyer steps are listed and counted for IN_PROGRESS and COMPLETED proposals only. */
export function isBuyerAgendaStatus(status: ProposalStatus) {
  return status === 'IN_PROGRESS' || status === 'COMPLETED'
}

/** Overdue (< today), today, week ((today, today + 7]); null = later or undated (counted, not listed). */
export function taskBucket(dueDate: ISODate | null | undefined, today: ISODate): 'overdue' | 'today' | 'week' | null {
  if (!dueDate) return null
  if (dueDate < today) return 'overdue'
  if (dueDate === today) return 'today'
  return dueDate <= addDays(today, AGENDA_WEEK_DAYS) ? 'week' : null
}

/** First day of the results window (today − 13). */
export function resultsWindowStart(today: ISODate): ISODate {
  return addDays(today, 1 - RESULTS_WINDOW_DAYS)
}

export function inResultsWindow(date: ISODate | null | undefined, today: ISODate) {
  return !!date && date >= resultsWindowStart(today) && date <= today
}

// ---------- buyer steps ----------

type SlotView = Pick<TrackBrief, 'stage' | 'plan' | 'presentedDate' | 'expectedResultDate' | 'reviewSince' | 'openRequest'>

/** The fields of a TrackView that home rows, results and the Monitor read. */
export function toTrackBrief(view: TrackView): TrackBrief {
  const { stage, round, plan, presentedDate, expectedResultDate, reviewSince, openRequest, outcome, accepted, needsInfoCount } = view
  return { stage, round, plan, presentedDate, expectedResultDate, reviewSince, openRequest, outcome, accepted, needsInfoCount }
}

/**
 * Overdue buyer step: AWAITING meeting, IN_REVIEW expected result or NEEDS_INFO due date before today.
 * Callers keep to in-proposal tracks of isBuyerAgendaStatus() proposals.
 */
export function isTrackOverdue(view: Pick<TrackBrief, 'stage' | 'plan' | 'expectedResultDate' | 'openRequest'>, today: ISODate) {
  const date = view.stage === 'AWAITING' ? view.plan.meetingDate : view.stage === 'IN_REVIEW' ? view.expectedResultDate : view.stage === 'NEEDS_INFO' ? view.openRequest?.dueDate : null
  return !!date && date < today
}

export interface BuyerSlot {
  action: BuyerAction
  bucket: AgendaBucket
  /** The key date (meeting, expected result, info due); null when there is none. */
  date: ISODate | null
}

/** Action, bucket and key date of an open track, whoever it belongs to; null for final stages. */
export function buyerSlot(view: SlotView, today: ISODate): BuyerSlot | null {
  switch (view.stage) {
    case 'NEEDS_INFO': {
      const due = view.openRequest?.dueDate ?? null
      return { action: 'sendInfo', date: due, bucket: taskBucket(due, today) ?? 'next' }
    }
    case 'AWAITING': {
      const m = view.plan.meetingDate
      if (!m) return { action: 'schedule', date: null, bucket: 'next' }
      if (m < today) return { action: 'confirmPresented', date: m, bucket: 'overdue' }
      return { action: 'present', date: m, bucket: taskBucket(m, today) ?? 'waiting' }
    }
    case 'IN_REVIEW': {
      const e = view.expectedResultDate
      if (e) return { action: 'followUp', date: e, bucket: e < today ? 'overdue' : e === today ? 'today' : 'waiting' }
      const since = view.reviewSince ?? view.presentedDate
      const stale = !!since && diffDays(since, today) > REVIEW_STALE_DAYS
      return { action: 'followUp', date: null, bucket: stale ? 'next' : 'waiting' }
    }
    default:
      return null
  }
}

/** Named people: presenters (AWAITING, IN_REVIEW) or the preparer (NEEDS_INFO); [] = the owner. */
export function responsibleIdsOf(view: Pick<TrackBrief, 'stage' | 'plan' | 'openRequest'>): string[] {
  if (view.stage === 'NEEDS_INFO') return view.openRequest?.preparerId ? [view.openRequest.preparerId] : []
  return view.stage === 'AWAITING' || view.stage === 'IN_REVIEW' ? view.plan.presenterIds : []
}

export interface BuyerAgendaMatch extends BuyerSlot {
  team: boolean
  responsibleIds: string[]
}

/**
 * Is this open track on my agenda? Mine: I am named, or nobody is and I own the proposal (team = false).
 * Team: I am the owner or a member, someone else is responsible and it is overdue. Otherwise null.
 */
export function buyerAgendaFor(view: SlotView, proposal: Pick<ProposalBrief, 'status' | 'ownerId' | 'memberIds'>, meId: string, today: ISODate): BuyerAgendaMatch | null {
  if (!isBuyerAgendaStatus(proposal.status)) return null
  const slot = buyerSlot(view, today)
  if (!slot) return null
  const responsibleIds = responsibleIdsOf(view)
  const mine = responsibleIds.length > 0 ? responsibleIds.includes(meId) : proposal.ownerId === meId
  if (mine) return { ...slot, team: false, responsibleIds }
  const onTeam = proposal.ownerId === meId || proposal.memberIds.includes(meId)
  return onTeam && slot.bucket === 'overdue' ? { ...slot, team: true, responsibleIds } : null
}

/** Row key; equal keys are merged into one row. */
export function buyerItemKey(item: Pick<BuyerAgendaItem, 'proposal' | 'action' | 'bucket' | 'date' | 'team'>) {
  return `${item.proposal.id}:${item.action}:${item.bucket}:${item.date}:${item.team}`
}

/**
 * One row per proposal + action + bucket + date + team flag: tracks and responsible people are joined,
 * view / packageSeq stay the first item's. Feed items in proposal store order (track order follows the input).
 */
export function mergeBuyerItems<T extends BuyerAgendaItem>(items: T[]): T[] {
  const rows = new Map<string, T>()
  for (const item of items) {
    const key = buyerItemKey(item)
    const row = rows.get(key)
    if (!row) {
      rows.set(key, { ...item, key, tracks: [...item.tracks], responsibleIds: [...item.responsibleIds] })
      continue
    }
    for (const t of item.tracks) if (!row.tracks.some((x) => x.trackId === t.trackId)) row.tracks.push(t)
    for (const id of item.responsibleIds) if (!row.responsibleIds.includes(id)) row.responsibleIds.push(id)
    row.canRecord &&= item.canRecord
  }
  return [...rows.values()]
}

// ---------- proposal steps ----------

/**
 * The proposal-level step for me (IN_PROGRESS only, bucket 'next'): createPackage for the owner / members once
 * the prep gate is open and a store is untracked; closeOut for the owner when every store is final.
 */
export function proposalAgendaAction(
  p: Pick<ProposalBrief, 'status' | 'ownerId' | 'memberIds'> & { stores: Pick<StoreStage, 'stage'>[]; prep: Pick<Progress, 'done' | 'total'> },
  meId: string,
): ProposalAction | null {
  if (!isCountableStatus(p.status)) return null
  const onTeam = p.ownerId === meId || p.memberIds.includes(meId)
  if (onTeam && canStartPresentation(p.prep) && p.stores.some((s) => !s.stage)) return 'createPackage'
  if (p.ownerId === meId && p.stores.length > 0 && p.stores.every((s) => s.stage && isFinalStage(s.stage))) return 'closeOut'
  return null
}

// ---------- production steps ----------

export interface ProductionSlot {
  action: ProductionAction
  /** Never 'waiting' (the agenda footer counts every non-followUp waiting row as a meeting). */
  bucket: Exclude<AgendaBucket, 'waiting'>
  /** The production deadline; null for reviewProduction. */
  date: ISODate | null
  count: number
}

/**
 * My "รอผลิต" steps on one involved proposal (`mine`), IN_PROGRESS / COMPLETED only: confirmProduction (owner or an
 * involved MANAGER/ADMIN, pending SKUs; the quantities are entered in its dialog) bucketed by the deadline or 'next';
 * deliverProduction (owner + members) once the deadline is within PRODUCTION_SOON_DAYS; reviewProduction (owner /
 * manager, SKUs needing review) in 'next'.
 */
export function productionAgendaFor(
  p: Pick<ProposalBrief, 'status' | 'ownerId' | 'memberIds'>,
  mine: boolean,
  summary: Pick<ProductionSummary, 'deadline' | 'pending' | 'inProduction' | 'produced' | 'flagged'> | null | undefined,
  me: Pick<User, 'id' | 'role'>,
  today: ISODate,
): ProductionSlot[] {
  if (!mine || !summary || !isBuyerAgendaStatus(p.status)) return []
  const out: ProductionSlot[] = []
  const { deadline } = summary
  const decides = canEditProposal(me, p)
  const onTeam = p.ownerId === me.id || p.memberIds.includes(me.id)
  if (decides && summary.pending > 0) out.push({ action: 'confirmProduction', bucket: taskBucket(deadline, today) ?? 'next', date: deadline, count: summary.pending })
  const making = summary.inProduction + summary.produced
  const soon = taskBucket(deadline, today)
  if (onTeam && making > 0 && soon && deadline <= addDays(today, PRODUCTION_SOON_DAYS)) out.push({ action: 'deliverProduction', bucket: soon, date: deadline, count: making })
  if (decides && summary.flagged > 0) out.push({ action: 'reviewProduction', bucket: 'next', date: null, count: summary.flagged })
  return out
}

/** The rows an agenda action counts (their passedStoresOf() feeds ProductionAgendaItem.stores). */
export function productionRowsFor<I extends ProductionItemCore>(action: ProductionAction, rows: ProductionRowCore<I>[]): ProductionRowCore<I>[] {
  switch (action) {
    case 'confirmProduction':
      return rows.filter((r) => r.status === 'PENDING')
    case 'deliverProduction':
      return rows.filter((r) => r.status === 'IN_PRODUCTION' || r.status === 'PRODUCED')
    case 'reviewProduction':
      return rows.filter((r) => r.needsReview)
  }
}

/** HomeProject.production: null when nothing passed or every row is cancelled / skipped. */
export function toProductionBrief(summary: ProductionSummary | null | undefined): ProductionBrief | null {
  if (!summary || summary.state === 'NONE' || summary.state === 'CANCELLED') return null
  const { state, deadline, daysToDeadline, pending, inProduction, produced, delivered, confirmed, undelivered, flagged, overdueDays } = summary
  return { state, deadline, daysToDeadline, pending, inProduction, produced, delivered, confirmed, undelivered, flagged, overdueDays }
}

// ---------- sort ----------

const KIND_RANK: Record<AgendaItem['kind'], number> = { buyer: 0, production: 1, proposal: 2, task: 3 }
type Step = BuyerAction | ProposalAction | ProductionAction | 'task'
const TODAY_RANK: Record<Step, number> = {
  present: 0,
  sendInfo: 1,
  followUp: 2,
  confirmPresented: 3,
  schedule: 4,
  confirmProduction: 5,
  deliverProduction: 6,
  createPackage: 7,
  closeOut: 8,
  reviewProduction: 9,
  task: 10,
}
const NEXT_RANK: Record<Step, number> = {
  confirmProduction: 0,
  reviewProduction: 1,
  createPackage: 2,
  sendInfo: 3,
  schedule: 4,
  followUp: 5,
  closeOut: 6,
  present: 7,
  confirmPresented: 8,
  deliverProduction: 9,
  task: 10,
}

const stepOf = (i: AgendaItem): Step => (i.kind === 'task' ? 'task' : i.action)
const teamRank = (i: AgendaItem) => (i.kind === 'buyer' && i.team ? 1 : 0)
const priorityRank = (i: AgendaItem) => (i.kind === 'task' ? PRIORITY_ORDER.indexOf(i.task.priority) : 0)

/** Ascending, undated last. */
function byDate(a: ISODate | null, b: ISODate | null) {
  if (a === b) return 0
  if (!a) return 1
  if (!b) return -1
  return a < b ? -1 : 1
}

/** buyer → production → proposal → task, tasks by priority then title; then code and key so the order is total. */
function ties(a: AgendaItem, b: AgendaItem) {
  return (
    KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
    priorityRank(a) - priorityRank(b) ||
    (a.kind === 'task' && b.kind === 'task' ? a.task.title.localeCompare(b.task.title, 'th') : 0) ||
    a.proposal.code.localeCompare(b.proposal.code) ||
    (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  )
}

/**
 * Agenda order: bucket, then per bucket — overdue: mine before team, date, ties; today: buyer steps →
 * confirmProduction → deliverProduction → proposal steps → reviewProduction → tasks; week: date, ties;
 * next: confirmProduction → reviewProduction → createPackage → sendInfo (dated first) → schedule →
 * followUp → closeOut; waiting: date (undated last).
 */
export function compareAgenda(a: AgendaItem, b: AgendaItem): number {
  const bucket = AGENDA_BUCKETS.indexOf(a.bucket) - AGENDA_BUCKETS.indexOf(b.bucket)
  if (bucket) return bucket
  switch (a.bucket) {
    case 'overdue':
      return teamRank(a) - teamRank(b) || byDate(a.date, b.date) || ties(a, b)
    case 'today':
      return TODAY_RANK[stepOf(a)] - TODAY_RANK[stepOf(b)] || ties(a, b)
    case 'next':
      return NEXT_RANK[stepOf(a)] - NEXT_RANK[stepOf(b)] || byDate(a.date, b.date) || ties(a, b)
    default:
      return byDate(a.date, b.date) || ties(a, b)
  }
}

/** Rows per bucket (HomeDashboard.agenda.total). */
export function countByBucket(items: Pick<AgendaItem, 'bucket'>[]): Record<AgendaBucket, number> {
  const out: Record<AgendaBucket, number> = { overdue: 0, today: 0, week: 0, next: 0, waiting: 0 }
  for (const i of items) out[i.bucket]++
  return out
}

// ---------- projects ----------

/** Untracked, or its track is in an open stage: no result from this store yet. */
export const isOpenStore = (s: Pick<StoreStage, 'stage'>) => !s.stage || OPEN_STAGES.includes(s.stage)

/** PresentationSummary of in-proposal stores, for headerLine() (hasTracks = some store is tracked). */
export function stageSummary(stores: Pick<StoreStage, 'store' | 'stage'>[]): PresentationSummary {
  const byStage: Record<PresentationStage, number> = { AWAITING: 0, IN_REVIEW: 0, NEEDS_INFO: 0, PASSED: 0, REJECTED: 0, WITHDRAWN: 0 }
  for (const s of stores) if (s.stage) byStage[s.stage]++
  const untracked = stores.filter((s) => !s.stage).map((s) => storeSnapshot(s.store))
  const tracked = stores.length - untracked.length
  const finalCount = byStage.PASSED + byStage.REJECTED + byStage.WITHDRAWN
  return {
    storesTotal: stores.length,
    tracked,
    untracked,
    byStage,
    waitingOnUs: byStage.AWAITING + byStage.NEEDS_INFO,
    finalCount,
    passed: byStage.PASSED,
    rejected: byStage.REJECTED,
    withdrawn: byStage.WITHDRAWN,
    allFinal: stores.length > 0 && untracked.length === 0 && finalCount === tracked,
    hasTracks: tracked > 0,
  }
}

/** Tracks before prep %: a task added after presenting does not drop the project back to PREP. */
export function projectPhase(stores: Pick<StoreStage, 'stage'>[], prep: Pick<Progress, 'done' | 'total'>, status: ProposalStatus): ProjectPhase {
  const tracked = stores.some((s) => s.stage)
  if (!tracked) {
    if (status === 'COMPLETED') return 'CLOSED'
    return canStartPresentation(prep) ? 'READY' : 'PREP'
  }
  if (stores.some(isOpenStore)) return 'BUYER'
  return stores.some((s) => s.stage === 'PASSED') ? 'LISTED' : 'NOT_LISTED'
}

export interface HealthInput {
  status: ProposalStatus
  channel: Channel
  targetDate: ISODate
  /** In-proposal stores. */
  stores: Pick<StoreStage, 'stage'>[]
  /** In-proposal open tracks with isTrackOverdue. */
  buyerOverdue: number
  /** Overdue leaf tasks. */
  overdueTasks: number
  /** The proposal's production summary; null / absent = nothing to produce. */
  production?: Pick<ProductionSummary, 'deadline' | 'daysToDeadline' | 'pending' | 'undelivered' | 'overdueDays'> | null
}

/**
 * The one LATE / AT_RISK rule (home rows, the strip, Monitor's ต้องติดตามด่วน); null = no chip. IN_PROGRESS, and
 * COMPLETED for production alarms only (production normally runs after the project is closed out).
 */
export function proposalHealth(p: HealthInput, today: ISODate): Health | null {
  const d = diffDays(today, p.targetDate)
  const prod = p.production
  const prodLate: Health | null =
    prod && prod.undelivered > 0 && d < 0 ? { level: 'LATE', reason: `เลยวันวางขาย ${-d} วัน ยังส่งสินค้าไม่ครบ ${prod.undelivered} SKU` } : null
  const prodOverdue: Health | null =
    prod && prod.overdueDays > 0 ? { level: 'AT_RISK', reason: `เลยกำหนดผลิต ${prod.overdueDays} วัน · ยังไม่ส่ง ${prod.undelivered} SKU` } : null
  const prodSoon: Health | null =
    prod && prod.pending > 0 && prod.daysToDeadline >= 0 && prod.daysToDeadline <= PRODUCTION_SOON_DAYS
      ? {
          level: 'AT_RISK',
          reason:
            prod.daysToDeadline === 0
              ? `ถึงกำหนดผลิตวันนี้ ยังไม่ยืนยัน ${prod.pending} SKU`
              : `อีก ${prod.daysToDeadline} วันถึงกำหนดผลิต ยังไม่ยืนยัน ${prod.pending} SKU`,
        }
      : null
  if (p.status === 'COMPLETED') return prodLate ?? prodOverdue ?? prodSoon
  if (!isCountableStatus(p.status)) return null
  const word = storeWord(p.channel)
  const open = p.stores.filter(isOpenStore).length
  const notPresented = p.stores.filter((s) => !s.stage || s.stage === 'AWAITING').length
  if (d < 0 && open > 0) return { level: 'LATE', reason: `เลยวันวางขาย ${-d} วัน ยังไม่ได้ผล ${open} ${word}` }
  if (prodLate) return prodLate
  if (prodOverdue) return prodOverdue
  if (p.buyerOverdue > 0) return { level: 'AT_RISK', reason: `ติดตาม Buyer เลยกำหนด ${p.buyerOverdue} ${word}` }
  if (p.overdueTasks > 0) return { level: 'AT_RISK', reason: `งานเลยกำหนด ${p.overdueTasks} งาน` }
  if (prodSoon) return prodSoon
  if (d <= HEALTH_RESULT_BY_DAYS && open > 0) return { level: 'AT_RISK', reason: `${d === 0 ? 'วางขายวันนี้' : `อีก ${d} วันวางขาย`} ยังรอผล ${open} ${word}` }
  if (d <= HEALTH_PRESENT_BY_DAYS && notPresented > 0) return { level: 'AT_RISK', reason: `อีก ${d} วันวางขาย ยังไม่ได้นำเสนอ ${notPresented} ${word}` }
  return null
}

/** LATE 0, AT_RISK 1, no chip 2. */
export function healthRank(health: Pick<Health, 'level'> | null | undefined) {
  return health?.level === 'LATE' ? 0 : health?.level === 'AT_RISK' ? 1 : 2
}

/** targetDate, then LATE → AT_RISK → none, then PHASE_ORDER, then code (inside a round: the row order). */
export function compareProjects(a: HomeProject, b: HomeProject): number {
  return (
    a.proposal.targetDate.localeCompare(b.proposal.targetDate) ||
    healthRank(a.health) - healthRank(b.health) ||
    PHASE_ORDER.indexOf(a.phase) - PHASE_ORDER.indexOf(b.phase) ||
    a.proposal.code.localeCompare(b.proposal.code)
  )
}
