import { LEVEL_LABEL } from '@flowtrade/shared'
import { AlertTriangleIcon, ChevronRightIcon, ChevronsDownUpIcon, ChevronsUpDownIcon, RotateCcwIcon, UserRoundIcon } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import type { TemplatePreviewItem } from '@/api'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatDateRange, spanDays } from '@/lib/format'
import { cn } from '@/lib/utils'
import { departmentColor } from './department'

interface PreviewNode extends TemplatePreviewItem {
  custom?: boolean
  children: PreviewNode[]
}

function buildPreviewTree(items: (TemplatePreviewItem & { custom?: boolean })[]): PreviewNode[] {
  const nodes = new Map<string, PreviewNode>(items.map((i) => [i.templateItemId, { ...i, children: [] }]))
  const roots: PreviewNode[] = []
  for (const item of items) {
    const node = nodes.get(item.templateItemId)!
    const parent = item.parentTemplateItemId ? nodes.get(item.parentTemplateItemId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

export function TemplateTreePreview({
  items,
  excluded,
  excludedIds,
  onChange,
  isLoading,
}: {
  items: (TemplatePreviewItem & { custom?: boolean })[]
  excluded: Set<string>
  excludedIds: string[]
  onChange: (ids: string[]) => void
  isLoading: boolean
}) {
  const uid = useId()
  const tree = useMemo(() => buildPreviewTree(items), [items])
  /** Nodes the user expanded/collapsed by hand; main Tasks start open so their sub tasks show. */
  const [openState, setOpenState] = useState<Record<string, boolean>>({})
  const levelById = new Map(items.map((i) => [i.templateItemId, i.level]))
  const isExpanded = (id: string) => openState[id] ?? levelById.get(id) === 1
  const parentIds = items.filter((i) => items.some((c) => c.parentTemplateItemId === i.templateItemId)).map((i) => i.templateItemId)
  const allExpanded = parentIds.length > 0 && parentIds.every(isExpanded)

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-11" />
        ))}
      </div>
    )
  }

  const toggleItem = (id: string, include: boolean) => {
    onChange(include ? excludedIds.filter((x) => x !== id) : [...excludedIds, id])
  }
  const toggleExpand = (id: string) => setOpenState((prev) => ({ ...prev, [id]: !isExpanded(id) }))

  const renderNode = (node: PreviewNode, ancestorExcluded: boolean) => {
    const isExcluded = excluded.has(node.templateItemId)
    const hasChildren = node.children.length > 0
    const isOpen = isExpanded(node.templateItemId)
    const checkboxId = `${uid}-${node.templateItemId}`
    const childCount = node.children.length
    return (
      <li key={node.templateItemId}>
        <div
          className={cn(
            'flex items-start gap-2 rounded-lg py-2 pr-2 transition-colors hover:bg-muted/50',
            node.level === 1 && 'bg-muted/30',
          )}
          style={{ paddingLeft: `${(node.level - 1) * 1.25 + 0.25}rem` }}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggleExpand(node.templateItemId)}
              aria-expanded={isOpen}
              aria-label={`${isOpen ? 'ย่อ' : 'ขยาย'} ${node.title}`}
              className="mt-px flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronRightIcon className={cn('size-4 transition-transform', isOpen && 'rotate-90')} />
            </button>
          ) : (
            <span className="size-5 shrink-0" aria-hidden />
          )}
          <Checkbox
            id={checkboxId}
            checked={!isExcluded}
            disabled={ancestorExcluded}
            onCheckedChange={(v) => toggleItem(node.templateItemId, v === true)}
            className="mt-0.5"
          />
          <div className="min-w-0 flex-1">
            <Label
              htmlFor={checkboxId}
              className={cn('block cursor-pointer leading-snug font-normal', node.level === 1 && 'font-medium', isExcluded && 'text-muted-foreground line-through decoration-1', ancestorExcluded && 'cursor-not-allowed')}
            >
              {node.title}
            </Label>
            <div className={cn('mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground', isExcluded && 'opacity-60')}>
              <span className="rounded bg-muted px-1 text-[10px] font-medium">{LEVEL_LABEL[node.level]}</span>
              {node.custom && <span className="rounded bg-brand-soft px-1 text-[10px] font-medium text-brand">เพิ่มเอง</span>}
              <span className="tabular">
                {formatDateRange(node.startDate, node.dueDate)} · {spanDays(node.startDate, node.dueDate)} วัน
              </span>
              {node.responsible ? (
                <span className="inline-flex items-center gap-1 rounded bg-muted/70 px-1.5 text-foreground/80" title={`แผนกที่รับผิดชอบ: ${node.responsible}`}>
                  <UserRoundIcon className="size-3 text-muted-foreground" aria-hidden />
                  <span className="text-muted-foreground">แผนก</span>
                  <span className="size-1.5 rounded-full" style={{ backgroundColor: departmentColor(node.responsible) }} aria-hidden />
                  {node.responsible}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-muted-foreground/70">
                  <UserRoundIcon className="size-3" aria-hidden />
                  ยังไม่ระบุแผนก
                </span>
              )}
              {hasChildren && !isOpen && <span className="tabular">· {childCount} งานย่อย</span>}
              {node.clamped && !isExcluded && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1 rounded bg-warning-soft px-1 font-medium text-warning-foreground" tabIndex={0}>
                      <AlertTriangleIcon className="size-3" />
                      เลื่อนมาเริ่มวันนี้
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>ตามแม่แบบควรเริ่มก่อนวันนี้ ระบบจึงเลื่อนวันเริ่มมาเป็นวันนี้</TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        </div>
        {hasChildren && isOpen && <ul>{node.children.map((c) => renderNode(c, ancestorExcluded || isExcluded))}</ul>}
      </li>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-1">
        {excludedIds.length > 0 && (
          <Button type="button" variant="ghost" size="xs" className="text-muted-foreground" onClick={() => onChange([])}>
            <RotateCcwIcon />
            ใช้ทุกงาน
          </Button>
        )}
        {parentIds.length > 0 && (
          <Button type="button" variant="ghost" size="xs" className="text-muted-foreground" onClick={() => setOpenState(Object.fromEntries(parentIds.map((id) => [id, !allExpanded])))}>
            {allExpanded ? <ChevronsDownUpIcon /> : <ChevronsUpDownIcon />}
            {allExpanded ? 'ย่อทั้งหมด' : 'ขยายทั้งหมด'}
          </Button>
        )}
      </div>
      <ul className="space-y-0.5">{tree.map((n) => renderNode(n, false))}</ul>
    </div>
  )
}
