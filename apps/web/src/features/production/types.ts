// "รอผลิต" tab — UI types. The persisted shapes, derivation and rules live in @flowtrade/shared (production.ts).
import type { ISODate, OrderField, ProductionEvent, ProductionOrder, ProductionPerson, ProductionRow, ProductionSummary, ProductionView, User } from '@flowtrade/shared'
import type { ProposalDetail } from '@/api'
import type { Tone } from '@/features/presentation/types'

export type {
  ProductionEvent,
  ProductionFlag,
  ProductionItem,
  ProductionOrder,
  ProductionPerms,
  ProductionPerson,
  ProductionRow,
  ProductionRowActions,
  ProductionStatus,
  ProductionSummary,
  ProductionView,
} from '@flowtrade/shared'
export type { Tone }

export interface StatusMeta {
  label: string
  tone: Tone
  /** Chip colours (with the base `inline-flex h-6 … rounded-full border px-2.5 text-xs font-medium`). */
  chip: string
  dot: string
}

/** Everything a button on the tab can ask the orchestrator (ProductionTab) to do. Named so it can't clash with the home ProductionAction. */
export type ProductionTabAction =
  /** "ยืนยันเริ่มผลิต": the dialog where the quantities and "วันที่ต้องการสินค้า" are entered (owner / manager). */
  | { kind: 'confirm' }
  /** AdvanceDialog; `ids` = the rows ticked at first (default: every row in the from-status). */
  | { kind: 'advance'; to: 'PRODUCED' | 'DELIVERED'; ids?: string[] }
  | { kind: 'dates'; productId: string }
  | { kind: 'back'; productId: string }
  /** Cancel a confirmed SKU, or "ไม่ผลิต" a pending one. */
  | { kind: 'cancel'; productId: string }
  | { kind: 'restore'; productId: string }
  | { kind: 'keep'; productId: string }
  /** "แก้จำนวนผลิต" dialog of a confirmed SKU (row menu, "แก้จำนวน" on a stores-changed row). */
  | { kind: 'editQty'; productId: string }
  /** "แก้ข้อมูลใบสั่งผลิต" dialog (row menu, the orders card). */
  | { kind: 'editOrder'; orderId: string }
  | { kind: 'goPresentation' }

export interface NextCardButton {
  label: string
  icon: 'confirm' | 'produced' | 'delivered'
  action: ProductionTabAction
}

export interface NextCard {
  kind: 'pending' | 'review' | 'active' | 'done' | 'cancelled'
  tone: Tone
  title: string
  reason: string | null
  primary: NextCardButton | null
  /** Calm text shown in place of the button. */
  note: string | null
}

export interface HeaderLine {
  text: string
  tone: Tone
}

export interface ProductionModel {
  isLoading: boolean
  isError: boolean
  /**
   * The reads pickableIds depends on (the proposal's tasks, the user lookup) have settled. The confirm dialog computes
   * its contact defaults once at open, so its button and the ?do=confirm link wait for this.
   */
  peopleReady: boolean
  refetch(): void
  view: ProductionView | undefined
  /** Rows that are not cancelled / skipped, view order. */
  rows: ProductionRow[]
  cancelledRows: ProductionRow[]
  summary: ProductionSummary
  canWork: boolean
  canDecide: boolean
  /** "ห้าง" / "แพลตฟอร์ม". */
  storeWord: string
  /** The server's today (view.today) once loaded. */
  today: ISODate
  targetDate: ISODate
  proposal: ProposalDetail
  me: User
  /** Short display name (nickname || name) for any user id. */
  userName(id: string | null | undefined): string
  /** Users for avatars and pickers (lookup + proposal team + the people orders name and their confirmers, deactivated ones included), by id. */
  usersById: Map<string, ProductionPerson>
  /** Who may be an order contact: people who can open the project (owner, members, task assignees, proposal.read.all). */
  pickableIds: ReadonlySet<string>
  rowById: Map<string, ProductionRow>
  /** The item's log, newest first. */
  eventsOf(productId: string): ProductionEvent[]
  /** "ใบสั่งผลิต" of the project, seq ascending. */
  orders: ProductionOrder[]
  orderById: Map<string, ProductionOrder>
}

/** The "ใบสั่งผลิต" fields as typed in the confirm / edit dialogs (null = nothing picked yet). */
export interface OrderDraft {
  manufacturerId: string | null
  /** Raw text; cleanReferenceNo() before sending. */
  referenceNo: string
  /** "วันที่ดำเนินการ" (production start); null only on an order confirmed before schedules existed, until one is picked. */
  startedOn: ISODate | null
  /** "ระยะเวลาผลิตทั้งหมด" as typed (days); readDays() before checking / sending. */
  productionDays: string
  mainContactId: string | null
  coContactIds: string[]
}

/** The order fields, in dialog order (shared orderFieldErrors keys; also the keys of a 422's `fields`). */
export type { OrderField }
export type OrderErrors = Partial<Record<OrderField, string>>
