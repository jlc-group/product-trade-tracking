import { addDays, type ISODate } from '@flowtrade/shared'
import { ArrowRightIcon, CalendarOffIcon, CircleAlertIcon, RefreshCwIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { errorMessage } from '@/api/hooks'
import { useAuth } from '@/auth/auth'
import { EmptyState, PageHeader } from '@/components/common/misc'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { AgendaList, AgendaSkeleton } from '@/features/calendar/agenda'
import { DayPanel } from '@/features/calendar/day-panel'
import { MiniMonth } from '@/features/calendar/mini-month'
import { bucketsInRange, isCountedOverdue, monthKey, monthLabel, nearestMonthWithItems, shiftMonth, type DayBucket } from '@/features/calendar/model'
import { CalendarLegend, MonthGrid, MonthGridSkeleton } from '@/features/calendar/month-grid'
import { CalendarToolbar } from '@/features/calendar/toolbar'
import { useCalendarData, useCalendarParams } from '@/features/calendar/use-calendar'
import { useIsMobile } from '@/hooks/use-mobile'
import { formatDate, today as getToday } from '@/lib/format'
import { usePrefs } from '@/lib/prefs'

const AGENDA_DAYS = 14

function countTasks(days: DayBucket[], todayDate: ISODate) {
  let tasks = 0
  let overdue = 0
  for (const d of days) {
    tasks += d.tasks.length
    overdue += d.tasks.filter((t) => isCountedOverdue(t, todayDate)).length
  }
  return { tasks, overdue }
}

const Num = ({ children, className }: { children: number; className?: string }) => <span className={`tabular font-semibold ${className ?? 'text-foreground'}`}>{children}</span>

export default function CalendarPage() {
  const { can } = useAuth()
  const { buddhistEra } = usePrefs()
  const { month, channel, layers, update } = useCalendarParams()
  const { buckets, isLoading, error, refetch } = useCalendarData(channel, layers)
  const isMobile = useIsMobile()
  const todayDate = getToday()
  const [panel, setPanel] = useState<{ date: ISODate | null; open: boolean }>({ date: null, open: false })

  const label = monthLabel(month, buddhistEra)
  const showLaunches = layers.includes('launches')
  const showTasks = layers.includes('tasks')

  const monthDays = bucketsInRange(buckets, `${month}-01`, `${month}-31`)
  const monthLaunches = monthDays.reduce((n, d) => n + d.launches.length, 0)
  const monthTasks = countTasks(monthDays, todayDate)
  const nearest = monthDays.length === 0 ? nearestMonthWithItems(buckets, month) : null

  const agendaEnd = addDays(todayDate, AGENDA_DAYS - 1)
  const upcoming = bucketsInRange(buckets, todayDate, agendaEnd)
  const overdueAll = countTasks(bucketsInRange(buckets, '0000-01-01', addDays(todayDate, -1)), todayDate).overdue

  const openDay = (date: ISODate) => setPanel({ date, open: true })
  const moveDay = (date: ISODate) => {
    setPanel({ date, open: true })
    if (monthKey(date) !== month) update({ month: monthKey(date) })
  }

  const summary = isLoading ? (
    <Skeleton className="h-4 w-64" />
  ) : error ? null : monthDays.length === 0 ? (
    <span className="flex flex-wrap items-center gap-x-2">
      ไม่มีรายการในเดือนนี้
      {nearest && (
        <Button variant="link" size="sm" className="h-auto p-0" onClick={() => update({ month: nearest })}>
          ไปที่{monthLabel(nearest, buddhistEra)} <ArrowRightIcon />
        </Button>
      )}
    </span>
  ) : (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
      {showLaunches && (
        <span>
          วางขาย <Num>{monthLaunches}</Num> รายการ
        </span>
      )}
      {showTasks && (
        <span>
          งานครบกำหนด <Num>{monthTasks.tasks}</Num> งาน
        </span>
      )}
      {showTasks && monthTasks.overdue > 0 && (
        <span className="text-danger">
          เลยกำหนด <Num className="text-danger">{monthTasks.overdue}</Num> งาน
        </span>
      )}
    </span>
  )

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="ปฏิทิน"
        description={
          can('proposal.read.all')
            ? 'วันวางขายของทุกโปรเจกต์ และวันครบกำหนดงานของคุณ ในมุมมองรายเดือน — กดที่วันเพื่อดูรายละเอียดและติ๊กงานได้ทันที'
            : 'วันวางขายของโปรเจกต์ที่คุณร่วมทำ และวันครบกำหนดงานของคุณ ในมุมมองรายเดือน — กดที่วันเพื่อดูรายละเอียดและติ๊กงานได้ทันที'
        }
      />

      <CalendarToolbar
        label={label}
        isCurrentMonth={month === monthKey(todayDate)}
        onPrev={() => update({ month: shiftMonth(month, -1) })}
        onNext={() => update({ month: shiftMonth(month, 1) })}
        onToday={() => update({ month: monthKey(todayDate) })}
        layers={layers}
        onLayersChange={(next) => update({ layers: next })}
        channel={channel}
        onChannelChange={(next) => update({ channel: next })}
        summary={summary}
      />

      {error ? (
        <EmptyState
          icon={<CircleAlertIcon className="size-5" />}
          title="โหลดข้อมูลปฏิทินไม่สำเร็จ"
          description={`${errorMessage(error)} — ตรวจสอบการเชื่อมต่อแล้วกดลองอีกครั้ง`}
          action={
            <Button variant="outline" size="sm" onClick={refetch}>
              <RefreshCwIcon /> ลองอีกครั้ง
            </Button>
          }
        />
      ) : (
        <>
          {/* Desktop / tablet: month grid + 14-day agenda */}
          <section className="hidden space-y-3 md:block" aria-label={`ปฏิทินเดือน${label}`}>
            {isLoading ? (
              <MonthGridSkeleton />
            ) : (
              <MonthGrid
                month={month}
                label={label}
                buckets={buckets}
                today={todayDate}
                selected={panel.open ? panel.date : null}
                onSelect={openDay}
                onMonthChange={(m) => update({ month: m })}
              />
            )}
            <CalendarLegend showLaunches={showLaunches} showTasks={showTasks} />
          </section>

          <section className="hidden space-y-4 md:block" aria-labelledby="calendar-agenda-title">
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
              <div>
                <h2 id="calendar-agenda-title" className="text-base font-semibold">
                  {AGENDA_DAYS} วันข้างหน้า
                </h2>
                <p className="tabular text-sm text-muted-foreground">
                  {formatDate(todayDate)} – {formatDate(agendaEnd)}
                </p>
              </div>
              {showTasks && overdueAll > 0 && (
                <Link
                  to="/my-tasks?due=overdue"
                  className="inline-flex items-center gap-1.5 rounded-full bg-danger-soft px-3 py-1 text-xs font-medium text-danger outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <CircleAlertIcon className="size-3.5" aria-hidden />
                  มีงานเลยกำหนด <span className="tabular">{overdueAll}</span> งาน — ไปที่งานของฉัน
                </Link>
              )}
            </div>
            {isLoading ? (
              <AgendaSkeleton />
            ) : upcoming.length > 0 ? (
              <AgendaList days={upcoming} today={todayDate} className="items-start xl:grid-cols-2" />
            ) : (
              <EmptyState
                icon={<CalendarOffIcon className="size-5" />}
                title={`${AGENDA_DAYS} วันข้างหน้ายังว่าง`}
                description="ยังไม่มีวันวางขายหรืองานของคุณที่ครบกำหนดในช่วงนี้ ลองเปลี่ยนตัวกรองช่องทางหรือดูเดือนถัดไปในปฏิทินด้านบน"
                className="py-8"
              />
            )}
          </section>

          {/* Phone: compact month + agenda of the whole month */}
          <section className="space-y-4 md:hidden" aria-labelledby="calendar-month-agenda-title">
            {isLoading ? (
              <Skeleton className="h-80 rounded-xl" />
            ) : (
              <MiniMonth month={month} label={label} buckets={buckets} today={todayDate} selected={panel.open ? panel.date : null} onSelect={openDay} />
            )}
            <h2 id="calendar-month-agenda-title" className="text-base font-semibold">
              รายการในเดือน{label}
            </h2>
            {isLoading ? (
              <AgendaSkeleton />
            ) : monthDays.length > 0 ? (
              <AgendaList days={monthDays} today={todayDate} />
            ) : (
              <EmptyState
                icon={<CalendarOffIcon className="size-5" />}
                title="เดือนนี้ยังว่าง"
                description="ไม่มีวันวางขายหรืองานของคุณที่ครบกำหนดในเดือนนี้"
                action={
                  nearest ? (
                    <Button variant="outline" size="sm" onClick={() => update({ month: nearest })}>
                      ไปที่{monthLabel(nearest, buddhistEra)} <ArrowRightIcon />
                    </Button>
                  ) : undefined
                }
              />
            )}
          </section>
        </>
      )}

      <DayPanel
        open={panel.open}
        onOpenChange={(open) => setPanel((p) => ({ ...p, open }))}
        date={panel.date}
        bucket={panel.date ? buckets.get(panel.date) : undefined}
        layers={layers}
        today={todayDate}
        side={isMobile ? 'bottom' : 'right'}
        onDateChange={moveDay}
      />
    </div>
  )
}
