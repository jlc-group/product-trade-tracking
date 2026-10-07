// Web side of the "รอผลิต" tab: status looks, derived copy (next card, header line, row lines, history), the
// deadline timeline and the quantity inputs of the dialogs. The rules live in @flowtrade/shared (production.ts). No
// React and no clock reads — `today` always comes in as an argument.
import {
  addDays,
  deriveProduction,
  diffDays,
  formatQty,
  parseQtyText,
  productionDiff,
  productionErrors,
  productionFlagLabel,
  productionStatusLabel,
  quantityError,
  skuListLabel,
  type ISODate,
  type ProductionEvent,
  type ProductionRow,
  type ProductionStatus,
  type ProductionSummary,
  type ProductionTrackView,
  type ProductionView,
} from '@flowtrade/shared'
import { relativeTo } from '@/features/presentation/model'
import { formatDate } from '@/lib/format'
import type { HeaderLine, NextCard, StatusMeta } from './types'

export { relativeTo }

// ---------- errors (Thai copy) ----------

/** The shared copy with dates in the viewer's BE/CE format. Not `ERR`: presentation/model.ts owns that name. */
export const PROD_ERR = productionErrors((d) => formatDate(d))

// ---------- status looks ----------

export const PRODUCTION_STATUS_META: Record<ProductionStatus, StatusMeta> = {
  PENDING: { label: productionStatusLabel('PENDING'), tone: 'warning', chip: 'bg-warning-soft text-warning-foreground border-warning/30', dot: 'bg-warning' },
  IN_PRODUCTION: { label: productionStatusLabel('IN_PRODUCTION'), tone: 'info', chip: 'bg-info-soft text-info border-info/20', dot: 'bg-info' },
  PRODUCED: { label: productionStatusLabel('PRODUCED'), tone: 'brand', chip: 'bg-brand-soft text-brand border-brand/20', dot: 'bg-brand' },
  DELIVERED: { label: productionStatusLabel('DELIVERED'), tone: 'success', chip: 'bg-success-soft text-success border-success/25', dot: 'bg-success' },
  CANCELLED: { label: productionStatusLabel('CANCELLED'), tone: 'muted', chip: 'bg-muted text-muted-foreground border-border', dot: 'bg-muted-foreground/60' },
}

/** "ไม่ผลิต": a CANCELLED row that was never confirmed. */
export const SKIPPED_META: StatusMeta = { ...PRODUCTION_STATUS_META.CANCELLED, label: productionStatusLabel('CANCELLED', true) }

export const statusMeta = (status: ProductionStatus, skipped = false) => (skipped ? SKIPPED_META : PRODUCTION_STATUS_META[status])

// ---------- small helpers ----------

/** Earliest pass date of a row (its first passing store). */
export function firstPassOf(row: Pick<ProductionRow, 'passedStores'>): ISODate | null {
  return row.passedStores.reduce<ISODate | null>((min, s) => (!min || s.passedOn < min ? s.passedOn : min), null)
}

const deliverWord = (word: string) => `ส่งเข้าคลัง/${word}`

// ---------- next card (§5.5, K1, K5, K26) ----------

export interface NextCardContext {
  summary: ProductionSummary
  rows: ProductionRow[]
  canWork: boolean
  canDecide: boolean
  word: string
  today: ISODate
}

/** The one thing to do now on the tab; first match wins. */
export function nextCard(c: NextCardContext): NextCard {
  const s = c.summary
  const word = c.word
  const due = `ต้อง${deliverWord(word)}ภายใน ${formatDate(s.deadline)} (${relativeTo(s.deadline, c.today)})`
  const making = s.inProduction + s.produced
  const overdue = s.overdueDays > 0

  if (s.pending > 0) {
    const reason = [
      c.canDecide ? `กรอกจำนวนผลิตและวันที่ต้องการสินค้าตอนกดยืนยัน · ${due}` : due,
      s.confirmed > 0 && `ยืนยันไปแล้ว ${s.confirmed} SKU — SKU ใหม่ต้องยืนยันอีกครั้ง`,
      c.canDecide && 'SKU ที่ไม่ต้องผลิต เลือก “ไม่ผลิต” ที่เมนู ⋯ ของแถวนั้น',
    ]
      .filter(Boolean)
      .join(' · ')
    return {
      kind: 'pending',
      tone: overdue ? 'danger' : 'warning',
      title: overdue ? `มี ${s.pending} SKU ที่ผ่าน Buyer แล้ว — เลยกำหนดผลิตมาแล้ว ${s.overdueDays} วัน` : `มี ${s.pending} SKU ที่ผ่าน Buyer แล้ว — รอยืนยันเริ่มผลิต`,
      reason,
      primary: c.canDecide ? { label: `ยืนยันเริ่มผลิต (${s.pending} SKU)`, icon: 'confirm', action: { kind: 'confirm' } } : null,
      note: c.canDecide ? null : 'รอเจ้าของโปรเจกต์หรือผู้จัดการกรอกจำนวนผลิตและยืนยันเริ่มผลิต',
    }
  }

  if (s.flagged > 0) {
    const first = c.rows.find((r) => r.needsReview)
    return {
      kind: 'review',
      tone: 'warning',
      title: `มี ${s.flagged} SKU ที่ยืนยันผลิตแล้วต้องตรวจสอบ`,
      reason: first ? `${first.product.sku}: ${flagStripText(first, word)}` : null,
      primary: null,
      note: c.canDecide ? 'เลือกที่แถวของ SKU นั้นด้านล่าง' : 'รอเจ้าของโปรเจกต์หรือผู้จัดการตัดสินใจ',
    }
  }

  if (s.state === 'ACTIVE') {
    const primary: NextCard['primary'] = !c.canWork
      ? null
      : s.produced > 0
        ? { label: `บันทึกส่งแล้ว (${s.produced} SKU)`, icon: 'delivered', action: { kind: 'advance', to: 'DELIVERED' } }
        : { label: `บันทึกผลิตเสร็จ (${s.inProduction} SKU)`, icon: 'produced', action: { kind: 'advance', to: 'PRODUCED' } }
    return {
      kind: 'active',
      tone: overdue ? 'danger' : 'info',
      title: overdue
        ? `เลยกำหนด${deliverWord(word)} ${s.overdueDays} วัน — ยังไม่ส่ง ${making} SKU`
        : `${s.inProduction > 0 ? `กำลังผลิต ${making} SKU` : `ผลิตเสร็จรอส่ง ${s.produced} SKU`} · ส่งแล้ว ${s.delivered}/${s.confirmed}`,
      reason: due,
      primary,
      note: null,
    }
  }

  if (s.state === 'DONE') {
    const last = s.lastDeliveredOn ? ` (ส่งครบ ${formatDate(s.lastDeliveredOn)})` : ''
    return {
      kind: 'done',
      tone: 'success',
      title: `${deliverWord(word)}ครบ ${s.delivered} SKU แล้ว`,
      reason: s.deliveredLate === 0 ? `ทันกำหนดทุก SKU${last}` : `ส่งช้ากว่ากำหนด ${s.deliveredLate} SKU${last}`,
      primary: null,
      note: null,
    }
  }

  return {
    kind: 'cancelled',
    tone: 'muted',
    title: s.skipped === s.cancelled ? 'ไม่ต้องผลิต SKU ที่ผ่าน Buyer' : 'ยกเลิกการผลิตทุก SKU แล้ว',
    reason: null,
    primary: null,
    note: null,
  }
}

// ---------- header line (§5.13, K9) ----------

/** "ผลิต: …" under the presentation line; null while nothing passed or everything was cancelled / skipped. */
export function productionHeaderLine(s: ProductionSummary): HeaderLine | null {
  if (s.state === 'NONE' || s.state === 'CANCELLED') return null
  const overdue = s.overdueDays > 0
  if (s.flagged > 0) return { text: `${s.flagged} SKU ที่ยืนยันผลิตแล้วต้องตรวจสอบ`, tone: 'warning' }
  if (s.state === 'PENDING') return { text: `รอยืนยันเริ่มผลิต ${s.pending} SKU`, tone: overdue ? 'danger' : 'warning' }
  if (s.state === 'ACTIVE')
    return overdue
      ? { text: `เลยกำหนด ${s.overdueDays} วัน · ยังไม่ส่ง ${s.inProduction + s.produced} SKU`, tone: 'danger' }
      : { text: `ส่งแล้ว ${s.delivered}/${s.confirmed} SKU · กำหนด ${formatDate(s.deadline)}`, tone: 'info' }
  return { text: `ส่งครบ ${s.delivered} SKU แล้ว`, tone: 'success' }
}

// ---------- rows ----------

/** Product cell meta line: who confirmed / cancelled, or when it passed. */
export function rowMeta(row: ProductionRow, userName: (id: string | null | undefined) => string): string | null {
  const item = row.item
  if (row.status === 'CANCELLED' && item) {
    const by = `${userName(item.cancelledById)} ${formatDate(item.cancelledAt, { withYear: false })}`
    return row.skipped ? `ไม่ผลิต · โดย ${by}` : `ยกเลิกโดย ${by}`
  }
  if (row.status === 'PENDING') {
    const first = firstPassOf(row)
    return first ? `ผ่าน Buyer ${formatDate(first)}` : null
  }
  return item?.confirmedAt ? `ยืนยันโดย ${userName(item.confirmedById)} ${formatDate(item.confirmedAt, { withYear: false })}` : null
}

export interface SubLine {
  text: string
  tone: 'danger' | 'warning' | 'success' | 'info' | 'muted'
}

/** One line under the status chip: lateness first, then the step's date. */
export function statusSubLine(row: ProductionRow, today: ISODate): SubLine | null {
  const item = row.item
  if (row.late?.kind === 'OVERDUE') return { text: `เลยกำหนด ${row.late.days} วัน`, tone: 'danger' }
  if (row.late?.kind === 'DELIVERED_LATE') return { text: `ส่ง ${formatDate(item?.deliveredOn)} · ช้า ${row.late.days} วัน`, tone: 'warning' }
  switch (row.status) {
    case 'IN_PRODUCTION':
      return { text: `ต้องการสินค้า ${formatDate(row.dueOn)} · ${relativeTo(row.dueOn, today)}`, tone: 'muted' }
    case 'PRODUCED':
      return { text: `ผลิตเสร็จ ${formatDate(item?.producedOn)}`, tone: 'muted' }
    case 'DELIVERED':
      return { text: `ส่ง ${formatDate(item?.deliveredOn)} · ทันกำหนด`, tone: 'success' }
    default:
      return null
  }
}

/** The warning strip under a row that needs the owner / a manager (K2, K9). */
export function flagStripText(row: ProductionRow, word: string): string {
  switch (row.flag) {
    case 'NOT_PASSED':
      return `SKU นี้ไม่มี${word}ที่ผ่านแล้ว (ผลถูกย้อน/แก้ หรือ${word}ถูกนำออกจากโปรเจกต์) — แต่ยืนยันผลิตไปแล้ว`
    case 'NOT_IN_PROPOSAL':
      return 'SKU นี้ถูกนำออกจากโปรเจกต์แล้ว — แต่ยืนยันผลิตไปแล้ว'
    case 'STORES_CHANGED': {
      const added = row.storesAdded.map((s) => s.name).join(', ')
      const parts = [added && `เพิ่ม ${added}`, row.storesRemovedCount > 0 && `ลดลง ${row.storesRemovedCount} ${word}`].filter(Boolean).join(' · ')
      const qty = row.item?.quantity != null ? `จำนวนผลิต ${formatQty(row.item.quantity)} ชิ้นยังเหมาะไหม?` : 'ตรวจสอบจำนวนผลิตอีกครั้ง'
      return `${word}ที่ผ่านเปลี่ยนไปหลังยืนยันผลิต: ${parts} — ${qty}`
    }
    default:
      return ''
  }
}

/** "ผลิตต่อ" / "ส่งต่อตามแผน" / "รับทราบ" / "จำนวนเดิมใช้ได้" and its confirm copy. */
export function keepCopy(row: ProductionRow, word: string): { button: string; title: string; description: string } {
  const sku = row.product.sku
  if (row.flag === 'STORES_CHANGED') {
    const qty = row.item?.quantity != null ? `จำนวน ${formatQty(row.item.quantity)} ชิ้น` : 'จำนวนเดิม'
    return { button: 'จำนวนเดิมใช้ได้', title: `ใช้จำนวนผลิต ${sku} เดิม?`, description: `${word}ที่ผ่านเปลี่ยนไปหลังยืนยันผลิต — ยืนยันว่า${qty}ยังเหมาะ คำเตือนจะหายไป` }
  }
  const flag = row.flag ? productionFlagLabel(row.flag, word) : ''
  const description = `SKU นี้${flag} แต่จะดำเนินการต่อตามที่ยืนยันไว้ คำเตือนจะหายไป`
  if (row.status === 'PRODUCED') return { button: 'ส่งต่อตามแผน', title: `ส่ง ${sku} ต่อตามแผน?`, description }
  if (row.status === 'DELIVERED') return { button: 'รับทราบ', title: `รับทราบ ${sku}?`, description }
  return { button: 'ผลิตต่อ', title: `ผลิต ${sku} ต่อ?`, description }
}

/** A kept NOT_PASSED / NOT_IN_PROPOSAL row: who decided to go on. */
export function keptNote(row: ProductionRow, word: string, userName: (id: string | null | undefined) => string): string | null {
  if (!row.flag || !row.kept) return null
  const by = row.item?.keptAt ? ` · โดย ${userName(row.item.keptById)} ${formatDate(row.item.keptAt, { withYear: false })}` : ''
  return `ดำเนินการต่อแม้${productionFlagLabel(row.flag, word)}${by}`
}

/** Flag callout (§5.6). */
export function flagCalloutText(rows: ProductionRow[]): string {
  const skus = rows.filter((r) => r.needsReview).map((r) => r.product.sku)
  return `SKU ที่ยืนยันผลิตแล้ว ${skus.length} SKU ต้องตรวจสอบ: ${skuListLabel(skus)}`
}

// ---------- deadline timeline (§5.7) ----------

/** A point closer to launch than this many days is "too close" (yellow). */
export const LAUNCH_RISK_DAYS = 14

/** 17 → "2 สัปดาห์ 3 วัน", 14 → "2 สัปดาห์", 5 → "5 วัน". */
export function weeksText(days: number): string {
  const weeks = Math.floor(days / 7)
  const rest = days % 7
  if (weeks === 0) return `${rest} วัน`
  return rest ? `${weeks} สัปดาห์ ${rest} วัน` : `${weeks} สัปดาห์`
}

export interface TimelineFlag {
  tone: 'danger' | 'warning'
  /** Short text under the legend date. */
  text: string
  /** The sentence for the alert above the bar. */
  alert: string
}

export interface TimelinePoint {
  key: 'passed' | 'today' | 'deadline' | 'launch'
  label: string
  date: ISODate
  /** 0…1 along the bar. */
  pos: number
  dot: string
  /** Red = past its limit, yellow = inside the last LAUNCH_RISK_DAYS before launch. */
  flag: TimelineFlag | null
}

export interface TimelineAlerts {
  danger: string[]
  warning: string[]
}

const POINT_RANK: Record<TimelinePoint['key'], number> = { today: 0, passed: 1, deadline: 2, launch: 3 }
const FLAG_DOT: Record<TimelineFlag['tone'], string> = { danger: 'bg-danger', warning: 'bg-warning' }

type TimelineInput = Pick<ProductionView, 'today' | 'targetDate' | 'rows' | 'summary'>

/** Red / yellow flag of each point; only while SKUs are still undelivered, except a late delivery. */
function pointFlags(view: TimelineInput, word: string): Record<TimelinePoint['key'], TimelineFlag | null> {
  const { today, targetDate, summary: s } = view
  const open = s.state === 'PENDING' || s.state === 'ACTIVE'
  const undelivered = `ยังไม่ส่ง ${s.undelivered} SKU`
  const flags: Record<TimelinePoint['key'], TimelineFlag | null> = { passed: null, today: null, deadline: null, launch: null }

  if (open && s.firstPassedOn) {
    const left = diffDays(s.firstPassedOn, targetDate)
    if (left < 0)
      flags.passed = { tone: 'danger', text: `หลังวันวางขาย ${weeksText(-left)}`, alert: `Buyer ให้ผ่านหลังวันวางขายมาแล้ว ${weeksText(-left)}` }
    else if (left < LAUNCH_RISK_DAYS)
      flags.passed = { tone: 'warning', text: `ห่างวันวางขาย ${left} วัน`, alert: `ผ่าน Buyer เมื่อเหลือแค่ ${left} วันก่อนวางขาย — เหลือเวลาผลิตน้อย` }
  }

  if (open && s.overdueDays === 0) {
    const left = diffDays(today, targetDate)
    if (left >= 0 && left < LAUNCH_RISK_DAYS)
      flags.today = {
        tone: 'warning',
        text: left === 0 ? 'วันวางขาย' : `อีก ${left} วันวางขาย`,
        alert: `${left === 0 ? 'วันนี้วางขาย' : `อีก ${left} วันจะถึงวันวางขาย`} แต่${undelivered}`,
      }
  }

  const lateDays = Math.max(0, ...view.rows.map((r) => (r.late?.kind === 'DELIVERED_LATE' ? r.late.days : 0)))
  // The date to beat: the earliest open due ("วันที่ต้องการสินค้า" of confirmed SKUs, else the plan deadline).
  const dueLeft = diffDays(s.deadline, targetDate)
  if (s.overdueDays > 0)
    flags.deadline = { tone: 'danger', text: `เกินมา ${weeksText(s.overdueDays)}`, alert: `เลยกำหนด${deliverWord(word)}มาแล้ว ${weeksText(s.overdueDays)} — ${undelivered}` }
  else if (lateDays > 0)
    flags.deadline = { tone: 'danger', text: `ส่งช้า ${weeksText(lateDays)}`, alert: `${deliverWord(word)}ช้ากว่ากำหนด ${weeksText(lateDays)} (${s.deliveredLate} SKU)` }
  else if (open && dueLeft < LAUNCH_RISK_DAYS) {
    const gap = dueLeft === 0 ? 'ตรงวันวางขาย' : `แค่ ${dueLeft} วันก่อนวางขาย`
    flags.deadline = {
      tone: 'warning',
      text: dueLeft === 0 ? 'ตรงวันวางขาย' : `ห่างวันวางขาย ${dueLeft} วัน`,
      alert: `${s.deadline === s.planDeadline ? `ตั้ง deadline ไว้${gap}` : `วันที่ต้องการสินค้าอยู่${gap}`} (น้อยกว่า ${LAUNCH_RISK_DAYS} วัน) — ใกล้วันวางขายเกินไป`,
    }
  }

  if (open && today > targetDate) {
    const over = weeksText(diffDays(targetDate, today))
    flags.launch = { tone: 'danger', text: `เกินมา ${over}`, alert: `เลยวันวางขายมาแล้ว ${over} — ${undelivered}` }
  }
  return flags
}

export interface TimelineBand {
  /** 0…1 along the bar. */
  from: number
  to: number
}

/**
 * Points of the bar and legend, chronological (same date: today first); the yellow risk band before launch; the red
 * late band from the deadline to today (SKUs still undelivered) or to the last delivery (delivered late).
 */
export function timelinePoints(
  view: TimelineInput,
  word: string,
): { points: TimelinePoint[]; todayPos: number; riskBand: TimelineBand | null; lateBand: (TimelineBand & { text: string }) | null } {
  const { today, targetDate, summary: s } = view
  // Without a pass (every row lost it) the bar starts at the earliest start — or today, as a start may be planned.
  const start = s.firstPassedOn ?? view.rows.reduce((min, r) => (r.item?.startedOn && r.item.startedOn < min ? r.item.startedOn : min), today)
  const end = targetDate > today ? targetDate : today
  const span = Math.max(1, diffDays(start, end))
  const pos = (d: ISODate) => Math.min(1, Math.max(0, diffDays(start, d) / span))
  const flags = pointFlags(view, word)
  const doneOnTime = s.state === 'DONE' && s.deliveredLate === 0
  const dot = (key: TimelinePoint['key'], plain: string) => {
    const flag = flags[key]
    return flag ? FLAG_DOT[flag.tone] : plain
  }
  const points: TimelinePoint[] = [
    ...(s.firstPassedOn ? [{ key: 'passed' as const, label: 'ผ่าน Buyer', date: s.firstPassedOn, pos: pos(s.firstPassedOn), dot: dot('passed', 'bg-success'), flag: flags.passed }] : []),
    { key: 'today', label: 'วันนี้', date: today, pos: pos(today), dot: 'bg-primary', flag: flags.today },
    { key: 'deadline', label: s.deadline === s.planDeadline ? 'Deadline ผลิต/ส่งคลัง' : 'วันที่ต้องการสินค้า', date: s.deadline, pos: pos(s.deadline), dot: dot('deadline', doneOnTime ? 'bg-success' : 'bg-muted-foreground'), flag: flags.deadline },
    { key: 'launch', label: 'วางขาย', date: targetDate, pos: pos(targetDate), dot: dot('launch', 'bg-foreground'), flag: flags.launch },
  ]
  points.sort((a, b) => a.date.localeCompare(b.date) || POINT_RANK[a.key] - POINT_RANK[b.key])
  const open = s.state === 'PENDING' || s.state === 'ACTIVE'
  const riskBand = open ? { from: pos(addDays(targetDate, -LAUNCH_RISK_DAYS)), to: pos(targetDate) } : null
  // From the missed due date to today (still open), or to the last delivery (delivered late; each SKU has its own due).
  const deliveredLateDays = Math.max(0, ...view.rows.map((r) => (r.late?.kind === 'DELIVERED_LATE' ? r.late.days : 0)))
  const lateUntil = s.overdueDays > 0 ? today : deliveredLateDays > 0 && s.lastDeliveredOn ? s.lastDeliveredOn : null
  const lateFrom = lateUntil && addDays(lateUntil, -(s.overdueDays > 0 ? s.overdueDays : deliveredLateDays))
  const lateBand = lateUntil && lateFrom && flags.deadline?.tone === 'danger' ? { from: pos(lateFrom), to: pos(lateUntil), text: flags.deadline.text } : null
  return { points, todayPos: pos(today), riskBand: riskBand && riskBand.to > riskBand.from ? riskBand : null, lateBand }
}

/** The alert sentences of the flagged points, in timeline order. */
export function timelineAlerts(points: TimelinePoint[]): TimelineAlerts {
  const pick = (tone: TimelineFlag['tone']) => points.flatMap((p) => (p.flag?.tone === tone ? [p.flag.alert] : []))
  return { danger: pick('danger'), warning: pick('warning') }
}

/** Timeline header chip. */
export function deadlineChip(s: ProductionSummary): SubLine {
  if (s.overdueDays > 0) return { text: `เลยกำหนด ${weeksText(s.overdueDays)}`, tone: 'danger' }
  if (s.state === 'DONE') return s.deliveredLate > 0 ? { text: 'ส่งช้า', tone: 'danger' } : { text: 'ส่งครบแล้ว', tone: 'success' }
  const d = s.daysToDeadline
  if (d < 0) return { text: `เลยมา ${-d} วัน`, tone: 'muted' }
  if (d === 0) return { text: 'วันนี้', tone: 'warning' }
  return { text: `อีก ${d} วัน`, tone: d <= 7 ? 'warning' : 'muted' }
}

// ---------- history (§5.10 ItemHistory) ----------

export function eventTitle(e: ProductionEvent, word: string): string {
  const label = (s: ProductionStatus | null) => (s ? productionStatusLabel(s) : '—')
  switch (e.kind) {
    case 'QUANTITY':
      return `จำนวนผลิต ${e.quantityBefore != null ? formatQty(e.quantityBefore) : '—'} → ${e.quantityAfter != null ? `${formatQty(e.quantityAfter)} ชิ้น` : 'ล้าง'}`
    case 'CONFIRM': {
      // Newer confirms carry "วันที่ต้องการสินค้า"; older ones a picked start date.
      const need = typeof e.detail.neededOn === 'string' ? e.detail.neededOn : null
      const when = need ? ` · ต้องการสินค้า ${formatDate(need)}` : e.date ? ` · เริ่ม ${formatDate(e.date)}` : ''
      return `ยืนยันเริ่มผลิต${e.quantityAfter != null ? ` (${formatQty(e.quantityAfter)} ชิ้น)` : ''}${when}`
    }
    case 'ADVANCE':
      return e.toStatus === 'DELIVERED' ? `${deliverWord(word)}แล้ว ${formatDate(e.date)}` : `ผลิตเสร็จ ${formatDate(e.date)}`
    case 'BACK':
      return e.toStatus === 'PENDING' ? 'ย้อนกลับเป็นรอยืนยัน' : `ย้อนสถานะ ${label(e.fromStatus)} → ${label(e.toStatus)}`
    case 'DATES': {
      const pair = (key: string) => {
        const v = e.detail[key]
        return Array.isArray(v) && v.length === 2 ? `${formatDate(String(v[0]))} → ${formatDate(String(v[1]))}` : null
      }
      const needed = pair('neededOn')
      const started = pair('startedOn')
      const produced = pair('producedOn')
      const delivered = pair('deliveredOn')
      return ['แก้วันที่', needed && `ต้องการสินค้า ${needed}`, started && `เริ่มผลิต ${started}`, produced && `ผลิตเสร็จ ${produced}`, delivered && `ส่ง ${delivered}`]
        .filter(Boolean)
        .join(' · ')
    }
    case 'CANCEL':
      return `${e.fromStatus === 'PENDING' ? 'ไม่ผลิต' : 'ยกเลิกการผลิต'}${e.reason ? `: “${e.reason}”` : ''}`
    case 'RESTORE':
      return `กู้คืน → ${label(e.toStatus)}`
    case 'KEEP':
      return 'รับทราบการเปลี่ยนแปลง · ดำเนินการต่อตามที่ยืนยันไว้'
    case 'PLAN':
      return e.leadDaysAfter != null ? `ตั้ง deadline ${e.leadDaysAfter} วันก่อนวางขาย` : 'แก้หมายเหตุการผลิต'
  }
}

// ---------- quantity inputs (confirm and edit dialogs) ----------

/** A typed quantity: its number, or the field error (empty → "กรอกจำนวนผลิต"). */
export function readQty(text: string): { value: number; error: null } | { value: null; error: string } {
  const v = parseQtyText(text)
  if (v === null) return { value: null, error: PROD_ERR.qtyRequired }
  if (v === 'invalid' || quantityError(v, PROD_ERR)) return { value: null, error: PROD_ERR.qty }
  return { value: v, error: null }
}

/** Input text of a saved quantity: grouped, or '' when none. */
export const qtyText = (q: number | null | undefined) => (q != null ? formatQty(q) : '')

export const savedQty = (row: Pick<ProductionRow, 'item'>) => row.item?.quantity ?? null

// ---------- production impact of a presentation change (K29) ----------

/** What replacing the tracks `before` → `after` does to production (from the cached view): newly flagged / dropped pending SKUs. */
export function productionImpact(view: ProductionView, productIds: string[], before: ProductionTrackView[], after: ProductionTrackView[]): { flagged: number; dropped: number } {
  const items = view.rows.flatMap((r) => (r.item ? [r.item] : []))
  const base = { productIds, targetDate: view.targetDate, leadDays: view.plan.leadDays, items }
  const was = deriveProduction({ ...base, views: before }, view.today)
  const now = deriveProduction({ ...base, views: after }, view.today)
  return { flagged: productionDiff(was, now).newFlagged.length, dropped: was.pendingIds.filter((id) => !now.pendingIds.includes(id)).length }
}

export function impactText(i: { flagged: number; dropped: number }): string | null {
  const parts = [i.flagged > 0 && `SKU ที่ยืนยันผลิตแล้ว ${i.flagged} SKU จะขึ้นคำเตือนให้ตรวจสอบ`, i.dropped > 0 && `SKU ที่รอยืนยันผลิต ${i.dropped} SKU จะหายจากแท็บรอผลิต`].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}
