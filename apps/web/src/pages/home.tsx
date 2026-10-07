import { ListChecksIcon } from 'lucide-react'
import { Link } from 'react-router'
import type { HomeDashboard } from '@/api'
import { errorMessage, useHome } from '@/api/hooks'
import { useAuth, useCurrentUser } from '@/auth/auth'
import { EmptyState, PageHeader } from '@/components/common/misc'
import { Button } from '@/components/ui/button'
import { AgendaPanel } from '@/features/home/agenda-panel'
import { GettingStarted } from '@/features/home/getting-started'
import { HomeSkeleton } from '@/features/home/home-skeleton'
import { ProjectRounds } from '@/features/home/project-rounds'
import { ResultsPanel } from '@/features/home/results-panel'
import { summaryLine } from '@/features/home/summary-line'
import { TeamStrip } from '@/features/home/team-strip'
import { useTaskToggler } from '@/features/my-work/use-task-toggler'
import { dayjs, formatDate, today } from '@/lib/format'

function greeting(hour: number) {
  if (hour < 11) return 'อรุณสวัสดิ์'
  if (hour < 16) return 'สวัสดีตอนบ่าย'
  return 'สวัสดีตอนเย็น'
}

/** Involved in nothing yet: the getting-started card replaces the agenda, projects and results. */
function isBlank(home: HomeDashboard) {
  const { agenda } = home
  return home.projects.length === 0 && home.onHold === 0 && agenda.items.length === 0 && agenda.laterTasks === 0 && agenda.parkedTasks === 0 && home.results.items.length === 0
}

/** "วันนี้ฉันต้องทำอะไร": my agenda, my projects by launch round, my latest buyer results (+ the department strip). */
export default function HomePage() {
  const user = useCurrentUser()
  const { can } = useAuth()
  const homeQuery = useHome()
  const toggler = useTaskToggler(homeQuery.dataUpdatedAt)
  const home = homeQuery.data
  const t = home?.today ?? today()
  const firstName = user.nickname || user.name.split(/\s+/)[0]

  return (
    <div className="@container space-y-6">
      <PageHeader
        className="flex-nowrap items-start sm:flex-wrap sm:items-end"
        eyebrow={`วัน${dayjs(t).format('dddd')}ที่ ${formatDate(t, { long: true })}`}
        title={`${greeting(new Date().getHours())} คุณ${firstName}`}
        description={home ? summaryLine(home.agenda) : 'กำลังเตรียมงานของวันนี้…'}
        actions={
          <Button asChild variant="outline" size="sm" className="gap-1.5 max-sm:w-7 max-sm:px-0">
            <Link to="/my-tasks">
              <ListChecksIcon />
              <span className="sr-only sm:not-sr-only">งานของฉันทั้งหมด</span>
            </Link>
          </Button>
        }
      />

      {homeQuery.isPending ? (
        <HomeSkeleton withStrip={can('dashboard.monitor')} />
      ) : homeQuery.isError ? (
        <EmptyState
          title="โหลดข้อมูลหน้าหลักไม่สำเร็จ"
          description={errorMessage(homeQuery.error)}
          action={
            <Button variant="outline" size="sm" onClick={() => homeQuery.refetch()}>
              ลองอีกครั้ง
            </Button>
          }
        />
      ) : (
        <>
          {homeQuery.data.team && <TeamStrip team={homeQuery.data.team} />}
          {isBlank(homeQuery.data) ? (
            <GettingStarted canCreate={can('proposal.create')} canMonitor={can('dashboard.monitor')} />
          ) : (
            <div className="grid items-start gap-6 @4xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
              <AgendaPanel agenda={homeQuery.data.agenda} today={homeQuery.data.today} toggler={toggler} />
              <div className="grid min-w-0 gap-6">
                <ProjectRounds projects={homeQuery.data.projects} onHold={homeQuery.data.onHold} today={homeQuery.data.today} />
                <ResultsPanel results={homeQuery.data.results} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
