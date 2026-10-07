import type { Task } from '@flowtrade/shared'
import { TableIcon } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { toPackageTask } from './model'

/** Level-1 tasks to bundle into a package / re-pitch, with each table's filled/total rows. */
export function TaskBundleChecklist({
  tasks,
  value,
  onChange,
  reopenedTaskIds,
  labelledBy,
  invalid = false,
  className,
}: {
  tasks: Task[]
  value: string[]
  onChange: (ids: string[]) => void
  /** Tasks open again since they were bundled (amber tag). */
  reopenedTaskIds?: Set<string>
  labelledBy?: string
  invalid?: boolean
  className?: string
}) {
  const toggle = (id: string, on: boolean) => onChange(on ? [...value, id] : value.filter((x) => x !== id))
  if (tasks.length === 0) {
    return <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">ยังไม่มีงานหลักที่เสร็จแล้ว</p>
  }
  return (
    <div role="group" aria-labelledby={labelledBy} className={cn('grid max-h-64 gap-0.5 overflow-y-auto rounded-lg border p-1.5', invalid && 'border-danger', className)}>
      {tasks.map((t) => {
        const checked = value.includes(t.id)
        const { fieldsFilled: filled, fieldsTotal: total } = toPackageTask(t)
        return (
          <label key={t.id} className={cn('flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent/60', checked && 'bg-accent/40')}>
            <Checkbox checked={checked} onCheckedChange={(v) => toggle(t.id, v === true)} />
            <span className="min-w-0 flex-1 truncate">{t.title}</span>
            {reopenedTaskIds?.has(t.id) && (
              <span className="shrink-0 rounded bg-warning-soft px-1.5 py-0.5 text-[10px] font-medium text-warning-foreground">ถูกเปิดกลับมาแก้</span>
            )}
            {total > 0 && (
              <>
                <span
                  className={cn('tabular inline-flex shrink-0 items-center gap-0.5 text-xs', filled === total ? 'text-success' : 'text-muted-foreground')}
                  title={`กรอกข้อมูลแล้ว ${filled} จาก ${total} แถว`}
                >
                  <TableIcon className="size-3.5" aria-hidden />
                  {filled}/{total}
                </span>
                {filled === 0 && (
                  <span className="shrink-0 rounded bg-warning-soft px-1.5 py-0.5 text-[10px] font-medium text-warning-foreground">ยังไม่กรอกตาราง</span>
                )}
              </>
            )}
          </label>
        )
      })}
    </div>
  )
}
