// FlowTrade domain types — shared by apps/web and (later) apps/api.
// Date-only values are 'YYYY-MM-DD' strings (Asia/Bangkok business dates);
// timestamps are ISO-8601 UTC strings.

export type ISODate = string
export type ISODateTime = string

export type Role = 'ADMIN' | 'MANAGER' | 'USER'
export type Channel = 'OFFLINE' | 'ONLINE'
export type ProposalStatus = 'DRAFT' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED'
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
export type TaskLevel = 1 | 2 | 3

export interface User {
  id: string
  /** Optional; a user has an email, a username, or both (login accepts either). */
  email: string | null
  /** Short sign-in name; login accepts email or username. */
  username: string | null
  name: string
  nickname: string | null
  /** Name of one of the admin-managed departments (or null). */
  department: string | null
  position: string | null
  role: Role
  isActive: boolean
  mustChangePassword: boolean
  avatarColor: string
  lastLoginAt: ISODateTime | null
  createdAt: ISODateTime
}

/** Company department (admin-managed list). Users pick from it; renaming cascades to users. */
export interface Department {
  id: string
  name: string
  sortOrder: number
  isActive: boolean
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

/** A retailer (offline) or a marketplace/platform (online). */
export interface Store {
  id: string
  name: string
  /** Short text shown inside the logo tile, e.g. "BigC", "7-11". */
  shortName: string
  channel: Channel
  color: string
  description: string | null
  sortOrder: number
  isActive: boolean
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

/** Shelf type (offline) or listing type (online). Admins can add more beyond Exclusive/Normal. */
export interface ShelfType {
  id: string
  name: string
  channel: Channel
  description: string | null
  color: string
  sortOrder: number
  isActive: boolean
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface Product {
  id: string
  sku: string
  name: string
  brand: string
  category: string
  barcode: string | null
  size: string | null
  isActive: boolean
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

/** One listing project: products → one store → one shelf type → target on-shelf date. */
export interface Proposal {
  id: string
  code: string
  title: string
  channel: Channel
  storeId: string
  shelfTypeId: string
  targetDate: ISODate
  status: ProposalStatus
  ownerId: string
  memberIds: string[]
  productIds: string[]
  templateId: string | null
  note: string | null
  createdAt: ISODateTime
  updatedAt: ISODateTime
  completedAt: ISODateTime | null
}

/** How a task's details are written: free text, or a table of label → value rows. */
export type DescriptionFormat = 'TEXT' | 'FIELDS'

/** One row of a FIELDS-format task: a label the team defines and the data someone fills in ('' = not filled yet). */
export interface DetailField {
  id: string
  label: string
  value: string
}

/** A row in a request: no id = the server assigns one; no value = not filled yet. */
export interface DetailFieldInput {
  id?: string
  label: string
  value?: string
}

/** Task / Sub-task / Mini-task — a self-referencing tree, max depth 3. */
export interface Task {
  id: string
  proposalId: string
  parentId: string | null
  level: TaskLevel
  title: string
  /** Free-text details (TEXT format). */
  description: string | null
  /** Which of description / detailFields is the task's details. */
  descriptionFormat: DescriptionFormat
  /** Label → value rows (FIELDS format); [] otherwise. */
  detailFields: DetailField[]
  startDate: ISODate | null
  dueDate: ISODate | null
  assigneeIds: string[]
  /** Responsible department / team, e.g. "NPD", "Graphics" (free text). */
  responsible: string | null
  priority: TaskPriority
  isDone: boolean
  completedAt: ISODateTime | null
  completedById: string | null
  sortOrder: number
  createdById: string
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface TaskTemplateItem {
  id: string
  parentId: string | null
  level: TaskLevel
  title: string
  /** Days relative to the proposal's targetDate (negative = before launch). */
  startOffsetDays: number
  dueOffsetDays: number
  /** Responsible department copied to the task, e.g. "NPD", "Graphics". */
  responsible: string | null
  sortOrder: number
}

export interface TaskTemplate {
  id: string
  name: string
  description: string | null
  /** null = every channel (offline and online). */
  channel: Channel | null
  /** null = applies to every shelf type of the channel. */
  shelfTypeId: string | null
  /** null = applies to every store of the channel. */
  storeId: string | null
  isActive: boolean
  items: TaskTemplateItem[]
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface Comment {
  id: string
  proposalId: string
  taskId: string | null
  authorId: string
  body: string
  createdAt: ISODateTime
}

export type EntityType = 'PROPOSAL' | 'TASK' | 'STORE' | 'SHELF_TYPE' | 'PRODUCT' | 'USER' | 'TEMPLATE' | 'DEPARTMENT'

export interface ActivityLog {
  id: string
  actorId: string
  action: string
  entityType: EntityType
  entityId: string
  proposalId: string | null
  /** Human-readable Thai summary, e.g. "ทำเครื่องหมายเสร็จ: ส่งตัวอย่างสินค้า" */
  summary: string
  createdAt: ISODateTime
}

export type NotificationType = 'TASK_ASSIGNED' | 'TASK_DUE_SOON' | 'TASK_OVERDUE' | 'PROPOSAL_STATUS' | 'COMMENT'

export interface AppNotification {
  id: string
  userId: string
  type: NotificationType
  title: string
  body: string
  link: string | null
  isRead: boolean
  createdAt: ISODateTime
}

// ---------- Derived / view models ----------

export interface Progress {
  done: number
  total: number
  percent: number
}

export interface TaskNode extends Task {
  children: TaskNode[]
  progress: Progress
}

export interface ProposalSummary extends Proposal {
  progress: Progress
  overdueCount: number
  openTaskCount: number
  nextDueDate: ISODate | null
}
