import { randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import {
  applyDetailPatch,
  autoCompletionHint,
  canCreateTask,
  canEditTaskDates,
  canManageTask,
  canManageTasks,
  canToggleTask,
  checkMove,
  completionMode,
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
  moveTaskLockReason,
  orderAsTree,
  readDetailFields,
  TASK_DATES_ADMIN_ONLY,
  taskLockReason,
  taskStructureRights,
  todayBangkok,
  type Progress,
  type Proposal,
  type Task,
  type TaskLevel,
  type User,
} from '@flowtrade/shared'
import type { TaskWithContext } from '@flowtrade/shared/api-types'
import { ActivityService, TASK_UPDATE_PREFIX } from '../../common/activity.service.js'
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

const ASSIGNEE_ONLY = 'ผู้รับผิดชอบงานแก้ไขได้เฉพาะรายละเอียดและข้อมูลในตาราง'

/** What the department rules of a tree change look at (the shared helpers take the whole proposal's tasks). */
type TreeTask = Pick<Task, 'id' | 'parentId' | 'responsible' | 'title'>

/** 403 for an edit of one task: says which department owns it when that locks the user out, else `fallback`. */
const taskDenied = (user: User, task: Pick<Task, 'responsible'>, fallback: string) => forbidden(taskLockReason(user, task) ?? fallback)

/**
 * Move / copy / delete (rules shared with the web: taskStructureRights / moveTaskLockReason): the project team, then the
 * task itself (its own department lock), then the other tasks the change touches — `allowed` / `reason` from the helper.
 */
function assertStructure(user: User, proposal: Proposal, task: Pick<Task, 'responsible'>, allowed: boolean, reason: string | null, teamOnly: string, action: string) {
  if (!canManageTasks(user, proposal)) throw forbidden(teamOnly)
  if (!canManageTask(user, proposal, task)) throw taskDenied(user, task, teamOnly)
  if (!allowed) throw forbidden(`${action}ไม่ได้${reason ? ` เพราะ${reason}` : ''}`)
}

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

  /** Every task of the proposal with what the department rules of a tree change need. */
  private treeTasks(db: Db, proposalId: string): Promise<TreeTask[]> {
    return db.task.findMany({ where: { proposalId }, select: { id: true, parentId: true, responsible: true, title: true } })
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
        completion: completionMode(task, row._count.children > 0),
      }))
  }

  // ---------- writes ----------

  create(user: User, input: CreateTaskBody): Promise<Task> {
    return this.prisma.$transaction(async (tx) => {
      await lockProposal(tx, input.proposalId)
      const proposal = await this.access.load(tx, input.proposalId)
      await this.access.assertView(tx, user, proposal)
      if (!canManageTasks(user, proposal)) throw forbidden('เฉพาะทีมงานของโปรเจกต์นี้ที่เพิ่มงานได้')
      // The new task's own department decides (also for a sub task); dates may be set while creating.
      const responsible = input.responsible ?? null
      if (!canCreateTask(user, proposal, responsible)) {
        throw forbidden(`เพิ่มงานของแผนก ${responsible} ได้เฉพาะคนในแผนก ${responsible} หรือ Admin`)
      }
      const title = input.title.trim()
      if (!title) throw invalid('กรุณาระบุชื่องาน', { title: 'กรุณาระบุชื่องาน' })
      const parent = input.parentId ? await tx.task.findUnique({ where: { id: input.parentId }, select: { id: true, proposalId: true, level: true, responsible: true } }) : null
      if (input.parentId && !parent) throw notFound('งาน')
      if (parent && parent.proposalId !== proposal.id) throw invalid('งานแม่ไม่ได้อยู่ในโปรเจกต์เดียวกัน')
      // A new sub task can re-open its parent, so the parent's department must allow the edit too.
      if (parent && !canManageTask(user, proposal, parent)) throw taskDenied(user, parent, 'คุณไม่มีสิทธิ์เพิ่มงานย่อยใต้งานนี้')
      const level = parent ? parent.level + 1 : 1
      if (level > MAX_TASK_LEVEL) throw invalid('เพิ่มได้สูงสุด 3 ระดับ (Task → Sub task → Mini task)')
      validateDates(input.startDate, input.dueDate)
      const assigneeIds = await this.access.activeUserIds(tx, input.assigneeIds ?? [])

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
        descriptionFormat: 'TEXT',
        detailFields: [],
      }
      const index = input.index == null ? siblings.length : clampIndex(input.index, siblings.length)
      siblings.splice(index, 0, node)
      tree.add(node)
      tree.renumber(siblings)
      // A new open child re-opens a completed parent.
      tree.rederive(user.id, now)

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
      // Proposal lock first (same order as every tree edit): a table edit can tick / re-open the task and its
      // ancestors. Then the row lock: concurrent edits of one task run one after another, so detailValues always
      // merge into the latest rows (two people filling different rows both keep their data).
      await lockProposal(tx, await this.proposalIdOf(tx, id))
      await tx.task.updateMany({ where: { id }, data: { updatedAt: new Date() } })
      const task = await this.findTask(tx, id)
      const proposal = await this.access.load(tx, task.proposalId)
      await this.access.assertView(tx, user, proposal)
      // Full edit = ADMIN, or the team on a task with no department / the user's own department; assignee-level edit
      // (description, table values) = the task's own assignee of that department. Everyone else only views (and comments).
      const manager = canManageTask(user, proposal, task)
      const isAssigneeOnly = !manager && canToggleTask(user, proposal, task)
      if (!manager && !isAssigneeOnly) throw taskDenied(user, task, 'คุณไม่มีสิทธิ์แก้ไขงานนี้')
      // Once a task exists only ADMIN sets or moves its dates (User and Manager never). The client re-sends both, so
      // compare values (the same value is fine).
      // Shifting the whole timeline goes through POST /proposals/:id/target-date.
      const start = patch.startDate !== undefined ? patch.startDate : task.startDate
      const due = patch.dueDate !== undefined ? patch.dueDate : task.dueDate
      if (((start ?? null) !== task.startDate || (due ?? null) !== task.dueDate) && !canEditTaskDates(user)) {
        throw forbidden(TASK_DATES_ADMIN_ONLY)
      }
      // patch.responsible is already trimmed ('' → null); undefined = not sent.
      const responsibleChanged = patch.responsible !== undefined && patch.responsible !== task.responsible
      const priorityChanged = patch.priority !== undefined && patch.priority !== task.priority
      if (isAssigneeOnly && (patch.assigneeIds || patch.title !== undefined || responsibleChanged || priorityChanged)) {
        throw forbidden(ASSIGNEE_ONLY)
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
      validateDates(start, due)

      let title = task.title
      if (patch.title !== undefined) {
        title = patch.title.trim()
        if (!title) throw invalid('กรุณาระบุชื่องาน', { title: 'กรุณาระบุชื่องาน' })
      }
      let added: string[] = []
      // Taken off the task: they hear about it through the bell (ACTIVITY), since the task leaves their list.
      let removed: string[] = []
      if (patch.assigneeIds) {
        added = patch.assigneeIds.filter((a) => !task.assigneeIds.includes(a))
        const next = await this.access.activeUserIds(tx, patch.assigneeIds)
        removed = task.assigneeIds.filter((u) => !next.includes(u))
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
      if (removed.length) notes.push(`นำผู้รับผิดชอบออก ${removed.length} คน`)
      await this.activity.log(tx, user, 'task.update', 'TASK', id, proposal.id, `${TASK_UPDATE_PREFIX}${title}${notes.length ? ` (${notes.join(', ')})` : ''}`, {
        extraRecipientIds: removed,
      })
      // Every edit re-derives (not only table edits), so rows left from before the rule heal on any change.
      await this.followCompletion(tx, user, proposal, id)
      return this.findTask(tx, id)
    })
  }

  /**
   * After an edit: tasks whose completion follows their table / sub tasks are ticked or re-opened to match
   * (the editor becomes the completer), logged as one automatic step.
   */
  private async followCompletion(tx: Db, user: User, proposal: Proposal, taskId: string) {
    const now = new Date()
    const tree = await TaskTree.load(tx, proposal.id)
    const changed = tree.rederive(user.id, now)
    if (changed.length === 0) return
    await tree.flush(tx, now)
    const done = changed[0].isDone
    const titles = changed.map((n) => n.title).join(', ')
    await this.activity.log(
      tx,
      user,
      done ? 'task.complete' : 'task.reopen',
      'TASK',
      taskId,
      proposal.id,
      done ? `กรอกข้อมูลครบ — ทำเครื่องหมายเสร็จอัตโนมัติ: ${titles}` : `ข้อมูลไม่ครบ — เปิดงานอีกครั้งอัตโนมัติ: ${titles}`,
    )
    if (done && proposal.status === 'DRAFT') await tx.proposal.update({ where: { id: proposal.id }, data: { status: 'IN_PROGRESS' } })
  }

  /** Tick / untick a task done by hand; tasks with a table or sub tasks follow them (422). Returns every task whose state changed. */
  toggle(user: User, id: string, isDone: boolean): Promise<ToggleResult> {
    return this.prisma.$transaction(async (tx) => {
      const { task, proposal } = await this.openForTreeEdit(tx, user, id)
      if (!canToggleTask(user, proposal, task)) throw taskDenied(user, task, 'ทำเครื่องหมายได้เฉพาะงานที่คุณรับผิดชอบ')
      if (proposal.status === 'CANCELLED') throw invalid('โปรเจกต์นี้ถูกยกเลิกแล้ว')
      const now = new Date()
      const tree = await TaskTree.load(tx, proposal.id)
      const mode = completionMode(tree.require(id), tree.nodes.some((n) => n.parentId === id))
      if (mode !== 'manual') throw invalid(autoCompletionHint(mode))
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
      const { task: moved, proposal } = await this.openForTreeEdit(tx, user, id)
      const tree = await TaskTree.load(tx, proposal.id)
      const task = tree.require(id)
      // A reorder among the same siblings changes only this task. A move to another parent carries the branch and changes
      // both parents' completion, so the branch and both parents must be editable too.
      const reorder = task.parentId === input.parentId
      const lock = moveTaskLockReason(user, proposal, await this.treeTasks(tx, proposal.id), id, input.parentId)
      assertStructure(user, proposal, moved, !lock, lock, 'เฉพาะทีมงานของโปรเจกต์นี้ที่จัดลำดับงานได้', reorder ? 'จัดลำดับงานนี้' : 'ย้ายงานนี้')
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
        tree.rederive(user.id, now)
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
      const now = new Date()
      const tree = await TaskTree.load(tx, proposal.id)
      const below = getDescendantIds(tree.nodes, id)
      // Sub tasks go with it, so each of them must be the user's to delete too.
      const rights = taskStructureRights(user, proposal, await this.treeTasks(tx, proposal.id), id)
      assertStructure(user, proposal, task, rights.remove, rights.reason, 'เฉพาะทีมงานของโปรเจกต์นี้ที่ลบงานได้', 'ลบงานนี้')
      const ids = new Set([id, ...below])
      // Their assignees lose the tasks from their list: read them before the rows go, so the bell can tell them.
      const assignees = await tx.taskAssignee.findMany({ where: { taskId: { in: [...ids] }, user: { isActive: true } }, select: { userId: true } })
      // Children, assignees and comments go with it (FK cascade); listed explicitly for clarity.
      await tx.task.deleteMany({ where: { id: { in: [...ids] } } })
      tree.remove(ids)
      tree.renumber(tree.siblings(task.parentId))
      tree.rederive(user.id, now)
      await tree.flush(tx, now)
      await this.activity.log(tx, user, 'task.delete', 'TASK', id, proposal.id, `ลบงาน: ${task.title}${ids.size > 1 ? ` และงานย่อย ${ids.size - 1} รายการ` : ''}`, {
        extraRecipientIds: assignees.map((a) => a.userId),
      })
      return { removed: [...ids] }
    })
  }

  /** Copies the task with its subtree, right after the original; the copy starts open unless its tables are already filled. */
  duplicate(user: User, id: string): Promise<Task> {
    return this.prisma.$transaction(async (tx) => {
      const { task: source, proposal } = await this.openForTreeEdit(tx, user, id)
      const rows = await tx.task.findMany({ where: { proposalId: proposal.id }, include: taskInclude, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
      const tree = TaskTree.from(proposal.id, rows)
      const original = rows.find((r) => r.id === id)
      if (!original) throw notFound('งาน')
      const below = getDescendantIds(tree.nodes, id)
      // The copy keeps each task's department and becomes a new child of the same parent (which it can re-open), so the
      // user must manage the whole subtree being copied and that parent.
      const rights = taskStructureRights(user, proposal, rows, id)
      assertStructure(user, proposal, source, rights.duplicate, rights.reason, 'คุณไม่มีสิทธิ์คัดลอกงานนี้', 'คัดลอกงานนี้')
      const subtreeIds = new Set([id, ...below])
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
        descriptionFormat: r.descriptionFormat,
        detailFields: readDetailFields(r.detailFields),
      }))
      const root = copies.find((c) => c.id === copyId)!
      const siblings = tree.siblings(original.parentId)
      siblings.splice(siblings.findIndex((s) => s.id === id) + 1, 0, root)
      for (const c of copies) tree.add(c)
      tree.renumber(siblings)
      tree.rederive(user.id, now)

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
            // As derived above: a copy whose table (and sub tasks) are complete starts done.
            isDone: c.isDone,
            completedAt: c.completedAt,
            completedById: c.completedById,
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
