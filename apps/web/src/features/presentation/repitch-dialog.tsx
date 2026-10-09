import type { ISODate } from '@flowtrade/shared'
import { TriangleAlertIcon } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { DateField } from '@/components/common/date-field'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Callout } from '@/features/wizard/choice-card'
import { formatDate } from '@/lib/format'
import { DialogActions, EventKindBadge, Field, GoneNotice, PeoplePicker, PICKER_HINT, QuoteBox, SelectAllButtons } from './dialog-parts'
import { editDescription, editTarget, fieldAria, hasErrors, proposalLine, useHeldWhileClosed } from './dialog-utils'
import { useEditEvent, useRecordStep } from './hooks'
import { diffPatch, ERR, isEmptyPatch, NOTE_MAX, rejectReasonLabel, toPackageTask, validateEdit, validateEvent } from './model'
import { TaskBundleChecklist } from './task-bundle-checklist'
import type { EventOf, FieldErrors, PresentationModel, StageEvent, TrackView } from './types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  model: PresentationModel
  trackId: string
  /** Edit mode: correct this REPITCH event (changes, meeting date, presenters). */
  editEventId?: string
}

/** "นำเสนอใหม่อีกครั้ง" for a REJECTED store: a fresh task snapshot, same track, round + 1. */
export function RepitchDialog({ open, onOpenChange, model, trackId, editEventId }: Props) {
  const target = useHeldWhileClosed(open, { trackId, editEventId })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <RepitchRoute key={`${target.trackId}|${target.editEventId ?? ''}`} model={model} trackId={target.trackId} editEventId={target.editEventId} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function RepitchRoute({ model, trackId, editEventId, onDone }: { model: PresentationModel; trackId: string; editEventId?: string; onDone: () => void }) {
  const view = model.viewById.get(trackId)
  const [stage] = useState(view?.stage)
  if (!view) return <GoneNotice />
  if (editEventId) {
    const e = editTarget(view, editEventId)?.effective
    return e?.kind === 'REPITCH' ? <RepitchForm model={model} view={view} target={e} onDone={onDone} /> : <GoneNotice />
  }
  return stage === 'REJECTED' ? <RepitchForm model={model} view={view} target={null} onDone={onDone} /> : <GoneNotice />
}

function RepitchForm({ model, view, target, onDone }: { model: PresentationModel; view: TrackView; target: EventOf<'REPITCH'> | null; onDone: () => void }) {
  const id = useId()
  const record = useRecordStep(model.proposal)
  const edit = useEditEvent(model.proposal)
  const word = model.storeWord
  const productCount = model.proposal.productIds.length
  // The round this re-pitch starts: the next one, or (editing) the one it started.
  const [round] = useState(() => (target ? (view.timeline.find((i) => i.event.id === target.id)?.round ?? view.round) : view.round + 1))
  const [taskPick, setTaskPick] = useState<string[] | null>(null)
  const [changes, setChanges] = useState(target?.changes ?? '')
  const [meetingDate, setMeetingDate] = useState<ISODate | null>(target ? target.meetingDate : null)
  const [presenterIds, setPresenterIds] = useState<string[]>(target ? target.presenterIds : view.plan.presenterIds)
  const [submitted, setSubmitted] = useState(false)
  // From submit on (kept after success): the saved re-pitch moves the store on while the dialog closes.
  const [holding, setHolding] = useState(false)

  const tasks = model.doneLevel1Tasks
  // null = every done level-1 task (picked up once tasks finish loading).
  const taskIds = (taskPick ?? tasks.map((t) => t.id)).filter((x) => tasks.some((t) => t.id === x))
  const event: StageEvent = { kind: 'REPITCH', tasks: tasks.filter((t) => taskIds.includes(t.id)).map(toPackageTask), changes: changes.trim(), meetingDate, presenterIds }
  const patch = target ? diffPatch(target, { changes: changes.trim(), meetingDate, presenterIds }) : null
  const unchanged = !!patch && isEmptyPatch(patch)
  const errors: FieldErrors = target && patch ? validateEdit(view, target.id, patch, model.today, productCount) : validateEvent(view, event, model.today, productCount)
  const shown: FieldErrors = submitted ? errors : {}
  const blocked = !target && !model.gateOpen
  const pending = record.isPending || edit.isPending
  const last = view.outcome?.kind === 'REJECTED' ? view.outcome : null

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (blocked || unchanged || hasErrors(errors)) return
    try {
      if (target && patch) {
        await edit.mutateAsync({ trackId: view.track.id, targetEventId: target.id, patch })
      } else {
        setHolding(true)
        await record.mutateAsync({ trackIds: [view.track.id], expectStage: 'REJECTED', events: [event] })
      }
      onDone()
    } catch {
      // error already toasted by the hook
      setHolding(false)
    }
  }

  // No longer REJECTED without this dialog (a teammate re-pitched or reverted, seen after a 409 refetch).
  if (!target && !holding && view.stage !== 'REJECTED') return <GoneNotice />

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle className="pr-6 leading-snug">
          {target ? 'แก้ไขรายละเอียด' : 'นำเสนอใหม่อีกครั้ง'} — {view.store.name}
        </DialogTitle>
        <DialogDescription>{target ? editDescription(model, target) : `${proposalLine(model)} — เริ่มรอบที่ ${round}`}</DialogDescription>
      </DialogHeader>

      {target ? (
        <EventKindBadge kind="REPITCH" />
      ) : (
        <>
          {blocked && (
            <Callout tone="warning" icon={<TriangleAlertIcon />}>
              {ERR.gate(model.progress)}
            </Callout>
          )}
          {last && (
            <QuoteBox tone="danger" title={`ครั้งก่อนไม่ผ่าน (${formatDate(last.date)})`}>
              {rejectReasonLabel(last.reason, word)} — “{last.detail}”
            </QuoteBox>
          )}
          <Field
            id={`${id}-tasks`}
            group
            required
            label="งานที่จะใช้ในรอบนี้"
            error={shown.tasks}
            aside={<SelectAllButtons total={tasks.length} selected={taskIds.length} onAll={() => setTaskPick(tasks.map((t) => t.id))} onNone={() => setTaskPick([])} />}
          >
            {model.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <TaskBundleChecklist
                tasks={tasks}
                value={taskIds}
                onChange={setTaskPick}
                reopenedTaskIds={model.reopenedTaskIds}
                labelledBy={`${id}-tasks-label`}
                invalid={!!shown.tasks}
              />
            )}
          </Field>
        </>
      )}

      <Field id={`${id}-changes`} label="ปรับอะไรจากครั้งก่อน" required error={shown.changes}>
        <Textarea
          {...fieldAria(`${id}-changes`, shown.changes)}
          rows={3}
          value={changes}
          onChange={(e) => setChanges(e.target.value)}
          placeholder="เช่น ลดราคาส่ง 5% และเพิ่มงบโปรโมชันเปิดตัว"
          maxLength={NOTE_MAX}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id={`${id}-meeting`}
          label={
            <>
              วันนัดนำเสนอ <span className="font-normal text-muted-foreground">(ถ้ามี)</span>
            </>
          }
          error={shown.meetingDate}
        >
          <DateField id={`${id}-meeting`} value={meetingDate} onChange={setMeetingDate} className="w-full" />
        </Field>
        <Field id={`${id}-presenters`} label="ผู้นำเสนอ" hint={PICKER_HINT} error={shown.presenterIds}>
          <PeoplePicker
            id={`${id}-presenters`}
            value={presenterIds}
            onChange={setPresenterIds}
            usersById={model.usersById}
            allowedIds={model.pickableIds}
            placeholder="เลือกผู้นำเสนอ"
          />
        </Field>
      </div>

      <DialogActions
        label={target ? 'บันทึกการแก้ไข' : `เริ่มนำเสนอใหม่ (รอบที่ ${round})`}
        pending={pending}
        disabled={blocked || unchanged || (!target && model.isLoading)}
      />
    </form>
  )
}
