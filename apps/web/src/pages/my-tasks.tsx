import type { MyTasksFilters, TaskWithContext } from '@/api'
import { CalendarClockIcon, CheckCheckIcon, FolderKanbanIcon, PartyPopperIcon, SearchIcon, SearchXIcon, XIcon } from 'lucide-react'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { errorMessage, useMyTasks } from '@/api/hooks'
import { StoreLogo } from '@/components/common/badges'
import { EmptyState, PageHeader } from '@/components/common/misc'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Skeleton } from '@/components/ui/skeleton'
import { Segmented, type SegmentOption } from '@/features/my-work/segmented'
import { groupByDue, groupByProject, matchesQuery, type TaskGroup } from '@/features/my-work/task-groups'
import { useTaskToggler, type TaskToggler } from '@/features/my-work/use-task-toggler'
import { WorkTaskRow } from '@/features/my-work/work-task-row'
import { today } from '@/lib/format'
import { cn } from '@/lib/utils'

type Status = NonNullable<MyTasksFilters['status']>
type Due = NonNullable<MyTasksFilters['due']>
type GroupBy = 'due' | 'project'

const DEFAULTS = { status: 'open' as Status, due: 'all' as Due, group: 'due' as GroupBy }

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.find((a) => a === value) ?? fallback
}

const STATUS_OPTIONS: SegmentOption<Status>[] = [
  { value: 'open', label: 'ยังไม่เสร็จ' },
  { value: 'done', label: 'เสร็จแล้ว' },
  { value: 'all', label: 'ทั้งหมด' },
]

const DUE_OPTIONS: SegmentOption<Due>[] = [
  { value: 'all', label: 'ทุกช่วง' },
  { value: 'overdue', label: 'เลยกำหนด' },
  { value: 'today', label: 'วันนี้' },
  { value: 'week', label: '7 วัน' },
]

const GROUP_OPTIONS: SegmentOption<GroupBy>[] = [
  { value: 'due', label: 'วันครบกำหนด', icon: CalendarClockIcon },
  { value: 'project', label: 'โปรเจกต์', icon: FolderKanbanIcon },
]

const TONE_DOT: Record<TaskGroup['tone'], string> = { danger: 'bg-danger', brand: 'bg-primary', default: 'bg-foreground/40', muted: 'bg-muted-foreground/40' }
const TONE_COUNT: Record<TaskGroup['tone'], string> = {
  danger: 'bg-danger-soft text-danger',
  brand: 'bg-brand-soft text-brand',
  default: 'bg-muted text-muted-foreground',
  muted: 'bg-muted text-muted-foreground',
}

function GroupSection({ group, toggler, groupBy }: { group: TaskGroup; toggler: TaskToggler; groupBy: GroupBy }) {
  const headingId = `group-${group.key}`
  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <div className="sticky top-14 z-10 -mx-1 flex min-w-0 items-center gap-2 bg-background/95 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        {group.project ? (
          <>
            <StoreLogo store={group.project.store} size="sm" />
            <h2 id={headingId} className="min-w-0 truncate text-sm font-semibold">
              <Link to={`/proposals/${group.project.id}`} className="rounded hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none">
                {group.title}
              </Link>
            </h2>
            <span className="tabular hidden shrink-0 text-xs text-muted-foreground sm:inline">{group.project.code}</span>
          </>
        ) : (
          <>
            <span className={cn('size-2 shrink-0 rounded-full', TONE_DOT[group.tone])} aria-hidden />
            <h2 id={headingId} className={cn('text-sm font-semibold', group.tone === 'danger' && 'text-danger')}>
              {group.title}
            </h2>
          </>
        )}
        <span className={cn('tabular shrink-0 rounded-full px-2 text-xs leading-5 font-semibold', TONE_COUNT[group.tone])}>{group.items.length}</span>
        {group.subtitle && <span className={cn('min-w-0 truncate text-xs', group.project && group.tone === 'danger' ? 'text-danger' : 'text-muted-foreground')}>{group.subtitle}</span>}
      </div>
      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {group.items.map((item) => (
          <WorkTaskRow key={item.task.id} item={item} toggler={toggler} showProject={groupBy !== 'project'} />
        ))}
      </ul>
    </section>
  )
}

function ListSkeleton() {
  return (
    <div className="space-y-6" aria-busy aria-label="กำลังโหลดงาน">
      {[4, 3].map((rows, g) => (
        <div key={g} className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <div className="divide-y rounded-xl border bg-card">
            {Array.from({ length: rows }, (_, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3">
                <Skeleton className="size-[18px] rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/5" />
                  <Skeleton className="h-3 w-2/5" />
                </div>
                <Skeleton className="h-5 w-20" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function MyTasksPage() {
  const [params, setParams] = useSearchParams()
  const status = pick(params.get('status'), ['open', 'done', 'all'] as const, DEFAULTS.status)
  const due = pick(params.get('due'), ['all', 'overdue', 'today', 'week'] as const, DEFAULTS.due)
  const groupBy = pick(params.get('group'), ['due', 'project'] as const, DEFAULTS.group)
  const urlQuery = params.get('q') ?? ''

  // Typing stays local (smooth input); the URL catches up after a short pause.
  const [query, setQuery] = useState(urlQuery)
  const deferredQuery = useDeferredValue(query)
  useEffect(() => {
    const id = window.setTimeout(() => {
      const trimmed = query.trim()
      if (trimmed === urlQuery) return
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (trimmed) next.set('q', trimmed)
          else next.delete('q')
          return next
        },
        { replace: true },
      )
    }, 300)
    return () => window.clearTimeout(id)
  }, [query, urlQuery, setParams])

  const setParam = (key: 'status' | 'due' | 'group', value: string, fallback: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value === fallback) next.delete(key)
        else next.set(key, value)
        return next
      },
      { replace: true },
    )

  // Due windows only make sense for unfinished work (the API treats done tasks as never overdue).
  const effectiveDue: Due = status === 'done' ? 'all' : due
  const tasksQuery = useMyTasks({ status, due: effectiveDue })
  const toggler = useTaskToggler(tasksQuery.dataUpdatedAt)
  const t = today()

  const filtered = useMemo(() => (tasksQuery.data ?? []).filter((i) => matchesQuery(i, deferredQuery)), [tasksQuery.data, deferredQuery])
  // Group by server state so a freshly ticked row stays where it is until the list refreshes.
  const groups = useMemo(() => {
    const serverDone = (i: TaskWithContext) => i.task.isDone
    return groupBy === 'project' ? groupByProject(filtered, serverDone, t) : groupByDue(filtered, serverDone, t)
  }, [filtered, groupBy, t])

  const overdueCount = filtered.filter((i) => !toggler.isDone(i) && !!i.task.dueDate && i.task.dueDate < t).length
  const hasFilters = status !== DEFAULTS.status || effectiveDue !== DEFAULTS.due
  const clearAll = () => {
    setQuery('')
    setParams(groupBy === DEFAULTS.group ? {} : { group: groupBy }, { replace: true })
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="งานของฉัน"
        description="ทุกงานที่คุณเป็นผู้รับผิดชอบจากทุกโปรเจกต์ ติ๊กเพื่อปิดงานได้ทันที หรือคลิกที่งานเพื่อดูรายละเอียดในโปรเจกต์"
      />

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 lg:flex-row lg:flex-wrap lg:items-center">
        <InputGroup className="h-8 lg:max-w-xs lg:min-w-56 lg:flex-1">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            placeholder="ค้นหางาน แผนก โปรเจกต์ หรือห้าง…"
            aria-label="ค้นหางาน"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton size="icon-xs" aria-label="ล้างคำค้นหา" onClick={() => setQuery('')}>
                <XIcon />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Segmented label="สถานะงาน" value={status} onChange={(v) => setParam('status', v, DEFAULTS.status)} options={STATUS_OPTIONS} className="w-full sm:w-fit" />
          <Segmented
            label="ช่วงวันครบกำหนด"
            value={effectiveDue}
            onChange={(v) => setParam('due', v, DEFAULTS.due)}
            options={DUE_OPTIONS}
            disabled={status === 'done'}
            className="w-full sm:w-fit"
          />
        </div>
        <div className="flex items-center gap-2 lg:ml-auto">
          <span className="shrink-0 text-xs text-muted-foreground">จัดกลุ่มตาม</span>
          <Segmented label="จัดกลุ่มตาม" value={groupBy} onChange={(v) => setParam('group', v, DEFAULTS.group)} options={GROUP_OPTIONS} className="w-full sm:w-fit" />
        </div>
      </div>

      {tasksQuery.isPending ? (
        <ListSkeleton />
      ) : tasksQuery.isError ? (
        <EmptyState
          title="โหลดรายการงานไม่สำเร็จ"
          description={errorMessage(tasksQuery.error)}
          action={
            <Button variant="outline" size="sm" onClick={() => tasksQuery.refetch()}>
              ลองอีกครั้ง
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        deferredQuery.trim() ? (
          <EmptyState
            icon={<SearchXIcon className="size-5" />}
            title={`ไม่พบงานที่ตรงกับ “${deferredQuery.trim()}”`}
            description="ลองค้นด้วยชื่องาน ชื่อแผนก (เช่น NPD) รหัสโปรเจกต์ (เช่น PRJ-) หรือชื่อห้าง"
            action={
              <Button variant="outline" size="sm" onClick={() => setQuery('')}>
                ล้างคำค้นหา
              </Button>
            }
          />
        ) : hasFilters ? (
          <EmptyState
            icon={status === 'done' ? <CheckCheckIcon className="size-5" /> : undefined}
            title={status === 'done' ? 'ยังไม่มีงานที่ทำเสร็จ' : 'ไม่มีงานในช่วงที่เลือก'}
            description={effectiveDue === 'overdue' ? 'ไม่มีงานเลยกำหนดเลย เยี่ยมมาก!' : 'ลองเปลี่ยนตัวกรอง หรือดูงานทั้งหมดของคุณ'}
            action={
              <Button variant="outline" size="sm" onClick={clearAll}>
                ดูงานที่ยังไม่เสร็จทั้งหมด
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<PartyPopperIcon className="size-5" />}
            title="ไม่มีงานค้าง เยี่ยมมาก!"
            description="งานที่ได้รับมอบหมายใหม่จะแสดงที่นี่ พร้อมแจ้งเตือนเมื่อใกล้ครบกำหนด"
            action={
              <Button asChild variant="outline" size="sm">
                <Link to="/my-tasks?status=done">ดูงานที่ทำเสร็จแล้ว</Link>
              </Button>
            }
          />
        )
      ) : (
        <div className="space-y-5">
          <p className="text-xs text-muted-foreground" aria-live="polite">
            แสดง <span className="tabular font-medium text-foreground">{filtered.length}</span> งาน
            {groupBy === 'project' && <> ใน <span className="tabular font-medium text-foreground">{groups.length}</span> โปรเจกต์</>}
            {overdueCount > 0 && (
              <>
                {' · '}
                <span className="tabular font-medium text-danger">เลยกำหนด {overdueCount}</span>
              </>
            )}
          </p>
          {groups.map((g) => (
            <GroupSection key={g.key} group={g} toggler={toggler} groupBy={groupBy} />
          ))}
        </div>
      )}
    </div>
  )
}
