// Read models for proposals (ProposalSummary / ProposalListItem / ProposalDetail).
// List items and detail read models for /proposals.
// Exported via ProposalsModule so the dashboard can build the same list items.
import { Injectable } from '@nestjs/common'
import { can, computeProgress, isOverdue, todayBangkok, type ISODate, type Proposal, type ProposalSummary, type User } from '@flowtrade/shared'
import type { ProposalDetail, ProposalListItem } from '@flowtrade/shared/api-types'
import { toDateOnly } from '../../common/dates.js'
import { notFound } from '../../common/errors.js'
import { proposalInclude, proposalWithStoresInclude, templateInclude, toProduct, toProposal, toShelfType, toStores, toTemplate, toUser } from '../../common/mappers.js'
import { ProposalAccessService } from '../../common/proposal-access.service.js'
import type { Prisma } from '../../generated/prisma/client.js'
import type { Db } from '../../prisma/prisma.service.js'
import { UUID_RE, type ProposalListQuery } from './proposals.schemas.js'

// ---------- include presets ----------

/** Everything a ProposalListItem needs except the tasks (loaded in one batch query). */
export const proposalListInclude = {
  stores: proposalWithStoresInclude.stores,
  members: proposalInclude.members,
  products: { select: { productId: true, product: true }, orderBy: { sortOrder: 'asc' } },
  shelfType: true,
  owner: true,
} satisfies Prisma.ProposalInclude

export const proposalDetailInclude = {
  ...proposalListInclude,
  members: { select: { userId: true, user: true }, orderBy: { addedAt: 'asc' } },
  template: { include: templateInclude },
} satisfies Prisma.ProposalInclude

export type ProposalListRow = Prisma.ProposalGetPayload<{ include: typeof proposalListInclude }>
export type ProposalDetailRow = Prisma.ProposalGetPayload<{ include: typeof proposalDetailInclude }>

/** targetDate asc; creation order breaks ties. */
export const proposalListOrder = [{ targetDate: 'asc' }, { createdAt: 'asc' }, { code: 'asc' }] satisfies Prisma.ProposalOrderByWithRelationInput[]

// ---------- visibility ----------

/** Owner, member, or assignee of any task. */
export function involvedWhere(userId: string): Prisma.ProposalWhereInput {
  return {
    OR: [{ ownerId: userId }, { members: { some: { userId } } }, { tasks: { some: { assignees: { some: { userId } } } } }],
  }
}

/** Proposals the user may see (canViewProposal as a query). */
export function visibleWhere(user: Pick<User, 'id' | 'role'>): Prisma.ProposalWhereInput {
  return can(user, 'proposal.read.all') ? {} : involvedWhere(user.id)
}

// ---------- pure summary ----------

export interface SummaryTask {
  id: string
  parentId: string | null
  isDone: boolean
  dueDate: ISODate | null
}

/** leaf progress, overdue LEAF count, open count, next open due date. */
export function summarize(proposal: Proposal, tasks: SummaryTask[], today: ISODate): ProposalSummary {
  const open = tasks.filter((x) => !x.isDone)
  const nextDue = open.map((x) => x.dueDate).filter((d): d is ISODate => !!d).sort()[0] ?? null
  const parents = new Set(tasks.map((t) => t.parentId).filter((p): p is string => !!p))
  return {
    ...proposal,
    progress: computeProgress(tasks),
    overdueCount: tasks.filter((x) => isOverdue(x, today) && !parents.has(x.id)).length,
    openTaskCount: open.length,
    nextDueDate: nextDue,
  }
}

export function toListItem(row: ProposalListRow, tasks: SummaryTask[], today: ISODate): ProposalListItem {
  return {
    ...summarize(toProposal(row), tasks, today),
    stores: toStores(row.stores),
    shelfType: toShelfType(row.shelfType),
    owner: toUser(row.owner),
    products: row.products.map((p) => toProduct(p.product)),
  }
}

function matchesQuery(q: string, ...fields: (string | null | undefined)[]) {
  const needle = q.trim().toLowerCase()
  return !needle || fields.some((f) => f?.toLowerCase().includes(needle))
}

// ---------- service ----------

@Injectable()
export class ProposalsReadService {
  constructor(private readonly access: ProposalAccessService) {}

  /** Tasks of many proposals in ONE query, grouped by proposal id. */
  async loadSummaryTasks(db: Db, proposalIds: string[]): Promise<Map<string, SummaryTask[]>> {
    const out = new Map<string, SummaryTask[]>(proposalIds.map((id) => [id, []]))
    if (proposalIds.length === 0) return out
    const rows = await db.task.findMany({
      where: { proposalId: { in: proposalIds } },
      select: { id: true, proposalId: true, parentId: true, isDone: true, dueDate: true },
    })
    for (const r of rows) out.get(r.proposalId)?.push({ id: r.id, parentId: r.parentId, isDone: r.isDone, dueDate: toDateOnly(r.dueDate) })
    return out
  }

  /** Builds list items for rows loaded with `proposalListInclude` (keeps the given order). */
  async buildListItems(db: Db, rows: ProposalListRow[], today: ISODate = todayBangkok()): Promise<ProposalListItem[]> {
    const tasks = await this.loadSummaryTasks(db, rows.map((r) => r.id))
    return rows.map((r) => toListItem(r, tasks.get(r.id) ?? [], today))
  }

  /** Loads + builds list items for any filter, sorted (targetDate asc). */
  async findListItems(db: Db, where: Prisma.ProposalWhereInput = {}, today: ISODate = todayBangkok()): Promise<ProposalListItem[]> {
    const rows = await db.proposal.findMany({ where, include: proposalListInclude, orderBy: proposalListOrder })
    return this.buildListItems(db, rows, today)
  }

  /** GET /proposals — scope, filters and free-text search exactly. */
  async list(db: Db, user: User, f: ProposalListQuery): Promise<ProposalListItem[]> {
    // An id that cannot exist simply matches nothing.
    for (const id of [f.storeId, f.shelfTypeId, f.ownerId]) if (id !== undefined && !UUID_RE.test(id)) return []

    const and: Prisma.ProposalWhereInput[] = []
    const scopeAll = f.scope === 'all' && can(user, 'proposal.read.all')
    if (!scopeAll) and.push(f.scope === 'mine' ? involvedWhere(user.id) : visibleWhere(user))
    const status = f.status ?? 'ALL'
    if (status === 'ACTIVE') and.push({ status: { in: ['DRAFT', 'IN_PROGRESS', 'ON_HOLD'] } })
    else if (status !== 'ALL') and.push({ status })
    if (f.channel) and.push({ channel: f.channel })
    if (f.storeId) and.push({ stores: { some: { storeId: f.storeId } } })
    if (f.shelfTypeId) and.push({ shelfTypeId: f.shelfTypeId })
    if (f.ownerId) and.push({ ownerId: f.ownerId })

    let rows = await db.proposal.findMany({ where: { AND: and }, include: proposalListInclude, orderBy: proposalListOrder })
    const q = f.q ?? ''
    if (q.trim()) {
      rows = rows.filter((r) =>
        matchesQuery(q, r.code, r.title, ...r.stores.map((x) => x.store.name), r.owner.name, ...r.products.map((x) => x.product.name), ...r.products.map((x) => x.product.sku)),
      )
    }
    return this.buildListItems(db, rows)
  }

  /** GET /proposals/:id — 404 when missing or not visible. */
  async detail(db: Db, user: User, id: string): Promise<ProposalDetail> {
    const row = await db.proposal.findUnique({ where: { id }, include: proposalDetailInclude })
    if (!row) throw notFound('การเสนอสินค้า')
    await this.access.assertView(db, user, toProposal(row))
    const [item] = await this.buildListItems(db, [row])
    return {
      ...item,
      members: row.members.map((m) => toUser(m.user)),
      template: row.template ? toTemplate(row.template) : null,
    }
  }
}
