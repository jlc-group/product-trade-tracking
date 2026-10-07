import { diffDays, type ISODate, type User } from '@flowtrade/shared'
import {
  CalendarClockIcon,
  CircleSlashIcon,
  ClipboardCheckIcon,
  EllipsisIcon,
  PanelRightOpenIcon,
  PencilIcon,
  PlusIcon,
  PresentationIcon,
  RotateCcwIcon,
  SendIcon,
  Trash2Icon,
  TriangleAlertIcon,
  Undo2Icon,
  type LucideIcon,
} from 'lucide-react'
import { useState, type MouseEvent, type ReactNode } from 'react'
import { StoreChip, StoreLogo } from '@/components/common/badges'
import { AvatarStack, UserAvatar } from '@/components/common/user-avatar'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ERR, gateTip, OPEN_STAGES, rowDetail, STAGE_ORDER, stageLabel, withCount } from './model'
import { canChangeEvent } from './permissions'
import { StageBadge, StageProgress, StageTile, StageTrack } from './stage-badge'
import type { PresentationAction, PresentationModel, PresentationStage, RowDetail, TrackView } from './types'

type OnAction = (a: PresentationAction) => void

// Rows are subgrids of this template from @3xl, so the column header lines up with every row.
// The first / last tracks include the rows' px-4 (a subgrid's padding counts against its edge tracks).
const COLS = '@3xl:grid @3xl:grid-cols-[13rem_7rem_minmax(0,1fr)_auto_2.75rem] @3xl:gap-x-3'
const ROW = 'grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 px-4 @3xl:col-span-5 @3xl:grid-cols-subgrid'

/** Disabled control with an explanation on hover / focus; below @3xl it's also printed under it, since tooltips don't open on touch. */
function WithTip({ tip, children, className }: { tip: string | null; children: ReactNode; className?: string }) {
  if (!tip) return <>{children}</>
  return (
    <span className={cn('inline-grid justify-items-start gap-1', className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent>{tip}</TooltipContent>
      </Tooltip>
      <span className="text-xs text-muted-foreground @3xl:hidden">{tip}</span>
    </span>
  )
}

function usersOf(model: PresentationModel, ids: string[]) {
  return ids.map((id) => model.usersById.get(id)).filter((u): u is User => !!u)
}

/** "📅 10 ต.ค. 69" with the DueChip colouring (overdue red, within 3 days amber). */
function DueDateChip({ date, today }: { date: ISODate; today: ISODate }) {
  const left = diffDays(today, date)
  return (
    <span
      className={cn(
        'tabular inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-xs whitespace-nowrap',
        left < 0 ? 'bg-danger-soft font-medium text-danger' : left <= 3 ? 'bg-warning-soft text-warning-foreground' : 'text-muted-foreground',
      )}
    >
      <CalendarClockIcon className="size-3.5" aria-hidden />
      {formatDate(date)}
    </span>
  )
}

function Warning({ warning }: { warning: NonNullable<RowDetail['warning']> }) {
  return (
    <span className={cn('inline-flex items-start gap-1 text-xs font-medium', warning.tone === 'danger' ? 'text-danger' : 'text-warning-foreground')}>
      <TriangleAlertIcon className="mt-px size-3.5 shrink-0" aria-hidden />
      {warning.text}
    </span>
  )
}

/** Stage chip (@3xl only — below it sits next to the StageTrack) and the derived detail lines. */
function StatusLines({ view, model }: { view: TrackView; model: PresentationModel }) {
  const d = rowDetail(view, model.today, model.storeWord)
  const presenters = usersOf(model, d.presenterIds)
  const preparer = d.due?.preparerId ? model.usersById.get(d.due.preparerId) : undefined
  return (
    <div className="col-span-2 min-w-0 space-y-1 @3xl:col-span-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <StageBadge stage={view.stage} round={view.round} className="hidden @3xl:inline-flex" />
        {d.main ? (
          <span className={cn('text-xs', d.mainTone === 'brand' ? 'font-medium text-brand' : 'text-muted-foreground')}>{d.main}</span>
        ) : (
          d.warning && <Warning warning={d.warning} />
        )}
        {presenters.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <span className="sr-only">ผู้นำเสนอ</span>
            <AvatarStack users={presenters} size="xs" />
          </span>
        )}
      </div>
      {d.main && d.warning && <Warning warning={d.warning} />}
      {d.quote && (
        <p className="line-clamp-1 text-xs break-words text-muted-foreground" title={d.quote}>
          {d.quote}
        </p>
      )}
      {d.due && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {d.due.date ? (
            <>
              <span>ต้องส่งภายใน</span>
              <DueDateChip date={d.due.date} today={model.today} />
            </>
          ) : (
            <span>ยังไม่กำหนดวันส่ง</span>
          )}
          {preparer && (
            <span className="inline-flex items-center gap-1">
              · ผู้เตรียม
              <UserAvatar user={preparer} size="xs" />
            </span>
          )}
        </div>
      )}
    </div>
  )
}

const NEXT_STEP: Partial<Record<PresentationStage, { label: string; icon: LucideIcon }>> = {
  AWAITING: { label: 'บันทึกว่านำเสนอแล้ว', icon: PresentationIcon },
  IN_REVIEW: { label: 'บันทึกผลพิจารณา', icon: ClipboardCheckIcon },
  NEEDS_INFO: { label: 'บันทึกการส่งข้อมูลเพิ่ม', icon: SendIcon },
}

function NextStepButton({ view, model, onAction }: { view: TrackView; model: PresentationModel; onAction: OnAction }) {
  const id = view.track.id
  if (view.stage === 'REJECTED') {
    const tip = model.gateOpen ? null : gateTip(model.progress)
    return (
      <WithTip tip={tip} className="w-full justify-items-stretch @3xl:w-auto">
        <Button size="sm" variant="outline" className="w-full @3xl:w-auto" disabled={!!tip} onClick={() => onAction({ kind: 'repitch', trackId: id })}>
          <RotateCcwIcon /> นำเสนอใหม่อีกครั้ง
        </Button>
      </WithTip>
    )
  }
  const step = NEXT_STEP[view.stage]
  if (!step) return null
  const Icon = step.icon
  return (
    <Button size="sm" className="w-full @3xl:w-auto" onClick={() => onAction({ kind: 'record', trackIds: [id] })}>
      <Icon /> {step.label}
    </Button>
  )
}

function MenuAction({
  icon: Icon,
  label,
  blocked,
  destructive,
  onSelect,
}: {
  icon: LucideIcon
  label: string
  /** Why it's unavailable — shows the item disabled with this line under it. */
  blocked: string | null
  destructive?: boolean
  onSelect: () => void
}) {
  if (blocked)
    return (
      <DropdownMenuItem disabled className="items-start">
        <Icon className="mt-0.5" />
        <span className="grid gap-0.5">
          <span>{label}</span>
          <span className="text-xs text-muted-foreground">{blocked}</span>
        </span>
      </DropdownMenuItem>
    )
  return (
    <DropdownMenuItem variant={destructive ? 'destructive' : 'default'} onSelect={onSelect}>
      <Icon /> {label}
    </DropdownMenuItem>
  )
}

/** Row ⋯ menu: only the items that apply to this track; ones that need the owner / a manager stay visible but disabled. */
function TrackMenu({ view, model, onAction }: { view: TrackView; model: PresentationModel; onAction: OnAction }) {
  const word = model.storeWord
  const trackId = view.track.id
  const perms = { canRecord: model.canRecord, canFinalize: model.canFinalize }
  const editable = model.canRecord ? view.latestEditable : null
  const revertable = model.canRecord ? view.lastRevertable : null
  const open = OPEN_STAGES.includes(view.stage)

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`การจัดการ ${view.store.name}`}>
          <EllipsisIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={() => onAction({ kind: 'openStore', storeId: view.store.id })}>
          <PanelRightOpenIcon /> ดูรายละเอียดและไทม์ไลน์
        </DropdownMenuItem>
        {model.canRecord && view.stage === 'AWAITING' && (
          <DropdownMenuItem onSelect={() => onAction({ kind: 'schedule', trackId })}>
            <CalendarClockIcon /> นัดวันนำเสนอ / แก้ไขนัด
          </DropdownMenuItem>
        )}
        {editable && (
          <MenuAction
            icon={PencilIcon}
            label="แก้ไขรายละเอียดล่าสุด"
            blocked={canChangeEvent(editable.kind, perms) ? null : ERR.finalOnly}
            onSelect={() => onAction({ kind: 'edit', trackId, eventId: editable.id })}
          />
        )}
        {revertable && (
          <MenuAction
            icon={Undo2Icon}
            label="ย้อนกลับขั้นก่อนหน้า"
            blocked={canChangeEvent(revertable.kind, perms) ? null : ERR.finalOnly}
            onSelect={() => onAction({ kind: 'revert', trackId })}
          />
        )}
        {model.canRecord && (
          <>
            <DropdownMenuSeparator />
            {open && (
              <MenuAction
                icon={CircleSlashIcon}
                label={`ยุติการนำเสนอ${word}นี้`}
                blocked={model.canFinalize ? null : ERR.finalOnly}
                onSelect={() => onAction({ kind: 'withdraw', trackId })}
              />
            )}
            <MenuAction
              icon={Trash2Icon}
              label={`นำ${word}นี้ออกจากชุด`}
              destructive
              blocked={view.untouched ? null : ERR.removeTouched}
              onSelect={() => onAction({ kind: 'remove', trackId })}
            />
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function StoreTrackRow({ view, model, onAction, showPackage }: { view: TrackView; model: PresentationModel; onAction: OnAction; showPackage: boolean }) {
  const live = view.inProposal
  const openSheet = () => onAction({ kind: 'openStore', storeId: view.store.id })
  const actions = live && model.canRecord
  const nextStep = actions ? <NextStepButton view={view} model={model} onAction={onAction} /> : null

  // The whole row opens the sheet, except its own controls and anything portaled out of it (menus, tooltips).
  const onRowClick = (e: MouseEvent<HTMLLIElement>) => {
    const target = e.target as HTMLElement
    const control = target.closest('button, a, [role="menuitem"], [tabindex]')
    if (!e.currentTarget.contains(target) || (control && e.currentTarget.contains(control))) return
    openSheet()
  }

  return (
    <li onClick={onRowClick} className={cn(ROW, 'cursor-pointer py-3 transition-colors hover:bg-accent/30 @3xl:items-center', !live && 'opacity-60')}>
      <div className="flex min-w-0 items-center gap-3">
        <StoreLogo store={view.store} size="md" />
        <div className="min-w-0">
          <button
            type="button"
            onClick={openSheet}
            className="block max-w-full truncate rounded-sm text-left text-sm font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {view.store.name}
          </button>
          {(view.plan.contactName || showPackage || !live) && (
            <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
              {view.plan.contactName && <span className="max-w-full truncate">Buyer: {view.plan.contactName}</span>}
              {showPackage && view.packageSeq > 0 && <span className="tabular rounded border px-1 text-[11px] leading-4">ชุด #{view.packageSeq}</span>}
              {!live && <span className="rounded bg-muted px-1 text-[11px] leading-4">ไม่อยู่ในโปรเจกต์แล้ว</span>}
            </div>
          )}
        </div>
      </div>

      <div className="col-start-2 row-start-1 flex items-center justify-end @3xl:col-start-5">{live && <TrackMenu view={view} model={model} onAction={onAction} />}</div>

      <div className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1 @3xl:col-span-1">
        <StageTrack stage={view.stage} round={view.round} withdrawnFrom={view.withdrawnFrom} storeName={view.store.name} word={model.storeWord} />
        <StageBadge stage={view.stage} round={view.round} className="@3xl:hidden" />
      </div>

      <StatusLines view={view} model={model} />

      {nextStep && <div className="col-span-2 @3xl:col-span-1">{nextStep}</div>}
    </li>
  )
}

/** "ผลพิจารณารายห้าง": progress bar, stage tiles (filters), one row per store (proposal order), and the untracked strip. */
export function StoreBoard({ model, onAction }: { model: PresentationModel; onAction: OnAction }) {
  const { summary, views, storeWord: word } = model
  const [filter, setFilter] = useState<PresentationStage | null>(null)
  // Tracks of stores that left the proposal only show under "ทั้งหมด" (they're not counted anywhere).
  const rows = filter ? views.filter((v) => v.inProposal && v.stage === filter) : views
  const canCreate = model.canRecord && model.gateOpen
  const createTip = model.gateOpen ? null : gateTip(model.progress)
  const stages = STAGE_ORDER.filter((s) => s !== 'WITHDRAWN' || summary.byStage.WITHDRAWN > 0 || filter === 'WITHDRAWN')
  const untracked = summary.untracked
  const storesIn = (s: PresentationStage) => views.filter((v) => v.inProposal && v.stage === s).map((v) => v.store)

  return (
    <section aria-labelledby="presentation-board-title" className="@container overflow-hidden rounded-xl border bg-card">
      <div className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <div className="space-y-0.5">
            <h2 id="presentation-board-title" className="text-base font-semibold">
              ผลพิจารณาราย{word}
            </h2>
            <p className="text-sm text-muted-foreground">
              ได้ผลแล้ว <span className="tabular">{summary.finalCount}</span> จาก <span className="tabular">{summary.storesTotal}</span> {word}
            </p>
          </div>
          <p className="text-sm">
            <span className="tabular text-2xl font-semibold text-success">{summary.passed}</span>
            <span className="text-muted-foreground">
              {' '}
              / <span className="tabular">{summary.storesTotal}</span> {word}ผ่าน
            </span>
          </p>
        </div>
        <StageProgress items={model.items} />
        <div role="group" aria-label="กรองตามสถานะการนำเสนอ" className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {stages.map((s) => (
            <StageTile key={s} stage={s} stores={storesIn(s)} active={filter === s} onClick={() => setFilter(filter === s ? null : s)} />
          ))}
        </div>
        {filter && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            แสดงเฉพาะ “{stageLabel(filter)}”
            <Button variant="link" size="xs" className="h-auto px-0" onClick={() => setFilter(null)}>
              แสดงทั้งหมด
            </Button>
          </p>
        )}
      </div>

      {rows.length > 0 ? (
        <div className={COLS}>
          <div aria-hidden className={cn(ROW, 'hidden border-y bg-muted/40 py-2 text-xs text-muted-foreground @3xl:grid')}>
            <span>{word}</span>
            <span>นำเสนอ · พิจารณา · ผล</span>
            <span>สถานะ</span>
            <span>ถัดไป</span>
            <span />
          </div>
          <ul className="divide-y border-t @3xl:col-span-5 @3xl:grid @3xl:grid-cols-subgrid @3xl:border-t-0">
            {rows.map((v) => (
              <StoreTrackRow key={v.track.id} view={v} model={model} onAction={onAction} showPackage={model.packages.length > 1} />
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1 border-t px-4 py-8 text-center text-sm text-muted-foreground">
          <p>ไม่มี{word}ในสถานะนี้</p>
          <Button variant="link" size="sm" onClick={() => setFilter(null)}>
            ดูทั้งหมด
          </Button>
        </div>
      )}

      {untracked.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-dashed bg-muted/30 px-4 py-3 text-sm">
          <span className="text-muted-foreground">ยังไม่ได้อยู่ในชุดนำเสนอ:</span>
          {untracked.map((s) => (
            <StoreChip key={s.id} store={s} className="max-w-full" />
          ))}
          {model.canRecord && (
            <WithTip tip={createTip} className="sm:ml-auto">
              <Button variant="outline" size="sm" disabled={!canCreate} onClick={() => onAction({ kind: 'create', storeIds: untracked.map((s) => s.id) })} className={cn(!createTip && 'sm:ml-auto')}>
                <PlusIcon /> สร้างชุดนำเสนอ{withCount(untracked.length, word)}
              </Button>
            </WithTip>
          )}
        </div>
      )}
    </section>
  )
}
