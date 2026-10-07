import { CloudOffIcon, ListIcon, RefreshCwIcon } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useLocation } from 'react-router'
import { toast } from 'sonner'
import { errorMessage, useDashboard } from '@/api/hooks'
import { EmptyState, PageHeader } from '@/components/common/misc'
import { Button } from '@/components/ui/button'
import { AtRiskList } from '@/features/monitor/at-risk-list'
import { BuyerOverdue } from '@/features/monitor/buyer-overdue'
import { KpiTiles } from '@/features/monitor/kpi-tiles'
import { MonitorSkeleton } from '@/features/monitor/monitor-skeleton'
import { OverdueTasks } from '@/features/monitor/overdue-tasks'
import { StatusChannelCard } from '@/features/monitor/status-channel'
import { StoreChart } from '@/features/monitor/store-chart'
import { UpcomingLaunches } from '@/features/monitor/upcoming-launches'
import { WorkloadChart } from '@/features/monitor/workload-chart'
import { dayjs, formatDate, today } from '@/lib/format'
import { cn } from '@/lib/utils'

export default function AdminMonitorPage() {
  const { data, isLoading, isFetching, error, refetch, dataUpdatedAt } = useDashboard()
  const day = data?.today ?? today()
  const { hash } = useLocation()
  const loaded = !!data

  // Links like /admin#buyer land before the sections exist: scroll once the data is in.
  useEffect(() => {
    if (loaded && hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [loaded, hash])

  const refresh = async () => {
    const result = await refetch()
    if (result.isSuccess) toast.success('อัปเดตข้อมูลภาพรวมล่าสุดแล้ว')
    else if (result.error) toast.error(errorMessage(result.error))
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`วัน${dayjs(day).format('dddd')}ที่ ${formatDate(day, { long: true })}`}
        title="Monitor ภาพรวม"
        description="ดูทุกโปรเจกต์เสนอสินค้าในหน้าเดียว — งานไหนเลยกำหนด โปรเจกต์ไหนต้องเร่ง ใครงานล้น และอะไรกำลังจะวางขาย"
        actions={
          <>
            {data && (
              <span className="tabular hidden text-xs text-muted-foreground sm:inline">อัปเดตเมื่อ {dayjs(dataUpdatedAt).format('HH:mm')} น.</span>
            )}
            <Button variant="outline" size="sm" onClick={refresh} disabled={isFetching}>
              <RefreshCwIcon className={cn(isFetching && 'animate-spin')} />
              รีเฟรชข้อมูล
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/proposals">
                <ListIcon />
                ดูการเสนอสินค้าทั้งหมด
              </Link>
            </Button>
          </>
        }
      />

      {isLoading ? (
        <MonitorSkeleton />
      ) : !data ? (
        <EmptyState
          icon={<CloudOffIcon className="size-5" />}
          title="โหลดข้อมูลภาพรวมไม่สำเร็จ"
          description={error ? `${errorMessage(error)} — ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง` : 'ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง'}
          action={
            <Button size="sm" onClick={refresh} disabled={isFetching}>
              <RefreshCwIcon className={cn(isFetching && 'animate-spin')} />
              ลองอีกครั้ง
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          <KpiTiles data={data} />
          <div className="grid gap-4 xl:grid-cols-12">
            <AtRiskList items={data.atRisk} className="xl:col-span-7" />
            <UpcomingLaunches items={data.upcomingLaunches} className="xl:col-span-5" />
            <BuyerOverdue items={data.buyerOverdue} today={data.today} className="xl:col-span-7" />
            <StatusChannelCard data={data} className="xl:col-span-5" />
            <StoreChart data={data.byStore} overdueTasks={data.overdueTasks} className="xl:col-span-6" />
            <WorkloadChart data={data.workload} className="xl:col-span-6" />
            <OverdueTasks items={data.overdueTasks} className="xl:col-span-12" />
          </div>
        </div>
      )}
    </div>
  )
}
