// Row → shared DTO mappers. Every API response uses the shapes in packages/shared/src/types.ts.
import {
  cleanFieldLabels,
  readDetailFields,
  type ActivityLog,
  type AppNotification,
  type Comment,
  type DetailField,
  type Product,
  type Proposal,
  type ShelfType,
  type Store,
  type Task,
  type TaskLevel,
  type TaskTemplate,
  type User,
} from '@flowtrade/shared'
import type { Prisma } from '../generated/prisma/client.js'
import { iso, isoOrNull, toDateOnly } from './dates.js'

// ---------- include presets (use these so mappers always get what they need) ----------

/** A proposal's stores in the admin-defined store order. */
const proposalStoreOrder = [{ store: { sortOrder: 'asc' } }, { store: { name: 'asc' } }, { storeId: 'asc' }] satisfies Prisma.ProposalStoreOrderByWithRelationInput[]

export const proposalInclude = {
  stores: { select: { storeId: true }, orderBy: proposalStoreOrder },
  members: { select: { userId: true }, orderBy: { addedAt: 'asc' } },
  products: { select: { productId: true }, orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.ProposalInclude

/** proposalInclude + the store rows (for `stores: Store[]` in read models). */
export const proposalWithStoresInclude = {
  ...proposalInclude,
  stores: { select: { storeId: true, store: true }, orderBy: proposalStoreOrder },
} satisfies Prisma.ProposalInclude

export const taskInclude = {
  assignees: { select: { userId: true }, orderBy: { assignedAt: 'asc' } },
} satisfies Prisma.TaskInclude

export const templateInclude = {
  items: { orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }] },
} satisfies Prisma.TaskTemplateInclude

export type UserRow = Prisma.UserGetPayload<object>
export type ProposalRow = Prisma.ProposalGetPayload<{ include: typeof proposalInclude }>
export type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskInclude }>
export type TemplateRow = Prisma.TaskTemplateGetPayload<{ include: typeof templateInclude }>

/** Detail rows as stored in tasks.detail_fields (JSONB). */
export const detailFieldsJson = (fields: DetailField[]): Prisma.InputJsonValue => fields.map(({ id, label, value }) => ({ id, label, value }))

// ---------- mappers ----------

export function toUser(u: UserRow): User {
  return {
    id: u.id,
    email: u.email,
    username: u.username,
    name: u.name,
    nickname: u.nickname,
    department: u.department,
    position: u.position,
    role: u.role,
    isActive: u.isActive,
    mustChangePassword: u.mustChangePassword,
    avatarColor: u.avatarColor,
    lastLoginAt: isoOrNull(u.lastLoginAt),
    createdAt: iso(u.createdAt),
  }
}

export function toStore(s: Prisma.StoreGetPayload<object>): Store {
  return { id: s.id, name: s.name, shortName: s.shortName, channel: s.channel, color: s.color, description: s.description, sortOrder: s.sortOrder, isActive: s.isActive, createdAt: iso(s.createdAt), updatedAt: iso(s.updatedAt) }
}

export function toStores(rows: { store: Prisma.StoreGetPayload<object> }[]): Store[] {
  return rows.map((r) => toStore(r.store))
}

export function toShelfType(s: Prisma.ShelfTypeGetPayload<object>): ShelfType {
  return { id: s.id, name: s.name, channel: s.channel, color: s.color, description: s.description, sortOrder: s.sortOrder, isActive: s.isActive, createdAt: iso(s.createdAt), updatedAt: iso(s.updatedAt) }
}

export function toProduct(p: Prisma.ProductGetPayload<object>): Product {
  return { id: p.id, sku: p.sku, name: p.name, brand: p.brand, category: p.category, barcode: p.barcode, size: p.size, isActive: p.isActive, createdAt: iso(p.createdAt), updatedAt: iso(p.updatedAt) }
}

export function toProposal(p: ProposalRow): Proposal {
  return {
    id: p.id,
    code: p.code,
    title: p.title,
    channel: p.channel,
    storeIds: p.stores.map((s) => s.storeId),
    shelfTypeId: p.shelfTypeId,
    targetDate: toDateOnly(p.targetDate),
    status: p.status,
    ownerId: p.ownerId,
    memberIds: p.members.map((m) => m.userId),
    productIds: p.products.map((x) => x.productId),
    templateId: p.templateId,
    note: p.note,
    createdAt: iso(p.createdAt),
    updatedAt: iso(p.updatedAt),
    completedAt: isoOrNull(p.completedAt),
  }
}

export function toTask(t: TaskRow): Task {
  return {
    id: t.id,
    proposalId: t.proposalId,
    parentId: t.parentId,
    level: t.level as TaskLevel,
    title: t.title,
    description: t.description,
    descriptionFormat: t.descriptionFormat,
    detailFields: readDetailFields(t.detailFields),
    startDate: toDateOnly(t.startDate),
    dueDate: toDateOnly(t.dueDate),
    assigneeIds: t.assignees.map((a) => a.userId),
    responsible: t.responsible,
    priority: t.priority,
    isDone: t.isDone,
    completedAt: isoOrNull(t.completedAt),
    completedById: t.completedById,
    sortOrder: t.sortOrder,
    createdById: t.createdById,
    createdAt: iso(t.createdAt),
    updatedAt: iso(t.updatedAt),
  }
}

export function toTemplate(t: TemplateRow): TaskTemplate {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    channel: t.channel,
    shelfTypeId: t.shelfTypeId,
    storeId: t.storeId,
    isActive: t.isActive,
    items: t.items.map((i) => ({
      id: i.id,
      parentId: i.parentId,
      level: i.level as TaskLevel,
      title: i.title,
      startOffsetDays: i.startOffsetDays,
      dueOffsetDays: i.dueOffsetDays,
      responsible: i.responsible,
      fieldLabels: Array.isArray(i.fieldLabels) ? cleanFieldLabels(i.fieldLabels) : [],
      sortOrder: i.sortOrder,
    })),
    createdAt: iso(t.createdAt),
    updatedAt: iso(t.updatedAt),
  }
}

export function toComment(c: Prisma.CommentGetPayload<object>): Comment {
  return { id: c.id, proposalId: c.proposalId, taskId: c.taskId, authorId: c.authorId, body: c.body, createdAt: iso(c.createdAt) }
}

export function toActivity(a: Prisma.ActivityLogGetPayload<object>): ActivityLog {
  return { id: a.id, actorId: a.actorId, action: a.action, entityType: a.entityType, entityId: a.entityId, proposalId: a.proposalId, summary: a.summary, createdAt: iso(a.createdAt) }
}

export function toNotification(n: Prisma.NotificationGetPayload<object>): AppNotification {
  return { id: n.id, userId: n.userId, type: n.type, title: n.title, body: n.body, link: n.link, isRead: n.isRead, createdAt: iso(n.createdAt) }
}
