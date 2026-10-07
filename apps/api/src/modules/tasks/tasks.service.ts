import { randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import {
  applyDetailPatch,
  canManageTasks,
  canToggleTask,
  checkMove,
  computeProgress,
  computeToggle,
  DESCRIPTION_FORMAT_LABEL,
  DETAIL_FIELDS_MAX,
  getDescendantIds,
  hasDetailPatch,
  isCountableStatus,
  isDueWithin,
  isOverdue,
  MAX_TASK_LEVEL,
  orderAsTree,
  readDetailFields,
  todayBangkok,
  type Progress,
  type Task,
  type TaskLevel,
  type User,
} from '@flowtrade/shared'
import type { TaskWithContext } from '@flowtrade/shared/api-types'
import { ActivityService } from '../../common/activity.service.js'
import { conflict, forbidden, invalid, notFound } from '../../common/errors.js'
import { fromDateOnly } from '../../common/dates.js'
import { detailFieldsJson, proposalWithStoresInclude, taskInclude, toProposal, toStores, toTask } from '../../common/mappers.js'
import { ProposalAccessService } from '../../common/proposal-access.service.js'
import { PrismaService, type Db } from '../../prisma/prisma.service.js'
import { assigneeRows, clampIndex, lockProposal, TaskTree, validateDates, type TreeNode } from './task-tree.js'
import type { CreateTaskBody, MoveTaskBody, MyTasksQuery, UpdateTaskBody } from './tasks.schemas.js'

export interface ToggleResult {
  changed: Task[]
  progress: Progress
  allDone: boolean
}

const levelWord = (level: number) => (level === 1 ? 'งาน' : level === 2 ? 'งานย่อย' : ' mini task')
const responsibleLabel = (value: string | null) => value ?? 'ไม่ระบุ'
const assignedNotice = (proposalId: string, taskId: string, title: string) => ({
  type: 'TASK_ASSIGNED' as const,
  title: 'คุณได้รับมอบหมายงานใหม่',
  body: title,
  link: `/proposals/${proposalId}?task=${taskId}`,
})

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProposalAccessService,
    private readonly activity: ActivityService,
  ) {}

  // ---------- helpers ----------

  private async findTask(db: Db, id: string): Promise<Task> {
    const row = await db.task.findUnique({ where: { id }, include: taskInclude })
    if (!row) throw notFound('งาน')
    return toTask(row)
  }

  private async proposalIdOf(db: Db, taskId: string) {
    const row = await db.task.findUnique({ where: { id: taskId }, select: { proposalId: true } })
    if (!row) throw notFound('งาน')
    return row.proposalId
  }

  private async proposalTasks(db: Db, proposalId: string): Promise<Task[]> {
    const rows = await db.task.findMany({ where: { proposalId }, include: taskInclude, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
    return orderAsTree(rows.map(toTask))
  }

  /** Locks the proposal's tree, then loads task + proposal fresh and checks visibility. */
  private async openForTreeEdit(db: Db, user: User, taskId: string) {
    const proposalId = await this.proposalIdOf(db, taskId)
    await lockProposal(db, proposalId)
    const task = await this.findTask(db, taskId)
    const proposal = await this.access.load(db, proposalId)
    await this.access.assertView(db, user, proposal)
    return { task, proposal }
  }

  // ---------- reads ----------

  async listByProposal(user: User, proposalId: string): Promise<Task[]> {
    await this.access.loadVisible(this.prisma, user, proposalId)
    return this.proposalTasks(this.prisma, proposalId)
  }

  /**
   * My tasks. `countable` = a leaf task of an IN_PROGRESS proposal: the only kind the due filters (overdue / today /
   * week) list, so `due=overdue` equals the sidebar badge. `due=all` lists everything (parents, drafts, on hold).
   */
  async mine(user: User, filters: MyTasksQuery): Promise<TaskWithContext[]> {
    const today = todayBangkok()
    const status = filters.status ?? 'open'
    const due = filters.due ?? 'all'
    const rows = await this.prisma.task.findMany({
      where: {
        assignees: { some: { userId: user.id } },
        proposal: { status: { not: 'CANCELLED' } },
        ...(filters.proposalId ? { proposalId: filters.proposalId } : {}),
        ...(status === 'all' ? {} : { isDone: status === 'done' }),
      },
      include: {
        ...taskInclude,
        proposal: { include: proposalWithStoresInclude },
        // Max depth is 3, so two parent hops give the whole path.
        parent: { select: { title: true, parent: { select: { title: true } } } },
        _count: { select: { children: true } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    })
    return rows
      .map((row) => ({ row, task: toTask(row), countable: row._count.children === 0 && isCountableStatus(row.proposal.status) }))
      .filter(({ task: x, countable }) =>
        due === 'all'
          ? true
          : countable && (due === 'overdue' ? isOverdue(x, today) : due === 'today' ? x.dueDate === today && !x.isDone : isDueWithin(x, today, 7)),
      )
      .sort((a, b) => (a.task.dueDate ?? '9999').localeCompare(b.task.dueDate ?? '9999'))
      .map(({ row, task, countable }) => ({
        task,
        proposal: toProposal(row.proposal),
        stores: toStores(row.proposal.stores),
        path: [row.parent?.parent?.title, row.parent?.title].filter((t): t is string => t !== undefined),
        countable,
      }))
  }

  // ---------- writes ----------

  create(user: User, input: CreateTaskBody): Promise<Task> {
    return this.prisma.$transaction(async (tx) => {
      await lockProposal(tx, input.proposalId)
      const proposal = await this.access.load(tx, input.proposalId)
      await this.access.assertView(tx, user, proposal)
      if (!canManageTasks(user, proposal)) throw forbidden('เฉพาะทีมงานของโปรเจกต์นี้ที่เพิ่มงานได้')
      const title = input.title.trim()
      if (!title) throw invalid('กรุณาระบุชื่องาน', { title: 'กรุณาระบุชื่องาน' })
      const parent = input.parentId ? await tx.task.findUnique({ where: { id: input.parentId }, select: { id: true, proposalId: true, level: true } }) : null
      if (input.parentId && !parent) throw notFound('งาน')
      if (parent && parent.proposalId !== proposal.id) throw invalid('งานแม่ไม่ได้อยู่ในโปรเจกต์เดียวกัน')
      const level = parent ? parent.level + 1 : 1
      if (level > MAX_TASK_LEVEL) throw invalid('เพิ่มได้สูงสุด 3 ระดับ (Task → Sub task → Mini task)')
      validateDates(input.startDate, input.dueDate)
      const assigneeIds = await this.access.activeUserIds(tx, input.assigneeIds ?? [])
      const responsible = input.responsible ?? null

      const now = new Date()
      const tree = await TaskTree.load(tx, proposal.id)
      const siblings = tree.siblings(parent?.id ?? null)
      const node: TreeNode = {
        id: randomUUID(),
        parentId: parent?.id ?? null,
        level: level as TaskLevel,
        title,
        sortOrder: 0,
        isDone: false,
        completedAt: null,
        completedById: null,
        updatedAt: now,
      }
      const index = input.index == null ? siblings.length : clampIndex(input.index, siblings.length)
      siblings.splice(index, 0, node)
      tree.add(node)
      tree.renumber(siblings)
      // A new open child re-opens a completed parent.
      tree.rederiveAncestors(node.id, user.id, now)

      await tx.task.create({
        data: {
          id: node.id,
          proposalId: proposal.id,
          parentId: node.parentId,
          level,
          title,
          description: input.description?.trim() || null,
          startDate: fromDateOnly(input.startDate ?? null),
          dueDate: fromDateOnly(input.dueDate ?? null),
          responsible,
          priority: input.priority ?? 'MEDIUM',
          sortOrder: node.sortOrder,
          createdById: user.id,
          assignees: { create: assigneeRows(assigneeIds, now) },
        },
      })
      await tree.flush(tx, now)
      await this.activity.log(tx, user, 'task.create', 'TASK', node.id, proposal.id, `เพิ่ม${levelWord(level)}: ${title}${responsible ? ` (แผนกผู้รับผิดชอบ: ${responsible})` : ''}`)
      await this.activity.notify(tx, assigneeIds, assignedNotice(proposal.id, node.id, title), user.id)
      return this.findTask(tx, node.id)
    })
  }

  update(user: User, id: string, patch: UpdateTaskBody): Promise<Task> {
    return this.prisma.$transaction(async (tx) => {
      // Row lock first: concurrent edits of one task run one after another, so detailValues
      // always merge into the latest rows (two people filling different rows both keep their data).
      await tx.task.updateMany({ where: { id }, data: { updatedAt: new Date() } })
      const task = await this.findTask(tx, id)
      const proposal = await this.access.load(tx, task.proposalId)
      await this.access.assertView(tx, user, proposal)
      const manager = canManageTasks(user, proposal)
      const isAssigneeOnly = !manager && task.assigneeIds.includes(user.id)
      if (!manager && !isAssigneeOnly) throw forbidden('คุณไม่มีสิทธิ์แก้ไขงานนี้')
      // patch.responsible is already trimmed ('' → null); undefined = not sent.
      const responsibleChanged = patch.responsible !== undefined && patch.responsible !== task.responsible
      if (isAssigneeOnly && (patch.assigneeIds || patch.title !== undefined || responsibleChanged)) {
        throw forbidden('ผู้รับผิดชอบแก้ไขได้เฉพาะรายละเอียดและวันที่')
      }
      const formatChanged = patch.descriptionFormat !== undefined && patch.descriptionFormat !== task.descriptionFormat
      const rowsEdited = patch.detailFields !== undefined || patch.detailAppend !== undefined || patch.detailLabels !== undefined || patch.detailRemove !== undefined
      if (isAssigneeOnly && (formatChanged || rowsEdited)) {
        throw forbidden('ผู้รับผิดชอบกรอกข้อมูลในตารางได้ ส่วนการเพิ่ม ลบ หรือแก้หัวข้อ และการเปลี่ยนรูปแบบ ให้ทีมงานโปรเจกต์เป็นผู้แก้')
      }
      const fieldsChanged = hasDetailPatch(patch)
      let fields = task.detailFields
      if (fieldsChanged) {
        const applied = applyDetailPatch(task.detailFields, patch, randomUUID)
        if (applied.missing.length) throw conflict('แถวข้อมูลนี้ถูกลบไปแล้ว — โหลดหน้าใหม่แล้วลองอีกครั้ง')
        if (applied.fields.length > DETAIL_FIELDS_MAX) throw invalid(`ตารางมีได้ไม่เกิน ${DETAIL_FIELDS_MAX} แถว`, { detailFields: `ตารางมีได้ไม่เกิน ${DETAIL_FIELDS_MAX} แถว` })
        if (new Set(applied.fields.map((f) => f.id)).size !== applied.fields.length) throw invalid('แถวข้อมูลซ้ำกัน', { detailFields: 'แถวข้อมูลซ้ำกัน' })
        fields = applied.fields
      }
      const before = new Map(task.detailFields.map((f) => [f.id, f.value]))
      const filled = Object.keys(patch.detailValues ?? {}).filter((fid) => fields.find((f) => f.id === fid)?.value !== before.get(fid)).length
      const start = patch.startDate !== undefined ? patch.startDate : task.startDate
      const due = patch.dueDate !== undefined ? patch.dueDate : task.dueDate
      validateDates(start, due)

      let title = task.title
      if (patch.title !== undefined) {
        title = patch.title.trim()
        if (!title) throw invalid('กรุณาระบุชื่องาน', { title: 'กรุณาระบุชื่องาน' })
      }
      let added: string[] = []
      if (patch.assigneeIds) {
        added = patch.assigneeIds.filter((a) => !task.assigneeIds.includes(a))
        const next = await this.access.activeUserIds(tx, patch.assigneeIds)
        await tx.taskAssignee.deleteMany({ where: { taskId: id, userId: { notIn: next } } })
        const fresh = next.filter((u) => !task.assigneeIds.includes(u))
        if (fresh.length) {
          await tx.taskAssignee.createMany({ data: assigneeRows(fresh, new Date()).map((a) => ({ taskId: id, ...a })), skipDuplicates: true })
        }
      }
      await tx.task.update({
        where: { id },
        data: {
          title,
          ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
          ...(formatChanged ? { descriptionFormat: patch.descriptionFormat } : {}),
          ...(fieldsChanged ? { detailFields: detailFieldsJson(fields) } : {}),
          ...(responsibleChanged ? { responsible: patch.responsible ?? null } : {}),
          ...(patch.priority ? { priority: patch.priority } : {}),
          startDate: fromDateOnly(start ?? null),
          dueDate: fromDateOnly(due ?? null),
        },
      })
      await this.activity.notify(tx, added, assignedNotice(proposal.id, id, title), user.id)
      const notes: string[] = []
      if (responsibleChanged) notes.push(`แผนกผู้รับผิดชอบ: ${responsibleLabel(task.responsible)} → ${responsibleLabel(patch.responsible ?? null)}`)
      if (formatChanged) notes.push(`เปลี่ยนรายละเอียดเป็นแบบ${DESCRIPTION_FORMAT_LABEL[patch.descriptionFormat!]}`)
      if (patch.detailFields) notes.push(`แก้ไขตารางข้อมูล ${fields.length} แถว`)
      if (patch.detailRemove?.length) notes.push(`ลบหัวข้อ ${patch.detailRemove.length} แถว`)
      if (patch.detailLabels && Object.keys(patch.detailLabels).length) notes.push(`แก้ชื่อหัวข้อ ${Object.keys(patch.detailLabels).length} แถว`)
      if (filled) notes.push(`กรอกข้อมูล ${filled} ช่อง`)
      if (patch.detailAppend?.length) notes.push(`เพิ่มหัวข้อ ${patch.detailAppend.length} แถว`)
      await this.activity.log(tx, user, 'task.update', 'TASK', id, proposal.id, `แก้ไขงาน: ${title}${notes.length ? ` (${notes.join(', ')})` : ''}`)
      return this.findTask(tx, id)
    })
  }

  /** Tick / untick with cascade. Returns every task whose state changed. */
  toggle(user: User, id: string, isDone: boolean): Promise<ToggleResult> {
    return this.prisma.$transaction(async (tx) => {
      const { task, proposal } = await this.openForTreeEdit(tx, user, id)
      if (!canToggleTask(user, proposal, task)) throw forbidden('ทำเครื่องหมายได้เฉพาะงานที่คุณรับผิดชอบ')
      if (proposal.status === 'CANCELLED') throw invalid('โปรเจกต์นี้ถูกยกเลิกแล้ว')
      const now = new Date()
      const tree = await TaskTree.load(tx, proposal.id)
      const changes = computeToggle(tree.nodes, id, isDone)
      for (const c of changes) {
        const n = tree.require(c.id)
        n.isDone = c.isDone
        n.completedAt = c.isDone ? now : null
        n.completedById = c.isDone ? user.id : null
        tree.touch(n)
      }
      await tree.flush(tx, now)
      await this.activity.log(
        tx,
        user,
        isDone ? 'task.complete' : 'task.reopen',
        'TASK',
        task.id,
        proposal.id,
        `${isDone ? 'ทำเครื่องหมายเสร็จ' : 'เปิดงานอีกครั้ง'}: ${task.title}${changes.length > 1 ? ` (+${changes.length - 1} งานที่เกี่ยวข้อง)` : ''}`,
      )
      if (isDone && proposal.status === 'DRAFT') await tx.proposal.update({ where: { id: proposal.id }, data: { status: 'IN_PROGRESS' } })
      const rows = changes.length ? await tx.task.findMany({ where: { id: { in: changes.map((c) => c.id) } }, include: taskInclude }) : []
      const byId = new Map(rows.map((r) => [r.id, toTask(r)]))
      const changed = changes.map((c) => byId.get(c.id)).filter((t): t is Task => t !== undefined)
      const progress = computeProgress(tree.nodes)
      return { changed, progress, allDone: progress.total > 0 && progress.done === progress.total }
    })
  }

  move(user: User, id: string, input: MoveTaskBody): Promise<Task[]> {
    return this.prisma.$transaction(async (tx) => {
      const { proposal } = await this.openForTreeEdit(tx, user, id)
      if (!canManageTasks(user, proposal)) throw forbidden('เฉพาะทีมงานของโปรเจกต์นี้ที่จัดลำดับงานได้')
      const tree = await TaskTree.load(tx, proposal.id)
      const task = tree.require(id)
      const check = checkMove(tree.nodes, id, input.parentId)
      if (!check.ok || !check.newLevel) throw invalid(check.reason ?? 'ย้ายงานไม่ได้')
      const now = new Date()
      const oldParent = task.parentId
      const levelDelta = check.newLevel - task.level
      const descendants = getDescendantIds(tree.nodes, id)
      task.parentId = input.parentId
      task.level = check.newLevel
      if (levelDelta !== 0) {
        for (const d of descendants) {
          const n = tree.require(d)
          n.level = (n.level + levelDelta) as TaskLevel
        }
      }
      const siblings = tree.siblings(input.parentId).filter((t) => t.id !== id)
      siblings.splice(clampIndex(input.index, siblings.length), 0, task)
      tree.renumber(siblings)
      if (oldParent !== input.parentId) {
        tree.renumber(tree.siblings(oldParent))
        if (oldParent) {
          const remaining = tree.nodes.find((t) => t.parentId === oldParent)
          if (remaining) tree.rederiveAncestors(remaining.id, user.id, now)
        }
        tree.rederiveAncestors(task.id, user.id, now)
        await this.activity.log(tx, user, 'task.move', 'TASK', task.id, proposal.id, `ย้ายงาน: ${task.title}`)
      }
      tree.touch(task)
      await tree.flush(tx, now)
      return this.proposalTasks(tx, proposal.id)
    })
  }

  remove(user: User, id: string): Promise<{ removed: string[] }> {
    return this.prisma.$transaction(async (tx) => {
      const { task, proposal } = await this.openForTreeEdit(tx, user, id)
      if (!canManageTasks(user, proposal)) throw forbidden('เฉพาะทีมงานของโปรเจกต์นี้ที่ลบงานได้')
      const now = new Date()
      const tree = await TaskTree.load(tx, proposal.id)
      const ids = new Set([id, ...getDescendantIds(tree.nodes, id)])
      // Children, assignees and comments go with it (FK cascade); listed explicitly for clarity.
      await tx.task.deleteMany({ where: { id: { in: [...ids] } } })
      tree.remove(ids)
      tree.renumber(tree.siblings(task.parentId))
      if (task.parentId) {
        const sibling = tree.nodes.find((t) => t.parentId === task.parentId)
        if (sibling) tree.rederiveAncestors(sibling.id, user.id, now)
      }
      await tree.flush(tx, now)
      await this.activity.log(tx, user, 'task.delete', 'TASK', id, proposal.id, `ลบงาน: ${task.title}${ids.size > 1 ? ` และงานย่อย ${ids.size - 1} รายการ` : ''}`)
      return { removed: [...ids] }
    })
  }

  /** Copies the task with its subtree, right after the original; the copy starts open. */
  duplicate(user: User, id: string): Promise<Task> {
    return this.prisma.$transaction(async (tx) => {
      const { proposal } = await this.openForTreeEdit(tx, user, id)
      if (!canManageTasks(user, proposal)) throw forbidden('คุณไม่มีสิทธิ์คัดลอกงานนี้')
      const rows = await tx.task.findMany({ where: { proposalId: proposal.id }, include: taskInclude, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
      const tree = TaskTree.from(proposal.id, rows)
      const original = rows.find((r) => r.id === id)
      if (!original) throw notFound('งาน')
      const subtreeIds = new Set([id, ...getDescendantIds(tree.nodes, id)])
      // Parents before children so every parent row exists when its child is inserted.
      const subtree = rows.filter((r) => subtreeIds.has(r.id)).sort((a, b) => a.level - b.level)
      const idMap = new Map(subtree.map((r) => [r.id, randomUUID()]))
      const copyId = idMap.get(id)!
      const now = new Date()

      const copies: TreeNode[] = subtree.map((r) => ({
        id: idMap.get(r.id)!,
        parentId: r.id === id ? r.parentId : (idMap.get(r.parentId!) ?? null),
        level: r.level as TaskLevel,
        title: r.id === id ? `${r.title} (สำเนา)` : r.title,
        sortOrder: r.sortOrder,
        isDone: false,
        completedAt: null,
        completedById: null,
        updatedAt: now,
      }))
      const root = copies.find((c) => c.id === copyId)!
      const siblings = tree.siblings(original.parentId)
      siblings.splice(siblings.findIndex((s) => s.id === id) + 1, 0, root)
      for (const c of copies) tree.add(c)
      tree.renumber(siblings)
      tree.rederiveAncestors(copyId, user.id, now)

      for (const [i, r] of subtree.entries()) {
        const c = copies[i]
        await tx.task.create({
          data: {
            id: c.id,
            proposalId: proposal.id,
            parentId: c.parentId,
            level: r.level,
            title: c.title,
            description: r.description,
            descriptionFormat: r.descriptionFormat,
            detailFields: detailFieldsJson(readDetailFields(r.detailFields)),
            startDate: r.startDate,
            dueDate: r.dueDate,
            responsible: r.responsible,
            priority: r.priority,
            sortOrder: c.sortOrder,
            createdById: user.id,
            assignees: { create: assigneeRows(r.assignees.map((a) => a.userId), now) },
          },
        })
      }
      await tree.flush(tx, now)
      await this.activity.log(tx, user, 'task.duplicate', 'TASK', copyId, proposal.id, `คัดลอกงาน: ${original.title}`)
      return this.findTask(tx, copyId)
    })
  }
}
