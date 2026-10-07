import type { ISODate } from '@flowtrade/shared'
import { useId, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { DateField } from '@/components/common/date-field'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { sameSet } from '@/features/proposal-detail/utils'
import { formatDate } from '@/lib/format'
import { DialogActions, EventKindBadge, Field, GoneNotice, PeoplePicker, PICKER_HINT } from './dialog-parts'
import { editDescription, editTarget, fieldAria, hasErrors, proposalLine, useHeldWhileClosed } from './dialog-utils'
import { useEditEvent, useScheduleTrack } from './hooks'
import { diffPatch, isEmptyPatch, NAME_MAX, validateEdit, validateEvent } from './model'
import type { EventOf, FieldErrors, PresentationModel, TrackView } from './types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  model: PresentationModel
  trackId: string
  /** Edit mode: correct this CREATED / SCHEDULED event (the plan it set). */
  editEventId?: string
}

/** "นัดวันนำเสนอ / แก้ไขนัด" for an AWAITING store; also edits a CREATED / SCHEDULED event. */
export function ScheduleDialog({ open, onOpenChange, model, trackId, editEventId }: Props) {
  const target = useHeldWhileClosed(open, { trackId, editEventId })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <ScheduleRoute key={`${target.trackId}|${target.editEventId ?? ''}`} model={model} trackId={target.trackId} editEventId={target.editEventId} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function ScheduleRoute({ model, trackId, editEventId, onDone }: { model: PresentationModel; trackId: string; editEventId?: string; onDone: () => void }) {
  const view = model.viewById.get(trackId)
  if (!view) return <GoneNotice />
  if (editEventId) {
    const e = editTarget(view, editEventId)?.effective
    return e && (e.kind === 'CREATED' || e.kind === 'SCHEDULED') ? <ScheduleForm model={model} view={view} target={e} onDone={onDone} /> : <GoneNotice />
  }
  // A meeting is planned only while the store waits to be presented. The live stage: saving a plan keeps the store
  // AWAITING, so this only turns into GoneNotice when a teammate's step moved it (seen after a 409 STALE refetch).
  return view.stage === 'AWAITING' ? <ScheduleForm model={model} view={view} target={null} onDone={onDone} /> : <GoneNotice />
}

function ScheduleForm({
  model,
  view,
  target,
  onDone,
}: {
  model: PresentationModel
  view: TrackView
  target: EventOf<'CREATED' | 'SCHEDULED'> | null
  onDone: () => void
}) {
  const id = useId()
  const schedule = useScheduleTrack(model.proposal)
  const edit = useEditEvent(model.proposal)
  const productCount = model.proposal.productIds.length
  const initial = target ?? view.plan
  const withContact = !target || target.kind === 'SCHEDULED'
  const [meetingDate, setMeetingDate] = useState<ISODate | null>(initial.meetingDate)
  const [presenterIds, setPresenterIds] = useState<string[]>(initial.presenterIds)
  const [contactName, setContactName] = useState('contactName' in initial ? (initial.contactName ?? '') : '')
  const [submitted, setSubmitted] = useState(false)

  const contact = contactName.trim() || null
  const patch = target ? diffPatch(target, withContact ? { meetingDate, presenterIds, contactName: contact } : { meetingDate, presenterIds }) : null
  const unchanged = patch
    ? isEmptyPatch(patch)
    : meetingDate === view.plan.meetingDate && contact === view.plan.contactName && sameSet(presenterIds, view.plan.presenterIds)
  const errors: FieldErrors =
    target && patch
      ? validateEdit(view, target.id, patch, model.today, productCount)
    : validateEvent(view, { kind: 'SCHEDULED', meetingDate, presenterIds, contactName: contact }, model.today, productCount)
  const shown: FieldErrors = submitted ? errors : {}
  const pending = schedule.isPending || edit.isPending

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (unchanged || hasErrors(errors)) return
    try {
      if (target && patch) {
        await edit.mutateAsync({ trackId: view.track.id, targetEventId: target.id, patch })
        toast.success('บันทึกการแก้ไขแล้ว')
      } else {
        await schedule.mutateAsync({ trackId: view.track.id, meetingDate, presenterIds, contactName: contact })
        toast.success('บันทึกนัดแล้ว', { description: `${view.store.name} · ${meetingDate ? `นัด ${formatDate(meetingDate)}` : 'ยังไม่ได้นัด'}` })
      }
      onDone()
    } catch {
      // error already toasted by the hook
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle className="pr-6 leading-snug">
          {target ? 'แก้ไขรายละเอียด' : 'นัดวันนำเสนอ'} — {view.store.name}
        </DialogTitle>
        <DialogDescription>{target ? editDescription(model, target) : `${proposalLine(model)} — ชุดนำเสนอ #${view.packageSeq}`}</DialogDescription>
      </DialogHeader>
      {target && <EventKindBadge kind={target.kind} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${id}-meeting`} label="วันนัดนำเสนอ" error={shown.meetingDate}>
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

      {withContact && (
        <Field id={`${id}-contact`} label="ชื่อ Buyer / ผู้ติดต่อ" optional error={shown.contactName}>
          <Input
            {...fieldAria(`${id}-contact`, shown.contactName)}
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="เช่น คุณสมศรี (Category Buyer)"
            maxLength={NAME_MAX}
          />
        </Field>
      )}

      <DialogActions label={target ? 'บันทึกการแก้ไข' : 'บันทึกนัด'} pending={pending} disabled={unchanged} />
    </form>
  )
}
