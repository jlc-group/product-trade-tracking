import { ListChecksIcon } from 'lucide-react'
import { Link } from 'react-router'
import type { HomeSummary } from '@/api'
import { errorMessage, useHome } from '@/api/hooks'
import { useCurrentUser } from '@/auth/auth'
import { EmptyState, PageHeader } from '@/components/common/misc'
import { Button } from '@/components/ui/button'
import { HomeCounters, HomeSkeleton, LaunchesPanel, ProjectsPanel, TodoPanel } from '@/features/my-work/home-panels'
import { useTaskToggler } from '@/features/my-work/use-task-toggler'
import { dayjs, formatDate, today } from '@/lib/format'

function greeting(hour: number) {
  if (hour < 11) return 'อรุณสวัสดิ์'
  if (hour < 16) return 'สวัสดีตอนบ่าย'
  return 'สวัสดีตอนเย็น'
}

/** One sentence that tells the user what today looks like. */
function summaryLine(home: HomeSummary) {
  const { overdue, dueToday } = home
  if (overdue.length === 0 && dueToday.length === 0) {
    return home.counts.open === 0 ? 'ไม่มีงานค้างเลย ใช้เวลาวางแผนโปรเจกต์ถัดไปได้เต็มที่' : 'วันนี้ไม่มีงานครบกำหนด ลองหยิบงานในสัปดาห์นี้มาทำล่วงหน้า'
  }
  const parts: string[] = []
  if (dueToday.length > 0) parts.push(`งานครบกำหนดวันนี้ ${dueToday.length} งาน`)
  if (overdue.length > 0) parts.push(`งานเลยกำหนด ${overdue.length} งานที่ควรเคลียร์ก่อน`)
  return `คุณมี${parts.join(' และ')}`
}

export default function HomePage() {
  const user = useCurrentUser()
  const homeQuery = useHome()
  const toggler = useTaskToggler(homeQuery.dataUpdatedAt)
  const home = homeQuery.data
  const t = home?.today ?? today()
  const firstName = user.nickname || user.name.split(/\s+/)[0]

  return (
    <div className="@container space-y-6">
      <PageHeader
        eyebrow={`วัน${dayjs(t).format('dddd')}ที่ ${formatDate(t, { long: true })}`}
        title={`${greeting(new Date().getHours())} คุณ${firstName}`}
        description={home ? summaryLine(home) : 'กำลังเตรียมงานของวันนี้…'}
        actions={
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link to="/my-tasks">
              <ListChecksIcon />
              งานของฉันทั้งหมด
            </Link>
          </Button>
        }
      />

      {homeQuery.isPending ? (
        <HomeSkeleton />
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
          <HomeCounters counts={homeQuery.data.counts} />
          <div className="grid items-start gap-6 @4xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <TodoPanel home={homeQuery.data} toggler={toggler} />
            <div className="grid min-w-0 gap-6">
              <ProjectsPanel projects={homeQuery.data.myProposals} />
              <LaunchesPanel launches={homeQuery.data.upcomingLaunches} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
