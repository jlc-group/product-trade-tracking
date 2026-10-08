// Request/response shapes of the FlowTrade REST API (apps/api).
import type {
  ActivityLog,
  Channel,
  Comment,
  DescriptionFormat,
  DetailFieldInput,
  ISODate,
  ISODateTime,
  Product,
  Progress,
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
import type { PresentationStage, StoreSnapshot, TrackView } from './presentation.js'
import type { ProductionSummary } from './production.js'
import type { TaskCompletionMode } from './task-tree.js'

// ---------- read models ----------

export interface ProposalListItem extends ProposalSummary {
  /** Same order as storeIds. */
  stores: Store[]
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
  stores: Store[]
  /** Titles of ancestors, top-down. */
  path: string[]
  /** 'manual' = ticked by hand; otherwise done follows its table / sub tasks (completionMode). */
  completion: TaskCompletionMode
  /** A leaf task of an IN_PROGRESS proposal: the only kind the overdue counts include (GET /tasks/mine). */
  countable?: boolean
}

/** What WorkTaskRow / useTaskToggler read; TaskWithContext also satisfies it. */
export interface TaskRowItem {
  task: Pick<Task, 'id' | 'title' | 'level' | 'isDone' | 'startDate' | 'dueDate' | 'priority' | 'responsible' | 'assigneeIds'>
  proposal: Pick<Proposal, 'id' | 'code' | 'ownerId' | 'memberIds'>
  stores: StoreSnapshot[]
  /** Titles of ancestors, top-down. */
  path: string[]
  /** 'manual' = ticked by hand; otherwise done follows its table / sub tasks (completionMode). */
  completion: TaskCompletionMode
}

export interface CommentWithAuthor extends Comment {
  author: User
}

export interface ActivityWithActor extends ActivityLog {
  actor: User
}

/** The latest logged change of one task (from the activity log). */
export interface TaskLastActivity {
  action: string
  summary: string
  createdAt: ISODateTime
  actor: User
}

/** Extra data for the printable report of one proposal (GET /proposals/:id/report). */
export interface ProposalReport {
  /** Everyone the tasks refer to (assignees, completed by, created by) — deactivated users included. */
  users: User[]
  /** Comments on the proposal's tasks, oldest first. */
  comments: CommentWithAuthor[]
  /** Latest logged change per task id; tasks with no logged change since they were created are absent. */
  lastActivity: Record<string, TaskLastActivity>
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
  /** IN_PROGRESS proposals (and COMPLETED ones with a production alarm) with a proposalHealth() chip, LATE first, then targetDate. */
  atRisk: (ProposalListItem & { health: Health })[]
  overdueTasks: TaskWithContext[]
  workload: { user: User; open: number; overdue: number; dueThisWeek: number }[]
  /** Org-wide overdue buyer rows (IN_PROGRESS + COMPLETED), merged, role-agnostic (team = false). */
  buyerOverdue: BuyerAgendaItem[]
}

// ---------- home dashboard (GET /dashboard/home, GET /dashboard/badge) ----------
// Pure rules (buckets, responsibility, merge, sort, phase, health) are in home.ts.

/** 'waiting' rows are collapsed in the agenda footer. */
export type AgendaBucket = 'overdue' | 'today' | 'week' | 'next' | 'waiting'
export type BuyerAction = 'sendInfo' | 'present' | 'confirmPresented' | 'schedule' | 'followUp'
export type ProposalAction = 'createPackage' | 'closeOut'
/** confirm (quantities are entered there) / review: owner or an involved MANAGER/ADMIN · deliver: owner + members. */
export type ProductionAction = 'confirmProduction' | 'deliverProduction' | 'reviewProduction'
export type ProjectPhase = 'PREP' | 'READY' | 'BUYER' | 'LISTED' | 'NOT_LISTED' | 'CLOSED'
export type HealthLevel = 'LATE' | 'AT_RISK'

export interface Health {
  level: HealthLevel
  /** Thai copy, always shown with the chip. */
  reason: string
}

export interface ProposalBrief {
  id: string
  code: string
  title: string
  channel: Channel
  status: ProposalStatus
  targetDate: ISODate
  ownerId: string
  memberIds: string[]
}

/** One in-proposal store with its track's stage (null = in no package yet). Same shape as the web's StageBarItem. */
export interface StoreStage {
  store: StoreSnapshot
  stage: PresentationStage | null
  round: number
  trackId: string | null
}

/** The part of a TrackView the home rows read (toTrackBrief). */
export type TrackBrief = Pick<
  TrackView,
  'stage' | 'round' | 'plan' | 'presentedDate' | 'expectedResultDate' | 'reviewSince' | 'openRequest' | 'outcome' | 'accepted' | 'needsInfoCount'
>

export interface AgendaBase {
  key: string
  bucket: AgendaBucket
  /** Task due date / buyer key date; null = undated (proposal items are always null). */
  date: ISODate | null
  proposal: ProposalBrief
}

export interface TaskAgendaItem extends AgendaBase, Omit<TaskRowItem, 'proposal'> {
  kind: 'task'
}

export interface BuyerAgendaItem extends AgendaBase {
  kind: 'buyer'
  action: BuyerAction
  /** At least one, in proposal store order. */
  tracks: { trackId: string; store: StoreSnapshot }[]
  /** Of the first track (the merge keys are identical). */
  view: TrackBrief
  /** presentation_packages.seq of the first track. */
  packageSeq: number
  /** Someone else is responsible and it is overdue; I am the owner or a member. */
  team: boolean
  /** Named presenters / preparer; [] = the owner. */
  responsibleIds: string[]
  canRecord: boolean
}

export interface ProposalAgendaItem extends AgendaBase {
  kind: 'proposal'
  action: ProposalAction
  stores: StoreStage[]
  prep: Progress
  openTasks: number
}

/** "รอผลิต" rows (productionAgendaFor); never in the 'waiting' bucket. */
export interface ProductionAgendaItem extends AgendaBase {
  kind: 'production'
  action: ProductionAction
  /** confirm: pending · deliver: IN_PRODUCTION + PRODUCED · review: needing review. */
  count: number
  /** Production deadline (launch − lead days). */
  deadline: ISODate
  overdueDays: number
  /** Passing stores of the counted rows, proposal order, unique. */
  stores: StoreSnapshot[]
}

export type AgendaItem = TaskAgendaItem | BuyerAgendaItem | ProposalAgendaItem | ProductionAgendaItem

/** The production counts home rows read (toProductionBrief). */
export type ProductionBrief = Pick<
  ProductionSummary,
  'state' | 'deadline' | 'daysToDeadline' | 'pending' | 'inProduction' | 'produced' | 'delivered' | 'confirmed' | 'undelivered' | 'flagged' | 'overdueDays'
>

export interface HomeProject {
  proposal: ProposalBrief & { shelfType: Pick<ShelfType, 'id' | 'name' | 'color'> }
  phase: ProjectPhase
  health: Health | null
  /** Leaf tasks; overdue only counts when IN_PROGRESS. */
  prep: Progress & { overdue: number }
  /** In-proposal stores, in proposal store order. */
  stores: StoreStage[]
  /** "รอผลิต" counts; null / absent when nothing passed or everything was cancelled / skipped. */
  production?: ProductionBrief | null
}

export interface BuyerResult {
  proposal: Pick<ProposalBrief, 'id' | 'code' | 'title' | 'channel'>
  trackId: string
  store: StoreSnapshot
  /** stage is one of FINAL_STAGES. */
  view: TrackBrief
}

/** Department alarms over IN_PROGRESS proposals, plus COMPLETED ones with a production alarm (dashboard.monitor only). */
export interface TeamPulse {
  /** Projects with health LATE. */
  late: number
  /** Projects with health AT_RISK. */
  atRisk: number
  /** Merged overdue buyer rows (IN_PROGRESS + COMPLETED). */
  buyerOverdue: number
  overdueTasks: number
}

export interface HomeDashboard {
  today: ISODate
  agenda: {
    /** Every bucket including 'waiting', sorted with compareAgenda. */
    items: AgendaItem[]
    /** Rows after merging. */
    total: Record<AgendaBucket, number>
    waiting: { inReview: number; laterMeetings: number }
    /** Open tasks due after today + 7, or undated (IN_PROGRESS proposals). */
    laterTasks: number
    /** Open tasks in DRAFT / ON_HOLD / COMPLETED proposals: never listed. */
    parkedTasks: number
    doneLast7Days: number
  }
  /** Involved DRAFT / IN_PROGRESS (+ COMPLETED still launching, with open tracked stores or with production to do); ON_HOLD only counted. */
  projects: HomeProject[]
  onHold: number
  /** items ≤ RESULTS_MAX_ITEMS; the counts cover every outcome in the window. */
  results: { items: BuyerResult[]; passed: number; rejected: number; withdrawn: number }
  /** Only with dashboard.monitor. */
  team: TeamPulse | null
}

export interface NavBadges {
  overdueTasks: number
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
  /** Table row labels from the template; non-empty = the task is created as a table. */
  fieldLabels?: string[]
}

export interface CreateProposalInput {
  channel: Channel
  productIds: string[]
  /** One proposal listed at all of these stores (one shared task list). */
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
  /** ADMIN only (proposal.stores.edit). */
  storeIds?: string[]
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

/** POST /manufacturers (also the confirm dialog's inline add); PATCH takes Partial<ManufacturerInput> & { isActive?: boolean }. */
export interface ManufacturerInput {
  name: string
  note?: string | null
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

