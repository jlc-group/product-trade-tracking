import { diffDays, isLaunchDate, LAUNCH_DAY_OF_MONTH, PREP_DAYS, type ISODate } from '@flowtrade/shared'
import { InfoIcon, Loader2Icon } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import type { ProposalDetail } from '@/api'
import { useChangeTargetDate, useTasks } from '@/api/hooks'
import { LaunchMonthPicker } from '@/components/common/launch-month-picker'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { formatDate, today } from '@/lib/format'
import { LaunchCompare } from './launch-summary'
import { launchWord, leafTasks, shiftLabel } from './utils'

interface Props {
  proposal: ProposalDetail
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RescheduleDialog({ proposal, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <RescheduleForm proposal={proposal} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function RescheduleForm({ proposal, onDone }: { proposal: ProposalDetail; onDone: () => void }) {
  const word = launchWord(proposal.channel)
  const t = today()
  const labelId = useId()
  // Launches are always on the 15th; an older proposal on another day has to pick a month first.
  const legacyDay = !isLaunchDate(proposal.targetDate)
  const [date, setDate] = useState<ISODate | null>(legacyDay ? null : proposal.targetDate)
  const [shift, setShift] = useState(true)
  const { data: tasks } = useTasks(proposal.id)
  const mutation = useChangeTargetDate()

  const delta = date ? diffDays(proposal.targetDate, date) : 0
  const unchanged = !date || delta === 0
  // Count leaves so the number matches the "x/y งานเสร็จ" summary (parents shift along with them).
  const openDated = leafTasks(tasks ?? []).filter((t) => !t.isDone && (t.startDate || t.dueDate)).length
  const openText = tasks ? ` ${openDated} งาน` : ''

  const shiftHint = unchanged
    ? `เมื่อเลือกเดือนใหม่ งานที่ยังไม่เสร็จ${openText} จะเลื่อนวันเริ่มและวันครบกำหนดไปเท่ากับจำนวนวันที่เลื่อน`
    : shift
      ? `งานที่ยังไม่เสร็จ${openText} จะ${shiftLabel(delta)} — งานที่เสร็จแล้วไม่เปลี่ยน`
      : 'วันของทุกงานจะคงเดิม — ปรับกำหนดการเองได้ภายหลังในแท็บรายการงาน'

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!date || unchanged) return
    try {
      await mutation.mutateAsync({ id: proposal.id, targetDate: date, shiftTasks: shift })
      onDone()
    } catch {
      // error already toasted by the hook
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>เลื่อน{word}</DialogTitle>
        <DialogDescription>
          {proposal.code} · {proposal.stores.map((s) => s.name).join(', ')} — ระบบจะบันทึกการเลื่อนไว้ในประวัติให้ทีมเห็น
        </DialogDescription>
      </DialogHeader>

      <div role="group" aria-labelledby={labelId} className="grid gap-2">
        <div className="grid gap-0.5">
          <p id={labelId} className="text-sm font-medium">
            เลือกเดือนที่{word}ใหม่
          </p>
          <p className="text-xs text-muted-foreground">
            {word}คือวันที่ {LAUNCH_DAY_OF_MONTH} ของเดือนเสมอ และเริ่มเตรียมงานล่วงหน้า {PREP_DAYS} วัน
          </p>
        </div>
        {legacyDay && (
          <p className="flex items-start gap-1.5 rounded-md bg-info-soft px-2.5 py-2 text-xs text-info">
            <InfoIcon className="mt-px size-3.5 shrink-0" aria-hidden />
            {word}เดิม ({formatDate(proposal.targetDate, { long: true })}) ไม่ใช่วันที่ {LAUNCH_DAY_OF_MONTH} — เลือกเดือนเพื่อปรับให้ตรงรอบ{word}
          </p>
        )}
        <LaunchMonthPicker value={date} onChange={setDate} today={t} storeIds={proposal.storeIds} excludeProposalId={proposal.id} compact />
      </div>

      <LaunchCompare word={word} from={proposal.targetDate} to={date} today={t} />

      <div className="flex items-start gap-3 rounded-lg border p-3">
        <Switch id="reschedule-shift" checked={shift} onCheckedChange={setShift} className="mt-0.5" />
        <div className="grid gap-1">
          <Label htmlFor="reschedule-shift" className="leading-snug">
            เลื่อนวันของงานที่ยังไม่เสร็จตามไปด้วย
          </Label>
          <p className="text-xs text-muted-foreground">{shiftHint}</p>
        </div>
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            ยกเลิก
          </Button>
        </DialogClose>
        <Button type="submit" disabled={unchanged || mutation.isPending}>
          {mutation.isPending && <Loader2Icon className="animate-spin" />}
          {unchanged ? 'เลือกเดือนใหม่ก่อน' : `เลื่อนเป็น ${formatDate(date)}`}
        </Button>
      </DialogFooter>
    </form>
  )
}
