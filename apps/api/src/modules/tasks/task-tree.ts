// In-memory working copy of one proposal's task tree. Services apply the shared tree logic
// (renumber, re-derive ancestors, cascades) to these nodes, then flush only the rows that changed.
import { getAncestorIds, type ISODate, type TaskLevel } from '@flowtrade/shared'
import { conflict, invalid, notFound } from '../../common/errors.js'
import type { Prisma } from '../../generated/prisma/client.js'
import type { Db } from '../../prisma/prisma.service.js'

export interface TreeNode {
  id: string
  parentId: string | null
  level: TaskLevel
  title: string
  sortOrder: number
  isDone: boolean
  completedAt: Date | null
  completedById: string | null
  updatedAt: Date
}

type TreeSource = Omit<TreeNode, 'level'> & { level: number }

const treeSelect = {
  id: true,
  parentId: true,
  level: true,
  title: true,
  sortOrder: true,
  isDone: true,
  completedAt: true,
  completedById: true,
  updatedAt: true,
} satisfies Prisma.TaskSelect

const sameTime = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null)

export class TaskTree {
  private readonly original = new Map<string, TreeNode>()
  /** Rows the user actually edited (their updatedAt moves); pure bookkeeping (renumbering) keeps it. */
  private readonly touched = new Set<string>()

  private constructor(
    readonly proposalId: string,
    public nodes: TreeNode[],
  ) {
    for (const n of nodes) this.original.set(n.id, { ...n })
  }

  static from(proposalId: string, rows: TreeSource[]) {
    return new TaskTree(
      proposalId,
      rows.map((r) => ({
        id: r.id,
        parentId: r.parentId,
        level: r.level as TaskLevel,
        title: r.title,
        sortOrder: r.sortOrder,
        isDone: r.isDone,
        completedAt: r.completedAt,
        completedById: r.completedById,
        updatedAt: r.updatedAt,
      })),
    )
  }

  static async load(db: Db, proposalId: string) {
    const rows = await db.task.findMany({ where: { proposalId }, select: treeSelect, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
    return TaskTree.from(proposalId, rows)
  }

  get(id: string) {
    return this.nodes.find((n) => n.id === id)
  }

  require(id: string) {
    const node = this.get(id)
    if (!node) throw notFound('งาน')
    return node
  }

  /** Children of `parentId` (null = top level) ordered by sortOrder. */
  siblings(parentId: string | null) {
    return this.nodes.filter((n) => n.parentId === parentId).sort((a, b) => a.sortOrder - b.sortOrder)
  }

  renumber(list: TreeNode[]) {
    list.forEach((n, i) => {
      n.sortOrder = (i + 1) * 1000
    })
  }

  touch(node: TreeNode) {
    this.touched.add(node.id)
  }

  /** A node the caller inserts itself (flush skips it). */
  add(node: TreeNode) {
    this.nodes.push(node)
    this.touched.add(node.id)
  }

  /** Nodes the caller deleted itself. */
  remove(ids: Set<string>) {
    this.nodes = this.nodes.filter((n) => !ids.has(n.id))
    for (const id of ids) this.original.delete(id)
  }

  /** A parent is done exactly when all of its children are done (walks up from `taskId`). */
  rederiveAncestors(taskId: string, actorId: string, now: Date) {
    for (const a of getAncestorIds(this.nodes, taskId)) {
      const parent = this.get(a)
      if (!parent) continue
      const kids = this.nodes.filter((t) => t.parentId === a)
      const done = kids.length > 0 && kids.every((k) => k.isDone)
      if (parent.isDone !== done) {
        parent.isDone = done
        parent.completedAt = done ? now : null
        parent.completedById = done ? actorId : null
        this.touch(parent)
      }
    }
  }

  /** Writes every pre-existing row whose tree fields changed. */
  async flush(db: Db, now: Date) {
    for (const n of this.nodes) {
      const before = this.original.get(n.id)
      if (!before) continue
      const data: Prisma.TaskUncheckedUpdateInput = {}
      if (n.parentId !== before.parentId) data.parentId = n.parentId
      if (n.level !== before.level) data.level = n.level
      if (n.sortOrder !== before.sortOrder) data.sortOrder = n.sortOrder
      if (n.isDone !== before.isDone) data.isDone = n.isDone
      if (!sameTime(n.completedAt, before.completedAt)) data.completedAt = n.completedAt
      if (n.completedById !== before.completedById) data.completedById = n.completedById
      const touched = this.touched.has(n.id)
      if (!touched && Object.keys(data).length === 0) continue
      data.updatedAt = touched ? now : before.updatedAt
      await db.task.update({ where: { id: n.id }, data })
    }
  }
}

/**
 * Serialises tree edits of one proposal: rewrites the proposal's updated_at with its own value,
 * which takes the row lock until the transaction ends without changing anything visible.
 */
export async function lockProposal(db: Db, proposalId: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await db.proposal.findUnique({ where: { id: proposalId }, select: { updatedAt: true } })
    if (!row) throw notFound('การเสนอสินค้า')
    const { count } = await db.proposal.updateMany({ where: { id: proposalId, updatedAt: row.updatedAt }, data: { updatedAt: row.updatedAt } })
    if (count === 1) return
  }
  throw conflict('มีผู้อื่นกำลังแก้ไขงานในโปรเจกต์นี้ กรุณาลองใหม่อีกครั้ง')
}

export function validateDates(start?: ISODate | null, due?: ISODate | null) {
  if (start && due && due < start) throw invalid('วันครบกำหนดต้องไม่อยู่ก่อนวันเริ่ม', { dueDate: 'วันครบกำหนดต้องไม่อยู่ก่อนวันเริ่ม' })
}

export const clampIndex = (index: number, length: number) => Math.max(0, Math.min(index, length))

/** Assignee rows in the given order (mapper orders by assignedAt). */
export const assigneeRows = (userIds: string[], now: Date) => userIds.map((userId, i) => ({ userId, assignedAt: new Date(now.getTime() + i) }))
