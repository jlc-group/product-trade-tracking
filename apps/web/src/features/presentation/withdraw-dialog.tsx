import type { ISODate } from '@flowtrade/shared'
import { useId, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { DateField } from '@/components/common/date-field'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { DialogActions, EventKindBadge, Field, GoneNotice } from './dialog-parts'
import { editDescription, editTarget, fieldAria, hasErrors, proposalLine, useHeldWhileClosed } from './dialog-utils'
import { useEditEvent, useRecordStep } from './hooks'
import { diffPatch, ERR, isEmptyPatch, NOTE_MAX, OPEN_STAGES, validateEdit, validateEvent } from './model'
import type { EventOf, FieldErrors, PresentationModel, StageEvent, TrackView } from './types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  model: PresentationModel
  trackId: string
  /** Edit mode: correct this WITHDRAWN event (date, reason). */
  editEventId?: string
}

/** "ยุติการนำเสนอ{ห้าง}นี้" (owner / manager): the team stops presenting to a store — not a buyer rejection. */
export function WithdrawDialog({ open, onOpenChange, model, trackId, editEventId }: Props) {
  const target = useHeldWhileClosed(open, { trackId, editEventId })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <WithdrawRoute key={`${target.trackId}|${target.editEventId ?? ''}`} model={model} trackId={target.trackId} editEventId={target.editEventId} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function WithdrawRoute({ model, trackId, editEventId, onDone }: { model: PresentationModel; trackId: string; editEventId?: string; onDone: () => void }) {
  const view = model.viewById.get(trackId)
  const [stage] = useState(view?.stage)
  if (!view) return <GoneNotice />
  if (editEventId) {
    const e = editTarget(view, editEventId)?.effective
    return e?.kind === 'WITHDRAWN' ? <WithdrawForm model={model} view={view} target={e} onDone={onDone} /> : <GoneNotice />
  }
  return stage && OPEN_STAGES.includes(stage) ? <WithdrawForm model={model} view={view} target={null} onDone={onDone} /> : <GoneNotice />
}

function WithdrawForm({ model, view, target, onDone }: { model: PresentationModel; view: TrackView; target: EventOf<'WITHDRAWN'> | null; onDone: () => void }) {
  const id = useId()
  const record = useRecordStep(model.proposal)
  const edit = useEditEvent(model.proposal)
  const word = model.storeWord
  const productCount = model.proposal.productIds.length
  const [date, setDate] = useState<ISODate | null>(target ? target.date : model.today)
  const [reason, setReason] = useState(target?.reason ?? '')
  const [submitted, setSubmitted] = useState(false)
  // From submit on (kept after success): the saved withdraw moves the store on while the dialog closes.
  const [holding, setHolding] = useState(false)

  const event: StageEvent = { kind: 'WITHDRAWN', date: date ?? '', reason: reason.trim() }
  const patch = target ? diffPatch(target, { date: date ?? '', reason: reason.trim() }) : null
  const unchanged = !!patch && isEmptyPatch(patch)
  const errors: FieldErrors = target && patch ? validateEdit(view, target.id, patch, model.today, productCount) : validateEvent(view, event, model.today, productCount)
  const shown: FieldErrors = submitted ? errors : {}
  const pending = record.isPending || edit.isPending
  const hint = !model.canFinalize ? ERR.finalOnly : target ? undefined : `${word}นี้จะไม่ถูกนับในอัตราผ่านการพิจารณา และย้อนกลับได้ภายหลัง`

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (!model.canFinalize || unchanged || hasErrors(errors)) return
    try {
      if (target && patch) {
        await edit.mutateAsync({ trackId: view.track.id, targetEventId: target.id, patch })
        toast.success('บันทึกการแก้ไขแล้ว')
      } else {
        setHolding(true)
        // Withdrawing is allowed from any open stage, so the stage as loaded now (not as opened): after a 409
        // STALE the refetched stage goes up on the retry, as the toast suggests.
        await record.mutateAsync({ trackIds: [view.track.id], expectStage: view.stage, events: [event] })
        toast.success(`ยุติการนำเสนอ ${view.store.name} แล้ว`, { description: 'ไม่นับในอัตราผ่านการพิจารณา' })
      }
      onDone()
    } catch {
      // error already toasted by the hook
      setHolding(false)
    }
  }

  // The store left the open stages without this dialog (a teammate's outcome, seen after a 409 refetch).
  if (!target && !holding && !OPEN_STAGES.includes(view.stage)) return <GoneNotice />

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle className="pr-6 leading-snug">
          {target ? 'แก้ไขรายละเอียด' : 'ยุติการนำเสนอ'} — {view.store.name}
        </DialogTitle>
        <DialogDescription>
          {target ? editDescription(model, target) : `${proposalLine(model)} — ใช้เมื่อทีมตัดสินใจไม่นำเสนอ${word}นี้ต่อ (ไม่ใช่ Buyer ปฏิเสธ)`}
        </DialogDescription>
      </DialogHeader>
      {target && <EventKindBadge kind="WITHDRAWN" />}

      <Field id={`${id}-date`} label="วันที่" required error={shown.date}>
        <DateField id={`${id}-date`} value={date} onChange={setDate} max={model.today} clearable={false} className="w-full sm:w-60" />
      </Field>

      <Field
        id={`${id}-reason`}
        label="เหตุผล"
        required
        error={shown.reason}
        hint={hint}
      >
        <Textarea
          {...fieldAria(`${id}-reason`, shown.reason, !!hint)}
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={`เช่น ทีมตัดสินใจโฟกัส${word}อื่นก่อน`}
          maxLength={NOTE_MAX}
        />
      </Field>

      <DialogActions label={target ? 'บันทึกการแก้ไข' : `ยุติการนำเสนอ${word}นี้`} pending={pending} disabled={!model.canFinalize || unchanged} />
    </form>
  )
}
