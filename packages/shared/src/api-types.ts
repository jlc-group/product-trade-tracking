// Request/response shapes of the FlowTrade REST API (apps/api).
import type {
  ActivityLog,
  Channel,
  Comment,
  DescriptionFormat,
  DetailFieldInput,
  ISODate,
  Product,
  Proposal,
  ProposalStatus,
  ProposalSummary,
  Role,
  ShelfType,
  Store,
  Task,
  TaskPriority,
  TaskTemplate,
  TaskTemplateItem,
  User,
} from './types.js'

// ---------- read models ----------

export interface ProposalListItem extends ProposalSummary {
  store: Store
  shelfType: ShelfType
  owner: User
  products: Product[]
}

export interface ProposalDetail extends ProposalListItem {
  members: User[]
  template: TaskTemplate | null
}

export interface TaskWithContext {
  task: Task
  proposal: Proposal
  store: Store
  /** Titles of ancestors, top-down. */
  path: string[]
}

export interface CommentWithAuthor extends Comment {
  author: User
}

export interface ActivityWithActor extends ActivityLog {
  actor: User
}

export interface DashboardSummary {
  today: ISODate
  kpis: {
    activeProposals: number
    completedThisMonth: number
    launchesNext30: number
    openTasks: number
    overdueTasks: number
    avgProgress: number
  }
  byStatus: { status: ProposalStatus; count: number }[]
  byChannel: { channel: Channel; count: number }[]
  byStore: { store: Store; active: number; completed: number; overdueTasks: number }[]
  upcomingLaunches: ProposalListItem[]
  atRisk: ProposalListItem[]
  overdueTasks: TaskWithContext[]
  workload: { user: User; open: number; overdue: number; dueThisWeek: number }[]
}

export interface HomeSummary {
  today: ISODate
  overdue: TaskWithContext[]
  dueToday: TaskWithContext[]
  dueThisWeek: TaskWithContext[]
  myProposals: ProposalListItem[]
  upcomingLaunches: ProposalListItem[]
  counts: { open: number; overdue: number; doneThisWeek: number }
}

// ---------- inputs ----------

export interface ProposalFilters {
  q?: string
  /** 'ACTIVE' = DRAFT + IN_PROGRESS + ON_HOLD */
  status?: ProposalStatus | 'ACTIVE' | 'ALL'
  channel?: Channel
  storeId?: string
  shelfTypeId?: string
  ownerId?: string
  /** 'mine' = owner/member/assignee; 'all' requires proposal.read.all */
  scope?: 'mine' | 'all'
}

/**
 * One task of a wizard-edited plan. Keys are client-side ids (template item ids or temp ids);
 * levels are derived from parentKey and must not exceed 3. Dates are absolute business dates.
 */
export interface ProposalPlanItemInput {
  key: string
  parentKey: string | null
  title: string
  startDate: ISODate | null
  dueDate: ISODate | null
  responsible?: string | null
}

export interface CreateProposalInput {
  channel: Channel
  productIds: string[]
  /** One proposal is created per store. */
  storeIds: string[]
  shelfTypeId: string
  targetDate: ISODate
  title?: string
  note?: string | null
  templateId: string | null
  excludedTemplateItemIds?: string[]
  /**
   * The exact task list edited in the wizard (template items the user kept/changed + tasks they typed).
   * When present it replaces template instantiation; templateId is kept only as a reference.
   */
  plan?: ProposalPlanItemInput[]
  memberIds?: string[]
  status: 'DRAFT' | 'IN_PROGRESS'
}

export interface UpdateProposalInput {
  title?: string
  note?: string | null
  productIds?: string[]
  memberIds?: string[]
  ownerId?: string
  shelfTypeId?: string
}

export interface CreateTaskInput {
  proposalId: string
  parentId: string | null
  title: string
  description?: string | null
  startDate?: ISODate | null
  dueDate?: ISODate | null
  assigneeIds?: string[]
  /** Responsible department, e.g. "NPD". */
  responsible?: string | null
  priority?: TaskPriority
  /** Insert before this sibling's position; default = append. */
  index?: number
}

export interface UpdateTaskInput {
  title?: string
  description?: string | null
  /** Managers only. Switching format does not convert content — send the converted description / detailFields too. */
  descriptionFormat?: DescriptionFormat
  // Table rows (see applyDetailPatch for the order they are applied in). Everything except detailValues is managers only.
  /** Replaces every row (labels, order, values). A row without id gets a new one. */
  detailFields?: DetailFieldInput[]
  /** Adds rows after the latest rows. */
  detailAppend?: DetailFieldInput[]
  /** Renames rows by id. */
  detailLabels?: Record<string, string>
  /** Removes rows by id (ids already gone are ignored). */
  detailRemove?: string[]
  /** Fills values of existing rows by id; other rows are untouched. Managers and the task's assignees. */
  detailValues?: Record<string, string>
  startDate?: ISODate | null
  dueDate?: ISODate | null
  assigneeIds?: string[]
  /** Responsible department; null clears it. */
  responsible?: string | null
  priority?: TaskPriority
}

export interface MoveTaskInput {
  parentId: string | null
  /** Position among the new siblings (0-based). */
  index: number
}

export interface MyTasksFilters {
  status?: 'open' | 'done' | 'all'
  due?: 'overdue' | 'today' | 'week' | 'all'
  proposalId?: string
}

export interface UserInput {
  /** Optional; null clears it. At least one of email / username must remain. */
  email?: string | null
  /** Short sign-in name (a-z 0-9 . _ -, 3–32 chars); null clears it. */
  username?: string | null
  name: string
  nickname?: string | null
  department?: string | null
  position?: string | null
  role: Role
  /** Set by the admin. On create, omitted → the server issues a temporary password. */
  password?: string
  /** Force a password change at the next sign-in (only used together with `password`). */
  mustChangePassword?: boolean
}

export interface DepartmentInput {
  name: string
}

export type StoreInput = Pick<Store, 'name' | 'shortName' | 'channel' | 'color'> & { description?: string | null }
export type ShelfTypeInput = Pick<ShelfType, 'name' | 'channel' | 'color'> & { description?: string | null }
export type ProductInput = Pick<Product, 'sku' | 'name' | 'brand' | 'category'> & { barcode?: string | null; size?: string | null }

export interface TemplateInput {
  name: string
  description?: string | null
  /** null = every channel; then shelfTypeId must be null too. */
  channel: Channel | null
  shelfTypeId: string | null
  storeId: string | null
  isActive?: boolean
  items: TaskTemplateItem[]
}

export interface TemplatePreviewItem {
  templateItemId: string
  parentTemplateItemId: string | null
  level: 1 | 2 | 3
  title: string
  startDate: ISODate
  dueDate: ISODate
  responsible: string | null
  clamped: boolean
}

