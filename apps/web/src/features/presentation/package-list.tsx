import { ChevronRightIcon, EllipsisIcon, TableIcon, Trash2Icon, TriangleAlertIcon } from 'lucide-react'
import { useState } from 'react'
import { StoreLogo } from '@/components/common/badges'
import { UserAvatar } from '@/components/common/user-avatar'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Callout } from '@/features/wizard/choice-card'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ERR } from './model'
import type { PackageTask, PresentationAction, PresentationModel, PresentationPackage } from './types'

/** Chips shown before "+n" collapses the rest. */
const CHIP_LIMIT = 6

function TaskChip({ task, reopened, deleted, onOpenTask }: { task: PackageTask; reopened: boolean; deleted: boolean; onOpenTask: (taskId: string) => void }) {
  const partial = task.fieldsTotal > 0 && task.fieldsFilled < task.fieldsTotal
  const className = cn(
    'inline-flex max-w-full items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-xs',
    reopened && 'border-warning/40 bg-warning-soft text-warning-foreground',
    deleted && 'text-muted-foreground',
  )
  const body = (
    <>
      {task.fieldsTotal > 0 && <TableIcon className="size-3.5 shrink-0" aria-hidden />}
      <span className={cn('truncate', deleted && 'line-through')}>{task.title}</span>
      {task.fieldsTotal > 0 && (
        <span className="tabular shrink-0 text-muted-foreground">
          {task.fieldsFilled}/{task.fieldsTotal}
        </span>
      )}
      {reopened && <span className="shrink-0 font-medium">· ถูกเปิดกลับมาแก้</span>}
      {deleted && <span className="shrink-0">(ถูกลบแล้ว)</span>}
    </>
  )
  const title = partial ? `ยังไม่กรอกตาราง (${task.fieldsFilled}/${task.fieldsTotal})` : undefined
  if (deleted)
    return (
      <span className={className} title={title}>
        {body}
      </span>
    )
  return (
    <button
      type="button"
      title={title}
      onClick={() => onOpenTask(task.taskId)}
      className={cn(className, 'transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50', reopened && 'hover:bg-warning-soft/70')}
    >
      {body}
    </button>
  )
}

function PackageCard({
  pkg,
  model,
  onAction,
  onOpenTask,
}: {
  pkg: PresentationPackage
  model: PresentationModel
  onAction: (a: PresentationAction) => void
  onOpenTask: (taskId: string) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const word = model.storeWord
  const tracks = model.views.filter((v) => v.track.packageId === pkg.id)
  const deletable = tracks.every((v) => v.untouched)
  const reopened = pkg.tasks.filter((t) => model.reopenedTaskIds.has(t.taskId))
  const creator = model.usersById.get(pkg.createdById)
  const shownTasks = showAll || pkg.tasks.length <= CHIP_LIMIT ? pkg.tasks : pkg.tasks.slice(0, CHIP_LIMIT - 1)
  const hiddenCount = pkg.tasks.length - shownTasks.length

  return (
    <article className="space-y-3 rounded-xl border bg-card p-4" aria-label={`ชุดนำเสนอ #${pkg.seq}`}>
      <div className="flex items-start gap-2">
        <p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
          <span className="font-semibold">ชุดนำเสนอ #{pkg.seq}</span>
          <span className="text-muted-foreground">· สร้าง {formatDate(pkg.createdAt)} โดย</span>
          <span className="inline-flex min-w-0 items-center gap-1.5">
            {creator && <UserAvatar user={creator} size="xs" />}
            <span className="truncate">{model.userName(pkg.createdById)}</span>
          </span>
        </p>
        {model.canRecord && (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="-my-1" aria-label={`การจัดการ ชุดนำเสนอ #${pkg.seq}`}>
                <EllipsisIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              {deletable ? (
                <DropdownMenuItem variant="destructive" onSelect={() => onAction({ kind: 'deletePackage', packageId: pkg.id })}>
                  <Trash2Icon /> ลบชุดนำเสนอ
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem disabled className="items-start">
                  <Trash2Icon className="mt-0.5" />
                  <span className="grid gap-0.5">
                    <span>ลบชุดนำเสนอ</span>
                    <span className="text-xs text-muted-foreground">{ERR.deleteBlocked(word)}</span>
                  </span>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-muted-foreground">งานในชุด ({pkg.tasks.length})</span>
        {shownTasks.map((t) => (
          <TaskChip key={t.taskId} task={t} reopened={model.reopenedTaskIds.has(t.taskId)} deleted={model.deletedTaskIds.has(t.taskId)} onOpenTask={onOpenTask} />
        ))}
        {hiddenCount > 0 && (
          <Button variant="outline" size="xs" className="tabular" onClick={() => setShowAll(true)} aria-label={`แสดงอีก ${hiddenCount} งาน`}>
            +{hiddenCount}
          </Button>
        )}
      </div>

      {tracks.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-muted-foreground">
            {word}ในชุด ({tracks.length})
          </span>
          {tracks.map((v) => (
            <button
              key={v.track.id}
              type="button"
              title={v.store.name}
              aria-label={v.store.name}
              onClick={() => onAction({ kind: 'openStore', storeId: v.store.id })}
              className={cn('rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50', !v.inProposal && 'opacity-60')}
            >
              <StoreLogo store={v.store} size="sm" />
            </button>
          ))}
        </div>
      )}

      {pkg.note && (
        <p className="text-sm break-words whitespace-pre-line">
          <span className="text-muted-foreground">หมายเหตุ: </span>
          {pkg.note}
        </p>
      )}

      {reopened.length > 0 && (
        <Callout tone="warning" icon={<TriangleAlertIcon />}>
          งาน {reopened.map((t) => `“${t.title}”`).join(', ')} ถูกเปิดกลับมาแก้หลังสร้างชุดนี้ — ถ้ามีข้อมูลใหม่ อย่าลืมแจ้ง Buyer
        </Callout>
      )}
    </article>
  )
}

/** "ชุดนำเสนอ (n)": what was bundled and sent, per package. Collapsed unless a bundled task was reopened. */
export function PackageList({ model, onAction, onOpenTask }: { model: PresentationModel; onAction: (a: PresentationAction) => void; onOpenTask: (taskId: string) => void }) {
  const { packages } = model
  const hasReopened = packages.some((p) => p.tasks.some((t) => model.reopenedTaskIds.has(t.taskId)))
  const [open, setOpen] = useState(hasReopened)
  // Opens by itself when a bundled task gets reopened while the tab is showing.
  const [seenReopened, setSeenReopened] = useState(hasReopened)
  if (hasReopened !== seenReopened) {
    setSeenReopened(hasReopened)
    if (hasReopened) setOpen(true)
  }

  if (packages.length === 0) return null
  const only = packages.length === 1 ? packages[0] : null
  const label = only
    ? `ชุดนำเสนอ (1) · ${only.tasks.length} งาน · สร้าง ${formatDate(only.createdAt)} โดย ${model.userName(only.createdById)}`
    : `ชุดนำเสนอ (${packages.length})`

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="group flex max-w-full items-center gap-1.5 rounded-md text-left text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
        <ChevronRightIcon className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-90" aria-hidden />
        <span className="min-w-0">{label}</span>
        {hasReopened && <TriangleAlertIcon className="size-3.5 shrink-0 text-warning-foreground" aria-label="มีงานที่ถูกเปิดกลับมาแก้" />}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 space-y-3">
        {packages.map((p) => (
          <PackageCard key={p.id} pkg={p} model={model} onAction={onAction} onOpenTask={onOpenTask} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}
