import { AlertTriangleIcon, ArrowDownIcon, ArrowUpIcon, KanbanIcon, LayoutGridIcon, Loader2Icon, RocketIcon, TableIcon } from 'lucide-react'
import type { ProposalListItem } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { daysUntil } from '@/lib/format'
import { cn } from '@/lib/utils'
import { SORT_LABEL, type ListParamsApi, type SortKey, type ViewMode } from './params'

const VIEW_OPTIONS: { value: ViewMode; label: string; icon: typeof TableIcon }[] = [
  { value: 'table', label: 'ตาราง', icon: TableIcon },
  { value: 'kanban', label: 'Kanban', icon: KanbanIcon },
  { value: 'grid', label: 'การ์ด', icon: LayoutGridIcon },
]

const isLive = (p: ProposalListItem) => p.status !== 'COMPLETED' && p.status !== 'CANCELLED'

function SortControl({ list, className }: { list: ListParamsApi; className?: string }) {
  const { params, update } = list
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Label htmlFor="proposal-sort" className="sr-only">
        เรียงตาม
      </Label>
      <Select value={params.sort} onValueChange={(v) => update({ sort: v as SortKey })}>
        <SelectTrigger id="proposal-sort" className="w-auto bg-card">
          <span className="text-muted-foreground">เรียง:</span>
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="end">
          {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
            <SelectItem key={k} value={k}>
              {SORT_LABEL[k]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="icon"
        aria-label={params.dir === 'asc' ? 'เรียงจากน้อยไปมาก — คลิกเพื่อสลับ' : 'เรียงจากมากไปน้อย — คลิกเพื่อสลับ'}
        onClick={() => update({ dir: params.dir === 'asc' ? 'desc' : 'asc' })}
      >
        {params.dir === 'asc' ? <ArrowUpIcon /> : <ArrowDownIcon />}
      </Button>
    </div>
  )
}

export function ResultsBar({ items, list, fetching }: { items: ProposalListItem[] | undefined; list: ListParamsApi; fetching: boolean }) {
  const { params, update } = list
  const live = items?.filter(isLive) ?? []
  const withOverdue = live.filter((p) => p.overdueCount > 0).length
  const launchingSoon = live.filter((p) => {
    const n = daysUntil(p.targetDate)
    return n >= 0 && n <= 14
  }).length

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1.5 text-sm" aria-live="polite">
        {items ? (
          <span className="text-muted-foreground">
            พบ <span className="tabular font-semibold text-foreground">{items.length}</span> รายการ
          </span>
        ) : (
          <span className="text-muted-foreground">กำลังโหลด…</span>
        )}
        {withOverdue > 0 && (
          <span className="tabular inline-flex h-6 items-center gap-1 rounded-full bg-danger-soft px-2.5 text-xs font-medium text-danger">
            <AlertTriangleIcon className="size-3.5" aria-hidden />
            มีงานเลยกำหนด {withOverdue} โปรเจกต์
          </span>
        )}
        {launchingSoon > 0 && (
          <span className="tabular inline-flex h-6 items-center gap-1 rounded-full bg-warning-soft px-2.5 text-xs font-medium text-warning-foreground">
            <RocketIcon className="size-3.5" aria-hidden />
            วางขายภายใน 14 วัน {launchingSoon} โปรเจกต์
          </span>
        )}
        {fetching && items && <Loader2Icon className="size-4 animate-spin text-muted-foreground" aria-label="กำลังอัปเดต" />}
      </div>

      <div className="flex items-center gap-2">
        {params.view !== 'kanban' && <SortControl list={list} className={cn(params.view === 'table' && 'xl:hidden')} />}
        <ToggleGroup
          type="single"
          variant="outline"
          spacing={0}
          value={params.view}
          onValueChange={(v) => v && update({ view: v as ViewMode })}
          aria-label="รูปแบบการแสดงผล"
          className="bg-card"
        >
          {VIEW_OPTIONS.map((o) => (
            <ToggleGroupItem key={o.value} value={o.value} aria-label={o.label} title={o.label} className="px-2.5 data-[state=on]:bg-brand-soft data-[state=on]:text-brand">
              <o.icon aria-hidden />
              <span className="hidden sm:inline">{o.label}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </div>
  )
}
