// Web side of the "นำเสนอ Buyer" track: stage looks, derived copy (rows, next action, header, timeline) and the
// record-dialog form. The stage rules, reducer and validators live in @flowtrade/shared (the API runs the same
// checks) and are re-exported here, the validators with this app's date format in their messages.
// No React and no clock reads — `today` always comes in as an argument.
import {
  acceptedSkus,
  addDays,
  appendErrors,
  diffDays,
  diffPatch,
  EVENT_LABEL,
  presentationErrors,
  REJECT_REASONS,
  rejectReasonLabel,
  STAGE_LABEL,
  STAGE_LONG,
  stageLabel,
  storeSnapshot,
  validateEdit as validateEditWith,
  validateEvent as validateEventWith,
  type ISODate,
  type Progress,
  type ProposalStatus,
} from '@flowtrade/shared'
import type { ProposalDetail } from '@/api'
import { formatDate } from '@/lib/format'
import type {
  EventKind,
  EventPatch,
  FieldErrors,
  HeaderLine,
  MetaEvent,
  NextAction,
  NextActionButton,
  PresentationAction,
  PresentationStage,
  PresentationSummary,
  RecordChoice,
  RecordMode,
  RejectReason,
  RowDetail,
  StageBarItem,
  StageEvent,
  StepErrors,
  StepForm,
  TimelineItem,
  Tone,
  TrackEvent,
  TrackView,
} from './types'

export {
  buildViews,
  canStartPresentation,
  diffPatch,
  EDITABLE_FIELDS,
  EVENT_LABEL,
  fieldLabel,
  FINAL_STAGES,
  isEditableKind,
  isEmptyPatch,
  isFinalStage,
  isStageEvent,
  isStageKind,
  NAME_MAX,
  NEXT,
  nextPackageSeq,
  NOTE_MAX,
  OPEN_STAGES,
  reduceTrack,
  REJECT_REASONS,
  rejectReasonLabel,
  STAGE_AFTER,
  STAGE_ORDER,
  stageLabel,
  stageLong,
  storeSnapshot,
  summarize,
  toPackageTask,
  validatePackage,
  WAITING_ON_US,
} from '@flowtrade/shared'
export type { ReduceContext } from '@flowtrade/shared'

// ---------- stage looks ----------

export interface StageMeta {
  /** Chip text. */
  label: string
  /** Sheet / dialog / tooltip text; WITHDRAWN carries "{ห้าง}" — use stageLong(). */
  long: string
  tone: Tone
  /** Chip colours (with the base `inline-flex h-6 … rounded-full border px-2.5 text-xs font-medium`). */
  chip: string
  dot: string
  /** StageTrack "current" node. */
  node: string
}

export const STAGE_META: Record<PresentationStage, StageMeta> = {
  AWAITING: {
    label: STAGE_LABEL.AWAITING,
    long: STAGE_LONG.AWAITING,
    tone: 'brand',
    chip: 'bg-brand-soft text-brand border-brand/20',
    dot: 'bg-brand',
    node: 'border-primary bg-brand-soft text-brand ring-4 ring-primary/15',
  },
  IN_REVIEW: {
    label: STAGE_LABEL.IN_REVIEW,
    long: STAGE_LONG.IN_REVIEW,
    tone: 'info',
    chip: 'bg-info-soft text-info border-info/20',
    dot: 'bg-info',
    node: 'border-info bg-info-soft text-info ring-4 ring-info/15',
  },
  NEEDS_INFO: {
    label: STAGE_LABEL.NEEDS_INFO,
    long: STAGE_LONG.NEEDS_INFO,
    tone: 'warning',
    chip: 'bg-warning-soft text-warning-foreground border-warning/30',
    dot: 'bg-warning',
    node: 'border-warning bg-warning-soft text-warning-foreground ring-4 ring-warning/20',
  },
  PASSED: {
    label: STAGE_LABEL.PASSED,
    long: STAGE_LONG.PASSED,
    tone: 'success',
    chip: 'bg-success-soft text-success border-success/25',
    dot: 'bg-success',
    node: 'border-success bg-success text-success-foreground',
  },
  REJECTED: {
    label: STAGE_LABEL.REJECTED,
    long: STAGE_LONG.REJECTED,
    tone: 'danger',
    chip: 'bg-danger-soft text-danger border-danger/20',
    dot: 'bg-danger',
    node: 'border-danger bg-danger-soft text-danger',
  },
  WITHDRAWN: {
    label: STAGE_LABEL.WITHDRAWN,
    long: STAGE_LONG.WITHDRAWN,
    tone: 'muted',
    chip: 'bg-muted text-muted-foreground border-border',
    dot: 'bg-muted-foreground/60',
    node: 'border-border bg-muted text-muted-foreground',
  },
}

/** StageBar segment / strip look of a store that is in no package yet. */
export const UNTRACKED_CLASS = 'border-dashed bg-card text-muted-foreground'
export const UNTRACKED_LABEL = 'ยังไม่ได้อยู่ในชุดนำเสนอ'

/** Icon circles, cards: `bg-{tone}-soft text-{tone}`. */
export const TONE_SOFT: Record<Tone, string> = {
  brand: 'bg-brand-soft text-brand',
  info: 'bg-info-soft text-info',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning-foreground',
  danger: 'bg-danger-soft text-danger',
  muted: 'bg-muted text-muted-foreground',
}

export const TONE_TEXT: Record<Tone, string> = {
  brand: 'text-brand',
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning-foreground',
  danger: 'text-danger',
  muted: 'text-muted-foreground',
}

// ---------- chips ----------

export const INFO_QUICK_CHIPS = ['ตัวอย่างสินค้า', 'ใบเสนอราคาใหม่', 'ผลแล็บ/ผลทดสอบ', 'เอกสาร อย./ใบรับรอง', 'รูป/สื่อการตลาด', 'ข้อมูลยอดขาย', 'โปรโมชัน/งบการตลาด']
export const EXPECTED_QUICK_DAYS = [7, 14, 30]
export const EXPECTED_QUICK_CHIPS = [
  { days: 7, label: '1 สัปดาห์' },
  { days: 14, label: '2 สัปดาห์' },
  { days: 30, label: '1 เดือน' },
]

/** Request quick chip: appends "• chip" on its own line. */
export function appendRequestChip(text: string, chip: string) {
  const sep = text && !text.endsWith('\n') ? '\n' : ''
  return `${text}${sep}• ${chip}\n`
}

// ---------- record dialog modes ----------

/** Record-dialog mode for a track's stage (the first ticked track decides). */
export function recordModeFor(stage: PresentationStage): RecordMode | null {
  return stage === 'AWAITING' ? 'present' : stage === 'IN_REVIEW' ? 'result' : stage === 'NEEDS_INFO' ? 'infoSent' : null
}

/** Choice cards per mode, in display order. */
export const RECORD_CHOICES: Record<RecordMode, RecordChoice[]> = {
  present: ['pending', 'passed', 'needsInfo', 'rejected'],
  result: ['passed', 'needsInfo', 'rejected'],
  infoSent: ['infoSent', 'passed', 'rejected'],
}

/** Stage a track lands in after the choice. */
export const CHOICE_STAGE: Record<RecordChoice, PresentationStage> = {
  pending: 'IN_REVIEW',
  passed: 'PASSED',
  needsInfo: 'NEEDS_INFO',
  rejected: 'REJECTED',
  infoSent: 'IN_REVIEW',
}

/** Choice card an event kind was recorded with (edit mode shows it read-only). */
export function choiceForEvent(kind: EventKind): RecordChoice | null {
  switch (kind) {
    case 'PRESENTED':
      return 'pending'
    case 'NEEDS_INFO':
      return 'needsInfo'
    case 'INFO_SENT':
      return 'infoSent'
    case 'PASSED':
      return 'passed'
    case 'REJECTED':
      return 'rejected'
    default:
      return null
  }
}

/** "ใช้ผลเดียวกันกับห้างอื่น" works only for "ยังไม่ทราบผล" and for "ผ่าน" with every SKU accepted. */
export function sameResultAllowed(choice: RecordChoice | null, form: Pick<StepForm, 'acceptedProductIds'>, productIds: string[]) {
  if (choice === 'pending') return true
  if (choice !== 'passed') return false
  return !form.acceptedProductIds || productIds.length <= 1 || productIds.every((id) => form.acceptedProductIds!.includes(id))
}

// ---------- copy helpers ----------

/** " (3 ห้าง)" — the count suffix appears only when n > 1. */
export function withCount(n: number, word: string) {
  return n > 1 ? ` (${n} ${word})` : ''
}

/** "Watsons", "Watsons, Lotus's", "Watsons, Lotus's และอีก 2 ห้าง". */
export function storeNamesText(names: string[], word: string) {
  if (names.length <= 2) return names.join(', ')
  return `${names.slice(0, 2).join(', ')} และอีก ${names.length - 2} ${word}`
}

/** Like relativeDay() but against an explicit today: "วันนี้", "พรุ่งนี้", "อีก 5 วัน", "เมื่อวาน", "เลยมา 3 วัน". */
export function relativeTo(date: ISODate, today: ISODate) {
  const n = diffDays(today, date)
  if (n === 0) return 'วันนี้'
  if (n === 1) return 'พรุ่งนี้'
  if (n === -1) return 'เมื่อวาน'
  return n > 0 ? `อีก ${n} วัน` : `เลยมา ${-n} วัน`
}

/** "• ผลแล็บ SPF\n• ตัวอย่าง 2 ชิ้น" → "ผลแล็บ SPF, ตัวอย่าง 2 ชิ้น" (one-line row text). */
export function flattenRequest(text: string) {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[•\-*]\s*/, '').trim())
    .filter(Boolean)
    .join(', ')
}

const clip = (text: string, max = 40) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

// ---------- errors (Thai copy, §5) ----------

/** The shared copy with dates in the viewer's BE/CE format (formatDate reads the preference on each call). */
export const ERR = presentationErrors((d) => formatDate(d))

// ---------- gate ----------

/** Tooltip on create / re-pitch buttons while the gate is closed. */
export function gateTip(progress: Pick<Progress, 'done' | 'total'>) {
  return `งานเตรียมยังไม่ครบ (${progress.done}/${progress.total}) — ทำให้ครบก่อน`
}

// ---------- shared validators, messages from ERR ----------

/** Errors of one new event appended to the track now (schedule / re-pitch / withdraw dialogs). */
export const validateEvent = (view: TrackView, event: StageEvent | MetaEvent, today: ISODate, productCount: number) => validateEventWith(view, event, today, productCount, ERR)

/** Errors of an edit, revalidated against the neighbouring events (keys = the event's payload fields). */
export const validateEdit = (view: TrackView, targetEventId: string, patch: EventPatch, today: ISODate, productCount: number) =>
  validateEditWith(view, targetEventId, patch, today, productCount, ERR)

// ---------- board ----------

/** StageBar segments: every proposal store in order, with its track's stage (null = untracked). */
export function stageItems(proposal: Pick<ProposalDetail, 'stores'>, views: TrackView[]): StageBarItem[] {
  return proposal.stores.map((s) => {
    const v = views.find((x) => x.inProposal && x.store.id === s.id)
    return { store: v?.store ?? storeSnapshot(s), stage: v?.stage ?? null, round: v?.round ?? 1, trackId: v?.track.id ?? null }
  })
}

// ---------- derived copy ----------

/** Header line in ProgressSummary (§4.16); null = nothing to show. A cancelled proposal only keeps an existing summary. */
export function headerLine(summary: PresentationSummary, gateOpen: boolean, word: string, status?: ProposalStatus): HeaderLine | null {
  const s = summary
  const line = (kind: HeaderLine['kind'], text: string, tone: Tone): HeaderLine => ({ kind, prefix: 'นำเสนอ Buyer:', text, tone, showBar: true })
  if (!s.hasTracks) return gateOpen && status !== 'CANCELLED' ? { kind: 'next', prefix: null, text: 'ขั้นต่อไป: นำเสนอ Buyer', tone: 'brand', showBar: false } : null
  if (s.byStage.NEEDS_INFO) return line('needsInfo', `ต้องส่งข้อมูลเพิ่ม ${s.byStage.NEEDS_INFO} ${word}`, 'warning')
  if (s.byStage.AWAITING) return line('awaiting', `รอนำเสนอ ${s.byStage.AWAITING} ${word}`, 'brand')
  if (s.byStage.IN_REVIEW) return line('inReview', `รอผลพิจารณา ${s.byStage.IN_REVIEW} ${word}`, 'info')
  if (s.untracked.length) return line('untracked', `ยังไม่ได้นำเสนอ ${s.untracked.length} ${word}`, 'muted')
  if (s.passed) return line('passed', `ผ่าน ${s.passed}/${s.storesTotal} ${word}`, 'success')
  if (s.rejected) return line('allRejected', `ไม่ผ่านทุก${word}`, 'danger')
  return line('allWithdrawn', `ยุติการนำเสนอทุก${word}`, 'muted')
}

/** Row detail lines and warnings (§3.9). NEEDS_INFO with no due date: the UI shows "ยังไม่กำหนดวันส่ง". */
export function rowDetail(
  view: Pick<TrackView, 'stage' | 'plan' | 'presentedDate' | 'expectedResultDate' | 'reviewSince' | 'openRequest' | 'outcome' | 'accepted'>,
  today: ISODate,
  word = 'ห้าง',
): RowDetail {
  const d: RowDetail = { main: null, mainTone: 'muted', quote: null, warning: null, presenterIds: [], due: null }
  const o = view.outcome
  switch (view.stage) {
    case 'AWAITING': {
      const m = view.plan.meetingDate
      d.presenterIds = view.plan.presenterIds
      if (!m) d.main = 'ยังไม่ได้นัด'
      else if (m === today) {
        d.main = 'นัดวันนี้'
        d.mainTone = 'brand'
      } else if (m > today) d.main = `นัด ${formatDate(m)} · ${relativeTo(m, today)}`
      else d.warning = { text: `เลยวันนัดมา ${diffDays(m, today)} วัน — นำเสนอแล้วหรือยัง?`, tone: 'warning' }
      break
    }
    case 'IN_REVIEW': {
      const p = view.presentedDate
      const e = view.expectedResultDate
      const waited = p ? diffDays(p, today) : 0
      // The follow-up nudge counts from the latest PRESENTED / INFO_SENT; the wait shown still counts from the pitch.
      const stale = (view.reviewSince ? diffDays(view.reviewSince, today) : waited) > 14
      if (p) d.main = `เสนอ ${formatDate(p)} · รอผลมา ${waited} วัน`
      if (e && e < today) d.warning = { text: `เลยวันที่คาดว่าจะทราบผล ${diffDays(e, today)} วัน — ลองติดตาม Buyer`, tone: 'warning' }
      else if (e) d.main = [d.main, `คาดว่าจะทราบผล ${formatDate(e)}`].filter(Boolean).join(' · ')
      else if (p && stale) {
        d.main = `เสนอ ${formatDate(p)}`
        d.warning = { text: `รอผลมา ${waited} วัน · ควรติดตาม Buyer`, tone: 'warning' }
      }
      break
    }
    case 'NEEDS_INFO': {
      const r = view.openRequest
      d.quote = r ? `Buyer ต้องการ: ${flattenRequest(r.request)}` : null
      d.due = { date: r?.dueDate ?? null, preparerId: r?.preparerId ?? null }
      if (r?.dueDate && r.dueDate < today) d.warning = { text: `เลยกำหนดส่งข้อมูล ${diffDays(r.dueDate, today)} วัน`, tone: 'danger' }
      break
    }
    case 'PASSED':
      d.main = `ผ่านเมื่อ ${formatDate(o?.date)}${view.accepted ? ` · รับ ${view.accepted.count} จาก ${view.accepted.total} SKU` : ''}`
      break
    case 'REJECTED':
      d.main = `ไม่ผ่านเมื่อ ${formatDate(o?.date)}`
      if (o?.kind === 'REJECTED') d.quote = `เหตุผล: ${rejectReasonLabel(o.reason, word)} — “${o.detail}”`
      break
    case 'WITHDRAWN':
      d.main = `ยุติเมื่อ ${formatDate(o?.date)}`
      if (o?.kind === 'WITHDRAWN') d.quote = `เหตุผล: ${o.reason}`
      break
  }
  return d
}

export interface NextActionContext {
  views: TrackView[]
  summary: PresentationSummary
  status: ProposalStatus
  gateOpen: boolean
  progress: { done: number; total: number }
  canRecord: boolean
  canFinalize: boolean
  word: string
  today: ISODate
  userName: (id: string | null | undefined) => string
}

/** Nulls last. */
function byDate(a: ISODate | null | undefined, b: ISODate | null | undefined) {
  if (a === b) return 0
  if (!a) return 1
  if (!b) return -1
  return a < b ? -1 : 1
}

/** The one thing to do now (§3.10); the first match wins. Only stores still in the proposal count. */
export function nextAction(c: NextActionContext): NextAction {
  const { summary: s, word, today } = c
  const base = { reason: null, steps: null, primary: null, secondary: null, note: null }
  const button = (label: string, action: PresentationAction, variant: NextActionButton['variant'] = 'default'): NextActionButton => ({ label, action, variant })
  const record = (label: string, action: PresentationAction) => (c.canRecord ? { primary: button(label, action), note: null } : { primary: null, note: ERR.readOnly })

  if (c.status === 'CANCELLED') return { ...base, kind: 'cancelled', tone: 'info', title: 'โปรเจกต์ถูกยกเลิก — ดูประวัติการนำเสนอได้อย่างเดียว' }

  const views = c.views.filter((v) => v.inProposal)
  if (views.length === 0 && !c.gateOpen) {
    const { done, total } = c.progress
    return total === 0
      ? { ...base, kind: 'locked', tone: 'muted', title: 'ยังไม่มีงานเตรียมในโปรเจกต์นี้', reason: 'เพิ่มงานในแท็บ “รายการงาน” ก่อน เมื่อทำครบแล้วจึงนำเสนอ Buyer ได้' }
      : { ...base, kind: 'locked', tone: 'muted', title: 'ยังสร้างชุดนำเสนอไม่ได้', reason: `ต้องทำงานเตรียมให้ครบก่อน — เหลืออีก ${total - done} งาน (${done}/${total})` }
  }
  if (views.length === 0) {
    return {
      ...base,
      kind: 'ready',
      tone: 'success',
      title: 'พร้อมนำเสนอแล้ว — สร้างชุดนำเสนอ',
      reason: `เลือกงานที่เสร็จแล้วและ${word}ที่จะนำเสนอ ระบบจะติดตามผลให้แยกราย${word}`,
      steps: '① สร้างชุดนำเสนอ → ② บันทึกว่านำเสนอแล้ว → ③ บันทึกผลพิจารณา (ผ่าน · ไม่ผ่าน · ต้องการข้อมูลเพิ่ม)',
      ...record('สร้างชุดนำเสนอ', { kind: 'create' }),
    }
  }

  const byStore = (a: TrackView, b: TrackView) => a.storeIndex - b.storeIndex
  const needs = views.filter((v) => v.stage === 'NEEDS_INFO').sort((a, b) => byDate(a.openRequest?.dueDate, b.openRequest?.dueDate) || byStore(a, b))
  if (needs.length) {
    const v = needs[0]
    const due = v.openRequest?.dueDate ?? null
    const preparer = v.openRequest?.preparerId ? ` · ผู้เตรียม ${c.userName(v.openRequest.preparerId)}` : ''
    const reason = due ? `ต้องส่งภายใน ${formatDate(due)} (${relativeTo(due, today)})${preparer}` : `ยังไม่กำหนดวันส่ง${preparer}`
    const action = record('บันทึกการส่งข้อมูลเพิ่ม', { kind: 'record', trackIds: [v.track.id] })
    if (due && due < today) {
      return { ...base, kind: 'needsInfoOverdue', tone: 'danger', title: `Buyer ของ ${v.store.name} ต้องการข้อมูลเพิ่ม — เลยกำหนดส่ง ${diffDays(due, today)} วัน`, reason, ...action }
    }
    const more = needs.length - 1
    return { ...base, kind: 'needsInfo', tone: 'warning', title: `Buyer ของ ${v.store.name} ต้องการข้อมูลเพิ่ม${more ? ` (และอีก ${more} ${word})` : ''}`, reason, ...action }
  }

  const awaiting = views.filter((v) => v.stage === 'AWAITING').sort((a, b) => byDate(a.plan.meetingDate, b.plan.meetingDate) || byStore(a, b))
  if (awaiting.length) {
    const v = awaiting[0]
    const m = v.plan.meetingDate
    const more = awaiting.length - 1
    return {
      ...base,
      kind: 'awaiting',
      tone: 'brand',
      title: `นำเสนอให้ Buyer ของ ${v.store.name}${more ? ` (และอีก ${more} ${word})` : ''}`,
      reason: m ? `นัดใกล้สุด ${formatDate(m)} (${relativeTo(m, today)})` : 'ยังไม่ได้นัดวันนำเสนอ',
      ...record(`บันทึกว่านำเสนอแล้ว${withCount(awaiting.length, word)}`, { kind: 'record', trackIds: awaiting.map((x) => x.track.id) }),
    }
  }

  const review = views.filter((v) => v.stage === 'IN_REVIEW').sort((a, b) => byDate(a.presentedDate, b.presentedDate) || byStore(a, b))
  if (review.length) {
    const v = review[0]
    const p = v.presentedDate
    const e = v.expectedResultDate
    return {
      ...base,
      kind: 'inReview',
      tone: 'info',
      title: `รอผลพิจารณาจาก Buyer ${review.length} ${word}`,
      reason: !p ? null : e ? `เสนอไปเมื่อ ${formatDate(p)} · คาดว่าจะทราบผล ${formatDate(e)} (${relativeTo(e, today)})` : `เสนอไปเมื่อ ${formatDate(p)} · รอผลมา ${diffDays(p, today)} วัน`,
      ...record('บันทึกผลพิจารณา', { kind: 'record', trackIds: [v.track.id] }),
    }
  }

  // The status API refuses COMPLETED while any task is open, even though outcomes can be recorded meanwhile.
  const tasksLeft = c.progress.total - c.progress.done
  const closeOut = c.canFinalize && c.status !== 'COMPLETED' && tasksLeft === 0 ? button('ตั้งโปรเจกต์เป็นเสร็จสิ้น', { kind: 'complete' }) : null
  if (s.untracked.length) {
    const n = s.untracked.length
    const title = `ยังมี ${n} ${word}ที่ยังไม่ได้นำเสนอ`
    // Reaching here means every tracked store is final.
    const secondary = closeOut ? { ...closeOut, variant: 'ghost' as const } : null
    if (!c.gateOpen) {
      const { done, total } = c.progress
      return { ...base, kind: 'untracked', tone: 'brand', title, reason: `ทำงานเตรียมให้ครบก่อน (${done}/${total}) จึงจะสร้างชุดนำเสนอได้`, ...record('ไปที่รายการงาน', { kind: 'goTasks' }), secondary }
    }
    return {
      ...base,
      kind: 'untracked',
      tone: 'brand',
      title,
      reason: s.untracked.map((x) => x.name).join(', '),
      ...record(`สร้างชุดนำเสนอ${withCount(n, word)}`, { kind: 'create', storeIds: s.untracked.map((x) => x.id) }),
      secondary,
    }
  }

  const tone: Tone = s.passed === 0 && s.rejected > 0 ? 'danger' : 'success'
  const title = `ได้ผลครบทุก${word}แล้ว: ผ่าน ${s.passed} · ไม่ผ่าน ${s.rejected}${s.withdrawn ? ` · ยุติ ${s.withdrawn}` : ''}`
  if (closeOut) return { ...base, kind: 'allFinal', tone, title, reason: 'ตั้งโปรเจกต์เป็น “เสร็จสิ้น” เพื่อปิดงานนี้', primary: closeOut }
  if (c.canFinalize && c.status !== 'COMPLETED') {
    const { done, total } = c.progress
    return { ...base, kind: 'allFinal', tone, title, reason: `ทำงานเตรียมให้ครบก่อน (${done}/${total}) จึงจะตั้งโปรเจกต์เป็น “เสร็จสิ้น” ได้`, primary: button('ไปที่รายการงาน', { kind: 'goTasks' }) }
  }
  return { ...base, kind: 'allFinal', tone, title, note: c.status === 'COMPLETED' ? 'โปรเจกต์นี้ตั้งเป็น “เสร็จสิ้น” แล้ว' : 'เจ้าของโปรเจกต์หรือผู้จัดการเป็นผู้ตั้งสถานะเสร็จสิ้น' }
}

export interface EventCopyContext {
  word: string
  /** The proposal's current SKUs (a partial pass is counted against them, as reduceTrack's `accepted`). */
  productIds: string[]
  userName: (id: string | null | undefined) => string
}

/** One value of an EDITED change, as text. */
export function formatEditValue(field: string, value: unknown, c: EventCopyContext): string {
  if (field === 'acceptedProductIds') {
    // New passes store the explicit SKU list; one equal to the current SKUs still reads "ทุก SKU".
    const partial = Array.isArray(value) ? acceptedSkus(value.map(String), c.productIds) : null
    return partial ? `${partial.count} SKU` : 'ทุก SKU'
  }
  if (value === null || value === undefined || value === '') return '—'
  switch (field) {
    case 'date':
    case 'dueDate':
    case 'expectedResultDate':
    case 'meetingDate':
      return formatDate(String(value))
    case 'reason':
      return REJECT_REASONS.includes(value as RejectReason) ? rejectReasonLabel(value as RejectReason, c.word) : clip(String(value))
    case 'preparerId':
      return c.userName(String(value))
    case 'presenterIds':
      return Array.isArray(value) && value.length ? value.map((id) => c.userName(String(id))).join(', ') : '—'
    case 'tasks':
      return Array.isArray(value) ? `${value.length} งาน` : '—'
    default:
      return clip(String(value).replace(/\s*\n\s*/g, ' '))
  }
}

/** Timeline entry title (§4.13 history entries). */
export function eventTitle(item: TimelineItem, packageSeq: number, c: EventCopyContext): string {
  const e = item.effective
  // A reverted INFO_SENT / REPITCH never started its round; show the round it would have started.
  const startedRound = item.reverted ? item.round + 1 : item.round
  switch (e.kind) {
    case 'CREATED':
      return `เพิ่มเข้าชุดนำเสนอ #${packageSeq}`
    case 'SCHEDULED':
      return e.meetingDate ? `นัดนำเสนอ ${formatDate(e.meetingDate)}` : 'ยกเลิกวันนัด'
    case 'PRESENTED':
      return `นำเสนอให้ Buyer แล้ว${e.contactName ? ` (${e.contactName})` : ''}`
    case 'NEEDS_INFO':
      return ['Buyer ขอข้อมูลเพิ่ม', e.dueDate && `ต้องส่งภายใน ${formatDate(e.dueDate)}`, e.preparerId && `ผู้เตรียม: ${c.userName(e.preparerId)}`].filter(Boolean).join(' · ')
    case 'INFO_SENT':
      return `ส่งข้อมูลเพิ่มแล้ว — เริ่มพิจารณารอบที่ ${startedRound}`
    case 'PASSED': {
      const partial = acceptedSkus(e.acceptedProductIds, c.productIds)
      return `ผ่านการพิจารณา${partial ? ` (รับ ${partial.count} จาก ${partial.total} SKU)` : ''}`
    }
    case 'REJECTED':
      return `ไม่ผ่านการพิจารณา · เหตุผล: ${rejectReasonLabel(e.reason, c.word)}`
    case 'WITHDRAWN':
      return 'ยุติการนำเสนอ'
    case 'REPITCH':
      return `เริ่มนำเสนอใหม่ (รอบที่ ${startedRound})`
    case 'REVERTED':
      return item.revert ? `ย้อนกลับจาก “${stageLabel(item.revert.from)}” เป็น “${stageLabel(item.revert.to)}”` : 'ย้อนกลับขั้นก่อนหน้า'
    case 'EDITED': {
      if (!item.edit) return 'แก้ไขรายละเอียด'
      const parts = item.edit.changes.map((ch) => `${ch.label} ${formatEditValue(ch.field, ch.before, c)} → ${formatEditValue(ch.field, ch.after, c)}`)
      return `แก้ไขรายละเอียด “${EVENT_LABEL[item.edit.target.kind]}”${parts.length ? `: ${parts.join(', ')}` : ''}`
    }
  }
}

/** Free text quoted under a timeline entry (rounded-lg bg-muted/50 p-3 box), or null. */
export function eventQuote(e: TrackEvent): string | null {
  switch (e.kind) {
    case 'PRESENTED':
      return e.note
    case 'NEEDS_INFO':
      return e.request || null
    case 'INFO_SENT':
      return e.sentWhat
    case 'PASSED':
      return [e.notAcceptedNote && `ไม่รับสินค้าที่เหลือเพราะ: ${e.notAcceptedNote}`, e.note].filter(Boolean).join('\n') || null
    case 'REJECTED':
      return e.detail || null
    case 'WITHDRAWN':
      return e.reason || null
    case 'REPITCH':
      return e.changes || null
    default:
      return null
  }
}

// ---------- record dialog ----------

/** Record-dialog defaults (§3.3). */
export function emptyStepForm(view: TrackView, today: ISODate, meId: string): StepForm {
  const meeting = view.plan.meetingDate
  return {
    presentedDate: meeting && meeting <= today ? meeting : today,
    contactName: view.plan.contactName ?? '',
    expectedResultDate: null,
    note: '',
    date: today,
    request: '',
    dueDate: addDays(today, 7),
    preparerId: meId,
    acceptedProductIds: null,
    notAcceptedNote: '',
    reason: null,
    detail: '',
    sentWhat: '',
  }
}

/** Edit mode: prefill the form from an (effective) event. */
export function stepFormFromEvent(e: TrackEvent, base: StepForm): StepForm {
  switch (e.kind) {
    case 'PRESENTED':
      return { ...base, presentedDate: e.date, contactName: e.contactName ?? '', expectedResultDate: e.expectedResultDate, note: e.note ?? '' }
    case 'NEEDS_INFO':
      return { ...base, date: e.date, request: e.request, dueDate: e.dueDate, preparerId: e.preparerId }
    case 'INFO_SENT':
      return { ...base, date: e.date, sentWhat: e.sentWhat ?? '', expectedResultDate: e.expectedResultDate }
    case 'PASSED':
      return { ...base, date: e.date, acceptedProductIds: e.acceptedProductIds, notAcceptedNote: e.notAcceptedNote ?? '', note: e.note ?? '' }
    case 'REJECTED':
      return { ...base, date: e.date, reason: e.reason, detail: e.detail }
    default:
      return base
  }
}

/**
 * The events a record-dialog submit appends. "present" mode: PRESENTED, plus the outcome dated the same
 * day unless the choice is "ยังไม่ทราบผล". `productIds` = the proposal's SKUs (all ticked → null).
 */
export function buildStepEvents(mode: RecordMode, choice: RecordChoice, form: StepForm, productIds: string[]): StageEvent[] {
  const text = (v: string) => v.trim() || null
  const outcome = (date: ISODate): StageEvent | null => {
    switch (choice) {
      case 'passed': {
        const picked = form.acceptedProductIds
        const ids = productIds.length > 1 && picked && !productIds.every((id) => picked.includes(id)) ? productIds.filter((id) => picked.includes(id)) : null
        return { kind: 'PASSED', date, acceptedProductIds: ids, notAcceptedNote: ids ? text(form.notAcceptedNote) : null, note: text(form.note) }
      }
      case 'needsInfo':
        return { kind: 'NEEDS_INFO', date, request: form.request.trim(), dueDate: form.dueDate, preparerId: form.preparerId }
      case 'rejected':
        // A missing reason is caught by validation (err.reason).
        return { kind: 'REJECTED', date, reason: form.reason as RejectReason, detail: form.detail.trim() }
      default:
        return null
    }
  }
  if (mode === 'present') {
    const date = form.presentedDate ?? ''
    const pending = choice === 'pending'
    const presented: StageEvent = { kind: 'PRESENTED', date, contactName: text(form.contactName), expectedResultDate: pending ? form.expectedResultDate : null, note: pending ? text(form.note) : null }
    const then = pending ? null : outcome(date)
    return then ? [presented, then] : [presented]
  }
  if (choice === 'infoSent') return [{ kind: 'INFO_SENT', date: form.date ?? '', sentWhat: text(form.sentWhat), expectedResultDate: form.expectedResultDate }]
  const e = outcome(form.date ?? '')
  return e ? [e] : []
}

/**
 * Record-dialog errors, keyed by form field (PRESENTED.date → presentedDate). In "present" mode the
 * outcome's date is the presented date, so its date errors are not repeated.
 */
export function validateStep(mode: RecordMode, choice: RecordChoice | null, form: StepForm, view: TrackView, today: ISODate, productIds: string[]): StepErrors {
  if (!choice) return {}
  const events = buildStepEvents(mode, choice, form, productIds)
  const errors = appendErrors(view, events, today, productIds.length, ERR)
  const out: StepErrors = {}
  events.forEach((e, i) => {
    for (const [k, msg] of Object.entries(errors[i])) {
      if (!msg || (mode === 'present' && e.kind !== 'PRESENTED' && k === 'date')) continue
      out[toStepField(e.kind, k)] ??= msg
    }
  })
  return out
}

function toStepField(kind: EventKind, field: string): keyof StepForm {
  return (kind === 'PRESENTED' && field === 'date' ? 'presentedDate' : field) as keyof StepForm
}

/** validateEdit() result re-keyed for the record dialog (PRESENTED.date → presentedDate). */
export function toStepErrors(kind: EventKind, errors: FieldErrors): StepErrors {
  const out: StepErrors = {}
  for (const [k, msg] of Object.entries(errors)) if (msg) out[toStepField(kind, k)] ??= msg
  return out
}

/** Record dialog, edit mode: the patch for the edited (effective) event — changed fields only. */
export function stepPatch(e: TrackEvent, form: StepForm, productIds: string[]): EventPatch {
  const choice = choiceForEvent(e.kind)
  if (!choice) return {}
  const mode: RecordMode = e.kind === 'PRESENTED' ? 'present' : e.kind === 'INFO_SENT' ? 'infoSent' : 'result'
  const [built] = buildStepEvents(mode, choice, form, productIds)
  if (!built) return {}
  const patch = diffPatch(e, built)
  // Every box ticked builds null; a stored explicit list of every current SKU is the same answer, not an edit.
  if (e.kind === 'PASSED' && 'acceptedProductIds' in patch && patch.acceptedProductIds === null && !acceptedSkus(e.acceptedProductIds, productIds)) delete patch.acceptedProductIds
  return patch
}
