import { randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import {
  CHANNEL_SHORT,
  CHANNEL_TERMS,
  MAX_TASK_LEVEL,
  orderAsTree,
  planFromTemplate,
  todayBangkok,
  type Channel,
  type TaskTemplate,
  type User,
} from '@flowtrade/shared'
import type { TemplatePreviewItem } from '@flowtrade/shared/api-types'
import { ActivityService } from '../../common/activity.service.js'
import { invalid, notFound } from '../../common/errors.js'
import { templateInclude, toTemplate } from '../../common/mappers.js'
import { PrismaService, type Db } from '../../prisma/prisma.service.js'
import { isUuid, type CreateTemplateBody, type PreviewQuery, type SuggestQuery, type TemplateItemPayload, type UpdateTemplateBody } from './templates.schemas.js'

/** A validated, re-keyed item ready to insert (parents always precede their children). */
interface ItemRow {
  id: string
  parentId: string | null
  level: number
  title: string
  startOffsetDays: number
  dueOffsetDays: number
  responsible: string | null
  fieldLabels: string[]
  sortOrder: number
}

/** "Most specific wins": a store match outranks a shelf-type match, which outranks a channel-only match. */
const specificity = (t: { channel: Channel | null; storeId: string | null; shelfTypeId: string | null }) =>
  (t.storeId ? 4 : 0) + (t.shelfTypeId ? 2 : 0) + (t.channel ? 1 : 0)

/** An "every channel" template (channel null) can't be tied to a channel's shelf type or store. */
function assertChannelScope(channel: Channel | null, shelfTypeId: string | null, storeId: string | null) {
  if (channel !== null) return
  const fields: Record<string, string> = {}
  if (shelfTypeId) fields.shelfTypeId = 'แม่แบบที่ใช้ได้ทุกช่องทางระบุประเภท Shelf ไม่ได้ — เลือกช่องทางก่อน หากต้องการเจาะจงประเภท Shelf'
  if (storeId) fields.storeId = 'แม่แบบที่ใช้ได้ทุกช่องทางระบุห้าง/แพลตฟอร์มไม่ได้ — เลือกช่องทางก่อน หากต้องการเจาะจงห้าง'
  const first = fields.shelfTypeId ?? fields.storeId
  if (first) throw invalid(first, fields)
}

/**
 * Validates the tree shape of a template payload, then gives every item a fresh UUID
 * (client temporary ids such as "ti-ab12cd34" are replaced, parent links remapped).
 */
export function prepareItems(items: TemplateItemPayload[]): ItemRow[] {
  const fields: Record<string, string> = {}
  let first: string | null = null
  const issue = (index: number, key: string, message: string) => {
    fields[`items.${index}.${key}`] ??= message
    first ??= message
  }

  const byId = new Map<string, TemplateItemPayload>()
  items.forEach((item, index) => {
    if (byId.has(item.id)) issue(index, 'id', 'รหัสงานในแม่แบบซ้ำกัน กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง')
    else byId.set(item.id, item)
  })

  items.forEach((item, index) => {
    const label = `"${item.title}"`
    if (item.parentId === null) {
      if (item.level !== 1) issue(index, 'level', `${label} ไม่มีงานแม่ จึงต้องเป็นระดับ 1 (Task)`)
    } else {
      const parent = byId.get(item.parentId)
      if (!parent || item.parentId === item.id) issue(index, 'parentId', `${label} อ้างถึงงานแม่ที่ไม่มีอยู่ในแม่แบบ`)
      else if (parent.level >= MAX_TASK_LEVEL) issue(index, 'level', `${label} ลึกเกิน ${MAX_TASK_LEVEL} ระดับ (Task → Sub task → Mini task)`)
      else if (item.level !== parent.level + 1) issue(index, 'level', `${label} ต้องเป็นระดับ ${parent.level + 1} ถัดจากงานแม่ "${parent.title}"`)
    }
    if (item.dueOffsetDays < item.startOffsetDays) issue(index, 'dueOffsetDays', `${label} วันครบกำหนดอยู่ก่อนวันเริ่ม`)
  })

  if (first) throw invalid(first, fields)

  // Levels strictly increase along every parent link, so the payload is a forest (no cycles).
  const ids = new Map(items.map((i) => [i.id, randomUUID()]))
  const withOrder = items.map((i, k) => ({ ...i, sortOrder: i.sortOrder ?? (k + 1) * 1000 }))
  return orderAsTree(withOrder).map((i) => ({
    id: ids.get(i.id)!,
    parentId: i.parentId ? ids.get(i.parentId)! : null,
    level: i.level,
    title: i.title,
    startOffsetDays: i.startOffsetDays,
    dueOffsetDays: i.dueOffsetDays,
    responsible: i.responsible,
    fieldLabels: i.fieldLabels,
    sortOrder: i.sortOrder,
  }))
}

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  async list(includeInactive: boolean): Promise<TaskTemplate[]> {
    const rows = await this.prisma.taskTemplate.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: templateInclude,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    })
    // "Every channel" templates (channel null) first; otherwise oldest first (Array.sort is stable).
    return rows.map(toTemplate).sort((a, b) => Number(a.channel !== null) - Number(b.channel !== null))
  }

  async get(id: string): Promise<TaskTemplate> {
    return toTemplate(await this.load(this.prisma, id))
  }

  /**
   * Best active template for a channel/shelf/store combination, or null.
   * Candidates: channel = X or null (every channel), shelf/store null or matching; most specific wins, ties → oldest.
   */
  async suggest(q: SuggestQuery): Promise<TaskTemplate | null> {
    // Non-uuid values cannot match any template, so they behave like "not chosen" (never a 500 from the uuid cast).
    const shelf = q.shelfTypeId && isUuid(q.shelfTypeId) ? q.shelfTypeId : null
    const store = q.storeId && isUuid(q.storeId) ? q.storeId : null
    const candidates = await this.prisma.taskTemplate.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ channel: q.channel }, { channel: null }] },
          { OR: [{ shelfTypeId: null }, ...(shelf ? [{ shelfTypeId: shelf }] : [])] },
          { OR: [{ storeId: null }, ...(store ? [{ storeId: store }] : [])] },
        ],
      },
      select: { id: true, channel: true, shelfTypeId: true, storeId: true },
      // Ties go to the oldest template (stable sort over insertion order).
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    })
    let best: (typeof candidates)[number] | null = null
    for (const c of candidates) if (!best || specificity(c) > specificity(best)) best = c
    if (!best) return null
    const row = await this.prisma.taskTemplate.findUnique({ where: { id: best.id }, include: templateInclude })
    return row ? toTemplate(row) : null
  }

  async preview(id: string, q: PreviewQuery): Promise<TemplatePreviewItem[]> {
    const template = toTemplate(await this.load(this.prisma, id))
    return planFromTemplate(template.items, q.targetDate, todayBangkok(), q.excluded).map((p) => ({
      templateItemId: p.templateItemId,
      parentTemplateItemId: p.parentTemplateItemId,
      level: p.level,
      title: p.title,
      startDate: p.startDate,
      dueDate: p.dueDate,
      responsible: p.responsible,
      clamped: p.clamped,
    }))
  }

  async create(actor: User, body: CreateTemplateBody): Promise<TaskTemplate> {
    const items = prepareItems(body.items)
    assertChannelScope(body.channel, body.shelfTypeId, body.storeId)
    return this.prisma.$transaction(async (tx) => {
      await this.assertRefs(tx, body.channel, body.shelfTypeId, body.storeId, { shelf: true, store: true })
      const row = await tx.taskTemplate.create({
        data: {
          name: body.name,
          description: body.description ?? null,
          channel: body.channel,
          shelfTypeId: body.shelfTypeId,
          storeId: body.storeId,
          isActive: body.isActive ?? true,
          items: { createMany: { data: items } },
        },
        include: templateInclude,
      })
      await this.activity.log(tx, actor, 'template.create', 'TEMPLATE', row.id, null, `สร้างแม่แบบ ${row.name}`)
      return toTemplate(row)
    })
  }

  /** Partial update; when `items` is present it replaces every item of the template. */
  async update(actor: User, id: string, body: UpdateTemplateBody): Promise<TaskTemplate> {
    const items = body.items ? prepareItems(body.items) : null
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.taskTemplate.findUnique({ where: { id } })
      if (!existing) throw notFound('แม่แบบ')
      // Check the resulting scope before writing (the DB CHECK would otherwise answer 500).
      assertChannelScope(
        body.channel !== undefined ? body.channel : existing.channel,
        body.shelfTypeId !== undefined ? body.shelfTypeId : existing.shelfTypeId,
        body.storeId !== undefined ? body.storeId : existing.storeId,
      )
      // Updating the template row first takes its row lock, so concurrent item replacements serialize.
      const updated = await tx.taskTemplate.update({
        where: { id },
        data: {
          name: body.name,
          description: body.description,
          channel: body.channel,
          shelfTypeId: body.shelfTypeId,
          storeId: body.storeId,
          isActive: body.isActive,
          updatedAt: new Date(),
        },
      })
      const channelChanged = updated.channel !== existing.channel
      await this.assertRefs(tx, updated.channel, updated.shelfTypeId, updated.storeId, {
        shelf: body.shelfTypeId !== undefined || channelChanged,
        store: body.storeId !== undefined || channelChanged,
      })
      if (items) {
        await tx.taskTemplateItem.deleteMany({ where: { templateId: id } })
        if (items.length > 0) await tx.taskTemplateItem.createMany({ data: items.map((i) => ({ ...i, templateId: id })) })
      }
      const row = await this.load(tx, id)
      await this.activity.log(tx, actor, 'template.update', 'TEMPLATE', row.id, null, `แก้ไขแม่แบบ ${row.name}`)
      return toTemplate(row)
    })
  }

  /** Items cascade; proposals keep their tasks and get templateId = null (FK ON DELETE SET NULL). */
  async remove(actor: User, id: string): Promise<true> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.taskTemplate.findUnique({ where: { id }, select: { id: true, name: true } })
      if (!existing) throw notFound('แม่แบบ')
      await tx.taskTemplate.delete({ where: { id } })
      await this.activity.log(tx, actor, 'template.delete', 'TEMPLATE', id, null, `ลบแม่แบบ ${existing.name}`)
    })
    return true
  }

  // ---------- helpers ----------

  private async load(db: Db, id: string) {
    const row = await db.taskTemplate.findUnique({ where: { id }, include: templateInclude })
    if (!row) throw notFound('แม่แบบ')
    return row
  }

  /**
   * The chosen shelf type / store must exist and belong to the template's channel (inactive ones are allowed).
   * An "every channel" template has neither (assertChannelScope), so there is nothing to check.
   */
  private async assertRefs(db: Db, channel: Channel | null, shelfTypeId: string | null, storeId: string | null, check: { shelf: boolean; store: boolean }) {
    if (channel === null) return
    const terms = CHANNEL_TERMS[channel]
    const storeTerm = terms.store.split(' / ')[0]
    if (check.shelf && shelfTypeId) {
      const shelf = await db.shelfType.findUnique({ where: { id: shelfTypeId }, select: { name: true, channel: true } })
      if (!shelf) {
        const message = `ไม่พบ${terms.shelf}ที่เลือก`
        throw invalid(message, { shelfTypeId: message })
      }
      if (shelf.channel !== channel) {
        const message = `"${shelf.name}" ไม่ใช่${terms.shelf}ของช่องทาง ${CHANNEL_SHORT[channel]}`
        throw invalid(message, { shelfTypeId: message })
      }
    }
    if (check.store && storeId) {
      const store = await db.store.findUnique({ where: { id: storeId }, select: { name: true, channel: true } })
      if (!store) {
        const message = `ไม่พบ${storeTerm}ที่เลือก`
        throw invalid(message, { storeId: message })
      }
      if (store.channel !== channel) {
        const message = `"${store.name}" ไม่ใช่${storeTerm}ของช่องทาง ${CHANNEL_SHORT[channel]}`
        throw invalid(message, { storeId: message })
      }
    }
  }
}
