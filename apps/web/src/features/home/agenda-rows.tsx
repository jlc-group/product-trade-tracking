import { diffDays, storeWord, type ISODate } from '@flowtrade/shared'
import { BadgeCheckIcon, CircleXIcon, FactoryIcon, PresentationIcon, TriangleAlertIcon, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import type { BuyerAgendaItem, ProductionAction, ProductionAgendaItem, ProposalAgendaItem } from '@/api'
import { StoreLogo, StoreLogos } from '@/components/common/badges'
import { Button } from '@/components/ui/button'
import { relativeTo, rowDetail, STAGE_META, storeNamesText, TONE_SOFT, TONE_TEXT } from '@/features/presentation/model'
import { StageBadge, StageIcon } from '@/features/presentation/stage-badge'
import type { Tone } from '@/features/presentation/types'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { buyerTitle, closeOutResult, productionTitle, proposalTitle } from './agenda-copy'
import { buyerHref, buyerRowHref, productionHref, proposalStepHref } from './links'
import { shortName, type UsersById } from './users'

interface Line {
  text: string
  tone: Tone | null
  warn?: boolean
}

/** "ผู้เตรียม: มิว" / "ผู้นำเสนอ: จอย, เมย์" / "เจ้าของ: จอย" (nobody named). */
function responsibleText(item: BuyerAgendaItem, users: UsersById) {
  if (item.responsibleIds.length === 0) return `เจ้าของ: ${shortName(users, item.proposal.ownerId)}`
  const names = item.responsibleIds.map((id) => shortName(users, id)).join(', ')
  return `${item.view.stage === 'NEEDS_INFO' ? 'ผู้เตรียม' : 'ผู้นำเสนอ'}: ${names}`
}

/** The detail lines of a buyer step (§3.3 table). */
function detailLines(item: BuyerAgendaItem, today: ISODate, users: UsersById): Line[] {
  const d = rowDetail(item.view, today, storeWord(item.proposal.channel))
  const warning: Line | null = d.warning ? { text: d.warning.text, tone: d.warning.tone, warn: true } : null
  switch (item.action) {
    case 'sendInfo': {
      const due = item.view.openRequest?.dueDate
      const dueLine: Line = warning ?? { text: due ? `กำหนดส่ง ${formatDate(due)} · ${relativeTo(due, today)}` : 'ยังไม่กำหนดวันส่ง', tone: null }
      return d.quote ? [{ text: d.quote, tone: null }, dueLine] : [dueLine]
    }
    case 'present': {
      const presenters = item.view.plan.presenterIds.map((id) => shortName(users, id)).join(', ')
      const text = [d.main, presenters && `ผู้นำเสนอ ${presenters}`].filter(Boolean).join(' · ')
      return text ? [{ text, tone: d.mainTone === 'brand' ? 'brand' : null }] : []
    }
    case 'confirmPresented':
      return warning ? [warning] : []
    case 'schedule':
      return [{ text: `อยู่ในชุดนำเสนอ #${item.packageSeq} · ยังไม่ได้นัด`, tone: null }]
    case 'followUp':
      return [d.main && { text: d.main, tone: null }, warning].filter((l): l is Line => !!l)
  }
}

/** Launch chip on buyer rows when launch is ≤ 14 days away (or passed). */
function launchChip(targetDate: ISODate, today: ISODate): Line | null {
  const d = diffDays(today, targetDate)
  if (d > 14) return null
  if (d > 0) return { text: `วางขายอีก ${d} วัน`, tone: d <= 7 ? 'danger' : 'warning' }
  return { text: d === 0 ? 'วางขายวันนี้' : `เลยวันวางขาย ${-d} วัน`, tone: 'danger' }
}

const NOTIFY_WHEN: Record<BuyerAgendaItem['action'], string> = {
  sendInfo: 'เมื่อส่งแล้ว',
  present: 'เมื่อนำเสนอแล้ว',
  confirmPresented: 'เมื่อนำเสนอแล้ว',
  schedule: 'เมื่อนัดได้แล้ว',
  followUp: 'เมื่อได้ผลแล้ว',
}

function buyerButtons(item: BuyerAgendaItem): { label: string; href: string; ghost?: boolean }[] {
  const single = item.tracks.length === 1
  switch (item.action) {
    case 'sendInfo':
      return [{ label: 'บันทึกการส่งข้อมูล', href: buyerHref(item, 'record') }]
    case 'present':
      return [{ label: 'บันทึกว่านำเสนอแล้ว', href: buyerHref(item, 'record') }]
    case 'confirmPresented':
      return [
        { label: 'บันทึกว่านำเสนอแล้ว', href: buyerHref(item, 'record') },
        ...(single ? [{ label: 'เลื่อนนัด', href: buyerHref(item, 'schedule'), ghost: true }] : []),
      ]
    case 'schedule':
      return [single ? { label: 'นัดวันนำเสนอ', href: buyerHref(item, 'schedule') } : { label: 'ไปแท็บนำเสนอ', href: `/proposals/${item.proposal.id}?tab=present` }]
    case 'followUp':
      return [{ label: 'บันทึกผล', href: buyerHref(item, 'record') }]
  }
}

function DetailLine({ line, clamp }: { line: Line; clamp?: boolean }) {
  return (
    <p className={cn('flex items-start gap-1 text-xs', line.tone ? cn(TONE_TEXT[line.tone], 'font-medium') : 'text-muted-foreground')}>
      {line.warn && <TriangleAlertIcon className="mt-px size-3.5 shrink-0" aria-hidden />}
      <span className={cn('min-w-0 break-words', clamp && 'line-clamp-2')}>{line.text}</span>
    </p>
  )
}

/**
 * One buyer step (send info, present, schedule, follow up) of one or more stores. The title opens the store sheet;
 * the button deep-links straight into the record / schedule dialog. `readOnly` (Monitor): no buttons, and the
 * responsible person is always named.
 */
export function BuyerAgendaRow({ item, today, users, readOnly = false }: { item: BuyerAgendaItem; today: ISODate; users: UsersById; readOnly?: boolean }) {
  const { proposal, view } = item
  const stores = item.tracks.map((t) => t.store)
  const lines = detailLines(item, today, users)
  const launch = launchChip(proposal.targetDate, today)
  const tag = readOnly ? responsibleText(item, users) : item.team ? `ทีม · ${responsibleText(item, users)}` : null
  const overdue = item.bucket === 'overdue'
  const buttons = readOnly ? [] : item.canRecord ? buyerButtons(item) : [{ label: 'ดูรายละเอียด', href: buyerRowHref(item), ghost: true }]

  return (
    <li className="relative flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50 sm:px-4">
      <span className="relative mt-0.5 shrink-0">
        {stores.length > 1 ? <StoreLogos stores={stores} size="md" max={2} /> : <StoreLogo store={stores[0]} size="md" />}
        <span className={cn('absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full ring-2 ring-card', TONE_SOFT[STAGE_META[view.stage].tone])}>
          <StageIcon stage={view.stage} className="size-2.5" />
        </span>
      </span>

      <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-full space-y-1 sm:basis-0">
          <Link
            to={buyerRowHref(item)}
            className="line-clamp-2 text-sm font-medium outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring/60 focus-visible:after:ring-inset"
          >
            {buyerTitle(item)}
          </Link>
          {lines.map((line, i) => (
            <DetailLine key={i} line={line} clamp={!line.tone} />
          ))}
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <StageBadge stage={view.stage} round={view.round} className="h-5 px-2 text-[11px]" />
            <span className="min-w-0 truncate">
              <span className="tabular font-medium text-foreground/70">{proposal.code}</span> {proposal.title}
            </span>
            {tag && <span className="rounded bg-muted px-1.5 leading-5 font-medium text-foreground/80">{tag}</span>}
            {launch && <span className={cn('tabular rounded px-1.5 leading-5 font-medium whitespace-nowrap', TONE_SOFT[launch.tone ?? 'muted'])}>{launch.text}</span>}
          </div>
          {!readOnly && !item.canRecord && (
            <p className="text-xs text-muted-foreground">
              บันทึกได้เฉพาะทีมโปรเจกต์ — แจ้งคุณ{shortName(users, proposal.ownerId)} {NOTIFY_WHEN[item.action]}
            </p>
          )}
        </div>

        {buttons.length > 0 && (
          <div className="relative z-10 ml-auto flex shrink-0 items-center gap-1.5">
            {buttons.map((b) => (
              <Button key={b.label} asChild size="sm" variant={b.ghost ? 'ghost' : overdue ? 'default' : 'outline'}>
                <Link to={b.href}>{b.label}</Link>
              </Button>
            ))}
          </div>
        )}
      </div>
    </li>
  )
}

const STEP_LOOK: Record<'createPackage' | 'LISTED' | 'NOT_LISTED', { icon: LucideIcon; tone: Tone }> = {
  createPackage: { icon: PresentationIcon, tone: 'brand' },
  LISTED: { icon: BadgeCheckIcon, tone: 'success' },
  NOT_LISTED: { icon: CircleXIcon, tone: 'muted' },
}

/** A project-level step: create the first / next presentation package, or close the project out. */
export function ProposalAgendaRow({ item }: { item: ProposalAgendaItem }) {
  const { proposal, stores, prep } = item
  const word = storeWord(proposal.channel)
  let look = STEP_LOOK.createPackage
  let detail: string
  let label: string
  if (item.action === 'createPackage') {
    const untracked = stores.filter((s) => !s.stage).map((s) => s.store.name)
    detail = `งานเตรียมครบ ${prep.done}/${prep.total} · ${storeNamesText(untracked, word)}`
    label = 'สร้างชุดนำเสนอ'
  } else {
    const listed = closeOutResult(stores) === 'LISTED'
    const passed = stores.filter((s) => s.stage === 'PASSED').length
    const rejected = stores.filter((s) => s.stage === 'REJECTED').length
    look = listed ? STEP_LOOK.LISTED : STEP_LOOK.NOT_LISTED
    if (item.openTasks > 0) {
      detail = `ทำงานเตรียมที่เหลือ ${item.openTasks} งานก่อนปิดโปรเจกต์`
      label = 'ดูงานที่เหลือ'
    } else {
      detail = `ได้ลง ${passed} จาก ${stores.length} ${word}${rejected ? ` (ไม่ผ่าน ${rejected})` : ''}`
      label = listed ? 'ไปปิดโปรเจกต์' : 'ไปที่แท็บนำเสนอ'
    }
  }
  const Icon = look.icon

  return (
    <li className="relative flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50 sm:px-4">
      <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg', TONE_SOFT[look.tone])}>
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-full space-y-0.5 sm:basis-0">
          <Link
            to={`/proposals/${proposal.id}?tab=present`}
            className="line-clamp-2 text-sm font-medium outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring/60 focus-visible:after:ring-inset"
          >
            {proposalTitle(item)}
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            {proposal.title} · <span className="tabular">{proposal.code}</span>
          </p>
          <p className="text-xs text-muted-foreground">{detail}</p>
        </div>
        <Button asChild size="sm" variant="outline" className="relative z-10 ml-auto">
          <Link to={proposalStepHref(item)}>{label}</Link>
        </Button>
      </div>
    </li>
  )
}

const PRODUCTION_BUTTON: Record<ProductionAction, string> = {
  confirmProduction: 'ยืนยันเริ่มผลิต',
  fillQuantity: 'กรอกจำนวน',
  deliverProduction: 'บันทึกการผลิต',
  reviewProduction: 'ตรวจสอบ',
}

/** A "รอผลิต" step: confirm the passed SKUs, fill their quantities, deliver before the deadline, or review a changed pass. */
export function ProductionAgendaRow({ item, today }: { item: ProductionAgendaItem; today: ISODate }) {
  const { proposal } = item
  const overdue = item.bucket === 'overdue'
  const tone: Tone = item.action === 'deliverProduction' ? (overdue ? 'danger' : 'info') : overdue && item.action !== 'reviewProduction' ? 'danger' : 'warning'
  const due = `กำหนดส่ง ${formatDate(item.deadline)} · ${relativeTo(item.deadline, today)}`
  const detail =
    item.action === 'reviewProduction'
      ? `ผลผ่าน Buyer หรือ${storeWord(proposal.channel)}ที่ผ่านเปลี่ยนไปหลังยืนยันผลิต — เลือกดำเนินการต่อ แก้จำนวน หรือยกเลิก`
      : item.action !== 'deliverProduction' && item.missingQty > 0
        ? `ยังไม่ได้กรอกจำนวน ${item.missingQty} SKU · ${due}`
        : due

  return (
    <li className="relative flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50 sm:px-4">
      <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg', TONE_SOFT[tone])}>
        <FactoryIcon className="size-4" aria-hidden />
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-full space-y-0.5 sm:basis-0">
          <Link
            to={`/proposals/${proposal.id}?tab=production`}
            className="line-clamp-2 text-sm font-medium outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring/60 focus-visible:after:ring-inset"
          >
            {productionTitle(item)}
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            {proposal.title} · <span className="tabular">{proposal.code}</span>
          </p>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {item.stores.length > 0 && (
              <span className="inline-flex items-center">
                <StoreLogos stores={item.stores} size="sm" max={4} logoClassName="h-5 min-w-5 rounded px-0.5 text-[8px]" />
                <span className="sr-only">{item.stores.map((s) => s.name).join(', ')}</span>
              </span>
            )}
            <span className={cn('min-w-0 break-words', overdue && item.action !== 'reviewProduction' ? 'font-medium text-danger' : 'text-muted-foreground')}>{detail}</span>
          </div>
        </div>
        <Button asChild size="sm" variant={overdue ? 'default' : 'outline'} className="relative z-10 ml-auto">
          <Link to={productionHref(item)}>{PRODUCTION_BUTTON[item.action]}</Link>
        </Button>
      </div>
    </li>
  )
}
