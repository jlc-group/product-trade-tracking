import { canToggleTask, LEVEL_LABEL } from '@flowtrade/shared'
import { ChevronRightIcon, Loader2Icon } from 'lucide-react'
import { Link } from 'react-router'
import type { TaskWithContext } from '@/api'
import { useCurrentUser } from '@/auth/auth'
import { PriorityBadge, StoreLogo } from '@/components/common/badges'
import { DueChip } from '@/components/common/misc'
import { Checkbox } from '@/components/ui/checkbox'
import { DepartmentChip } from '@/features/task-tree/department'
import { cn } from '@/lib/utils'
import type { TaskToggler } from './use-task-toggler'

export const taskHref = (item: TaskWithContext) => `/proposals/${item.proposal.id}?task=${item.task.id}`

/**
 * One assigned task in a cross-project list. The whole row is a link to the task inside its
 * proposal (stretched-link pattern); the checkbox sits above the link so ticking never navigates.
 */
export function WorkTaskRow({
  item,
  toggler,
  showProject = true,
  showPriority = true,
  className,
}: {
  item: TaskWithContext
  toggler: TaskToggler
  /** Show store logo + proposal code (hide when the group header already says which project). */
  showProject?: boolean
  showPriority?: boolean
  className?: string
}) {
  const user = useCurrentUser()
  const { task, proposal, store, path } = item
  const allowed = canToggleTask(user, proposal, task)
  const done = toggler.isDone(item)
  const pending = toggler.isPending(item)
  const checkboxId = `work-task-${task.id}`

  return (
    <li className={cn('group/row relative flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50 sm:px-4', className)}>
      <div className="relative z-10 flex size-5 shrink-0 items-center justify-center pt-0.5">
        {pending ? (
          <Loader2Icon className="size-4 animate-spin text-primary" aria-label="กำลังบันทึก" />
        ) : (
          <Checkbox
            id={checkboxId}
            checked={done}
            disabled={!allowed}
            onCheckedChange={(v) => toggler.toggle(item, v === true)}
            aria-label={done ? `ยกเลิกเครื่องหมายเสร็จ: ${task.title}` : `ทำเครื่องหมายว่าเสร็จ: ${task.title}`}
            title={allowed ? undefined : 'เฉพาะผู้รับผิดชอบหรือทีมโปรเจกต์เท่านั้นที่ทำเครื่องหมายได้'}
            className="size-[18px] rounded-full data-checked:border-success data-checked:bg-success"
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <Link
          to={taskHref(item)}
          className={cn(
            'line-clamp-2 text-sm font-medium outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring/60 sm:line-clamp-1',
            done && 'text-muted-foreground line-through decoration-muted-foreground/60',
          )}
        >
          {task.title}
        </Link>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {showProject && (
            <span className="inline-flex shrink-0 items-center gap-1.5">
              <StoreLogo store={store} size="sm" className="h-5 min-w-5 text-[8px]" />
              <span className="tabular font-medium text-foreground/70">{proposal.code}</span>
            </span>
          )}
          {path.length > 0 ? (
            <span className="flex min-w-0 items-center gap-0.5" title={path.join(' › ')}>
              {path.map((p, i) => (
                <span key={`${p}-${i}`} className="flex min-w-0 items-center gap-0.5">
                  {i > 0 && <ChevronRightIcon className="size-3 shrink-0 opacity-60" aria-hidden />}
                  <span className="truncate">{p}</span>
                </span>
              ))}
            </span>
          ) : (
            <span>{LEVEL_LABEL[task.level]}</span>
          )}
          {task.responsible && <DepartmentChip name={task.responsible} className="h-5 max-w-36 shrink-0 font-normal" />}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
        {showPriority && <PriorityBadge priority={task.priority} hideMedium />}
        <DueChip startDate={task.startDate} dueDate={task.dueDate} isDone={done} compact />
      </div>
    </li>
  )
}
