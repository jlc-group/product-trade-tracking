// "นำเสนอ Buyer" track — types. The persisted shapes and the reducer's views live in @flowtrade/shared
// (the API checks the same rules); the UI-only types below stay in the web app.
import type { ISODate, PresentationData, PresentationPackage, PresentationStage, PresentationSummary, RejectReason, StoreSnapshot, Task, TrackView, User } from '@flowtrade/shared'
import type { ProposalDetail } from '@/api'

export type {
  EditableKind,
  EditChange,
  EventKind,
  EventOf,
  EventPatch,
  EventPayload,
  FieldErrors,
  MetaEvent,
  PackageTask,
  PresentationData,
  PresentationPackage,
  PresentationStage,
  PresentationSummary,
  RejectReason,
  StageEvent,
  StageEventKind,
  StoreSnapshot,
  StoreTrack,
  TimelineItem,
  TrackEvent,
  TrackPlan,
  TrackView,
} from '@flowtrade/shared'

// ---------- UI (model.ts) ----------

export type Tone = 'brand' | 'info' | 'success' | 'warning' | 'danger' | 'muted'

/** One StageBar segment, in proposal store order. stage null = not in any package yet. */
export interface StageBarItem {
  store: StoreSnapshot
  stage: PresentationStage | null
  round: number
  trackId: string | null
}

export interface HeaderLine {
  kind: 'next' | 'needsInfo' | 'awaiting' | 'inReview' | 'untracked' | 'passed' | 'allRejected' | 'allWithdrawn'
  /** "นำเสนอ Buyer:" (muted) — null for kind 'next'. */
  prefix: string | null
  text: string
  tone: Tone
  /** Show the mini StageBar next to the text. */
  showBar: boolean
}

export interface RowDetail {
  /** Main line; null when the warning replaces it, or the stage has none (NEEDS_INFO). */
  main: string | null
  mainTone: 'muted' | 'brand'
  /** Quoted second line ("Buyer ต้องการ: …", "เหตุผล: …"), line-clamped by the UI. */
  quote: string | null
  warning: { text: string; tone: 'warning' | 'danger' } | null
  /** AWAITING: presenters for the AvatarStack. */
  presenterIds: string[]
  /** NEEDS_INFO: "ต้องส่งภายใน" + DueChip + preparer. */
  due: { date: ISODate | null; preparerId: string | null } | null
}

export type RecordMode = 'present' | 'result' | 'infoSent'
export type RecordChoice = 'pending' | 'passed' | 'needsInfo' | 'rejected' | 'infoSent'

/** Record-dialog form. `date` is the decision / request / sent date (hidden in "present" mode). */
export interface StepForm {
  presentedDate: ISODate | null
  contactName: string
  expectedResultDate: ISODate | null
  note: string
  date: ISODate | null
  request: string
  dueDate: ISODate | null
  preparerId: string | null
  /** null = every SKU. */
  acceptedProductIds: string[] | null
  notAcceptedNote: string
  reason: RejectReason | null
  detail: string
  sentWhat: string
}

export type StepErrors = Partial<Record<keyof StepForm, string>>

/** Everything a button on the presentation tab can ask the orchestrator (PresentationTab) to do. */
export type PresentationAction =
  | { kind: 'create'; storeIds?: string[] }
  /** Mode from the first track's stage: AWAITING → present, IN_REVIEW → result, NEEDS_INFO → infoSent. */
  | { kind: 'record'; trackIds: string[] }
  | { kind: 'schedule'; trackId: string }
  | { kind: 'repitch'; trackId: string }
  | { kind: 'withdraw'; trackId: string }
  /** CREATED / SCHEDULED → ScheduleDialog; PRESENTED / NEEDS_INFO / INFO_SENT / PASSED / REJECTED → RecordStepDialog; WITHDRAWN → WithdrawDialog; REPITCH → RepitchDialog. */
  | { kind: 'edit'; trackId: string; eventId: string }
  | { kind: 'revert'; trackId: string }
  | { kind: 'remove'; trackId: string }
  | { kind: 'deletePackage'; packageId: string }
  | { kind: 'openStore'; storeId: string }
  /** Set the proposal COMPLETED (useChangeProposalStatus). */
  | { kind: 'complete' }
  /** Switch to the tasks tab (next action with the prep gate closed). */
  | { kind: 'goTasks' }

export type NextActionKind = 'cancelled' | 'locked' | 'ready' | 'needsInfoOverdue' | 'needsInfo' | 'awaiting' | 'inReview' | 'untracked' | 'allFinal'

export interface NextActionButton {
  label: string
  action: PresentationAction
  variant: 'default' | 'ghost'
}

export interface NextAction {
  kind: NextActionKind
  tone: Tone
  title: string
  reason: string | null
  /** "① สร้างชุดนำเสนอ → ② … → ③ …" (kind 'ready' only). */
  steps: string | null
  /** null → show `note` instead (no permission, or nothing to do). */
  primary: NextActionButton | null
  /** Ghost "ตั้งโปรเจกต์เป็นเสร็จสิ้น" next to the untracked action. */
  secondary: NextActionButton | null
  /** Calm text shown in place of the primary button (text-xs text-muted-foreground). */
  note: string | null
}

/** usePresentationSummary(): the cheap view (no tasks) for the header line, tab count, banner, proposal actions. */
export interface PresentationSummaryState extends PresentationSummary {
  /** True until the tracks are known (still loading, or the read failed). */
  isLoading: boolean
  gateOpen: boolean
  views: TrackView[]
  items: StageBarItem[]
  header: HeaderLine | null
  storeWord: string
}

export interface PresentationModel {
  isLoading: boolean
  isError: boolean
  refetch(): void
  data: PresentationData | undefined
  /** Proposal store order; tracks of stores that left the proposal appended. */
  views: TrackView[]
  summary: PresentationSummary
  /** StageBar segments for every proposal store (proposal order). */
  items: StageBarItem[]
  next: NextAction
  header: HeaderLine | null
  gateOpen: boolean
  progress: { done: number; total: number }
  /** Packages by seq. */
  packages: PresentationPackage[]
  /** Level-1 tasks marked done (sortOrder). */
  doneLevel1Tasks: Task[]
  /** Open leaf tasks, by due date (no date last). */
  openLeafTasks: Task[]
  tasks: Task[]
  /** Bundled tasks that are open again. */
  reopenedTaskIds: Set<string>
  /** Bundled tasks that no longer exist. */
  deletedTaskIds: Set<string>
  canRecord: boolean
  canFinalize: boolean
  /** "ห้าง" / "แพลตฟอร์ม". */
  storeWord: string
  /** Proposal SKU count (SKU checklist shows when > 1). */
  productCount: number
  proposal: ProposalDetail
  me: User
  today: ISODate
  /** Short display name (nickname || name) for any user id. */
  userName(id: string | null | undefined): string
  /** Users for avatars (lookup + proposal team), by id. */
  usersById: Map<string, User>
  /** Who may be picked as presenter / preparer: people who can open the proposal (owner, members, task assignees, proposal.read.all). */
  pickableIds: Set<string>
  viewById: Map<string, TrackView>
  /** In-proposal and removed stores' views by store id. */
  viewByStore: Map<string, TrackView>
}
