import { diffDays, type User } from '@flowtrade/shared'
import {
  CalendarClockIcon,
  ClipboardCheckIcon,
  InfoIcon,
  PencilIcon,
  PresentationIcon,
  RotateCcwIcon,
  RotateCwIcon,
  SearchXIcon,
  SendIcon,
  TableIcon,
  TriangleAlertIcon,
  Undo2Icon,
} from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { StoreLogo } from '@/components/common/badges'
import { AvatarStack, UserAvatar } from '@/components/common/user-avatar'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Callout } from '@/features/wizard/choice-card'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ERR, eventQuote, gateTip, isFinalStage, rejectReasonLabel, relativeTo, rowDetail, STAGE_META, stageLong, TONE_TEXT } from './model'
import { canChangeEvent } from './permissions'
import { StageBadge, StageIcon, StageTrack } from './stage-badge'
import { TrackTimeline } from './track-timeline'
import type { PackageTask, PresentationAction, PresentationModel, PresentationStage, RowDetail, TrackView } from './types'

interface StoreTrackSheetProps {
  model: PresentationModel
  storeId: string | null
  onClose: () => void
  onAction: (action: PresentationAction) => void
  onOpenTask: (taskId: string) => void
}

/** Right-side store sheet (full screen on phones), driven by ?store=<id>: status, plan, bundled tasks and timeline. */
export function StoreTrackSheet({ model, storeId, onClose, onAction, onOpenTask }: StoreTrackSheetProps) {
  // Keep the last store while the sheet animates closed, so the body doesn't flash "not found".
  const [shownId, setShownId] = useState(storeId)
  if (storeId && storeId !== shownId) setShownId(storeId)
  const id = storeId ?? shownId
  const view = id ? (model.viewByStore.get(id) ?? null) : null

  return (
    <Sheet open={!!storeId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[520px]">
        {view ? (
          <SheetBody key={view.track.id} view={view} model={model} onAction={onAction} onOpenTask={onOpenTask} />
        ) : (
          <SheetFallback model={model} onClose={onClose} />
        )}
      </SheetContent>
    </Sheet>
  )
}

function SheetFallback({ model, onClose }: { model: PresentationModel; onClose: () => void }) {
  if (model.isLoading) {
    return (
      <div className="space-y-4 p-4 pr-12" aria-busy="true">
        <SheetTitle className="sr-only">กำลังโหลดข้อมูลการนำเสนอ</SheetTitle>
        <SheetDescription className="sr-only">กำลังโหลดสถานะและไทม์ไลน์ของ{model.storeWord}</SheetDescription>
        <div className="flex items-center gap-3">
          <Skeleton className="size-11 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    )
  }
  const failed = model.isError
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">{failed ? <TriangleAlertIcon className="size-5" /> : <SearchXIcon className="size-5" />}</div>
      <SheetTitle>{failed ? 'โหลดข้อมูลการนำเสนอไม่สำเร็จ' : `ไม่พบ${model.storeWord}นี้ในการนำเสนอ`}</SheetTitle>
      <SheetDescription className="max-w-xs">{failed ? 'ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง' : 'อาจถูกนำออกจากชุดแล้ว'}</SheetDescription>
      <div className="flex flex-wrap justify-center gap-2">
        {failed && (
          <Button variant="outline" onClick={() => model.refetch()}>
            <RotateCwIcon /> ลองอีกครั้ง
          </Button>
        )}
        <Button variant="outline" onClick={onClose}>
          ปิด
        </Button>
      </div>
    </div>
  )
}

function SheetBody({ view, model, onAction, onOpenTask }: { view: TrackView; model: PresentationModel; onAction: (a: PresentationAction) => void; onOpenTask: (taskId: string) => void }) {
  const timelineId = useId()
  const cancelled = model.proposal.status === 'CANCELLED'
  const meta = [view.packageSeq ? `ชุดนำเสนอ #${view.packageSeq}` : null, `รอบที่ ${view.round}`].filter(Boolean).join(' · ')

  return (
    <>
      <SheetHeader className="border-b p-4 pr-12">
        <div className="flex items-center gap-3">
          <StoreLogo store={view.store} size="lg" />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <SheetTitle className="min-w-0 truncate text-lg leading-snug font-semibold">{view.store.name}</SheetTitle>
              <StageBadge stage={view.stage} round={view.round} />
            </div>
            <SheetDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span>{meta}</span>
              {!view.inProposal && <span className="inline-flex h-5 items-center rounded-full bg-muted px-1.5 text-[11px] font-medium">ไม่อยู่ในโปรเจกต์แล้ว</span>}
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        {cancelled && (
          <Callout tone="info" icon={<InfoIcon />}>
            โปรเจกต์ถูกยกเลิก — ดูประวัติการนำเสนอได้อย่างเดียว
          </Callout>
        )}

        <StageTrack stage={view.stage} round={view.round} withdrawnFrom={view.withdrawnFrom} size="lg" sub={trackSubLines(view)} storeName={view.store.name} word={model.storeWord} />

        <StatusBox view={view} model={model} onAction={onAction} />

        <PlanSection view={view} model={model} onAction={onAction} />

        <BundleSection view={view} model={model} onOpenTask={onOpenTask} />

        <section aria-labelledby={timelineId}>
          <h3 id={timelineId} className="mb-3 text-sm font-semibold">
            ไทม์ไลน์
          </h3>
          <TrackTimeline view={view} model={model} onEdit={(eventId) => onAction({ kind: 'edit', trackId: view.track.id, eventId })} />
        </section>
      </div>
    </>
  )
}

/** Lines under นำเสนอ · พิจารณา · ผล. */
function trackSubLines(view: TrackView): [ReactNode, ReactNode, ReactNode] {
  const first = view.stage === 'AWAITING' ? (view.plan.meetingDate ? `นัด ${formatDate(view.plan.meetingDate)}` : 'ยังไม่ได้นัด') : view.presentedDate ? formatDate(view.presentedDate) : '—'
  const second = view.needsInfoCount > 0 ? `↻ ขอข้อมูลเพิ่ม ${view.needsInfoCount} ครั้ง` : '—'
  const third = view.outcome && view.stage !== 'WITHDRAWN' ? formatDate(view.outcome.date) : '—'
  return [first, second, third]
}

// ---------- status box ----------

const BOX: Record<PresentationStage, string> = {
  AWAITING: 'border-brand/20 bg-brand-soft',
  IN_REVIEW: 'border-info/20 bg-info-soft',
  NEEDS_INFO: 'border-warning/30 bg-warning-soft',
  PASSED: 'border-success/25 bg-success-soft',
  REJECTED: 'border-danger/20 bg-danger-soft',
  WITHDRAWN: 'border-border bg-muted/50',
}

function StatusBox({ view, model, onAction }: { view: TrackView; model: PresentationModel; onAction: (a: PresentationAction) => void }) {
  const detail = rowDetail(view, model.today, model.storeWord)
  const label = view.stage === 'NEEDS_INFO' ? 'Buyer ต้องการข้อมูลเพิ่ม' : stageLong(view.stage, model.storeWord)
  return (
    <section aria-label="สถานะปัจจุบัน" className={cn('space-y-2 rounded-lg border p-3', BOX[view.stage])}>
      <p className={cn('flex items-center gap-1.5 text-xs font-medium', TONE_TEXT[STAGE_META[view.stage].tone])}>
        <StageIcon stage={view.stage} className="size-3.5 shrink-0" />
        {label}
      </p>
      <StatusDetail view={view} model={model} detail={detail} />
      <StatusActions view={view} model={model} onAction={onAction} />
    </section>
  )
}

function StatusDetail({ view, model, detail }: { view: TrackView; model: PresentationModel; detail: RowDetail }) {
  const main = detail.main && <p className={cn('text-sm', detail.mainTone === 'brand' ? 'font-medium text-brand' : 'text-foreground')}>{detail.main}</p>
  const warning = detail.warning && <Warning text={detail.warning.text} tone={detail.warning.tone} />
  const o = view.outcome

  switch (view.stage) {
    case 'NEEDS_INFO': {
      const r = view.openRequest
      return (
        <>
          {r && <p className="text-sm break-words whitespace-pre-line text-foreground">{r.request}</p>}
          <DueLine due={r?.dueDate ?? null} preparerId={r?.preparerId ?? null} model={model} />
          {warning}
        </>
      )
    }
    case 'PASSED': {
      const quote = o && eventQuote(o)
      return (
        <>
          {main}
          {quote && <p className="text-sm break-words whitespace-pre-line text-muted-foreground">{quote}</p>}
        </>
      )
    }
    case 'REJECTED':
      return (
        <>
          {main}
          {o?.kind === 'REJECTED' && (
            <>
              <p className="text-sm font-medium text-foreground">เหตุผล: {rejectReasonLabel(o.reason, model.storeWord)}</p>
              <p className="text-sm break-words whitespace-pre-line text-foreground">“{o.detail}”</p>
            </>
          )}
        </>
      )
    case 'WITHDRAWN':
      return (
        <>
          {main}
          {detail.quote && <p className="text-sm break-words text-foreground">{detail.quote}</p>}
        </>
      )
    default:
      return (
        <>
          {main}
          {warning}
        </>
      )
  }
}

function Warning({ text, tone }: { text: string; tone: 'warning' | 'danger' }) {
  return (
    <p className={cn('flex items-start gap-1 text-xs font-medium', tone === 'danger' ? 'text-danger' : 'text-warning-foreground')}>
      <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
      {text}
    </p>
  )
}

/** "ต้องส่งภายใน 📅 10 ต.ค. 69 · อีก 4 วัน · ผู้เตรียม (ป) ป๊อป" */
function DueLine({ due, preparerId, model }: { due: string | null; preparerId: string | null; model: PresentationModel }) {
  const overdue = !!due && due < model.today
  const soon = !!due && !overdue && diffDays(model.today, due) <= 3
  const preparer = preparerId ? model.usersById.get(preparerId) : undefined
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
      {due ? (
        <>
          <span>ต้องส่งภายใน</span>
          <span className={cn('tabular inline-flex items-center gap-1 font-medium', overdue ? 'text-danger' : soon ? 'text-warning-foreground' : 'text-foreground')}>
            <CalendarClockIcon className="size-3.5" />
            {formatDate(due)}
          </span>
          <span aria-hidden>·</span>
          <span>{relativeTo(due, model.today)}</span>
        </>
      ) : (
        <span>ยังไม่กำหนดวันส่ง</span>
      )}
      {preparerId && (
        <>
          <span aria-hidden>·</span>
          <span>ผู้เตรียม</span>
          <span className="inline-flex min-w-0 items-center gap-1 text-foreground">
            {preparer && <UserAvatar user={preparer} size="xs" />}
            {model.userName(preparerId)}
          </span>
        </>
      )}
    </p>
  )
}

/** A disabled button with the reason on hover / focus (StatusActions also prints it on phones, where tooltips don't open). */
function Gated({ tip, children }: { tip: string | null; children: ReactNode }) {
  if (!tip) return children
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  )
}

function StatusActions({ view, model, onAction }: { view: TrackView; model: PresentationModel; onAction: (a: PresentationAction) => void }) {
  if (!view.inProposal || model.proposal.status === 'CANCELLED') return null
  if (!model.canRecord) return isFinalStage(view.stage) ? null : <p className="text-xs text-muted-foreground">{ERR.readOnly}</p>

  const trackId = view.track.id
  const record = () => onAction({ kind: 'record', trackIds: [trackId] })
  let primary: ReactNode = null
  let primaryTip: string | null = null
  switch (view.stage) {
    case 'AWAITING':
      primary = (
        <Button size="sm" onClick={record}>
          <PresentationIcon />
          บันทึกว่านำเสนอแล้ว
        </Button>
      )
      break
    case 'IN_REVIEW':
      primary = (
        <Button size="sm" onClick={record}>
          <ClipboardCheckIcon />
          บันทึกผลพิจารณา
        </Button>
      )
      break
    case 'NEEDS_INFO':
      primary = (
        <Button size="sm" onClick={record}>
          <SendIcon />
          บันทึกการส่งข้อมูลเพิ่ม
        </Button>
      )
      break
    case 'REJECTED': {
      const tip = model.gateOpen ? null : gateTip(model.progress)
      primaryTip = tip
      primary = (
        <Gated tip={tip}>
          <Button size="sm" variant="outline" disabled={!!tip} onClick={() => onAction({ kind: 'repitch', trackId })}>
            <RotateCcwIcon />
            นำเสนอใหม่อีกครั้ง
          </Button>
        </Gated>
      )
      break
    }
  }

  const target = view.lastRevertable
  const revertTip = target && !canChangeEvent(target.kind, { canRecord: model.canRecord, canFinalize: model.canFinalize }) ? ERR.finalOnly : null
  const revert = target && (
    <Gated tip={revertTip}>
      <Button size="sm" variant="ghost" disabled={!!revertTip} onClick={() => onAction({ kind: 'revert', trackId })}>
        <Undo2Icon />
        ย้อนกลับขั้นก่อนหน้า
      </Button>
    </Gated>
  )

  if (!primary && !revert) return null
  const tips = [primaryTip, revertTip].filter((t): t is string => !!t)
  return (
    <div className="space-y-1.5 pt-1">
      <div className="flex flex-wrap items-center gap-2">
        {primary}
        {revert}
      </div>
      {tips.map((t) => (
        <p key={t} className="text-xs text-muted-foreground sm:hidden">
          {t}
        </p>
      ))}
    </div>
  )
}

// ---------- plan ----------

function PlanSection({ view, model, onAction }: { view: TrackView; model: PresentationModel; onAction: (a: PresentationAction) => void }) {
  const id = useId()
  const { meetingDate, presenterIds, contactName } = view.plan
  const presenters = presenterIds.map((p) => model.usersById.get(p)).filter((u): u is User => !!u)
  const canSchedule = view.inProposal && model.canRecord && view.stage === 'AWAITING'

  return (
    <section aria-labelledby={id} className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 id={id} className="text-sm font-semibold">
          ข้อมูลการนัด
        </h3>
        {canSchedule && (
          <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => onAction({ kind: 'schedule', trackId: view.track.id })} aria-label="แก้ไขข้อมูลการนัด">
            <PencilIcon />
            แก้ไข
          </Button>
        )}
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-xs text-muted-foreground">วันนัด</dt>
        <dd className="tabular">
          {meetingDate ? (
            <>
              {formatDate(meetingDate)}
              {view.stage === 'AWAITING' && <span className="text-muted-foreground"> · {relativeTo(meetingDate, model.today)}</span>}
            </>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </dd>
        <dt className="text-xs text-muted-foreground">ผู้นำเสนอ</dt>
        <dd className="min-w-0">
          {presenterIds.length ? (
            <span className="flex min-w-0 items-center gap-2">
              {presenters.length > 0 && <AvatarStack users={presenters} max={4} size="xs" />}
              <span className="min-w-0 truncate">{presenterIds.map((p) => model.userName(p)).join(', ')}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </dd>
        <dt className="text-xs text-muted-foreground">Buyer / ผู้ติดต่อ</dt>
        <dd className="min-w-0 break-words">{contactName || <span className="text-muted-foreground">—</span>}</dd>
      </dl>
    </section>
  )
}

// ---------- bundled tasks ----------

function BundleSection({ view, model, onOpenTask }: { view: TrackView; model: PresentationModel; onOpenTask: (taskId: string) => void }) {
  const id = useId()
  const bundle = view.bundle
  const repitch = view.repitch
  const repitchRound = repitch ? (view.timeline.find((t) => t.event.id === repitch.id)?.round ?? view.round) : null
  const reopened = bundle.filter((t) => model.reopenedTaskIds.has(t.taskId))

  return (
    <section aria-labelledby={id} className="space-y-2">
      <h3 id={id} className="text-sm font-semibold">
        {repitchRound ? `งานที่ใช้ในรอบที่ ${repitchRound} (${bundle.length})` : `งานที่ใช้นำเสนอ (${bundle.length})`}
      </h3>
      {repitch && <p className="text-sm break-words text-muted-foreground">ปรับจากครั้งก่อน: {repitch.changes}</p>}
      {reopened.length > 0 && (
        <Callout tone="warning" icon={<TriangleAlertIcon />}>
          งาน {reopened.map((t) => `“${t.title}”`).join(', ')} ถูกเปิดกลับมาแก้หลังสร้างชุดนี้ — ถ้ามีข้อมูลใหม่ อย่าลืมแจ้ง Buyer
        </Callout>
      )}
      {bundle.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {bundle.map((t) => (
            <BundleChip key={t.taskId} task={t} reopened={model.reopenedTaskIds.has(t.taskId)} deleted={model.deletedTaskIds.has(t.taskId)} onOpen={onOpenTask} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">—</p>
      )}
    </section>
  )
}

function BundleChip({ task, reopened, deleted, onOpen }: { task: PackageTask; reopened: boolean; deleted: boolean; onOpen: (taskId: string) => void }) {
  const base = 'inline-flex max-w-full items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-xs'
  if (deleted) {
    return (
      <span className={cn(base, 'text-muted-foreground')}>
        <span className="min-w-0 truncate line-through">{task.title}</span>
        <span className="shrink-0">(ถูกลบแล้ว)</span>
      </span>
    )
  }
  const hasFields = task.fieldsTotal > 0
  return (
    <button
      type="button"
      onClick={() => onOpen(task.taskId)}
      title={hasFields ? `${task.title} · กรอกข้อมูลแล้ว ${task.fieldsFilled} จาก ${task.fieldsTotal} แถว` : task.title}
      className={cn(
        base,
        'text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
        reopened && 'border-warning/40 bg-warning-soft text-warning-foreground hover:bg-warning-soft/70',
      )}
    >
      {hasFields && <TableIcon className="size-3.5 shrink-0" />}
      <span className="min-w-0 truncate">{task.title}</span>
      {hasFields && (
        <span className={cn('tabular shrink-0', !reopened && 'text-muted-foreground')}>
          {task.fieldsFilled}/{task.fieldsTotal}
        </span>
      )}
      {reopened && <span className="shrink-0 font-medium">· ถูกเปิดกลับมาแก้</span>}
    </button>
  )
}
