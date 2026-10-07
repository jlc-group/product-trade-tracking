import { addDays, diffDays, type ISODate } from '@flowtrade/shared'
import { ChevronRightIcon, InfoIcon, SendIcon, TriangleAlertIcon } from 'lucide-react'
import { useId, useRef, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { DateField } from '@/components/common/date-field'
import { StoreChecklist } from '@/components/common/store-checklist'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useProductionImpact } from '@/features/production/hooks'
import { Callout, ChoiceCard } from '@/features/wizard/choice-card'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { DialogActions, EventKindBadge, Field, GoneNotice, PeoplePicker, PICKER_HINT, QuickChip, QuoteBox } from './dialog-parts'
import { editDescription, editTarget, fieldAria, hasErrors, mergeErrors, proposalLine, useHeldWhileClosed } from './dialog-utils'
import { useEditEvent, useRecordStep } from './hooks'
import {
  appendRequestChip,
  buildStepEvents,
  buildViews,
  CHOICE_STAGE,
  choiceForEvent,
  emptyStepForm,
  ERR,
  EXPECTED_QUICK_CHIPS,
  INFO_QUICK_CHIPS,
  isEditableKind,
  isEmptyPatch,
  NAME_MAX,
  NOTE_MAX,
  RECORD_CHOICES,
  recordModeFor,
  REJECT_REASONS,
  rejectReasonLabel,
  sameResultAllowed,
  STAGE_META,
  stageLabel,
  stepFormFromEvent,
  stepPatch,
  storeNamesText,
  summarize,
  toStepErrors,
  TONE_SOFT,
  validateEdit,
  validateStep,
  withCount,
} from './model'
import { StageIcon } from './stage-badge'
import type { PresentationModel, PresentationStage, RecordChoice, RecordMode, RejectReason, StepErrors, StepForm, TimelineItem, TrackView } from './types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  model: PresentationModel
  /** The first track decides the mode (AWAITING → present, IN_REVIEW → result, NEEDS_INFO → infoSent); the rest start ticked under "ใช้ผลเดียวกัน". */
  trackIds: string[]
  /** Edit mode: correct this PRESENTED / NEEDS_INFO / INFO_SENT / PASSED / REJECTED event of trackIds[0]. */
  editEventId?: string
}

export function RecordStepDialog({ open, onOpenChange, model, trackIds, editEventId }: Props) {
  const target = useHeldWhileClosed(open, { trackIds, editEventId })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <RecordForm
          key={`${target.trackIds.join(',')}|${target.editEventId ?? ''}`}
          model={model}
          trackIds={target.trackIds}
          editEventId={target.editEventId}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function RecordForm({ model, trackIds, editEventId, onDone }: { model: PresentationModel; trackIds: string[]; editEventId?: string; onDone: () => void }) {
  const view = model.viewById.get(trackIds[0] ?? '')
  // The stage the dialog opened in picks the mode, even once the store moves on (after saving, or by a teammate
  // meanwhile — then NewStepForm shows GoneNotice instead of a form the server can only refuse).
  const [stage] = useState(view?.stage)
  if (!view) return <GoneNotice />
  if (editEventId) {
    const item = editTarget(view, editEventId)
    return item && choiceForEvent(item.event.kind) ? <EditStepForm model={model} view={view} item={item} onDone={onDone} /> : <GoneNotice />
  }
  const mode = stage ? recordModeFor(stage) : null
  if (!stage || !mode) return <GoneNotice />
  return <NewStepForm model={model} view={view} expectStage={stage} mode={mode} extraTrackIds={trackIds.slice(1)} onDone={onDone} />
}

const CHOICE_TITLE: Record<RecordMode, string> = {
  present: 'ผลจากการนำเสนอ',
  result: 'ผลพิจารณาจาก Buyer',
  infoSent: 'ความคืบหน้า',
}

const CHOICE_LOOK: Record<RecordChoice, { tone: 'info' | 'success' | 'warning' | 'danger'; title: string; desc: string }> = {
  pending: { tone: 'info', title: 'ยังไม่ทราบผล', desc: 'Buyer ขอเวลาพิจารณา' },
  passed: { tone: 'success', title: 'ผ่าน', desc: 'Buyer รับสินค้าเข้าขาย' },
  needsInfo: { tone: 'warning', title: 'ต้องการข้อมูลเพิ่ม', desc: 'ยังไม่ตัดสิน ขอข้อมูลหรือตัวอย่างเพิ่ม' },
  rejected: { tone: 'danger', title: 'ไม่ผ่าน', desc: 'Buyer ไม่รับสินค้า — ต้องระบุเหตุผล' },
  infoSent: { tone: 'info', title: 'ส่งข้อมูลเพิ่มให้ Buyer แล้ว', desc: '' },
}

function NewStepForm({
  model,
  view: liveView,
  expectStage,
  mode,
  extraTrackIds,
  onDone,
}: {
  model: PresentationModel
  view: TrackView
  expectStage: PresentationStage
  mode: RecordMode
  extraTrackIds: string[]
  onDone: () => void
}) {
  const id = useId()
  const record = useRecordStep(model.proposal)
  // Held from submit on: the saved write moves these stores on, which would change the text of the closing dialog.
  const [saving, setSaving] = useState<{ view: TrackView; others: TrackView[] } | null>(null)
  const view = saving?.view ?? liveView
  const { storeWord: word, today } = model
  const productIds = model.proposal.productIds
  const [form, setForm] = useState<StepForm>(() => emptyStepForm(view, today, model.me.id))
  const set = (patch: Partial<StepForm>) => setForm((f) => ({ ...f, ...patch }))
  const [choice, setChoice] = useState<RecordChoice | null>(mode === 'infoSent' ? 'infoSent' : null)
  const [submitted, setSubmitted] = useState(false)

  // "ใช้ผลเดียวกันกับห้างอื่น" (D12): other stores in the same stage, for "ยังไม่ทราบผล" and an all-SKU "ผ่าน" only.
  const others = saving?.others ?? (mode === 'infoSent' ? [] : model.views.filter((v) => v.inProposal && v.stage === expectStage && v.track.id !== view.track.id))
  const [extraIds, setExtraIds] = useState<string[]>(() =>
    extraTrackIds.map((t) => model.viewById.get(t)?.store.id).filter((s): s is string => !!s && others.some((o) => o.store.id === s)),
  )
  const [shareOpen, setShareOpen] = useState(extraIds.length > 0)
  const shareable = others.length > 0 && (choice === null || choice === 'pending' || choice === 'passed')
  const skuBlocked = choice === 'passed' && !sameResultAllowed(choice, form, productIds)
  const extras = shareable && !skuBlocked ? others.filter((o) => extraIds.includes(o.store.id)) : []
  const targets = [view, ...extras]
  const bulk = targets.length > 1
  const names = storeNamesText(
    targets.map((v) => v.store.name),
    word,
  )
  // The buyer name is never copied to other stores.
  const stepForm = bulk ? { ...form, contactName: '' } : form
  const errors = choice ? mergeErrors(targets.map((v) => validateStep(mode, choice, stepForm, v, today, productIds))) : {}
  const shown: StepErrors = submitted ? errors : {}

  const title = mode === 'present' ? `บันทึกว่านำเสนอแล้ว — ${names}` : mode === 'result' ? `บันทึกผลพิจารณา — ${names}` : `บันทึกการส่งข้อมูลเพิ่ม — ${view.store.name}`
  const description = (() => {
    if (mode === 'present') return `${proposalLine(model)} — ชุดนำเสนอ #${view.packageSeq} · ${view.plan.meetingDate ? `นัด ${formatDate(view.plan.meetingDate)}` : 'ยังไม่ได้นัด'}`
    if (mode === 'result') {
      const p = view.presentedDate
      // Calendar days, not hours: "วันนี้", "เมื่อวาน", "8 วันก่อน".
      const ago = p ? diffDays(p, today) : 0
      const agoText = ago <= 0 ? 'วันนี้' : ago === 1 ? 'เมื่อวาน' : `${ago} วันก่อน`
      return `${proposalLine(model)} — ${p ? `เสนอเมื่อ ${formatDate(p)} (${agoText}) · ` : ''}รอบที่ ${view.round}`
    }
    const r = view.openRequest
    return `${proposalLine(model)} — ${r ? `Buyer ขอเมื่อ ${formatDate(r.date)} · ` : ''}${r?.dueDate ? `ต้องส่งภายใน ${formatDate(r.dueDate)}` : 'ยังไม่กำหนดวันส่ง'}`
  })()

  const submitLabel = !choice
    ? mode === 'present'
      ? 'เลือกผลการนำเสนอก่อน'
      : 'เลือกผลพิจารณาก่อน'
    : {
        pending: `บันทึกว่านำเสนอแล้ว${withCount(targets.length, word)}`,
        passed: `บันทึกว่าผ่าน${withCount(targets.length, word)}`,
        needsInfo: 'บันทึกคำขอข้อมูลเพิ่ม',
        rejected: 'บันทึกว่าไม่ผ่าน',
        infoSent: 'บันทึกว่าส่งข้อมูลแล้ว',
      }[choice]

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!choice) return
    setSubmitted(true)
    if (hasErrors(errors)) return
    setSaving({ view, others })
    try {
      const data = await record.mutateAsync({ trackIds: targets.map((v) => v.track.id), expectStage, events: buildStepEvents(mode, choice, stepForm, productIds) })
      if (choice === 'pending') toast.success('บันทึกว่านำเสนอแล้ว', { description: `${names} · รอ Buyer พิจารณา` })
      else if (choice === 'passed') {
        const s = summarize(buildViews(data, model.proposal), model.proposal)
        toast.success(`บันทึกว่า ${names} ผ่านแล้ว`, { description: `ได้ผลแล้ว ${s.finalCount} จาก ${s.storesTotal} ${word}` })
      } else if (choice === 'needsInfo')
        toast.success('บันทึกคำขอข้อมูลเพิ่มแล้ว', { description: `${names} · ${form.dueDate ? `ต้องส่งภายใน ${formatDate(form.dueDate)}` : 'ยังไม่กำหนดวันส่ง'}` })
      else if (choice === 'rejected') toast.success(`บันทึกว่า ${names} ไม่ผ่านแล้ว`, { description: form.reason ? rejectReasonLabel(form.reason, word) : undefined })
      else toast.success('บันทึกการส่งข้อมูลเพิ่มแล้ว', { description: `${names} กลับไปรอพิจารณา (รอบที่ ${view.round + 1})` })
      onDone()
    } catch {
      // error already toasted by the hook
      setSaving(null)
    }
  }

  const otherStores = model.proposal.stores.filter((s) => others.some((o) => o.store.id === s.id))

  // The store moved on without this dialog (a teammate's step, seen after a 409 STALE refetch): every retry with
  // this expectStage would be refused again. A store picked under "ใช้ผลเดียวกัน" that moved just drops out of `others`.
  if (!saving && liveView.stage !== expectStage) return <GoneNotice />

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle className="pr-6 leading-snug">{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      {mode === 'infoSent' && view.openRequest && <QuoteBox tone="warning" title="Buyer ต้องการข้อมูลเพิ่ม">{view.openRequest.request}</QuoteBox>}

      {mode === 'present' && <PresentedFields id={id} model={model} form={form} set={set} errors={shown} bulk={bulk} />}

      <Field id={`${id}-choice`} group required label={CHOICE_TITLE[mode]} hint={bulk ? ERR.bulk(word) : undefined}>
        <div role="radiogroup" aria-labelledby={`${id}-choice-label`} className={cn('grid gap-2', mode === 'present' ? 'sm:grid-cols-2' : 'sm:grid-cols-3')}>
          {RECORD_CHOICES[mode].map((c) => (
            <OutcomeCard
              key={c}
              choice={c}
              selected={choice === c}
              onSelect={() => setChoice(c)}
              disabled={bulk && (c === 'needsInfo' || c === 'rejected')}
              stacked={mode !== 'present'}
              desc={c === 'infoSent' ? `กลับไปรอพิจารณารอบที่ ${view.round + 1}` : undefined}
            />
          ))}
        </div>
      </Field>

      {choice && <OutcomeFields id={id} model={model} mode={mode} choice={choice} form={form} set={set} errors={shown} decidedMin={view.presentedDate} sentMin={view.openRequest?.date ?? null} />}

      {choice === 'passed' && (
        <Callout tone="success" icon={<InfoIcon />}>
          {names} จะปิดเป็น “ผ่าน” — ถ้าบันทึกผิด เจ้าของโปรเจกต์หรือผู้จัดการย้อนกลับได้จากเมนู ⋯
        </Callout>
      )}
      {choice === 'infoSent' && (
        <Callout tone="info" icon={<InfoIcon />}>
          {names} จะกลับไปเป็น “{stageLabel('IN_REVIEW')}” (รอบที่ {view.round + 1})
        </Callout>
      )}

      {shareable && (
        <Collapsible open={shareOpen && !skuBlocked} onOpenChange={setShareOpen} disabled={skuBlocked}>
          <CollapsibleTrigger asChild>
            <button
              id={`${id}-share`}
              type="button"
              className="group flex w-full items-center gap-1.5 rounded-md text-left text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" aria-hidden />
              <span className="min-w-0 flex-1">
                ใช้ผลเดียวกันกับ{word}อื่นที่{STAGE_META[expectStage].label} ({others.length})
              </span>
              {extras.length > 0 && <span className="tabular shrink-0 text-xs font-normal text-muted-foreground">เลือกแล้ว {extras.length}</span>}
            </button>
          </CollapsibleTrigger>
          {skuBlocked && <p className="mt-1 pl-5.5 text-xs text-muted-foreground">ถ้า Buyer รับไม่ครบทุก SKU ให้บันทึกทีละ{word}</p>}
          <CollapsibleContent className="pt-2">
            <StoreChecklist stores={otherStores} value={extraIds} onChange={setExtraIds} labelledBy={`${id}-share`} />
          </CollapsibleContent>
        </Collapsible>
      )}

      <DialogActions label={submitLabel} pending={record.isPending} disabled={!choice} />
    </form>
  )
}

function EditStepForm({ model, view, item, onDone }: { model: PresentationModel; view: TrackView; item: TimelineItem; onDone: () => void }) {
  const id = useId()
  const edit = useEditEvent(model.proposal)
  const target = item.effective
  const kind = target.kind
  const choice = choiceForEvent(kind) ?? 'pending'
  const mode: RecordMode = kind === 'PRESENTED' ? 'present' : kind === 'INFO_SENT' ? 'infoSent' : 'result'
  const productIds = model.proposal.productIds
  const [form, setForm] = useState<StepForm>(() => stepFormFromEvent(target, emptyStepForm(view, model.today, model.me.id)))
  const set = (patch: Partial<StepForm>) => setForm((f) => ({ ...f, ...patch }))
  const [submitted, setSubmitted] = useState(false)

  // Only changed fields go into the EDITED patch; dates are re-checked against the neighbouring steps.
  const patch = stepPatch(target, form, productIds)
  const unchanged = isEmptyPatch(patch)
  const errors = toStepErrors(kind, validateEdit(view, target.id, patch, model.today, productIds.length))
  const shown: StepErrors = submitted ? errors : {}
  // Fewer accepted SKUs can drop SKUs waiting for production or flag confirmed ones (K29).
  const impactOf = useProductionImpact(model.proposal)
  const impact =
    target.kind === 'PASSED' && 'acceptedProductIds' in patch
      ? impactOf(
          model.views,
          model.views.map((v) =>
            v.track.id === view.track.id && v.outcome?.kind === 'PASSED' && v.outcome.id === target.id ? { ...v, outcome: { ...v.outcome, acceptedProductIds: patch.acceptedProductIds ?? null } } : v,
          ),
        )
      : null

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (unchanged || hasErrors(errors)) return
    try {
      await edit.mutateAsync({ trackId: view.track.id, targetEventId: target.id, patch })
      toast.success('บันทึกการแก้ไขแล้ว')
      onDone()
    } catch {
      // error already toasted by the hook
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle className="pr-6 leading-snug">แก้ไขรายละเอียด — {view.store.name}</DialogTitle>
        <DialogDescription>{editDescription(model, item.event)}</DialogDescription>
      </DialogHeader>
      {isEditableKind(kind) && <EventKindBadge kind={kind} />}
      {mode === 'present' && <PresentedFields id={id} model={model} form={form} set={set} errors={shown} bulk={false} />}
      <OutcomeFields id={id} model={model} mode={mode} choice={choice} form={form} set={set} errors={shown} decidedMin={null} sentMin={null} />
      {impact && (
        <Callout tone="warning" icon={<TriangleAlertIcon />}>
          {impact}
        </Callout>
      )}
      <DialogActions label="บันทึกการแก้ไข" pending={edit.isPending} disabled={unchanged} />
    </form>
  )
}

function OutcomeCard({
  choice,
  selected,
  onSelect,
  disabled,
  stacked,
  desc,
}: {
  choice: RecordChoice
  selected: boolean
  onSelect: () => void
  disabled: boolean
  /** Three narrow columns: icon above the text from `sm` up. */
  stacked: boolean
  desc?: string
}) {
  const look = CHOICE_LOOK[choice]
  return (
    <ChoiceCard mode="radio" hideMarker tone={look.tone} selected={selected} onSelect={onSelect} disabled={disabled} className={cn('p-3 sm:p-4', stacked && 'sm:flex-col sm:gap-2')}>
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4.5', TONE_SOFT[look.tone])}>
        {choice === 'infoSent' ? <SendIcon aria-hidden /> : <StageIcon stage={CHOICE_STAGE[choice]} />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{look.title}</span>
        <span className="block text-xs text-muted-foreground">{desc ?? look.desc}</span>
      </span>
    </ChoiceCard>
  )
}

interface FieldsProps {
  id: string
  model: PresentationModel
  form: StepForm
  set: (patch: Partial<StepForm>) => void
  errors: StepErrors
}

/** "present" mode: the presented date and buyer name (above the outcome cards). */
function PresentedFields({ id, model, form, set, errors, bulk }: FieldsProps & { bulk: boolean }) {
  const word = model.storeWord
  return (
    <>
      <Field id={`${id}-presented`} label="วันที่นำเสนอ" required error={errors.presentedDate}>
        <DateField id={`${id}-presented`} value={form.presentedDate} onChange={(v) => set({ presentedDate: v })} max={model.today} clearable={false} className="w-full sm:w-60" />
      </Field>
      {bulk ? (
        <p className="text-xs text-muted-foreground">
          ใส่ชื่อ Buyer ราย{word}ได้ในหน้ารายละเอียดของแต่ละ{word}
        </p>
      ) : (
        <Field id={`${id}-contact`} label="ชื่อ Buyer / ผู้ติดต่อ" optional error={errors.contactName}>
          <Input
            {...fieldAria(`${id}-contact`, errors.contactName)}
            value={form.contactName}
            onChange={(e) => set({ contactName: e.target.value })}
            placeholder="เช่น คุณสมศรี (Category Buyer)"
            maxLength={NAME_MAX}
          />
        </Field>
      )}
    </>
  )
}

/** The chosen outcome's fields. "present" mode hides the decision date: it is the presented date. */
function OutcomeFields({
  id,
  model,
  mode,
  choice,
  form,
  set,
  errors,
  decidedMin,
  sentMin,
}: FieldsProps & {
  mode: RecordMode
  choice: RecordChoice
  /** Earliest decision / request date (last presented); null in edit mode (checked on submit instead). */
  decidedMin: ISODate | null
  /** Earliest sent date (the buyer's request date). */
  sentMin: ISODate | null
}) {
  const { storeWord: word, today } = model
  const showDate = mode !== 'present'
  const requestRef = useRef<HTMLTextAreaElement>(null)

  const dateField = (label: string, min: ISODate | null) =>
    showDate && (
      <Field id={`${id}-date`} label={label} required error={errors.date}>
        <DateField id={`${id}-date`} value={form.date} onChange={(v) => set({ date: v })} min={min} max={today} clearable={false} className="w-full sm:w-60" />
      </Field>
    )

  if (choice === 'pending') {
    return (
      <>
        <ExpectedField id={`${id}-expected`} value={form.expectedResultDate} base={form.presentedDate ?? today} onChange={(v) => set({ expectedResultDate: v })} error={errors.expectedResultDate} />
        <Field id={`${id}-note`} label="หมายเหตุ" optional error={errors.note}>
          <Textarea
            {...fieldAria(`${id}-note`, errors.note)}
            rows={2}
            value={form.note}
            onChange={(e) => set({ note: e.target.value })}
            placeholder="เช่น Buyer สนใจ ขอดูราคาส่งก่อน"
            maxLength={NOTE_MAX}
          />
        </Field>
      </>
    )
  }

  if (choice === 'infoSent') {
    return (
      <>
        {dateField('วันที่ส่ง', sentMin)}
        <Field id={`${id}-sent`} label="ส่งอะไรไปบ้าง" optional error={errors.sentWhat}>
          <Textarea
            {...fieldAria(`${id}-sent`, errors.sentWhat)}
            rows={2}
            value={form.sentWhat}
            onChange={(e) => set({ sentWhat: e.target.value })}
            placeholder="เช่น ส่งผลแล็บทางอีเมล และส่งตัวอย่างทางไปรษณีย์"
            maxLength={NOTE_MAX}
          />
        </Field>
        <ExpectedField id={`${id}-expected`} value={form.expectedResultDate} base={form.date ?? today} onChange={(v) => set({ expectedResultDate: v })} error={errors.expectedResultDate} />
      </>
    )
  }

  if (choice === 'needsInfo') {
    const requestDate = (mode === 'present' ? form.presentedDate : form.date) ?? today
    const addChip = (chip: string) => {
      set({ request: appendRequestChip(form.request, chip) })
      requestAnimationFrame(() => {
        const el = requestRef.current
        if (!el) return
        el.focus()
        el.setSelectionRange(el.value.length, el.value.length)
      })
    }
    return (
      <>
        {dateField('วันที่ได้รับคำขอ', decidedMin)}
        <Field id={`${id}-request`} label="Buyer ต้องการข้อมูลอะไรเพิ่ม" required error={errors.request}>
          <div className="flex flex-wrap gap-1.5">
            {INFO_QUICK_CHIPS.map((chip) => (
              <QuickChip key={chip} plus onClick={() => addChip(chip)}>
                {chip}
              </QuickChip>
            ))}
          </div>
          <Textarea
            ref={requestRef}
            {...fieldAria(`${id}-request`, errors.request)}
            rows={3}
            value={form.request}
            onChange={(e) => set({ request: e.target.value })}
            placeholder="เช่น ผลทดสอบ อย., ราคาส่งรายลัง, ตัวอย่างเพิ่ม 2 ชิ้น"
            maxLength={NOTE_MAX}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={`${id}-due`} label="ต้องส่งภายใน" error={errors.dueDate}>
            <DateField id={`${id}-due`} value={form.dueDate} onChange={(v) => set({ dueDate: v })} min={requestDate} className="w-full" />
          </Field>
          <Field id={`${id}-preparer`} label="ผู้เตรียมข้อมูล" hint={PICKER_HINT}>
            <PeoplePicker
              id={`${id}-preparer`}
              single
              value={form.preparerId ? [form.preparerId] : []}
              onChange={(ids) => set({ preparerId: ids[0] ?? null })}
              usersById={model.usersById}
              allowedIds={model.pickableIds}
              placeholder="เลือกผู้เตรียมข้อมูล"
            />
          </Field>
        </div>
      </>
    )
  }

  if (choice === 'rejected') {
    return (
      <>
        {dateField('วันที่ได้รับผล', decidedMin)}
        <Field id={`${id}-reason`} group label="เหตุผลหลัก" required error={errors.reason}>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={form.reason ?? ''}
            onValueChange={(v) => set({ reason: (v || null) as RejectReason | null })}
            aria-labelledby={`${id}-reason-label`}
            aria-describedby={errors.reason ? `${id}-reason-error` : undefined}
            className="flex flex-wrap justify-start"
          >
            {REJECT_REASONS.map((r) => (
              <ToggleGroupItem
                key={r}
                value={r}
                className="h-7 rounded-full px-3 text-xs data-[state=on]:border-danger data-[state=on]:bg-danger-soft data-[state=on]:text-danger"
              >
                {rejectReasonLabel(r, word)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
        <Field id={`${id}-detail`} label="ทำไมถึงไม่ผ่าน" required hint="ข้อมูลนี้ช่วยทีมปรับข้อเสนอครั้งหน้า — นำเสนอใหม่ได้ภายหลัง" error={errors.detail}>
          <Textarea
            {...fieldAria(`${id}-detail`, errors.detail, true)}
            rows={3}
            value={form.detail}
            onChange={(e) => set({ detail: e.target.value })}
            placeholder="เช่น Buyer ขอ GP 38% แต่เราให้ได้สูงสุด 32%"
            maxLength={NOTE_MAX}
          />
        </Field>
      </>
    )
  }

  // passed
  const productIds = model.proposal.productIds
  const accepted = form.acceptedProductIds ?? productIds
  const partial = productIds.length > 1 && accepted.length > 0 && accepted.length < productIds.length
  return (
    <>
      {dateField('วันที่ได้รับผล', decidedMin)}
      {productIds.length > 1 && <SkuField id={`${id}-skus`} model={model} value={accepted} onChange={(ids) => set({ acceptedProductIds: ids })} error={errors.acceptedProductIds} />}
      {partial && (
        <Field id={`${id}-not-accepted`} label="เหตุผลที่ไม่รับสินค้าที่เหลือ" required error={errors.notAcceptedNote}>
          <Input
            {...fieldAria(`${id}-not-accepted`, errors.notAcceptedNote)}
            value={form.notAcceptedNote}
            onChange={(e) => set({ notAcceptedNote: e.target.value })}
            placeholder="เช่น Buyer รับเฉพาะขนาดเล็กก่อน"
            maxLength={NOTE_MAX}
          />
        </Field>
      )}
      <Field id={`${id}-pass-note`} label="เงื่อนไข / หมายเหตุ" optional error={errors.note}>
        <Textarea
          {...fieldAria(`${id}-pass-note`, errors.note)}
          rows={2}
          value={form.note}
          onChange={(e) => set({ note: e.target.value })}
          placeholder="เช่น เงื่อนไขที่ตกลง รอบส่งสินค้าแรก"
          maxLength={NOTE_MAX}
        />
      </Field>
    </>
  )
}

/** Optional expected-result date with +1 week / +2 weeks / +1 month chips (counted from `base`). */
function ExpectedField({ id, value, base, onChange, error }: { id: string; value: ISODate | null; base: ISODate; onChange: (v: ISODate | null) => void; error?: string }) {
  return (
    <Field id={id} label="คาดว่าจะทราบผลภายใน" optional error={error}>
      <div className="flex flex-wrap items-center gap-2">
        <DateField id={id} value={value} onChange={onChange} min={base} className="w-full sm:w-60" />
        <div className="flex flex-wrap gap-1.5">
          {EXPECTED_QUICK_CHIPS.map((c) => (
            <QuickChip key={c.days} onClick={() => onChange(addDays(base, c.days))}>
              {c.label}
            </QuickChip>
          ))}
        </div>
      </div>
    </Field>
  )
}

/** "สินค้าที่ Buyer รับ" — only when the proposal has more than one SKU; all ticked = every SKU. */
function SkuField({ id, model, value, onChange, error }: { id: string; model: PresentationModel; value: string[]; onChange: (ids: string[]) => void; error?: string }) {
  const products = model.proposal.productIds.map((pid) => model.proposal.products.find((p) => p.id === pid)).filter((p) => !!p)
  const toggle = (pid: string, on: boolean) => onChange(on ? [...value, pid] : value.filter((x) => x !== pid))
  return (
    <Field id={id} group label="สินค้าที่ Buyer รับ" required error={error}>
      <div role="group" aria-labelledby={`${id}-label`} className={cn('grid gap-0.5 rounded-lg border p-1.5 sm:grid-cols-2', error && 'border-danger')}>
        {products.map((p) => {
          const on = value.includes(p.id)
          return (
            <label key={p.id} className={cn('flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent/60', on && 'bg-accent/40')}>
              <Checkbox checked={on} onCheckedChange={(v) => toggle(p.id, v === true)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{p.name}</span>
                <span className="tabular block truncate text-xs text-muted-foreground">{p.sku}</span>
              </span>
            </label>
          )
        })}
      </div>
    </Field>
  )
}
