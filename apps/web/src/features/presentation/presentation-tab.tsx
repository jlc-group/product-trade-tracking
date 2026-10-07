import { ChevronRightIcon, CircleIcon, InfoIcon, LockIcon, RotateCwIcon, TriangleAlertIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import type { ProposalDetail } from '@/api'
import { StoreLogo } from '@/components/common/badges'
import { DueChip, EmptyState, useConfirm } from '@/components/common/misc'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useProductionImpact } from '@/features/production/hooks'
import { Callout } from '@/features/wizard/choice-card'
import { cn } from '@/lib/utils'
import { CreatePackageDialog } from './create-package-dialog'
import { useCloseOut, useDeletePackage, usePresentationModel, usePresentationSummary, useRemoveTrack, useRevertLast } from './hooks'
import { OPEN_STAGES, stageLabel } from './model'
import { NextActionCard } from './next-action-card'
import { PackageList } from './package-list'
import { RecordStepDialog } from './record-step-dialog'
import { RepitchDialog } from './repitch-dialog'
import { ScheduleDialog } from './schedule-dialog'
import { StoreBoard } from './store-board'
import { StoreTrackSheet } from './store-track-sheet'
import { WithdrawDialog } from './withdraw-dialog'
import type { PresentationAction, PresentationModel, TrackView } from './types'

type DialogTarget =
  | { kind: 'create'; storeIds?: string[] }
  | { kind: 'record'; trackIds: string[]; editEventId?: string }
  | { kind: 'schedule' | 'repitch' | 'withdraw'; trackId: string; editEventId?: string }

/** The open dialog; kept (with open: false) while it animates out. `key` remounts it fresh on every open. */
type DialogState = DialogTarget & { key: number; open: boolean }

const LOCKED_LIST_MAX = 5

interface Props {
  proposal: ProposalDetail
  /** Switches to the task list and opens the task drawer. */
  onOpenTask: (taskId: string) => void
  onGoToTasks: () => void
}

/** "นำเสนอ Buyer" tab: loading / error / locked / ready / active states, the store sheet (?store=) and every dialog. */
export function PresentationTab({ proposal, onOpenTask, onGoToTasks }: Props) {
  const model = usePresentationModel(proposal)
  const [params, setParams] = useSearchParams()
  const storeId = params.get('store')
  const wantsCreate = params.get('create') === '1'
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [confirm, confirmDialog] = useConfirm()
  const revert = useRevertLast(proposal)
  const removeTrack = useRemoveTrack(proposal)
  const deletePackage = useDeletePackage(proposal)
  const { closeOut, isPending: closing } = useCloseOut(proposal)
  const productionImpact = useProductionImpact(proposal)
  const word = model.storeWord
  const cancelled = proposal.status === 'CANCELLED'

  const openDialog = (target: DialogTarget) => setDialog((prev) => ({ ...target, key: (prev?.key ?? 0) + 1, open: true }))
  const closeDialog = () => setDialog((prev) => (prev ? { ...prev, open: false } : prev))

  // Keep tab=present explicit: ?store= alone is what forces this tab, so dropping it must not fall back to the task list.
  const setStore = (id: string | null) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        p.set('tab', 'present')
        if (id) p.set('store', id)
        else p.delete('store')
        return p
      },
      { replace: true },
    )

  // ?create=1 opens the create dialog once; it's removed from the URL right away so a refresh doesn't reopen it.
  const [createSeen, setCreateSeen] = useState(false)
  if (wantsCreate !== createSeen) {
    setCreateSeen(wantsCreate)
    if (wantsCreate && model.canRecord) setDialog((prev) => ({ kind: 'create', key: (prev?.key ?? 0) + 1, open: true }))
  }
  useEffect(() => {
    if (!wantsCreate) return
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        p.delete('create')
        p.set('tab', 'present')
        return p
      },
      { replace: true },
    )
  }, [wantsCreate, setParams])

  // Home deep links: ?do=record|schedule&tracks=<id>[,<id>…][&stage=<the row's stage>] open that dialog once the model
  // has loaded (§3.10); do / tracks / stage then leave the URL (replace), so a refresh or back doesn't reopen it.
  const deepDo = params.get('do')
  const deepTracks = params.get('tracks')
  const deepStage = params.get('stage')
  const deepKey = (deepDo || deepTracks) && !model.isLoading ? `${deepDo}:${deepStage}:${deepTracks}` : null
  const deepTarget = deepKey && !model.isError ? deepLinkTarget(model, deepDo, deepTracks, deepStage) : null
  const deepNotice = typeof deepTarget === 'string' ? deepTarget : null
  const [deepSeen, setDeepSeen] = useState<string | null>(null)
  if (deepKey && deepKey !== deepSeen) {
    setDeepSeen(deepKey)
    if (deepTarget && typeof deepTarget !== 'string') setDialog((prev) => ({ ...deepTarget, key: (prev?.key ?? 0) + 1, open: true }))
  }
  useEffect(() => {
    if (!deepKey) return
    if (deepNotice) toast.info(deepNotice, { id: deepKey })
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        p.delete('do')
        p.delete('tracks')
        p.delete('stage')
        p.set('tab', 'present')
        return p
      },
      { replace: true },
    )
  }, [deepKey, deepNotice, setParams])

  function openEdit(trackId: string, eventId: string) {
    const item = model.viewById.get(trackId)?.timeline.find((it) => it.event.id === eventId)
    if (!item) return
    switch (item.event.kind) {
      case 'CREATED':
      case 'SCHEDULED':
        return openDialog({ kind: 'schedule', trackId, editEventId: eventId })
      case 'WITHDRAWN':
        return openDialog({ kind: 'withdraw', trackId, editEventId: eventId })
      case 'REPITCH':
        return openDialog({ kind: 'repitch', trackId, editEventId: eventId })
      case 'REVERTED':
      case 'EDITED':
        return
      default:
        return openDialog({ kind: 'record', trackIds: [trackId], editEventId: eventId })
    }
  }

  async function onRevert(trackId: string) {
    const v = model.viewById.get(trackId)
    const target = v?.lastRevertable
    if (!v || !target || !v.revertTo || revert.isPending) return
    // Undoing an INFO_SENT / REPITCH also drops the round it started.
    const prev = stageLabel(v.revertTo, target.kind === 'INFO_SENT' || target.kind === 'REPITCH' ? v.round - 1 : v.round)
    // Undoing a PASS can drop SKUs waiting for production or flag confirmed ones (K29).
    const impact = target.kind === 'PASSED' ? productionImpact(model.views, model.views.filter((x) => x.track.id !== trackId)) : null
    const ok = await confirm({
      title: `ย้อน ${v.store.name} กลับไป “${prev}”?`,
      description: (
        <>
          ผล “{stageLabel(v.stage, v.round)}” ที่บันทึกไว้จะถูกยกเลิก แต่ยังเห็นได้ในไทม์ไลน์
          {impact && <span className="mt-2 block font-medium text-warning-foreground">{impact}</span>}
        </>
      ),
      confirmLabel: 'ย้อนกลับ',
    })
    if (!ok) return
    try {
      await revert.mutateAsync({ trackId, targetEventId: target.id })
      toast.success('ย้อนกลับแล้ว', { description: `${v.store.name} กลับไปเป็น “${prev}”` })
    } catch {
      // error already toasted by the hook
    }
  }

  async function onRemove(trackId: string) {
    const v = model.viewById.get(trackId)
    if (!v || removeTrack.isPending) return
    const ok = await confirm({
      title: `นำ ${v.store.name} ออกจากชุดนำเสนอ #${v.packageSeq}?`,
      description: `ยังไม่มีการบันทึกขั้นตอนของ${word}นี้ ${word}จะกลับไปอยู่ในรายการ “ยังไม่ได้อยู่ในชุดนำเสนอ”`,
      confirmLabel: 'นำออก',
      destructive: true,
    })
    if (!ok) return
    try {
      await removeTrack.mutateAsync({ trackId })
      toast.success(`นำ ${v.store.name} ออกจากชุดแล้ว`)
      if (storeId === v.store.id) setStore(null)
    } catch {
      // error already toasted by the hook
    }
  }

  async function onDeletePackage(packageId: string) {
    const pkg = model.packages.find((p) => p.id === packageId)
    if (!pkg || deletePackage.isPending) return
    const stores = model.views.filter((v) => v.track.packageId === packageId).map((v) => v.store.id)
    const ok = await confirm({
      title: `ลบชุดนำเสนอ #${pkg.seq}?`,
      description: `${stores.length} ${word}ในชุดนี้จะกลับไปเป็น “ยังไม่ได้อยู่ในชุดนำเสนอ” ยังไม่มีผลที่บันทึกไว้ จึงไม่มีข้อมูลหาย`,
      confirmLabel: 'ลบชุด',
      destructive: true,
    })
    if (!ok) return
    try {
      await deletePackage.mutateAsync({ packageId })
      toast.success(`ลบชุดนำเสนอ #${pkg.seq} แล้ว`)
      if (storeId && stores.includes(storeId)) setStore(null)
    } catch {
      // error already toasted by the hook
    }
  }

  function onAction(a: PresentationAction) {
    switch (a.kind) {
      case 'create':
        return openDialog({ kind: 'create', storeIds: a.storeIds })
      case 'record':
        if (a.trackIds.length) openDialog({ kind: 'record', trackIds: a.trackIds })
        return
      case 'schedule':
      case 'repitch':
      case 'withdraw':
        return openDialog({ kind: a.kind, trackId: a.trackId })
      case 'edit':
        return openEdit(a.trackId, a.eventId)
      case 'revert':
        return void onRevert(a.trackId)
      case 'remove':
        return void onRemove(a.trackId)
      case 'deletePackage':
        return void onDeletePackage(a.packageId)
      case 'openStore':
        return setStore(a.storeId)
      case 'complete':
        if (!closing) void closeOut()
        return
      case 'goTasks':
        return onGoToTasks()
    }
  }

  const active = model.views.length > 0

  let body
  if (model.isLoading) body = <PresentationSkeleton />
  else if (model.isError)
    body = (
      <EmptyState
        icon={<TriangleAlertIcon className="size-5" />}
        title="โหลดข้อมูลการนำเสนอไม่สำเร็จ"
        description="ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง"
        action={
          <Button variant="outline" onClick={() => model.refetch()}>
            <RotateCwIcon /> ลองอีกครั้ง
          </Button>
        }
      />
    )
  else if (active)
    body = (
      <>
        {!cancelled && <NextActionCard model={model} onAction={onAction} />}
        <StoreBoard model={model} onAction={onAction} />
        <PackageList model={model} onAction={onAction} onOpenTask={onOpenTask} />
      </>
    )
  else if (cancelled) body = null
  else if (!model.gateOpen) body = <LockedState model={model} onOpenTask={onOpenTask} onGoToTasks={onGoToTasks} />
  else
    body = (
      <>
        <NextActionCard model={model} onAction={onAction} />
        <ReadyStores model={model} />
      </>
    )

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {cancelled && (
        <Callout tone="info" icon={<InfoIcon />}>
          โปรเจกต์ถูกยกเลิก — ดูประวัติการนำเสนอได้อย่างเดียว
        </Callout>
      )}
      {body}

      <StoreTrackSheet model={model} storeId={storeId} onClose={() => setStore(null)} onAction={onAction} onOpenTask={onOpenTask} />
      {dialog && <DialogHost dialog={dialog} model={model} onClose={closeDialog} />}
      {confirmDialog}
    </div>
  )
}

/** The dialog a home deep link asks for, or the toast to show instead (§3.10); null = not a deep link we know. */
function deepLinkTarget(model: PresentationModel, action: string | null, trackIds: string | null, stage: string | null): DialogTarget | string | null {
  if (action !== 'record' && action !== 'schedule') return null
  if (!model.canRecord) return 'บันทึกได้เฉพาะทีมโปรเจกต์'
  const stale = 'ขั้นนี้ถูกบันทึกไปแล้ว'
  const views = (trackIds ?? '')
    .split(',')
    .map((id) => model.viewById.get(id.trim()))
    .filter((v): v is TrackView => !!v && v.inProposal)
  if (action === 'schedule') return views.length === 1 && views[0].stage === 'AWAITING' ? { kind: 'schedule', trackId: views[0].track.id } : stale
  // The stage the row showed: a track recorded elsewhere meanwhile may sit in another open stage (NEEDS_INFO → IN_REVIEW).
  const expected = OPEN_STAGES.find((s) => s === stage) ?? views[0]?.stage
  const ids = views.filter((v) => OPEN_STAGES.includes(v.stage) && v.stage === expected).map((v) => v.track.id)
  return ids.length ? { kind: 'record', trackIds: ids } : stale
}

function DialogHost({ dialog, model, onClose }: { dialog: DialogState; model: PresentationModel; onClose: () => void }) {
  const onOpenChange = (open: boolean) => {
    if (!open) onClose()
  }
  switch (dialog.kind) {
    case 'create':
      return <CreatePackageDialog key={dialog.key} open={dialog.open} onOpenChange={onOpenChange} model={model} initialStoreIds={dialog.storeIds} />
    case 'record':
      return <RecordStepDialog key={dialog.key} open={dialog.open} onOpenChange={onOpenChange} model={model} trackIds={dialog.trackIds} editEventId={dialog.editEventId} />
    case 'schedule':
      return <ScheduleDialog key={dialog.key} open={dialog.open} onOpenChange={onOpenChange} model={model} trackId={dialog.trackId} editEventId={dialog.editEventId} />
    case 'repitch':
      return <RepitchDialog key={dialog.key} open={dialog.open} onOpenChange={onOpenChange} model={model} trackId={dialog.trackId} editEventId={dialog.editEventId} />
    case 'withdraw':
      return <WithdrawDialog key={dialog.key} open={dialog.open} onOpenChange={onOpenChange} model={model} trackId={dialog.trackId} editEventId={dialog.editEventId} />
  }
}

function PresentationSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="กำลังโหลดข้อมูลการนำเสนอ">
      <Skeleton className="h-28 rounded-xl" />
      <div className="space-y-2 rounded-xl border bg-card p-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    </div>
  )
}

/** Gate closed and nothing tracked: what's still open in the prep work. */
function LockedState({ model, onOpenTask, onGoToTasks }: { model: PresentationModel; onOpenTask: (taskId: string) => void; onGoToTasks: () => void }) {
  const { done, total } = model.progress
  const shown = model.openLeafTasks.slice(0, LOCKED_LIST_MAX)
  const more = model.openLeafTasks.length - shown.length
  const goButton = <Button onClick={onGoToTasks}>ไปที่รายการงาน</Button>

  if (total === 0)
    return (
      <EmptyState icon={<LockIcon className="size-5" />} title="ยังไม่มีงานเตรียมในโปรเจกต์นี้" description="เพิ่มงานในแท็บ “รายการงาน” ก่อน เมื่อทำครบแล้วจึงนำเสนอ Buyer ได้" action={goButton} />
    )

  return (
    <EmptyState
      icon={<LockIcon className="size-5" />}
      title="ยังสร้างชุดนำเสนอไม่ได้"
      description={`ต้องทำงานเตรียมให้ครบก่อน — เหลืออีก ${total - done} งาน (${done}/${total})`}
      action={
        <div className="flex w-full max-w-md flex-col items-center gap-3">
          {shown.length > 0 && (
            <div className="w-full space-y-1.5">
              <ul className="divide-y overflow-hidden rounded-lg border bg-card text-left">
                {shown.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => onOpenTask(t.id)}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors outline-none hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
                    >
                      <CircleIcon className="size-4 shrink-0 text-muted-foreground/60" aria-label="ยังไม่เสร็จ" />
                      <span className="min-w-0 flex-1 truncate">{t.title}</span>
                      {(t.startDate || t.dueDate) && <DueChip startDate={t.startDate} dueDate={t.dueDate} isDone={false} className="hidden sm:inline-flex" />}
                      <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
              {more > 0 && <p className="text-xs text-muted-foreground">และอีก {more} งาน</p>}
            </div>
          )}
          {goButton}
        </div>
      }
    />
  )
}

/** Gate open, nothing tracked yet: the stores a package can go to. */
function ReadyStores({ model }: { model: PresentationModel }) {
  const stores = model.summary.untracked
  if (stores.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-card px-4 py-3">
      <span className="text-sm text-muted-foreground">
        {model.storeWord}ที่นำเสนอได้ (<span className="tabular">{stores.length}</span>)
      </span>
      <span className="flex flex-wrap items-center gap-1.5">
        {stores.map((s) => (
          <StoreLogo key={s.id} store={s} size="md" />
        ))}
        <span className="sr-only">{stores.map((s) => s.name).join(', ')}</span>
      </span>
    </div>
  )
}

/** Tab count: stores waiting on the team (AWAITING + NEEDS_INFO); warning tone when any buyer asked for more info. */
export function PresentationTabCount({ proposal }: { proposal: ProposalDetail }) {
  const summary = usePresentationSummary(proposal)
  const n = summary.waitingOnUs
  if (summary.isLoading || n === 0 || proposal.status === 'CANCELLED') return null
  return (
    <span
      className={cn('tabular rounded-full px-1.5 text-[11px] leading-4', summary.byStage.NEEDS_INFO > 0 ? 'bg-warning-soft font-semibold text-warning-foreground' : 'bg-foreground/10')}
    >
      <span aria-hidden>{n}</span>
      <span className="sr-only">
        รอทีมดำเนินการ {n} {summary.storeWord}
      </span>
    </span>
  )
}
