import type { ISODate, Store } from '@flowtrade/shared'
import { TriangleAlertIcon } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { DateField } from '@/components/common/date-field'
import { StoreChecklist } from '@/components/common/store-checklist'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Callout } from '@/features/wizard/choice-card'
import { DialogActions, Field, PeoplePicker, PICKER_HINT, SelectAllButtons } from './dialog-parts'
import { fieldAria, hasErrors, proposalLine, useHeldWhileClosed } from './dialog-utils'
import { useCreatePackage } from './hooks'
import { ERR, NOTE_MAX, stageLabel, toPackageTask, validatePackage } from './model'
import { TaskBundleChecklist } from './task-bundle-checklist'
import type { PresentationModel } from './types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  model: PresentationModel
  /** Untracked stores to tick (the strip's "สร้างชุดนำเสนอ"); default = every store not in a package yet. */
  initialStoreIds?: string[]
}

export function CreatePackageDialog({ open, onOpenChange, model, initialStoreIds }: Props) {
  const storeIds = useHeldWhileClosed(open, initialStoreIds ?? null)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <CreateForm model={model} initialStoreIds={storeIds} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function CreateForm({ model, initialStoreIds, onDone }: { model: PresentationModel; initialStoreIds: string[] | null; onDone: () => void }) {
  const { proposal, storeWord: word } = model
  const id = useId()
  const create = useCreatePackage(proposal)
  // null = still the defaults, so tasks / tracks that finish loading after the dialog opened are picked up.
  const [taskPick, setTaskPick] = useState<string[] | null>(null)
  const [storePick, setStorePick] = useState<string[] | null>(null)
  const [meetingDate, setMeetingDate] = useState<ISODate | null>(null)
  const [presenterIds, setPresenterIds] = useState<string[]>([model.me.id])
  const [note, setNote] = useState('')
  const [submitted, setSubmitted] = useState(false)
  // Held from submit on: the saved stores turn "taken", which would empty the closing dialog's selection.
  const [saving, setSaving] = useState<{ takenIds: string[]; storeIds: string[] } | null>(null)

  const tasks = model.doneLevel1Tasks
  const taskIds = (taskPick ?? tasks.map((t) => t.id)).filter((x) => tasks.some((t) => t.id === x))
  // One track per store, ever: stores already in a package are listed but can't be ticked.
  const takenIds = saving?.takenIds ?? proposal.stores.filter((s) => model.viewByStore.has(s.id)).map((s) => s.id)
  const freeIds = proposal.stores.filter((s) => !takenIds.includes(s.id)).map((s) => s.id)
  const storeIds = saving?.storeIds ?? (storePick ?? initialStoreIds ?? freeIds).filter((x) => freeIds.includes(x))

  const unfilled = tasks.filter((t) => {
    if (!taskIds.includes(t.id)) return false
    const p = toPackageTask(t)
    return p.fieldsTotal > 0 && p.fieldsFilled < p.fieldsTotal
  }).length

  const errors = validatePackage({ taskCount: taskIds.length, storeCount: storeIds.length, note }, word)
  const problem = errors.tasks ?? errors.stores
  const noteError = submitted ? errors.note : undefined
  const disabled = !model.gateOpen || model.isLoading || !!problem

  const storeHint = (s: Store) => {
    const v = model.viewByStore.get(s.id)
    if (!v || !takenIds.includes(s.id)) return null
    return `อยู่ในชุด #${v.packageSeq} · ${v.stage === 'PASSED' ? 'ผ่านแล้ว' : stageLabel(v.stage, v.round)}`
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (disabled || hasErrors(errors)) return
    setSaving({ takenIds, storeIds })
    try {
      await create.mutateAsync({ tasks: tasks.filter((t) => taskIds.includes(t.id)), storeIds, meetingDate, presenterIds, note: note.trim() || null })
      onDone()
    } catch {
      // error already toasted by the hook
      setSaving(null)
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>สร้างชุดนำเสนอ</DialogTitle>
        <DialogDescription>
          {proposalLine(model)} — รวมงานที่เสร็จแล้วเป็นชุดนำเสนอ แล้วเลือก{word}ที่จะนำเสนอ
        </DialogDescription>
      </DialogHeader>

      {!model.gateOpen && (
        <Callout tone="warning" icon={<TriangleAlertIcon />}>
          {ERR.gate(model.progress)}
        </Callout>
      )}

      <Field
        id={`${id}-tasks`}
        group
        label="งานที่จะรวมในชุด"
        description="งานหลักที่เสร็จแล้ว — ติ๊กออกได้ถ้าไม่ต้องการส่งให้ Buyer"
        aside={<SelectAllButtons total={tasks.length} selected={taskIds.length} onAll={() => setTaskPick(tasks.map((t) => t.id))} onNone={() => setTaskPick([])} />}
      >
        {model.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <TaskBundleChecklist tasks={tasks} value={taskIds} onChange={setTaskPick} reopenedTaskIds={model.reopenedTaskIds} labelledBy={`${id}-tasks-label`} />
        )}
      </Field>

      {unfilled > 0 && (
        <Callout tone="warning" icon={<TriangleAlertIcon />}>
          {unfilled} งานยังกรอกตารางไม่ครบ — สร้างชุดได้ แต่ควรตรวจข้อมูลก่อนส่งให้ Buyer
        </Callout>
      )}

      <Field
        id={`${id}-stores`}
        group
        label={`${word}ที่จะนำเสนอ`}
        aside={<SelectAllButtons total={freeIds.length} selected={storeIds.length} onAll={() => setStorePick(freeIds)} onNone={() => setStorePick([])} />}
      >
        <StoreChecklist
          stores={proposal.stores}
          value={storeIds}
          onChange={setStorePick}
          labelledBy={`${id}-stores-label`}
          disabledIds={takenIds}
          hint={storeHint}
          className="max-h-60 overflow-y-auto"
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
          hint={`ใช้กับทุก${word}ที่เลือก แก้ราย${word}ได้ภายหลัง`}
        >
          <DateField id={`${id}-meeting`} value={meetingDate} onChange={setMeetingDate} className="w-full" />
        </Field>
        <Field id={`${id}-presenters`} label="ผู้นำเสนอ" hint={PICKER_HINT}>
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

      <Field id={`${id}-note`} label="หมายเหตุ" optional error={noteError}>
        <Textarea
          {...fieldAria(`${id}-note`, noteError)}
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="เช่น ส่งไฟล์พรีเซนต์ทางอีเมลก่อนวันนัด"
          maxLength={NOTE_MAX}
        />
      </Field>

      <DialogActions
        label={model.gateOpen && !model.isLoading ? (problem ?? `สร้างชุดนำเสนอ (${taskIds.length} งาน · ${storeIds.length} ${word})`) : 'สร้างชุดนำเสนอ'}
        pending={create.isPending}
        disabled={disabled}
      />
    </form>
  )
}
