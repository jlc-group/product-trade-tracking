import { isOverdue, TASK_DATES_ADMIN_ONLY, type ISODate, type TaskNode } from '@flowtrade/shared'
import { CalendarPlusIcon, TriangleAlertIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { DateField } from '@/components/common/date-field'
import { DueChip } from '@/components/common/misc'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { daysUntil, formatDateRange, relativeDay, spanDays, today } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { UpdateTaskInput } from '@/api'
import { outsideParentRange } from './tree-utils'

interface DateRangeProps {
  task: Pick<TaskNode, 'id' | 'startDate' | 'dueDate' | 'isDone'>
  parentStart: ISODate | null
  parentDue: ISODate | null
  hasParent: boolean
  onChange: (patch: Pick<UpdateTaskInput, 'startDate' | 'dueDate'>) => void
}

/** Start / due pickers with the span in days and a soft warning when outside the parent's window. */
export function DateRangeFields({ task, parentStart, parentDue, hasParent, onChange, compact }: DateRangeProps & { compact?: boolean }) {
  const startId = useId()
  const dueId = useId()
  const span = spanDays(task.startDate, task.dueDate)
  const outside = hasParent && outsideParentRange(task.startDate, task.dueDate, parentStart, parentDue)
  return (
    <div className="space-y-3">
      <div className={cn('grid gap-3', compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2')}>
        <div className="space-y-1.5">
          <Label htmlFor={startId} className="text-xs text-muted-foreground">
            วันเริ่ม
          </Label>
          <DateField id={startId} value={task.startDate} max={task.dueDate} onChange={(v) => onChange({ startDate: v })} placeholder="ยังไม่กำหนด" className="w-full" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={dueId} className="text-xs text-muted-foreground">
            วันครบกำหนด
          </Label>
          <DateField id={dueId} value={task.dueDate} min={task.startDate} onChange={(v) => onChange({ dueDate: v })} placeholder="ยังไม่กำหนด" className="w-full" />
        </div>
      </div>
      <SpanSummary task={task} span={span} />
      {outside && (
        <p className="flex items-start gap-1.5 rounded-lg bg-warning-soft px-2.5 py-2 text-xs text-warning-foreground">
          <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
          <span>
            ช่วงวันที่นี้อยู่นอกช่วงของงานแม่ ({formatDateRange(parentStart, parentDue)}) — บันทึกได้ แต่ลองตรวจว่าตั้งใจไว้แบบนี้
          </span>
        </p>
      )}
    </div>
  )
}

function dueText(due: ISODate, overdue: boolean) {
  if (overdue) return `เลยกำหนดมา ${-daysUntil(due)} วัน`
  const rel = relativeDay(due)
  return rel === 'วันนี้' || rel === 'พรุ่งนี้' ? `ครบกำหนด${rel}` : `ครบกำหนด${rel.replace(/^อีก/, 'ในอีก')}`
}

function SpanSummary({ task, span }: { task: DateRangeProps['task']; span: number | null }) {
  if (!task.startDate && !task.dueDate) return <p className="text-xs text-muted-foreground">ยังไม่ได้กำหนดวัน — เลือกวันเริ่มและวันครบกำหนดเพื่อให้ทีมเห็นในปฏิทิน</p>
  const overdue = isOverdue(task, today())
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {span !== null && (
        <span>
          ระยะเวลา <span className="tabular font-semibold text-foreground">{span}</span> วัน
        </span>
      )}
      {task.dueDate && !task.isDone && (
        <span className={cn(overdue && 'font-medium text-danger')}>{dueText(task.dueDate, overdue)}</span>
      )}
    </p>
  )
}

/** Date chip in a row; opens the pickers only for Admin (dates of an existing task are Admin-only). */
export function DateRangePopover({ editable, className, ...props }: DateRangeProps & { editable: boolean; className?: string }) {
  const [open, setOpen] = useState(false)
  const { task } = props
  const hasDates = !!(task.startDate || task.dueDate)
  const overdue = isOverdue(task, today())
  const outside = props.hasParent && outsideParentRange(task.startDate, task.dueDate, props.parentStart, props.parentDue)
  const chip = hasDates ? <DueChip startDate={task.startDate} dueDate={task.dueDate} isDone={task.isDone} compact={overdue} /> : null
  const warn = outside ? <TriangleAlertIcon className="size-3.5 shrink-0 text-warning" aria-label="อยู่นอกช่วงวันที่ของงานแม่" /> : null

  if (!editable) {
    if (!hasDates) return null
    return (
      <span className={cn('inline-flex items-center gap-1', className)} title={`${formatDateRange(task.startDate, task.dueDate)}\n${TASK_DATES_ADMIN_ONLY}`}>
        {chip}
        {warn}
      </span>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex max-w-full min-w-0 items-center gap-1 rounded-md outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
            !hasDates && 'h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground',
            className,
          )}
          aria-label={hasDates ? `ระยะเวลา ${formatDateRange(task.startDate, task.dueDate)} — คลิกเพื่อแก้ไข` : 'กำหนดวันเริ่มและวันครบกำหนด'}
        >
          {chip ?? (
            <>
              <CalendarPlusIcon className="size-3.5" />
              กำหนดวัน
            </>
          )}
          {warn}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(20rem,calc(100vw-2rem))] gap-3 p-3" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-medium">ระยะเวลาของงาน</p>
        <DateRangeFields {...props} compact />
        {hasDates && (
          <div className="flex justify-end border-t pt-2">
            <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => props.onChange({ startDate: null, dueDate: null })}>
              ล้างวันที่ทั้งหมด
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
