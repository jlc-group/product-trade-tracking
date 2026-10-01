import { useId, type ReactNode } from 'react'
import { AlertTriangleIcon, ArrowRightIcon, CalendarCheck2Icon, CheckCircle2Icon, CircleDotIcon, FolderPlusIcon, PartyPopperIcon, RocketIcon } from 'lucide-react'
import { Link } from 'react-router'
import type { HomeSummary, ProposalListItem, TaskWithContext } from '@/api'
import { useAuth } from '@/auth/auth'
import { ShelfTypeBadge, StatusBadge, StoreLogo } from '@/components/common/badges'
import { EmptyState, LaunchCountdown, ProgressBar } from '@/components/common/misc'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { dayjs, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { TaskToggler } from './use-task-toggler'
import { WorkTaskRow } from './work-task-row'

const SECTION_LIMIT = 5

// ---------- shared panel chrome ----------

export function Panel({ title, icon, action, children, className }: { title: string; icon?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className={cn('flex min-w-0 flex-col rounded-xl border bg-card', className)}>
      <header className="flex items-center gap-2 border-b px-4 py-3">
        {icon && <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>}
        <h2 id={id} className="text-sm font-semibold">
          {title}
        </h2>
        {action && <div className="ml-auto">{action}</div>}
      </header>
      {children}
    </section>
  )
}

function PanelLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Button asChild variant="ghost" size="sm" className="-mr-2 h-7 gap-1 text-xs text-muted-foreground hover:text-foreground">
      <Link to={to}>
        {children}
        <ArrowRightIcon />
      </Link>
    </Button>
  )
}

// ---------- counters ----------

export function HomeCounters({ counts }: { counts: HomeSummary['counts'] }) {
  const tiles = [
    { label: 'งานค้าง', value: counts.open, hint: 'งานที่คุณรับผิดชอบอยู่', to: '/my-tasks', icon: CircleDotIcon, tone: 'text-primary bg-brand-soft' },
    {
      label: 'เลยกำหนด',
      value: counts.overdue,
      hint: counts.overdue > 0 ? 'ควรจัดการก่อน' : 'ไม่มีงานเลยกำหนด',
      to: '/my-tasks?due=overdue',
      icon: AlertTriangleIcon,
      tone: counts.overdue > 0 ? 'text-danger bg-danger-soft' : 'text-muted-foreground bg-muted',
      alert: counts.overdue > 0,
    },
    { label: 'เสร็จสัปดาห์นี้', value: counts.doneThisWeek, hint: 'ใน 7 วันที่ผ่านมา', to: '/my-tasks?status=done', icon: CheckCircle2Icon, tone: 'text-success bg-success-soft' },
  ]
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-4">
      {tiles.map((t) => (
        <Link
          key={t.label}
          to={t.to}
          className={cn(
            'group flex min-w-0 flex-col gap-1 rounded-xl border bg-card p-3 transition-colors hover:border-primary/30 hover:bg-accent/30 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none sm:p-4',
            t.alert && 'border-danger/30',
          )}
        >
          <span className="flex items-center justify-between gap-2">
            <span className="text-xs leading-tight font-medium text-muted-foreground sm:text-sm">{t.label}</span>
            <span className={cn('hidden size-7 shrink-0 items-center justify-center rounded-lg sm:flex', t.tone)}>
              <t.icon className="size-4" />
            </span>
          </span>
          <span className={cn('tabular text-2xl font-semibold tracking-tight sm:text-3xl', t.alert && 'text-danger')}>{t.value}</span>
          <span className="hidden truncate text-xs text-muted-foreground sm:block">{t.hint}</span>
        </Link>
      ))}
    </div>
  )
}

// ---------- tasks to do ----------

function TaskSection({
  title,
  tone,
  items,
  moreHref,
  toggler,
}: {
  title: string
  tone: 'danger' | 'brand' | 'default'
  items: TaskWithContext[]
  moreHref: string
  toggler: TaskToggler
}) {
  if (items.length === 0) return null
  const shown = items.slice(0, SECTION_LIMIT)
  const rest = items.length - shown.length
  return (
    <div>
      <div className={cn('flex items-center gap-2 px-3 pt-3 pb-1 text-xs font-semibold sm:px-4', tone === 'danger' ? 'text-danger' : tone === 'brand' ? 'text-primary' : 'text-muted-foreground')}>
        <span className={cn('size-1.5 rounded-full', tone === 'danger' ? 'bg-danger' : tone === 'brand' ? 'bg-primary' : 'bg-muted-foreground/50')} aria-hidden />
        {title}
        <span
          className={cn(
            'tabular rounded-full px-1.5 leading-4',
            tone === 'danger' ? 'bg-danger-soft' : tone === 'brand' ? 'bg-brand-soft' : 'bg-muted',
          )}
        >
          {items.length}
        </span>
      </div>
      <ul className={cn('divide-y', tone === 'danger' && 'bg-danger-soft/30')}>
        {shown.map((item) => (
          <WorkTaskRow key={item.task.id} item={item} toggler={toggler} />
        ))}
      </ul>
      {rest > 0 && (
        <Link to={moreHref} className="block px-3 py-2 text-xs font-medium text-primary hover:underline sm:px-4">
          ดูอีก {rest} งาน
        </Link>
      )}
    </div>
  )
}

export function TodoPanel({ home, toggler }: { home: HomeSummary; toggler: TaskToggler }) {
  const empty = home.overdue.length + home.dueToday.length + home.dueThisWeek.length === 0
  const laterCount = Math.max(0, home.counts.open - home.overdue.length - home.dueToday.length - home.dueThisWeek.length)
  return (
    <Panel title="งานที่ต้องทำ" icon={<CalendarCheck2Icon />} action={<PanelLink to="/my-tasks">งานทั้งหมด</PanelLink>}>
      {empty ? (
        <EmptyState
          className="m-4 border-0 bg-transparent py-10"
          icon={<PartyPopperIcon className="size-5" />}
          title={home.counts.open === 0 ? 'ไม่มีงานค้าง เยี่ยมมาก!' : 'ไม่มีงานที่ครบกำหนดใน 7 วันนี้'}
          description={
            home.counts.open === 0
              ? 'งานที่ได้รับมอบหมายใหม่จะแสดงที่นี่ทันที'
              : `ยังมีงานค้างอีก ${home.counts.open} งานในช่วงถัดไป วางแผนล่วงหน้าได้เลย`
          }
          action={
            home.counts.open > 0 ? (
              <Button asChild variant="outline" size="sm">
                <Link to="/my-tasks">ดูงานทั้งหมดของฉัน</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="pb-2">
          <TaskSection title="เลยกำหนด" tone="danger" items={home.overdue} moreHref="/my-tasks?due=overdue" toggler={toggler} />
          <TaskSection title="วันนี้" tone="brand" items={home.dueToday} moreHref="/my-tasks?due=today" toggler={toggler} />
          <TaskSection title="7 วันข้างหน้า" tone="default" items={home.dueThisWeek} moreHref="/my-tasks?due=week" toggler={toggler} />
          {laterCount > 0 && (
            <p className="px-4 pt-3 text-xs text-muted-foreground">
              และอีก <span className="tabular font-medium text-foreground">{laterCount}</span> งานในช่วงถัดไป ·{' '}
              <Link to="/my-tasks" className="font-medium text-primary hover:underline">
                ดูทั้งหมด
              </Link>
            </p>
          )}
        </div>
      )}
    </Panel>
  )
}

// ---------- my projects ----------

function ProjectCard({ p }: { p: ProposalListItem }) {
  return (
    <li className="group relative rounded-lg border p-3 transition-colors hover:border-primary/30 hover:bg-accent/30">
      <div className="flex items-start gap-3">
        <StoreLogo store={p.store} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <Link
              to={`/proposals/${p.id}`}
              className="line-clamp-2 text-sm leading-snug font-medium outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring/60"
            >
              {p.title}
            </Link>
            <StatusBadge status={p.status} className="hidden shrink-0 sm:inline-flex" />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span className="tabular">{p.code}</span>
            <ShelfTypeBadge shelfType={p.shelfType} className="h-5 px-1.5 text-[11px]" />
            <StatusBadge status={p.status} className="h-5 px-2 text-[11px] sm:hidden" />
          </div>
        </div>
      </div>
      <ProgressBar progress={p.progress} className="mt-3" />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
        <span className="text-muted-foreground">
          วางขาย {formatDate(p.targetDate)} · <LaunchCountdown targetDate={p.targetDate} />
        </span>
        {p.overdueCount > 0 && (
          <span className="tabular inline-flex items-center gap-1 rounded-md bg-danger-soft px-1.5 py-0.5 font-medium text-danger">
            <AlertTriangleIcon className="size-3" />
            เลยกำหนด {p.overdueCount}
          </span>
        )}
      </div>
    </li>
  )
}

export function ProjectsPanel({ projects }: { projects: ProposalListItem[] }) {
  const { can } = useAuth()
  const shown = projects.slice(0, 6)
  return (
    <Panel title="โปรเจกต์ของฉัน" icon={<RocketIcon />} action={projects.length > 0 ? <PanelLink to="/proposals">ดูทั้งหมด</PanelLink> : undefined}>
      {projects.length === 0 ? (
        <EmptyState
          className="m-4 border-0 bg-transparent py-8"
          icon={<FolderPlusIcon className="size-5" />}
          title="ยังไม่มีโปรเจกต์ที่คุณดูแล"
          description="โปรเจกต์ที่คุณเป็นเจ้าของหรือเป็นสมาชิกทีมจะแสดงที่นี่"
          action={
            can('proposal.create') ? (
              <Button asChild size="sm">
                <Link to="/proposals/new">เสนอสินค้าใหม่</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="grid gap-2 p-3">
          {shown.map((p) => (
            <ProjectCard key={p.id} p={p} />
          ))}
        </ul>
      )}
    </Panel>
  )
}

// ---------- upcoming launches ----------

export function LaunchesPanel({ launches }: { launches: ProposalListItem[] }) {
  return (
    <Panel title="วางขายเร็ว ๆ นี้" icon={<CalendarCheck2Icon />} action={<span className="text-xs text-muted-foreground">30 วันข้างหน้า</span>}>
      {launches.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">ไม่มีสินค้าที่จะวางขายใน 30 วันนี้</p>
      ) : (
        <ul className="divide-y">
          {launches.map((p) => {
            const d = dayjs(p.targetDate)
            return (
              <li key={p.id} className="relative flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50">
                <span className="flex w-11 shrink-0 flex-col items-center rounded-lg bg-muted py-1 leading-none">
                  <span className="tabular text-base font-semibold">{d.format('D')}</span>
                  <span className="text-[10px] text-muted-foreground">{d.format('MMM')}</span>
                </span>
                <StoreLogo store={p.store} size="sm" />
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/proposals/${p.id}`}
                    className="block truncate text-sm font-medium outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring/60"
                  >
                    {p.title}
                  </Link>
                  <span className="block truncate text-xs text-muted-foreground">
                    {p.store.name} · {p.shelfType.name}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                  <LaunchCountdown targetDate={p.targetDate} />
                  <span className={cn('tabular text-[11px]', p.progress.percent === 100 ? 'text-success' : 'text-muted-foreground')}>เสร็จ {p.progress.percent}%</span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

// ---------- loading ----------

export function HomeSkeleton() {
  return (
    <div className="space-y-6" aria-busy aria-label="กำลังโหลดหน้าหลัก">
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 rounded-xl sm:h-28" />
        ))}
      </div>
      <div className="grid gap-6 @4xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <Skeleton className="h-5 w-32" />
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-start gap-3 py-1.5">
              <Skeleton className="size-[18px] rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </div>
        <div className="space-y-6">
          <div className="space-y-3 rounded-xl border bg-card p-4">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
          <div className="space-y-3 rounded-xl border bg-card p-4">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </div>
    </div>
  )
}
