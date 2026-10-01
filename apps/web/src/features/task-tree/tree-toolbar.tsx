import type { Progress } from '@flowtrade/shared'
import { Building2Icon, ChevronsDownUpIcon, ChevronsUpDownIcon, PlusIcon } from 'lucide-react'
import { ProgressBar } from '@/components/common/misc'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { FILTER_LABEL, NO_DEPARTMENT, type DepartmentCount, type DepartmentFilter, type TreeFilter } from './use-tree-state'

// Select values can't be '' — map the department filter to sentinel values that no department uses.
const ALL_VALUE = '__all__'
const NONE_VALUE = '__none__'
const toSelectValue = (d: DepartmentFilter) => (d === null ? ALL_VALUE : d === NO_DEPARTMENT ? NONE_VALUE : `dept:${d}`)
const fromSelectValue = (v: string): DepartmentFilter => (v === ALL_VALUE ? null : v === NONE_VALUE ? NO_DEPARTMENT : v.replace(/^dept:/, ''))

const FILTERS: TreeFilter[] = ['all', 'mine', 'open', 'overdue']

interface TreeToolbarProps {
  progress: Progress
  counts: Record<TreeFilter, number>
  filter: TreeFilter
  onFilter: (f: TreeFilter) => void
  department: DepartmentFilter
  departmentCounts: { departments: DepartmentCount[]; none: number }
  onDepartment: (d: DepartmentFilter) => void
  /** Any filter (status or department) is active. */
  isFiltering: boolean
  canExpand: boolean
  onExpandAll: () => void
  onCollapseAll: () => void
  /** null when the user can't add tasks. */
  onAddRoot: (() => void) | null
}

/** Overall progress, expand/collapse, "+ เพิ่มงานหลัก" and the filter chips. */
export function TreeToolbar({
  progress,
  counts,
  filter,
  onFilter,
  department,
  departmentCounts,
  onDepartment,
  isFiltering,
  canExpand,
  onExpandAll,
  onCollapseAll,
  onAddRoot,
}: TreeToolbarProps) {
  return (
    <div className="space-y-3 border-b p-3 @lg:p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-48 flex-1">
          <div className="flex items-baseline gap-2">
            <h2 className="text-base font-semibold">รายการงาน</h2>
            <span className={cn('tabular text-sm', progress.percent === 100 ? 'font-medium text-success' : 'text-muted-foreground')}>
              {progress.total ? `เสร็จ ${progress.percent}%` : 'ยังไม่มีงาน'}
            </span>
          </div>
          <ProgressBar progress={progress} className="mt-1.5 max-w-md" />
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onExpandAll} aria-label="ขยายทั้งหมด" disabled={!canExpand}>
            <ChevronsUpDownIcon />
            <span className="hidden @xl:inline">ขยายทั้งหมด</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={onCollapseAll} aria-label="ย่อทั้งหมด" disabled={!canExpand}>
            <ChevronsDownUpIcon />
            <span className="hidden @xl:inline">ย่อทั้งหมด</span>
          </Button>
          {onAddRoot && (
            <Button size="sm" className="ml-1" onClick={onAddRoot}>
              <PlusIcon />
              เพิ่มงานหลัก
            </Button>
          )}
        </div>
      </div>
      <div role="group" aria-label="กรองรายการงาน" className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => {
          const active = filter === f
          return (
            <button
              key={f}
              type="button"
              aria-pressed={active}
              onClick={() => onFilter(f)}
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                active ? 'border-primary bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {FILTER_LABEL[f]}
              <span
                className={cn(
                  'tabular min-w-5 rounded-full px-1.5 text-center text-[11px] leading-4',
                  active ? 'bg-primary-foreground/20' : f === 'overdue' && counts.overdue > 0 ? 'bg-danger-soft font-semibold text-danger' : 'bg-muted',
                )}
              >
                {counts[f]}
              </span>
            </button>
          )
        })}
        <DepartmentSelect value={department} counts={departmentCounts} onChange={onDepartment} />
        {isFiltering && <span className="basis-full text-xs text-muted-foreground">แสดงงานแม่ของรายการที่ตรงไว้เป็นสีจาง เพื่อให้รู้ว่าอยู่ใต้งานไหน</span>}
      </div>
    </div>
  )
}

/** "ทุกแผนก ▾" — shows only the departments that have tasks in this proposal. */
function DepartmentSelect({ value, counts, onChange }: { value: DepartmentFilter; counts: { departments: DepartmentCount[]; none: number }; onChange: (d: DepartmentFilter) => void }) {
  const { departments, none } = counts
  // Nothing to choose between (e.g. an older proposal without departments) — keep the toolbar quiet.
  if (departments.length === 0 && value === null) return null
  const missing = value !== null && value !== NO_DEPARTMENT && !departments.some((d) => d.name === value)
  const options = missing ? [...departments, { name: value, count: 0 }] : departments
  return (
    <Select value={toSelectValue(value)} onValueChange={(v) => onChange(fromSelectValue(v))}>
      <SelectTrigger
        size="sm"
        aria-label="กรองตามแผนกที่รับผิดชอบ"
        className={cn('ml-auto h-7 max-w-56 rounded-full text-xs', value !== null ? 'border-primary bg-primary/10 font-medium text-primary dark:bg-primary/15' : 'bg-background text-muted-foreground')}
      >
        <Building2Icon className="size-3.5" />
        <SelectValue>
          <span className="truncate">{value === null ? 'ทุกแผนก' : value === NO_DEPARTMENT ? 'ยังไม่ระบุแผนก' : `แผนก ${value}`}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent position="popper" align="end" className="max-h-72">
        <SelectItem value={ALL_VALUE}>ทุกแผนก</SelectItem>
        <SelectSeparator />
        {options.map((d) => (
          <SelectItem key={d.name} value={toSelectValue(d.name)}>
            <span className="truncate">{d.name}</span>
            <span className="tabular text-xs text-muted-foreground">{d.count}</span>
          </SelectItem>
        ))}
        {(none > 0 || value === NO_DEPARTMENT) && (
          <SelectItem value={NONE_VALUE}>
            <span className="text-muted-foreground">ยังไม่ระบุแผนก</span>
            <span className="tabular text-xs text-muted-foreground">{none}</span>
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  )
}

/** Loading placeholder shaped like the toolbar and a few indented rows. */
export function TreeSkeleton() {
  const rows = [0, 1, 1, 2, 2, 1, 0, 1, 0]
  return (
    <div className="overflow-hidden rounded-xl border bg-card" aria-busy="true" aria-label="กำลังโหลดรายการงาน">
      <div className="space-y-3 border-b p-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-1.5 w-full max-w-md" />
        <div className="flex gap-1.5">
          {[16, 14, 20, 18].map((w, i) => (
            <Skeleton key={i} className="h-7 rounded-full" style={{ width: `${w * 4}px` }} />
          ))}
        </div>
      </div>
      {rows.map((depth, i) => (
        <div key={i} className="flex h-11 items-center gap-2 border-b border-border/60 px-3 last:border-b-0">
          <span style={{ width: depth * 20 }} className="shrink-0" />
          <Skeleton className="size-4 rounded" />
          <Skeleton className="h-4" style={{ width: `${[52, 40, 46, 34, 38, 44, 56, 30, 48][i]}%` }} />
          <div className="ml-auto hidden items-center gap-6 sm:flex">
            <Skeleton className="size-6 rounded-full" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-10" />
          </div>
        </div>
      ))}
    </div>
  )
}
