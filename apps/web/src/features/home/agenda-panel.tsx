import { addDays, AGENDA_WEEK_DAYS, compareAgenda, type ISODate } from '@flowtrade/shared'
import type { AgendaBucket, AgendaItem, HomeDashboard } from '@/api'
import { ArrowRightIcon, ChevronDownIcon, ChevronUpIcon, HourglassIcon, ListChecksIcon, PartyPopperIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { EmptyState } from '@/components/common/misc'
import { Segmented, type SegmentOption } from '@/features/my-work/segmented'
import type { TaskToggler } from '@/features/my-work/use-task-toggler'
import { WorkTaskRow } from '@/features/my-work/work-task-row'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { BuyerAgendaRow, ProductionAgendaRow, ProposalAgendaRow } from './agenda-rows'
import { MoreToggle, Panel } from './panel'
import { useUsersById, type UsersById } from './users'

type Filter = 'all' | 'prep' | 'buyer'
type ListedBucket = Exclude<AgendaBucket, 'waiting'>

const BUCKETS: { bucket: ListedBucket; title: string; limit: number; dot: string; text: string; pill: string }[] = [
  { bucket: 'overdue', title: 'เลยกำหนด', limit: 10, dot: 'bg-danger', text: 'text-danger', pill: 'bg-danger-soft' },
  { bucket: 'today', title: 'วันนี้', limit: 10, dot: 'bg-primary', text: 'text-primary', pill: 'bg-brand-soft' },
  { bucket: 'week', title: '7 วันข้างหน้า', limit: 5, dot: 'bg-muted-foreground/50', text: 'text-muted-foreground', pill: 'bg-muted' },
  { bucket: 'next', title: 'ขั้นต่อไปที่รอคุณ', limit: 5, dot: 'bg-success', text: 'text-success', pill: 'bg-success-soft' },
]

const isPrep = (i: AgendaItem) => i.kind === 'task'

function AgendaRow({ item, today, toggler, users }: { item: AgendaItem; today: ISODate; toggler: TaskToggler; users: UsersById }) {
  if (item.kind === 'task') return <WorkTaskRow item={item} toggler={toggler} />
  if (item.kind === 'buyer') return <BuyerAgendaRow item={item} today={today} users={users} />
  if (item.kind === 'production') return <ProductionAgendaRow item={item} today={today} />
  return <ProposalAgendaRow item={item} />
}

/** One time bucket: TaskSection-style header (dot + title + count) and its rows, `limit` at first. */
function BucketSection({
  meta,
  items,
  today,
  toggler,
  users,
}: {
  meta: (typeof BUCKETS)[number]
  items: AgendaItem[]
  today: ISODate
  toggler: TaskToggler
  users: UsersById
}) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? items : items.slice(0, meta.limit)
  const hidden = items.length - meta.limit
  const headingId = `agenda-${meta.bucket}-title`
  return (
    <section id={`agenda-${meta.bucket}`} aria-labelledby={headingId} className="scroll-mt-20">
      <h3 id={headingId} className={cn('flex items-center gap-2 px-3 pt-3 pb-1 text-xs font-semibold sm:px-4', meta.text)}>
        <span className={cn('size-1.5 rounded-full', meta.dot)} aria-hidden />
        {meta.title}
        <span className={cn('tabular rounded-full px-1.5 leading-4', meta.pill)}>{items.length}</span>
      </h3>
      <ul className={cn('divide-y', meta.bucket === 'overdue' && 'bg-danger-soft/30')}>
        {shown.map((item) => (
          <AgendaRow key={item.key} item={item} today={today} toggler={toggler} users={users} />
        ))}
      </ul>
      {hidden > 0 && <MoreToggle expanded={expanded} label={`แสดงอีก ${hidden} รายการ`} onToggle={() => setExpanded((v) => !v)} className="px-3 sm:px-4" />}
    </section>
  )
}

/** "สิ่งที่ต้องทำ": prep tasks, buyer steps and project steps in time buckets, with the waiting rows folded into the footer. */
export function AgendaPanel({ agenda, today, toggler }: { agenda: HomeDashboard['agenda']; today: ISODate; toggler: TaskToggler }) {
  const users = useUsersById()
  const [filter, setFilter] = useState<Filter>('all')
  const [showWaiting, setShowWaiting] = useState(false)

  const items = useMemo(() => [...agenda.items].sort(compareAgenda), [agenda.items])
  const listed = items.filter((i) => i.bucket !== 'waiting')
  const waiting = items.filter((i) => i.bucket === 'waiting')
  const prepCount = listed.filter(isPrep).length
  const buyerCount = listed.length - prepCount
  const hasFilter = prepCount > 0 && buyerCount > 0
  const active: Filter = hasFilter ? filter : 'all'
  const visible = active === 'all' ? listed : listed.filter((i) => isPrep(i) === (active === 'prep'))

  const options: SegmentOption<Filter>[] = [
    { value: 'all', label: 'ทั้งหมด', count: listed.length },
    { value: 'prep', label: 'งานเตรียม', count: prepCount },
    { value: 'buyer', label: 'Buyer · ผลิต', count: buyerCount },
  ]
  const filterControl = (className?: string) => <Segmented label="แสดงเรื่องที่ต้องทำ" value={active} onChange={setFilter} options={options} className={className} />

  const weekEnd = formatDate(addDays(today, AGENDA_WEEK_DAYS), { withYear: false })
  const inReview = waiting.filter((i) => i.kind === 'buyer' && i.action === 'followUp').length
  const laterMeetings = waiting.length - inReview
  const waitingText = [
    inReview > 0 && `รอ Buyer พิจารณาอยู่อีก ${inReview} รายการ (ยังไม่ถึงกำหนดทราบผล)`,
    laterMeetings > 0 && `นัดนำเสนอหลัง ${weekEnd} อีก ${laterMeetings} นัด`,
  ]
    .filter(Boolean)
    .join(' · ')
  const taskText = [
    agenda.laterTasks > 0 && `และอีก ${agenda.laterTasks} งานที่ครบกำหนดหลัง ${weekEnd} หรือยังไม่กำหนดวัน`,
    agenda.parkedTasks > 0 && `ไม่รวมงานในโปรเจกต์ร่าง/พักไว้/ปิดแล้ว ${agenda.parkedTasks} งาน`,
    agenda.doneLast7Days > 0 && `7 วันที่ผ่านมาทำเสร็จ ${agenda.doneLast7Days} งาน`,
  ]
    .filter(Boolean)
    .join(' · ')
  const nothingAtAll = listed.length === 0 && waiting.length === 0 && agenda.laterTasks === 0

  return (
    <Panel
      id="agenda"
      className="@container"
      title="สิ่งที่ต้องทำ"
      icon={<ListChecksIcon />}
      action={hasFilter ? <div className="hidden @md:block">{filterControl()}</div> : undefined}
    >
      {hasFilter && <div className="border-b px-3 py-2 @md:hidden">{filterControl('w-full')}</div>}

      {nothingAtAll ? (
        <EmptyState
          className="m-4 border-0 bg-transparent py-8"
          icon={<PartyPopperIcon className="size-5" />}
          title="ไม่มีงานค้าง เยี่ยมมาก!"
          description="งานเตรียมข้อมูล ขั้นตอนนำเสนอ Buyer และการผลิตที่ต้องทำจะแสดงที่นี่ทันที"
        />
      ) : listed.length === 0 ? (
        <p className="px-4 pt-6 pb-2 text-center text-sm text-muted-foreground">ไม่มีเรื่องที่ต้องทำใน 7 วันนี้</p>
      ) : (
        <div className="pb-1">
          {BUCKETS.map((meta) => {
            const rows = visible.filter((i) => i.bucket === meta.bucket)
            return rows.length > 0 && <BucketSection key={meta.bucket} meta={meta} items={rows} today={today} toggler={toggler} users={users} />
          })}
        </div>
      )}

      <div className="mt-auto border-t">
        {waiting.length > 0 && active !== 'prep' && (
          <>
            <p className="flex items-start gap-1.5 px-3 pt-3 text-xs text-muted-foreground sm:px-4">
              <HourglassIcon className="mt-px size-3.5 shrink-0" aria-hidden />
              <span className="min-w-0">
                {waitingText}{' '}
                <button
                  type="button"
                  onClick={() => setShowWaiting((v) => !v)}
                  aria-expanded={showWaiting}
                  className="inline-flex items-center gap-0.5 font-medium whitespace-nowrap text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  {showWaiting ? 'ซ่อน' : 'แสดง'}
                  {showWaiting ? <ChevronUpIcon className="size-3.5" aria-hidden /> : <ChevronDownIcon className="size-3.5" aria-hidden />}
                </button>
              </span>
            </p>
            {showWaiting && (
              <ul className="mt-2 divide-y border-y">
                {waiting.map((item) => (
                  <AgendaRow key={item.key} item={item} today={today} toggler={toggler} users={users} />
                ))}
              </ul>
            )}
          </>
        )}
        <div className="space-y-1.5 px-3 py-3 text-xs text-muted-foreground sm:px-4">
          {taskText && active !== 'buyer' && <p>{taskText}</p>}
          <Link to="/my-tasks" className="inline-flex items-center gap-1 font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60">
            งานของฉันทั้งหมด
            <ArrowRightIcon className="size-3.5" aria-hidden />
          </Link>
        </div>
      </div>
    </Panel>
  )
}
