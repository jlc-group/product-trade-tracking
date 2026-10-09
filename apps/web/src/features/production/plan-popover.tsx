import { addDays, leadDaysError, NOTE_MAX, noteError, PRODUCTION_LEAD_DAYS_DEFAULT, PRODUCTION_LEAD_QUICK, type ProductionPlanInput } from '@flowtrade/shared'
import { Loader2Icon, TriangleAlertIcon } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Field } from '@/features/presentation/dialog-parts'
import { fieldAria } from '@/features/presentation/dialog-utils'
import { formatDate } from '@/lib/format'
import { useSavePlan } from './hooks'
import { PROD_ERR, relativeTo } from './model'
import type { ProductionModel } from './types'

/** "แก้ไข" (owner / manager: lead days + note) or "หมายเหตุ" (team: note only, K6) next to the timeline footer. */
export function PlanPopover({ model }: { model: ProductionModel }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="link" size="xs" className="h-auto px-0 text-xs">
          {model.canDecide ? 'แก้ไข' : 'หมายเหตุ'}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
        {open && <PlanForm model={model} onDone={() => setOpen(false)} />}
      </PopoverContent>
    </Popover>
  )
}

const parseLead = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : Number.NaN)

function PlanForm({ model, onDone }: { model: ProductionModel; onDone: () => void }) {
  const id = useId()
  const save = useSavePlan(model.proposal)
  const plan = model.view?.plan
  const savedLead = plan?.leadDays ?? PRODUCTION_LEAD_DAYS_DEFAULT
  const savedNote = plan?.note ?? ''
  const canLead = model.canDecide
  const word = model.storeWord
  const [leadText, setLeadText] = useState(String(savedLead))
  const [note, setNote] = useState(savedNote)
  const [submitted, setSubmitted] = useState(false)

  const lead = parseLead(leadText)
  const leadErr = canLead ? leadDaysError(lead, PROD_ERR) : null
  const noteErr = noteError(note, PROD_ERR)
  // A typed-in bad value shows its error right away (an empty box only on submit) and keeps บันทึก clickable.
  const leadShown = (submitted || leadText.trim() !== '' ? leadErr : null) ?? undefined
  const leadChanged = canLead && lead !== savedLead
  const input: ProductionPlanInput = {}
  if (leadChanged && !leadErr) input.leadDays = lead
  if (note.trim() !== savedNote.trim()) input.note = note.trim() || null
  const unchanged = !leadChanged && Object.keys(input).length === 0
  const preview = leadErr ? null : addDays(model.targetDate, -(canLead ? lead : savedLead))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (leadErr || noteErr || unchanged) return
    try {
      await save.mutateAsync(input)
      onDone()
    } catch {
      // error already toasted by the hook
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3" noValidate>
      <p className="text-sm font-semibold">{canLead ? 'ตั้ง deadline ผลิต' : 'หมายเหตุการผลิต'}</p>

      {canLead ? (
        <Field id={`${id}-lead`} label={`ส่งเข้าคลัง/${word}ก่อนวางขายกี่วัน`} error={leadShown}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5">
              <Input
                {...fieldAria(`${id}-lead`, leadShown)}
                inputMode="numeric"
                autoComplete="off"
                value={leadText}
                onChange={(e) => setLeadText(e.target.value)}
                className="tabular w-20"
              />
              <span className="text-sm text-muted-foreground">วัน</span>
            </span>
            <ToggleGroup type="single" variant="outline" size="sm" value={String(lead)} onValueChange={(v) => v && setLeadText(v)} aria-label="จำนวนวันที่ใช้บ่อย">
              {PRODUCTION_LEAD_QUICK.map((d) => (
                <ToggleGroupItem key={d} value={String(d)} className="tabular px-2.5 data-[state=on]:bg-brand-soft data-[state=on]:text-brand">
                  {d}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </Field>
      ) : (
        <p className="text-xs text-muted-foreground">
          ส่งเข้าคลัง/{word}ก่อนวางขาย <span className="tabular">{savedLead}</span> วัน · {PROD_ERR.leadDaysOnly}
        </p>
      )}

      {preview && (
        <div className="space-y-1 rounded-lg bg-muted/50 px-3 py-2 text-xs">
          <p>
            Deadline: <span className="tabular font-medium">{formatDate(preview)}</span> <span className="text-muted-foreground">({relativeTo(preview, model.today)})</span>
          </p>
          {preview < model.today && (
            <p className="flex items-center gap-1 font-medium text-warning-foreground">
              <TriangleAlertIcon className="size-3.5 shrink-0" aria-hidden />
              วันนี้เลย deadline นี้แล้ว
            </p>
          )}
        </div>
      )}

      <Field id={`${id}-note`} label="หมายเหตุการผลิต" optional error={submitted ? (noteErr ?? undefined) : undefined} hint={`${note.trim().length}/${NOTE_MAX}`}>
        <Textarea
          {...fieldAria(`${id}-note`, submitted ? (noteErr ?? undefined) : undefined, true)}
          rows={3}
          value={note}
          maxLength={NOTE_MAX}
          onChange={(e) => setNote(e.target.value)}
          placeholder="เช่น โรงงานต้องการเวลาเพิ่ม 3 วันสำหรับบรรจุภัณฑ์ใหม่"
        />
      </Field>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          ปิด
        </Button>
        <Button type="submit" size="sm" disabled={save.isPending || unchanged}>
          {save.isPending && <Loader2Icon className="animate-spin" />}
          บันทึก
        </Button>
      </div>
    </form>
  )
}
