// Node assembly of GET /dashboard/home and of the Monitor's health / buyer panels from the home.queries.ts rows.
// No database access and no clock reads: `today` and the rows decide everything. The rules are the shared ones
// (packages/shared/src/home.ts), so the web, home and Monitor count the same things.
import {
  buyerAgendaFor,
  buyerSlot,
  canRecordPresentation,
  compareAgenda,
  compareProjects,
  completionMode,
  countByBucket,
  deriveProduction,
  inResultsWindow,
  isBuyerAgendaStatus,
  isCountableStatus,
  isTrackOverdue,
  mergeBuyerItems,
  OPEN_STAGES,
  passedStoresOf,
  productionAgendaFor,
  productionRowsFor,
  projectPhase,
  proposalAgendaAction,
  proposalHealth,
  readDetailFields,
  reduceTrack,
  responsibleIdsOf,
  RESULTS_MAX_ITEMS,
  taskBucket,
  toProductionBrief,
  toTrackBrief,
  type BuyerAgendaMatch,
  type ISODate,
  type PresentationStage,
  type ProductionDerived,
  type ProductionItemCore,
  type Progress,
  type TaskLevel,
  type TrackView,
  type User,
} from '@flowtrade/shared'
import type {
  AgendaItem,
  BuyerAgendaItem,
  Health,
  HomeDashboard,
  HomeProject,
  ProductionAgendaItem,
  ProjectPhase,
  ProposalAgendaItem,
  ProposalBrief,
  StoreStage,
  TaskAgendaItem,
  TeamPulse,
} from '@flowtrade/shared/api-types'
import { toDateOnly } from '../../common/dates.js'
import { toStoreTrack, type TrackRow, type TrackWithSeqRow } from '../presentation/presentation.mappers.js'
import { toProductionItemCore } from '../production/production.state.js'
import { groupByProposal } from './dashboard.read-models.js'
import type { HomeItemRow, HomeRows, OutcomeTrackRow, ProjectSqlRow } from './home.queries.js'

const percentOf = (done: number, total: number) => (total === 0 ? 0 : Math.round((done / total) * 100))

/** One Q3 row with its phase and health. */
export interface ProjectRow {
  brief: ProposalBrief
  shelfType: { id: string; name: string; color: string }
  /** Owner, member or task assignee. */
  mine: boolean
  /** In-proposal stores, in proposal store order. */
  stores: StoreStage[]
  /** Leaf tasks; overdue only when IN_PROGRESS. */
  prep: Progress & { overdue: number }
  /** Open leaf tasks. */
  openTasks: number
  phase: ProjectPhase
  health: Health | null
  /** "รอผลิต" of IN_PROGRESS / COMPLETED projects; null when nothing passed and nothing was recorded. */
  production: ProductionDerived<ProductionItemCore> | null
}

/** An open track of an in-proposal store, reduced, with its project row. */
export interface OpenTrack {
  view: TrackView
  project: ProjectRow
  packageSeq: number
}

/** The tab's derivation from Q6 / Q7 rows, with the Q3 row's stores, SKUs, launch and lead days. */
function productionOf(row: ProjectSqlRow, stores: StoreStage[], tracks: TrackRow[], items: HomeItemRow[], today: ISODate) {
  if (!isBuyerAgendaStatus(row.status) || (tracks.length === 0 && items.length === 0)) return null
  const ctx = { proposal: { stores: stores.map((s) => s.store), productIds: row.product_ids }, packages: [] }
  const views = tracks.map((t) => reduceTrack(toStoreTrack(t), ctx))
  const derived = deriveProduction(
    { productIds: row.product_ids, targetDate: row.target_date, leadDays: row.lead_days, views, items: items.map(toProductionItemCore) },
    today,
  )
  return derived.summary.state === 'NONE' ? null : derived
}

/**
 * Q3 rows → project rows; Q4 rows → reduced open tracks (in proposal code, then store order); Q6 / Q7 rows → each
 * project's production. A track or item whose proposal is not among the rows, or a track whose store left the
 * proposal, is dropped; so is a COMPLETED project past launch without an open store once nothing is left to produce
 * or deliver (Q3 returns it while a store passed in the last PRODUCTION_HOME_AFTER_LAUNCH_DAYS).
 */
export function buildProjects(
  rows: ProjectSqlRow[],
  openTracks: TrackWithSeqRow[],
  passedTracks: TrackRow[],
  productionItems: HomeItemRow[],
  today: ISODate,
): { projects: ProjectRow[]; open: OpenTrack[] } {
  const stores = new Map<string, StoreStage[]>(
    rows.map((row) => [
      row.id,
      row.stores.map((s) => ({ store: { id: s.id, name: s.name, shortName: s.shortName, color: s.color }, stage: s.stage, round: s.round ?? 1, trackId: s.trackId })),
    ]),
  )
  const reduced = openTracks.flatMap((row) => {
    const own = stores.get(row.proposalId)
    if (!own) return []
    // productIds only matter for a PASSED outcome; open tracks have none.
    const view = reduceTrack(toStoreTrack(row), { proposal: { stores: own.map((s) => s.store), productIds: [] }, packages: [] })
    return view.inProposal ? [{ view, proposalId: row.proposalId, packageSeq: row.package.seq }] : []
  })

  const passedBy = groupByProposal(passedTracks)
  const itemsBy = groupByProposal(productionItems)
  const projects = rows.flatMap((row): ProjectRow[] => {
    const own = stores.get(row.id)!
    const production = productionOf(row, own, passedBy.get(row.id) ?? [], itemsBy.get(row.id) ?? [], today)
    const openStore = own.some((s) => s.stage && OPEN_STAGES.includes(s.stage))
    if (row.status === 'COMPLETED' && row.target_date < today && !openStore && !(production && production.summary.undelivered > 0)) return []
    const overdue = isCountableStatus(row.status) ? row.overdue : 0
    const prep = { done: row.done, total: row.total, percent: percentOf(row.done, row.total), overdue }
    const buyerOverdue = reduced.filter((r) => r.proposalId === row.id && isTrackOverdue(r.view, today)).length
    const health = proposalHealth(
      { status: row.status, channel: row.channel, targetDate: row.target_date, stores: own, buyerOverdue, overdueTasks: overdue, production: production?.summary ?? null },
      today,
    )
    return [
      {
        brief: { id: row.id, code: row.code, title: row.title, channel: row.channel, status: row.status, targetDate: row.target_date, ownerId: row.owner_id, memberIds: row.member_ids },
        shelfType: { id: row.shelf_id, name: row.shelf_name, color: row.shelf_color },
        mine: row.is_owner || row.is_member || row.is_assignee,
        stores: own,
        prep,
        openTasks: row.total - row.done,
        phase: projectPhase(own, prep, row.status),
        health,
        production,
      },
    ]
  })

  const byId = new Map(projects.map((p) => [p.brief.id, p]))
  const open = reduced
    .flatMap((r) => {
      const project = byId.get(r.proposalId)
      return project ? [{ view: r.view, project, packageSeq: r.packageSeq }] : []
    })
    .sort((a, b) => a.project.brief.code.localeCompare(b.project.brief.code) || a.view.storeIndex - b.view.storeIndex)
  return { projects, open }
}

function buyerItem(t: OpenTrack, match: BuyerAgendaMatch, canRecord: boolean): BuyerAgendaItem {
  return {
    kind: 'buyer',
    key: '',
    bucket: match.bucket,
    date: match.date,
    proposal: t.project.brief,
    action: match.action,
    tracks: [{ trackId: t.view.track.id, store: t.view.store }],
    view: toTrackBrief(t.view),
    packageSeq: t.packageSeq,
    team: match.team,
    responsibleIds: match.responsibleIds,
    canRecord,
  }
}

/** My buyer steps (mine, or team rows when overdue), merged. */
function myBuyerItems(user: User, open: OpenTrack[], today: ISODate): BuyerAgendaItem[] {
  return mergeBuyerItems(
    open.flatMap((t) => {
      const match = buyerAgendaFor(t.view, t.project.brief, user.id, today)
      return match ? [buyerItem(t, match, canRecordPresentation(user, t.project.brief))] : []
    }),
  )
}

/** Every overdue buyer step whoever it belongs to (team = false), merged and sorted: the Monitor panel and the strip. */
export function overdueBuyerRows(user: User, open: OpenTrack[], today: ISODate): BuyerAgendaItem[] {
  return mergeBuyerItems(
    open.flatMap((t) => {
      if (!isBuyerAgendaStatus(t.project.brief.status) || !isTrackOverdue(t.view, today)) return []
      const slot = buyerSlot(t.view, today)
      return slot ? [buyerItem(t, { ...slot, team: false, responsibleIds: responsibleIdsOf(t.view) }, canRecordPresentation(user, t.project.brief))] : []
    }),
  ).sort(compareAgenda)
}

/** createPackage / closeOut of my IN_PROGRESS projects (bucket 'next'). */
function proposalItems(me: string, projects: ProjectRow[]): ProposalAgendaItem[] {
  return projects.flatMap((p) => {
    if (!p.mine) return []
    const action = proposalAgendaAction({ ...p.brief, stores: p.stores, prep: p.prep }, me)
    if (!action) return []
    const prep = { done: p.prep.done, total: p.prep.total, percent: p.prep.percent }
    return [{ kind: 'proposal', key: `${p.brief.id}:${action}`, bucket: 'next', date: null, proposal: p.brief, action, stores: p.stores, prep, openTasks: p.openTasks }]
  })
}

/** My "รอผลิต" steps (productionAgendaFor): confirm / deliver / review, never 'waiting'. */
function productionItems(user: User, projects: ProjectRow[], today: ISODate): ProductionAgendaItem[] {
  return projects.flatMap((p) => {
    const d = p.production
    if (!d) return []
    return productionAgendaFor(p.brief, p.mine, d.summary, user, today).map(
      (slot): ProductionAgendaItem => ({
        kind: 'production',
        key: `${p.brief.id}:production:${slot.action}`,
        bucket: slot.bucket,
        date: slot.date,
        proposal: p.brief,
        action: slot.action,
        count: slot.count,
        deadline: d.summary.deadline,
        overdueDays: d.summary.overdueDays,
        stores: passedStoresOf(productionRowsFor(slot.action, d.rows)),
      }),
    )
  })
}

/** Open leaf tasks of IN_PROGRESS projects due up to today + 7; the rest are only counted. */
function taskItems(rows: HomeRows['tasks'], projects: Map<string, ProjectRow>, today: ISODate) {
  const items: TaskAgendaItem[] = []
  let laterTasks = 0
  let parkedTasks = 0
  for (const row of rows) {
    // Not among the project rows: a COMPLETED proposal that is fully closed.
    const project = projects.get(row.proposalId)
    if (!project || !isCountableStatus(project.brief.status)) {
      parkedTasks++
      continue
    }
    const dueDate = toDateOnly(row.dueDate)
    const bucket = taskBucket(dueDate, today)
    if (!bucket) {
      laterTasks++
      continue
    }
    items.push({
      kind: 'task',
      key: `task:${row.id}`,
      bucket,
      date: dueDate,
      proposal: project.brief,
      task: {
        id: row.id,
        title: row.title,
        level: row.level as TaskLevel,
        isDone: row.isDone,
        startDate: toDateOnly(row.startDate),
        dueDate,
        priority: row.priority,
        responsible: row.responsible,
        assigneeIds: row.assignees.map((a) => a.userId),
      },
      stores: project.stores.map((s) => s.store),
      path: [row.parent?.parent?.title, row.parent?.title].filter((t): t is string => t !== undefined),
      // Agenda tasks are leaves: only a table can make one automatic.
      completion: completionMode({ descriptionFormat: row.descriptionFormat, detailFields: readDetailFields(row.detailFields) }, false),
    })
  }
  return { items, laterTasks, parkedTasks }
}

/** Final tracks whose effective outcome date is in [today − 13, today]: newest first, then proposal and store order. */
function buyerResults(rows: OutcomeTrackRow[], today: ISODate): HomeDashboard['results'] {
  const found = rows
    .flatMap((row) => {
      const proposal = { stores: row.proposal.stores.map((s) => s.store), productIds: row.proposal.products.map((p) => p.productId) }
      const view = reduceTrack(toStoreTrack(row), { proposal, packages: [] })
      return view.inProposal && view.outcome && inResultsWindow(view.outcome.date, today) ? [{ row, view, date: view.outcome.date }] : []
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.row.proposal.code.localeCompare(b.row.proposal.code) || a.view.storeIndex - b.view.storeIndex)
  const count = (stage: PresentationStage) => found.filter((x) => x.view.stage === stage).length
  return {
    items: found.slice(0, RESULTS_MAX_ITEMS).map(({ row, view }) => ({
      proposal: { id: row.proposalId, code: row.proposal.code, title: row.proposal.title, channel: row.proposal.channel },
      trackId: row.id,
      store: view.store,
      view: toTrackBrief(view),
    })),
    passed: count('PASSED'),
    rejected: count('REJECTED'),
    withdrawn: count('WITHDRAWN'),
  }
}

/** Department alarms over IN_PROGRESS projects, plus COMPLETED ones' production alarms (rows must be org-wide). */
export function teamPulse(projects: ProjectRow[], buyerOverdue: number): TeamPulse {
  const live = projects.filter((p) => isCountableStatus(p.brief.status))
  const alarmed = projects.filter((p) => isCountableStatus(p.brief.status) || p.brief.status === 'COMPLETED')
  return {
    late: alarmed.filter((p) => p.health?.level === 'LATE').length,
    atRisk: alarmed.filter((p) => p.health?.level === 'AT_RISK').length,
    buyerOverdue,
    overdueTasks: live.reduce((n, p) => n + p.prep.overdue, 0),
  }
}

const toHomeProject = (p: ProjectRow): HomeProject => ({
  proposal: { ...p.brief, shelfType: p.shelfType },
  phase: p.phase,
  health: p.health,
  prep: p.prep,
  stores: p.stores,
  production: toProductionBrief(p.production?.summary),
})

export function buildHome(user: User, today: ISODate, rows: HomeRows): HomeDashboard {
  const { projects, open } = buildProjects(rows.projects, rows.openTracks, rows.passedTracks, rows.productionItems, today)
  const tasks = taskItems(rows.tasks, new Map(projects.map((p) => [p.brief.id, p])), today)
  const items: AgendaItem[] = [
    ...myBuyerItems(user, open, today),
    ...productionItems(user, projects, today),
    ...proposalItems(user.id, projects),
    ...tasks.items,
  ].sort(compareAgenda)
  const waiting = (action: BuyerAgendaItem['action']) => items.filter((i) => i.bucket === 'waiting' && i.kind === 'buyer' && i.action === action).length
  const mine = projects.filter((p) => p.mine)
  return {
    today,
    agenda: {
      items,
      total: countByBucket(items),
      waiting: { inReview: waiting('followUp'), laterMeetings: waiting('present') },
      laterTasks: tasks.laterTasks,
      parkedTasks: tasks.parkedTasks,
      doneLast7Days: rows.doneLast7Days,
    },
    projects: mine
      .filter((p) => p.brief.status !== 'ON_HOLD')
      .map(toHomeProject)
      .sort(compareProjects),
    onHold: mine.filter((p) => p.brief.status === 'ON_HOLD').length,
    results: buyerResults(rows.outcomes, today),
    team: rows.orgWide ? teamPulse(projects, overdueBuyerRows(user, open, today).length) : null,
  }
}
