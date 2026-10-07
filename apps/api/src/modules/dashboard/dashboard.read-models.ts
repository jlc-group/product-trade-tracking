// Read-model builders private to the dashboard module (ProposalListItem / TaskWithContext),
// shaped's toListItem / summarize / withContext.
import { computeProgress, isOverdue, type ISODate, type Proposal, type ProposalStatus, type Store, type Task, type User } from '@flowtrade/shared'
import type { ProposalListItem, TaskWithContext } from '@flowtrade/shared/api-types'
import { proposalWithStoresInclude, toProduct, toProposal, toShelfType, toStores, toUser } from '../../common/mappers.js'
import type { Prisma } from '../../generated/prisma/client.js'

/** Proposals that are still being worked on (dashboard "live" / "active"). */
export const CLOSED_STATUSES: ProposalStatus[] = ['CANCELLED', 'COMPLETED']

export const listInclude = {
  ...proposalWithStoresInclude,
  products: { select: { productId: true, product: true }, orderBy: { sortOrder: 'asc' } },
  shelfType: true,
  owner: true,
} satisfies Prisma.ProposalInclude

export type ListRow = Prisma.ProposalGetPayload<{ include: typeof listInclude }>

/** The task fields a proposal summary needs (progress / overdue / open / next due). */
export interface TaskLite {
  id: string
  proposalId: string
  parentId: string | null
  isDone: boolean
  dueDate: ISODate | null
}

export function groupByProposal<T extends { proposalId: string }>(tasks: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const t of tasks) {
    const list = out.get(t.proposalId)
    if (list) list.push(t)
    else out.set(t.proposalId, [t])
  }
  return out
}

/** progress is leaf-based; overdueCount counts overdue leaves; open/next-due use every task. */
export function toListItem(row: ListRow, tasks: TaskLite[], today: ISODate): ProposalListItem {
  const parentIds = new Set(tasks.map((x) => x.parentId).filter((id): id is string => !!id))
  const open = tasks.filter((x) => !x.isDone)
  const nextDueDate =
    open
      .map((x) => x.dueDate)
      .filter((d): d is ISODate => !!d)
      .sort()[0] ?? null
  return {
    ...toProposal(row),
    progress: computeProgress(tasks),
    overdueCount: tasks.filter((x) => isOverdue(x, today) && !parentIds.has(x.id)).length,
    openTaskCount: open.length,
    nextDueDate,
    stores: toStores(row.stores),
    shelfType: toShelfType(row.shelfType),
    owner: toUser(row.owner),
    products: row.products.map((p) => toProduct(p.product)),
  }
}

export const byTargetDate = (a: { targetDate: ISODate }, b: { targetDate: ISODate }) => a.targetDate.localeCompare(b.targetDate)

// ---------- task ordering ----------
// Tasks are kept in insertion order: proposal by proposal (codes are sequential), each
// proposal's tree in pre-order. The server reproduces that with a sort key so ties (e.g. equal
// due dates) come out in the same order on every request.

export interface TreeOrderKey {
  /** Proposal code (PRJ-<year>-<seq>), i.e. proposal creation order. */
  code: string
  /** Root → self: each node's sibling sortOrder (id breaks ties). */
  path: { sortOrder: number; id: string }[]
}

export function compareTreeOrder(a: TreeOrderKey, b: TreeOrderKey): number {
  if (a.code !== b.code) return a.code < b.code ? -1 : 1
  const n = Math.min(a.path.length, b.path.length)
  for (let i = 0; i < n; i++) {
    const x = a.path[i]
    const y = b.path[i]
    if (x.sortOrder !== y.sortOrder) return x.sortOrder - y.sortOrder
    if (x.id !== y.id) return x.id < y.id ? -1 : 1
  }
  return a.path.length - b.path.length
}

/** Active users in a stable order (creation, then Thai name). */
export function sortUsers(users: User[]): User[] {
  return [...users].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name, 'th') || a.id.localeCompare(b.id))
}

export function withContext(task: Task, proposal: Proposal, stores: Store[], path: string[]): TaskWithContext {
  return { task, proposal, stores, path }
}
