// Write side of /proposals: create/update/status/target-date/duplicate/remove.
import { randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import {
  addDays,
  canDeleteProposal,
  canEditProposal,
  diffDays,
  normalizePlan,
  planFromTemplate,
  readDetailFields,
  STATUS_LABEL,
  todayBangkok,
  type ISODate,
  type NormalizedPlanItem,
  type Proposal,
  type User,
} from '@flowtrade/shared'
import { ActivityService } from '../../common/activity.service.js'
import { fromDateOnly, toDateOnly } from '../../common/dates.js'
import { forbidden, invalid, notFound } from '../../common/errors.js'
import { detailFieldsJson, proposalInclude, taskInclude, templateInclude, toProposal, toTemplate } from '../../common/mappers.js'
import { ProposalAccessService } from '../../common/proposal-access.service.js'
import type { Prisma } from '../../generated/prisma/client.js'
import { PrismaService, type Db } from '../../prisma/prisma.service.js'
import { lockProposal } from '../tasks/task-tree.js'
import type { CreateProposalBody, DuplicateBody, StatusBody, TargetDateBody, UpdateProposalBody } from './proposals.schemas.js'

const memberNotice = (p: Pick<Proposal, 'id' | 'code' | 'title'>) => ({
  type: 'PROPOSAL_STATUS' as const,
  title: 'คุณถูกเพิ่มเป็นทีมงาน',
  body: `${p.code} ${p.title}`,
  link: `/proposals/${p.id}`,
})

/** One task to create for a new proposal, from a template plan or the wizard-edited plan (parents first). */
interface PlanRow {
  key: string
  parentKey: string | null
  title: string
  startDate: ISODate | null
  dueDate: ISODate | null
  responsible: string | null
  sortOrder: number
}

/** Rows created in one statement share now(); spacing them 1 ms apart keeps the caller's order (lists are ordered by these columns). */
const orderedStamps = (count: number) => {
  const base = Date.now()
  return Array.from({ length: count }, (_, i) => new Date(base + i))
}

@Injectable()
export class ProposalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly access: ProposalAccessService,
  ) {}

  // ---------- helpers ----------

  /** PRJ-<year>-<0001>: row-locked increment of proposal_counters (INSERT … ON CONFLICT DO UPDATE). */
  private async nextCode(db: Db, today: ISODate) {
    const year = Number(today.slice(0, 4))
    const counter = await db.proposalCounter.upsert({
      where: { year },
      create: { year, lastValue: 1 },
      update: { lastValue: { increment: 1 } },
    })
    return `PRJ-${year}-${String(counter.lastValue).padStart(4, '0')}`
  }

  private async editable(db: Db, user: User, id: string, message: string) {
    const proposal = await this.access.loadVisible(db, user, id)
    if (!canEditProposal(user, proposal)) throw forbidden(message)
    return proposal
  }

  /** Products in the given order (de-duplicated); every id must exist. */
  private async loadProducts(db: Db, ids: string[], requireActive: boolean) {
    const unique = [...new Set(ids)]
    const rows = await db.product.findMany({ where: { id: { in: unique } } })
    return unique.map((id) => {
      const p = rows.find((r) => r.id === id)
      if (!p || (requireActive && !p.isActive)) throw invalid('ไม่พบสินค้าที่เลือก')
      return p
    })
  }

  // ---------- POST /proposals ----------

  /** Wizard submit: one proposal per selected store, each with tasks from the template — all in one transaction. */
  create(user: User, input: CreateProposalBody): Promise<Proposal[]> {
    return this.prisma.$transaction(async (tx) => {
      const today = todayBangkok()
      const shelf = await tx.shelfType.findUnique({ where: { id: input.shelfTypeId } })
      if (!shelf || !shelf.isActive) throw invalid('กรุณาเลือกประเภท Shelf')
      if (shelf.channel !== input.channel) throw invalid('ประเภท Shelf ไม่ตรงกับช่องทางที่เลือก')
      const templateRow = input.templateId ? await tx.taskTemplate.findUnique({ where: { id: input.templateId }, include: templateInclude }) : null
      if (input.templateId && !templateRow) throw notFound('แม่แบบ')
      const template = templateRow ? toTemplate(templateRow) : null
      const memberIds = await this.access.activeUserIds(tx, (input.memberIds ?? []).filter((m) => m !== user.id))
      const products = await this.loadProducts(tx, input.productIds, true)

      // Validate every store up front (fixed order, first error wins).
      const storeRows = await tx.store.findMany({ where: { id: { in: [...new Set(input.storeIds)] } } })
      const stores = input.storeIds.map((storeId) => {
        const store = storeRows.find((s) => s.id === storeId && s.isActive)
        if (!store) throw invalid('ไม่พบห้างที่เลือก')
        if (store.channel !== input.channel) throw invalid(`${store.name} ไม่ได้อยู่ในช่องทางที่เลือก`)
        return store
      })

      // Wizard-edited plan (exactly what the user kept/typed) wins over template instantiation.
      let plan: PlanRow[]
      if (input.plan) {
        let normalized: NormalizedPlanItem[]
        try {
          normalized = normalizePlan(input.plan)
        } catch (e) {
          throw invalid(e instanceof Error ? e.message : 'รายการงานไม่ถูกต้อง')
        }
        plan = normalized.map((p) => ({ key: p.key, parentKey: p.parentKey, title: p.title, startDate: p.startDate, dueDate: p.dueDate, responsible: p.responsible, sortOrder: p.sortOrder }))
      } else if (template) {
        plan = planFromTemplate(template.items, input.targetDate, today, input.excludedTemplateItemIds ?? []).map((p) => ({
          key: p.templateItemId,
          parentKey: p.parentTemplateItemId,
          title: p.title,
          startDate: p.startDate,
          dueDate: p.dueDate,
          responsible: p.responsible,
          sortOrder: p.sortOrder,
        }))
      } else {
        plan = []
      }
      const customTitle = input.title?.trim()
      const note = input.note?.trim() || null
      const created: Proposal[] = []

      for (const store of stores) {
        const title = customTitle
          ? input.storeIds.length > 1
            ? `${customTitle} — ${store.name}`
            : customTitle
          : `${products[0].name}${products.length > 1 ? ` +${products.length - 1}` : ''} → ${store.name}`
        const code = await this.nextCode(tx, today)
        const memberStamps = orderedStamps(memberIds.length)
        const row = await tx.proposal.create({
          data: {
            code,
            title,
            channel: input.channel,
            storeId: store.id,
            shelfTypeId: shelf.id,
            targetDate: fromDateOnly(input.targetDate),
            status: input.status,
            ownerId: user.id,
            templateId: template?.id ?? null,
            note,
            members: { createMany: { data: memberIds.map((userId, i) => ({ userId, addedAt: memberStamps[i] })) } },
            products: { createMany: { data: products.map((p, i) => ({ productId: p.id, sortOrder: i })) } },
          },
          include: proposalInclude,
        })

        if (plan.length > 0) {
          // Plan is in tree pre-order, so every parent is mapped before its children.
          const idMap = new Map<string, { id: string; level: number }>()
          const tasks: Prisma.TaskCreateManyInput[] = plan.map((p) => {
            const id = randomUUID()
            const parent = p.parentKey ? idMap.get(p.parentKey) : undefined
            // An item whose parent is missing becomes a root (DB requires level 1 ⇔ no parent).
            const level = parent ? parent.level + 1 : 1
            idMap.set(p.key, { id, level })
            return {
              id,
              proposalId: row.id,
              parentId: parent?.id ?? null,
              level,
              title: p.title,
              description: null,
              startDate: fromDateOnly(p.startDate),
              dueDate: fromDateOnly(p.dueDate),
              responsible: p.responsible,
              priority: level === 1 ? ('HIGH' as const) : ('MEDIUM' as const),
              isDone: false,
              sortOrder: p.sortOrder,
              createdById: user.id,
            }
          })
          await tx.task.createMany({ data: tasks })
          await tx.taskAssignee.createMany({ data: tasks.map((t) => ({ taskId: t.id!, userId: user.id })) })
        }

        await this.activity.log(tx, user, 'proposal.create', 'PROPOSAL', row.id, row.id, `สร้างการเสนอสินค้า ${row.code} (${store.name})`)
        await this.activity.notify(tx, memberIds, memberNotice(row), user.id)
        created.push(toProposal(row))
      }
      return created
    })
  }

  // ---------- PATCH /proposals/:id ----------

  update(user: User, id: string, patch: UpdateProposalBody): Promise<Proposal> {
    return this.prisma.$transaction(async (tx) => {
      const proposal = await this.editable(tx, user, id, 'เฉพาะเจ้าของงานหรือผู้จัดการเท่านั้นที่แก้ไขได้')
      const data: Prisma.ProposalUncheckedUpdateInput = { updatedAt: new Date() }

      let ownerId = proposal.ownerId
      if (patch.ownerId && patch.ownerId !== proposal.ownerId) {
        await this.access.activeUserIds(tx, [patch.ownerId])
        ownerId = patch.ownerId
        data.ownerId = ownerId
      }

      if (patch.memberIds) {
        const added = patch.memberIds.filter((m) => !proposal.memberIds.includes(m))
        const next = await this.access.activeUserIds(tx, patch.memberIds.filter((m) => m !== ownerId))
        await tx.proposalMember.deleteMany({ where: { proposalId: id, userId: { notIn: next } } })
        const fresh = next.filter((m) => !proposal.memberIds.includes(m))
        const stamps = orderedStamps(fresh.length)
        if (fresh.length > 0) await tx.proposalMember.createMany({ data: fresh.map((userId, i) => ({ proposalId: id, userId, addedAt: stamps[i] })), skipDuplicates: true })
        await this.activity.notify(tx, added, memberNotice(proposal), user.id)
      }

      if (patch.productIds) {
        if (patch.productIds.length === 0) throw invalid('ต้องมีสินค้าอย่างน้อย 1 รายการ')
        const products = await this.loadProducts(tx, patch.productIds, false)
        await tx.proposalProduct.deleteMany({ where: { proposalId: id } })
        await tx.proposalProduct.createMany({ data: products.map((p, i) => ({ proposalId: id, productId: p.id, sortOrder: i })) })
      }

      if (patch.shelfTypeId) {
        const shelf = await tx.shelfType.findUnique({ where: { id: patch.shelfTypeId } })
        if (!shelf) throw notFound('ประเภท Shelf')
        if (shelf.channel !== proposal.channel) throw invalid('ประเภท Shelf ไม่ตรงกับช่องทาง')
        data.shelfTypeId = shelf.id
      }

      if (patch.title !== undefined) {
        if (!patch.title.trim()) throw invalid('กรุณาระบุชื่องาน')
        data.title = patch.title.trim()
      }
      if (patch.note !== undefined) data.note = patch.note?.trim() || null

      const row = await tx.proposal.update({ where: { id }, data, include: proposalInclude })
      await this.activity.log(tx, user, 'proposal.update', 'PROPOSAL', id, id, `แก้ไขข้อมูล ${row.code}`)
      return toProposal(row)
    })
  }

  // ---------- POST /proposals/:id/status ----------

  changeStatus(user: User, id: string, { status }: StatusBody): Promise<Proposal> {
    return this.prisma.$transaction(async (tx) => {
      // Same lock order as the tasks module (proposal row first), so a concurrent un-tick can't slip in.
      await lockProposal(tx, id)
      const proposal = await this.editable(tx, user, id, 'เฉพาะเจ้าของงานหรือผู้จัดการเท่านั้นที่เปลี่ยนสถานะได้')
      if (status === 'COMPLETED' && (await tx.task.count({ where: { proposalId: id, isDone: false } })) > 0) {
        throw invalid('ยังมีงานที่ยังไม่เสร็จ — ทำเครื่องหมายให้ครบก่อนปิดงาน')
      }
      const now = new Date()
      const row = await tx.proposal.update({
        where: { id },
        data: { status, completedAt: status === 'COMPLETED' ? now : null, updatedAt: now },
        include: proposalInclude,
      })
      const label = STATUS_LABEL[status]
      await this.activity.log(tx, user, 'proposal.status', 'PROPOSAL', id, id, `เปลี่ยนสถานะ ${proposal.code} เป็น "${label}"`)
      await this.activity.notify(
        tx,
        [proposal.ownerId, ...proposal.memberIds],
        { type: 'PROPOSAL_STATUS', title: `สถานะเปลี่ยนเป็น "${label}"`, body: `${proposal.code} ${proposal.title}`, link: `/proposals/${id}` },
        user.id,
      )
      return toProposal(row)
    })
  }

  // ---------- POST /proposals/:id/target-date ----------

  /** Move the target date; optionally shift every OPEN task's start/due by the same number of days. */
  changeTargetDate(user: User, id: string, { targetDate, shiftTasks }: TargetDateBody): Promise<Proposal> {
    return this.prisma.$transaction(async (tx) => {
      // Lock the proposal row before touching tasks: the tasks module locks in the same order (no deadlock),
      // and two concurrent date changes can't both shift tasks from the same old date.
      await lockProposal(tx, id)
      const proposal = await this.editable(tx, user, id, 'เฉพาะเจ้าของงานหรือผู้จัดการเท่านั้นที่เปลี่ยนวันวางขายได้')
      const delta = diffDays(proposal.targetDate, targetDate)
      const now = new Date()
      if (shiftTasks && delta !== 0) {
        const open = await tx.task.findMany({ where: { proposalId: id, isDone: false }, select: { id: true, startDate: true, dueDate: true } })
        // Tasks with the same (start, due) get the same new dates → one updateMany per distinct pair.
        const groups = new Map<string, { start: ISODate | null; due: ISODate | null; ids: string[] }>()
        for (const t of open) {
          const start = toDateOnly(t.startDate)
          const due = toDateOnly(t.dueDate)
          const key = `${start}|${due}`
          const g = groups.get(key) ?? { start, due, ids: [] }
          g.ids.push(t.id)
          groups.set(key, g)
        }
        for (const g of groups.values()) {
          await tx.task.updateMany({
            where: { id: { in: g.ids } },
            data: {
              startDate: g.start ? fromDateOnly(addDays(g.start, delta)) : null,
              dueDate: g.due ? fromDateOnly(addDays(g.due, delta)) : null,
              updatedAt: now,
            },
          })
        }
      }
      const row = await tx.proposal.update({ where: { id }, data: { targetDate: fromDateOnly(targetDate), updatedAt: now }, include: proposalInclude })
      await this.activity.log(
        tx,
        user,
        'proposal.targetDate',
        'PROPOSAL',
        id,
        id,
        `เลื่อนวันวางขายจาก ${proposal.targetDate} เป็น ${targetDate}${shiftTasks ? ` และเลื่อนงานที่ยังไม่เสร็จ ${delta} วัน` : ''}`,
      )
      return toProposal(row)
    })
  }

  // ---------- POST /proposals/:id/duplicate ----------

  /** Copy to another store of the same channel: new code, DRAFT, caller as owner, tasks re-dated by the target-date delta. */
  duplicate(user: User, id: string, { storeId, targetDate }: DuplicateBody): Promise<Proposal> {
    return this.prisma.$transaction(async (tx) => {
      const source = await this.access.loadVisible(tx, user, id)
      const store = await tx.store.findUnique({ where: { id: storeId } })
      if (!store || !store.isActive || store.channel !== source.channel) throw invalid('ห้างปลายทางไม่ถูกต้อง')
      const delta = diffDays(source.targetDate, targetDate)
      const code = await this.nextCode(tx, todayBangkok())
      const memberIds = source.memberIds.filter((m) => m !== user.id)
      const memberStamps = orderedStamps(memberIds.length)
      const row = await tx.proposal.create({
        data: {
          code,
          title: source.title.replace(/→ .+$/, () => `→ ${store.name}`),
          channel: source.channel,
          storeId: store.id,
          shelfTypeId: source.shelfTypeId,
          targetDate: fromDateOnly(targetDate),
          status: 'DRAFT',
          ownerId: user.id,
          templateId: source.templateId,
          note: source.note,
          members: { createMany: { data: memberIds.map((userId, i) => ({ userId, addedAt: memberStamps[i] })) } },
          products: { createMany: { data: source.productIds.map((productId, i) => ({ productId, sortOrder: i })) } },
        },
        include: proposalInclude,
      })

      // Parents before children (level asc).
      const sourceTasks = await tx.task.findMany({
        where: { proposalId: id },
        include: taskInclude,
        orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      })
      if (sourceTasks.length > 0) {
        const idMap = new Map<string, string>()
        const shift = (d: Date | null) => (d ? fromDateOnly(addDays(toDateOnly(d), delta)) : null)
        const tasks: Prisma.TaskCreateManyInput[] = []
        const assignees: Prisma.TaskAssigneeCreateManyInput[] = []
        for (const t of sourceTasks) {
          const newId = randomUUID()
          idMap.set(t.id, newId)
          tasks.push({
            id: newId,
            proposalId: row.id,
            parentId: t.parentId ? (idMap.get(t.parentId) ?? null) : null,
            level: t.level,
            title: t.title,
            description: t.description,
            descriptionFormat: t.descriptionFormat,
            detailFields: detailFieldsJson(readDetailFields(t.detailFields)),
            startDate: shift(t.startDate),
            dueDate: shift(t.dueDate),
            responsible: t.responsible,
            priority: t.priority,
            isDone: false,
            completedAt: null,
            completedById: null,
            sortOrder: t.sortOrder,
            createdById: user.id,
          })
          const stamps = orderedStamps(t.assignees.length)
          t.assignees.forEach((a, i) => assignees.push({ taskId: newId, userId: a.userId, assignedAt: stamps[i] }))
        }
        await tx.task.createMany({ data: tasks })
        if (assignees.length > 0) await tx.taskAssignee.createMany({ data: assignees })
      }

      await this.activity.log(tx, user, 'proposal.duplicate', 'PROPOSAL', row.id, row.id, `คัดลอกจาก ${source.code} เป็น ${row.code} (${store.name})`)
      return toProposal(row)
    })
  }

  // ---------- DELETE /proposals/:id ----------

  remove(user: User, id: string): Promise<true> {
    return this.prisma.$transaction(async (tx) => {
      const proposal = await this.access.loadVisible(tx, user, id)
      if (!canDeleteProposal(user, proposal)) throw forbidden('ลบได้เฉพาะงานร่างของตัวเอง — งานที่เริ่มแล้วให้เปลี่ยนสถานะเป็น "ยกเลิก" แทน')
      const taskCount = await tx.task.count({ where: { proposalId: id } })
      // Members, products, tasks (+ assignees) and comments cascade in the database.
      await tx.proposal.delete({ where: { id } })
      await tx.notification.deleteMany({ where: { link: { startsWith: `/proposals/${id}` } } })
      await this.activity.log(tx, user, 'proposal.delete', 'PROPOSAL', id, null, `ลบการเสนอสินค้า ${proposal.code} (${taskCount} งาน)`)
      return true as const
    })
  }
}
