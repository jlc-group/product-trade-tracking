// One day in detail: side sheet on desktop, bottom sheet on phones.
import { addDays, type ISODate } from '@flowtrade/shared'
import { CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useAuth } from '@/auth/auth'
import { EmptyState } from '@/components/common/misc'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { formatDate, relativeDay } from '@/lib/format'
import { cn } from '@/lib/utils'
import { LaunchRow, TaskRow } from './items'
import { isCountedOverdue, weekdayName, type DayBucket, type Layer } from './model'

function Section({ title, count, tone, children }: { title: string; count: number; tone?: 'danger'; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground">
        {title}
        <span className={cn('tabular rounded-full px-1.5 py-0.5 text-[11px] leading-none', tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-muted text-muted-foreground')}>{count}</span>
      </h3>
      {children}
    </section>
  )
}

export function DayPanel({
  open,
  onOpenChange,
  date,
  bucket,
  layers,
  today,
  side,
  onDateChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  date: ISODate | null
  bucket: DayBucket | undefined
  layers: Layer[]
  today: ISODate
  side: 'right' | 'bottom'
  onDateChange: (date: ISODate) => void
}) {
  const { can } = useAuth()
  const launches = bucket?.launches ?? []
  const tasks = bucket?.tasks ?? []
  const overdue = tasks.filter((t) => isCountedOverdue(t, today)).length
  const showLaunches = layers.includes('launches')
  const showTasks = layers.includes('tasks')
  const empty = launches.length + tasks.length === 0

  const summary = [
    showLaunches && (launches.length ? `วางขาย ${launches.length} รายการ` : 'ไม่มีวันวางขาย'),
    showTasks && (tasks.length ? `งานของฉัน ${tasks.length} งาน` : 'ไม่มีงานครบกำหนด'),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        className={cn('gap-0', side === 'right' ? 'data-[side=right]:sm:max-w-md' : 'max-h-[85dvh] rounded-t-2xl')}
      >
        {date && (
          <>
            <SheetHeader className="border-b pr-12">
              <div className="flex items-center gap-2">
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', date === today ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{relativeDay(date)}</span>
                <div className="ml-auto flex items-center">
                  <Button variant="ghost" size="icon-sm" aria-label="วันก่อนหน้า" onClick={() => onDateChange(addDays(date, -1))}>
                    <ChevronLeftIcon />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label="วันถัดไป" onClick={() => onDateChange(addDays(date, 1))}>
                    <ChevronRightIcon />
                  </Button>
                </div>
              </div>
              <SheetTitle className="text-lg font-semibold">
                {weekdayName(date)}ที่ {formatDate(date, { long: true })}
              </SheetTitle>
              <SheetDescription>{summary}</SheetDescription>
            </SheetHeader>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 scrollbar-thin">
              {empty ? (
                <EmptyState
                  icon={<CalendarDaysIcon className="size-5" />}
                  title="ยังไม่มีรายการในวันที่เลือก"
                  description={
                    layers.length < 2
                      ? `กำลังซ่อน${showLaunches ? 'งานของฉัน' : 'วันวางขาย'}อยู่ เปิดตัวกรองด้านบนเพื่อดูครบทุกอย่าง`
                      : 'ไม่มีโปรเจกต์ที่วางขาย และไม่มีงานของคุณที่ครบกำหนดในวันนั้น ลองกดลูกศรด้านบนเพื่อดูวันอื่น'
                  }
                  action={
                    can('proposal.create') && showLaunches ? (
                      <Button asChild size="sm" variant="outline">
                        <Link to="/proposals/new">
                          <PlusIcon /> เสนอสินค้าใหม่
                        </Link>
                      </Button>
                    ) : undefined
                  }
                  className="py-10"
                />
              ) : (
                <>
                  {showLaunches && launches.length > 0 && (
                    <Section title="วันวางขาย" count={launches.length}>
                      <div className="divide-y overflow-hidden rounded-xl border bg-card">
                        {launches.map((p) => (
                          <LaunchRow key={p.id} p={p} className="rounded-none" />
                        ))}
                      </div>
                    </Section>
                  )}
                  {showTasks && tasks.length > 0 && (
                    <Section title={overdue ? `งานของฉันที่ครบกำหนด · เลยกำหนด ${overdue}` : 'งานของฉันที่ครบกำหนด'} count={tasks.length} tone={overdue ? 'danger' : undefined}>
                      <div className="divide-y overflow-hidden rounded-xl border bg-card">
                        {tasks.map((t) => (
                          <TaskRow key={t.task.id} item={t} />
                        ))}
                      </div>
                    </Section>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
