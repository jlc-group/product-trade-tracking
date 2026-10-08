// Loaders behind GET /dashboard/home, GET /dashboard/badge and the Monitor summary. Each is one statement or one
// findMany, so a caller runs them together in one Promise.all wave. Raw SQL is schema-qualified (DB_SCHEMA), takes
// `today` as a parameter (never CURRENT_DATE: the session runs in UTC) and casts counts to int.
import {
  addDays,
  can,
  FINAL_STAGES,
  OPEN_STAGES,
  PRODUCTION_HOME_AFTER_LAUNCH_DAYS,
  PRODUCTION_LEAD_DAYS_DEFAULT,
  resultsWindowStart,
  type Channel,
  type ISODate,
  type PresentationStage,
  type ProposalStatus,
  type User,
} from '@flowtrade/shared'
import { fromDateOnly } from '../../common/dates.js'
import { proposalStoreOrder } from '../../common/mappers.js'
import { config } from '../../config.js'
import { Prisma } from '../../generated/prisma/client.js'
import type { Db } from '../../prisma/prisma.service.js'
import { trackInclude, trackWithSeqInclude } from '../presentation/presentation.mappers.js'

const table = (name: string) => Prisma.raw(`"${config.dbSchema.replaceAll('"', '""')}"."${name}"`)
const PROPOSALS = table('proposals')
const MEMBERS = table('proposal_members')
const PROPOSAL_STORES = table('proposal_stores')
const STORES = table('stores')
const SHELF_TYPES = table('shelf_types')
const TASKS = table('tasks')
const ASSIGNEES = table('task_assignees')
const TRACKS = table('presentation_tracks')
const PROPOSAL_PRODUCTS = table('proposal_products')
const PLANS = table('production_plans')
const ITEMS = table('production_items')

/** Statuses whose open tracks are buyer steps (isBuyerAgendaStatus). */
const BUYER_STATUSES: ProposalStatus[] = ['IN_PROGRESS', 'COMPLETED']

/** Start of a Bangkok business day as an instant (timestamptz lower bound). */
export const bangkokMidnight = (date: ISODate) => new Date(`${date}T00:00:00+07:00`)

/** Owner, member or assignee of any task: the proposals someone is involved in (same as GET /proposals?scope=mine). */
export const involvedWhere = (me: string): Prisma.ProposalWhereInput => ({
  OR: [{ ownerId: me }, { members: { some: { userId: me } } }, { tasks: { some: { assignees: { some: { userId: me } } } } }],
})

// ---------- Q1, Q2: my tasks ----------

export const agendaTaskSelect = {
  id: true,
  proposalId: true,
  title: true,
  level: true,
  isDone: true,
  startDate: true,
  dueDate: true,
  priority: true,
  responsible: true,
  descriptionFormat: true,
  detailFields: true,
  assignees: { select: { userId: true }, orderBy: { assignedAt: 'asc' } },
  // Max depth is 3, so two parent hops give the whole path.
  parent: { select: { title: true, parent: { select: { title: true } } } },
} satisfies Prisma.TaskSelect

export type AgendaTaskRow = Prisma.TaskGetPayload<{ select: typeof agendaTaskSelect }>

/** Q1: my open leaf tasks outside cancelled proposals (the proposal and its stores come from Q3). */
export function loadMyOpenLeaves(db: Db, me: string) {
  return db.task.findMany({
    where: { isDone: false, assignees: { some: { userId: me } }, children: { none: {} }, proposal: { status: { not: 'CANCELLED' } } },
    select: agendaTaskSelect,
  })
}

/** Q2: my leaf tasks completed since Bangkok midnight six days ago (today included: 7 days). */
export function countDoneLast7Days(db: Db, me: string, today: ISODate) {
  return db.task.count({
    where: {
      isDone: true,
      assignees: { some: { userId: me } },
      children: { none: {} },
      proposal: { status: { not: 'CANCELLED' } },
      completedAt: { gte: bangkokMidnight(addDays(today, -6)) },
    },
  })
}

// ---------- Q3: project rows ----------

export interface ProjectSqlStore {
  id: string
  name: string
  shortName: string
  color: string
  stage: PresentationStage | null
  round: number | null
  trackId: string | null
}

export interface ProjectSqlRow {
  id: string
  code: string
  title: string
  channel: Channel
  status: ProposalStatus
  target_date: ISODate
  owner_id: string
  shelf_id: string
  shelf_name: string
  shelf_color: string
  is_owner: boolean
  is_member: boolean
  is_assignee: boolean
  member_ids: string[]
  /** Leaf tasks. */
  total: number
  done: number
  /** Open leaves due before today (any status; callers count it for IN_PROGRESS only). */
  overdue: number
  /** In-proposal stores in proposal store order, with their track's cached stage / round. */
  stores: ProjectSqlStore[]
  /** production_plans.lead_days, or the default when the proposal has no plan row. */
  lead_days: number
  /** Proposal SKUs in proposal order. */
  product_ids: string[]
}

/**
 * Q3: DRAFT / IN_PROGRESS / ON_HOLD proposals, plus COMPLETED ones still launching, with an open tracked store (a
 * store never presented stays untracked once closed), with SKUs in production, or with a PASSED store and a launch at
 * most PRODUCTION_HOME_AFTER_LAUNCH_DAYS ago (SKUs maybe still to confirm; buildProjects drops it when nothing is left
 * to produce or deliver) — the involved ones, or every one when orgWide (the flags still tell which are mine). Not
 * CANCELLED.
 */
export function loadProjectRows(db: Db, me: string, today: ISODate, orgWide: boolean) {
  const isMember = Prisma.sql`EXISTS (SELECT 1 FROM ${MEMBERS} m WHERE m.proposal_id = p.id AND m.user_id = ${me}::uuid)`
  const isAssignee = Prisma.sql`EXISTS (SELECT 1 FROM ${ASSIGNEES} a JOIN ${TASKS} k ON k.id = a.task_id WHERE a.user_id = ${me}::uuid AND k.proposal_id = p.id)`
  return db.$queryRaw<ProjectSqlRow[]>`
    SELECT p.id, p.code, p.title, p.channel::text AS channel, p.status::text AS status,
           to_char(p.target_date, 'YYYY-MM-DD') AS target_date, p.owner_id,
           st.id AS shelf_id, st.name AS shelf_name, st.color AS shelf_color,
           (p.owner_id = ${me}::uuid) AS is_owner, ${isMember} AS is_member, ${isAssignee} AS is_assignee,
           COALESCE((SELECT json_agg(m.user_id ORDER BY m.added_at) FROM ${MEMBERS} m WHERE m.proposal_id = p.id), '[]') AS member_ids,
           lf.total, lf.done, lf.overdue, sx.stores,
           COALESCE(pl.lead_days, ${PRODUCTION_LEAD_DAYS_DEFAULT}::int) AS lead_days,
           COALESCE((SELECT json_agg(pp.product_id ORDER BY pp.sort_order, pp.product_id) FROM ${PROPOSAL_PRODUCTS} pp WHERE pp.proposal_id = p.id), '[]') AS product_ids
    FROM ${PROPOSALS} p
    JOIN ${SHELF_TYPES} st ON st.id = p.shelf_type_id
    LEFT JOIN ${PLANS} pl ON pl.proposal_id = p.id
    -- Work units (shared workUnits): every leaf, plus a parent with a table of its own (done when that table is full).
    -- Overdue stays leaf-only, like the badge.
    CROSS JOIN LATERAL (
      SELECT count(*) FILTER (WHERE u.leaf OR u.tbl)::int AS total,
             count(*) FILTER (WHERE (u.leaf AND u.is_done) OR (NOT u.leaf AND u.tbl AND u.filled))::int AS done,
             count(*) FILTER (WHERE u.leaf AND NOT u.is_done AND u.due_date < ${today}::date)::int AS overdue
      FROM (
        SELECT t.is_done, t.due_date,
               NOT EXISTS (SELECT 1 FROM ${TASKS} c WHERE c.proposal_id = p.id AND c.parent_id = t.id) AS leaf,
               (t.description_format::text = 'FIELDS' AND jsonb_array_length(t.detail_fields) > 0) AS tbl,
               NOT EXISTS (SELECT 1 FROM jsonb_array_elements(t.detail_fields) e WHERE btrim(COALESCE(e->>'value', '')) = '') AS filled
        FROM ${TASKS} t
        WHERE t.proposal_id = p.id
      ) u
    ) lf
    CROSS JOIN LATERAL (
      SELECT COALESCE(json_agg(json_build_object(
               'id', s.id, 'name', s.name, 'shortName', s.short_name, 'color', s.color,
               'stage', tr.stage::text, 'round', tr.round, 'trackId', tr.id)
             ORDER BY s.sort_order, s.name, s.id), '[]') AS stores
      FROM ${PROPOSAL_STORES} ps
      JOIN ${STORES} s ON s.id = ps.store_id
      LEFT JOIN ${TRACKS} tr ON tr.proposal_id = ps.proposal_id AND tr.store_id = ps.store_id
      WHERE ps.proposal_id = p.id
    ) sx
    WHERE ( p.status IN ('DRAFT', 'IN_PROGRESS', 'ON_HOLD')
         OR (p.status = 'COMPLETED' AND ( p.target_date >= ${today}::date
             OR EXISTS (SELECT 1 FROM ${PROPOSAL_STORES} ps2
                        JOIN ${TRACKS} t2 ON t2.proposal_id = ps2.proposal_id AND t2.store_id = ps2.store_id
                        WHERE ps2.proposal_id = p.id AND t2.stage IN ('AWAITING', 'IN_REVIEW', 'NEEDS_INFO'))
             OR EXISTS (SELECT 1 FROM ${ITEMS} pi WHERE pi.proposal_id = p.id AND pi.status IN ('IN_PRODUCTION', 'PRODUCED'))
             OR ( p.target_date >= ${addDays(today, -PRODUCTION_HOME_AFTER_LAUNCH_DAYS)}::date
                  AND EXISTS (SELECT 1 FROM ${PROPOSAL_STORES} ps3
                              JOIN ${TRACKS} t3 ON t3.proposal_id = ps3.proposal_id AND t3.store_id = ps3.store_id
                              WHERE ps3.proposal_id = p.id AND t3.stage = 'PASSED') ))) )
      ${orgWide ? Prisma.empty : Prisma.sql`AND (p.owner_id = ${me}::uuid OR ${isMember} OR ${isAssignee})`}
  `
}

// ---------- Q4, Q5: tracks ----------

/** Q4: open tracks of IN_PROGRESS / COMPLETED proposals (involved, or every one when orgWide). Stores come from Q3. */
export function loadOpenTracks(db: Db, me: string, orgWide: boolean) {
  return db.presentationTrack.findMany({
    where: { stage: { in: OPEN_STAGES }, proposal: { status: { in: BUYER_STATUSES }, ...(orgWide ? {} : involvedWhere(me)) } },
    include: trackWithSeqInclude,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
}

export const outcomeTrackInclude = {
  ...trackWithSeqInclude,
  proposal: {
    select: {
      code: true,
      title: true,
      channel: true,
      stores: { select: { store: { select: { id: true, name: true, shortName: true, color: true } } }, orderBy: proposalStoreOrder },
      products: { select: { productId: true }, orderBy: { sortOrder: 'asc' } },
    },
  },
} satisfies Prisma.PresentationTrackInclude

export type OutcomeTrackRow = Prisma.PresentationTrackGetPayload<{ include: typeof outcomeTrackInclude }>

/**
 * Q5: final tracks of involved, non-cancelled proposals touched since the results window opened (every role). The
 * cached row is updated on each write, so a track whose outcome date is in the window was updated in it too.
 */
export function loadRecentOutcomes(db: Db, me: string, today: ISODate) {
  return db.presentationTrack.findMany({
    where: {
      stage: { in: FINAL_STAGES },
      updatedAt: { gte: bangkokMidnight(resultsWindowStart(today)) },
      proposal: { status: { not: 'CANCELLED' }, ...involvedWhere(me) },
    },
    include: outcomeTrackInclude,
  })
}

// ---------- Q6, Q7: production ----------

/**
 * A superset of Q3's IN_PROGRESS / COMPLETED rows (buildProjects ignores tracks / items of proposals Q3 did not return),
 * so the production loaders never scan every COMPLETED proposal ever.
 */
export function homeProposalWhere(today: ISODate): Prisma.ProposalWhereInput {
  return {
    OR: [
      { status: 'IN_PROGRESS' },
      {
        status: 'COMPLETED',
        OR: [
          { targetDate: { gte: fromDateOnly(addDays(today, -PRODUCTION_HOME_AFTER_LAUNCH_DAYS)) } },
          { presentationTracks: { some: { stage: { in: OPEN_STAGES } } } },
          { productionItems: { some: { status: { in: ['IN_PRODUCTION', 'PRODUCED'] } } } },
        ],
      },
    ],
  }
}

const homeProposals = (me: string, today: ISODate, orgWide: boolean): Prisma.ProposalWhereInput => ({ AND: [homeProposalWhere(today), orgWide ? {} : involvedWhere(me)] })

/** Q6: PASSED tracks (the "รอผลิต" SKUs are derived from them; stores and SKUs come from Q3). */
export function loadPassedTracks(db: Db, me: string, today: ISODate, orgWide: boolean) {
  return db.presentationTrack.findMany({ where: { stage: 'PASSED', proposal: homeProposals(me, today, orgWide) }, include: trackInclude })
}

export const homeItemSelect = {
  proposalId: true,
  productId: true,
  status: true,
  quantity: true,
  confirmedAt: true,
  neededOn: true,
  deliveredOn: true,
  dueOn: true,
  ackStoreIds: true,
} satisfies Prisma.ProductionItemSelect

export type HomeItemRow = Prisma.ProductionItemGetPayload<{ select: typeof homeItemSelect }>

/** Q7: production_items rows (only what deriveProduction reads), by SKU like the tab. */
export function loadProductionItems(db: Db, me: string, today: ISODate, orgWide: boolean) {
  return db.productionItem.findMany({ where: { proposal: homeProposals(me, today, orgWide) }, select: homeItemSelect, orderBy: [{ product: { sku: 'asc' } }, { id: 'asc' }] })
}

// ---------- one wave ----------

export interface HomeRows {
  /** Q3 / Q4 are org-wide (dashboard.monitor): the team strip is built from them. */
  orgWide: boolean
  tasks: AgendaTaskRow[]
  doneLast7Days: number
  projects: ProjectSqlRow[]
  openTracks: Awaited<ReturnType<typeof loadOpenTracks>>
  outcomes: OutcomeTrackRow[]
  passedTracks: Awaited<ReturnType<typeof loadPassedTracks>>
  productionItems: HomeItemRow[]
}

/** Q1–Q7 together (home.builder buildHome turns them into HomeDashboard). */
export async function loadHomeRows(db: Db, user: Pick<User, 'id' | 'role'>, today: ISODate): Promise<HomeRows> {
  const orgWide = can(user, 'dashboard.monitor')
  const [tasks, doneLast7Days, projects, openTracks, outcomes, passedTracks, productionItems] = await Promise.all([
    loadMyOpenLeaves(db, user.id),
    countDoneLast7Days(db, user.id, today),
    loadProjectRows(db, user.id, today, orgWide),
    loadOpenTracks(db, user.id, orgWide),
    loadRecentOutcomes(db, user.id, today),
    loadPassedTracks(db, user.id, today, orgWide),
    loadProductionItems(db, user.id, today, orgWide),
  ])
  return { orgWide, tasks, doneLast7Days, projects, openTracks, outcomes, passedTracks, productionItems }
}

// ---------- badge ----------

/** My overdue leaf tasks in IN_PROGRESS proposals: one statement. */
export async function countOverdueTasks(db: Db, me: string, today: ISODate): Promise<number> {
  const rows = await db.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n
    FROM ${TASKS} t
    JOIN ${ASSIGNEES} a ON a.task_id = t.id AND a.user_id = ${me}::uuid
    JOIN ${PROPOSALS} p ON p.id = t.proposal_id AND p.status = 'IN_PROGRESS'
    WHERE NOT t.is_done AND t.due_date < ${today}::date
      AND NOT EXISTS (SELECT 1 FROM ${TASKS} c WHERE c.proposal_id = t.proposal_id AND c.parent_id = t.id)
  `
  return rows[0]?.n ?? 0
}
