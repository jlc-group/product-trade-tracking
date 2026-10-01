import { ArrowLeftIcon, HistoryIcon, LayoutDashboardIcon, ListTreeIcon, RotateCwIcon, SearchXIcon, TriangleAlertIcon } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router'
import { ApiError, type ProposalDetail } from '@/api'
import { errorMessage, useProposal } from '@/api/hooks'
import { EmptyState, PageHeader } from '@/components/common/misc'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ProposalDetailSkeleton } from '@/features/proposal-detail/detail-skeleton'
import { HistoryTab } from '@/features/proposal-detail/history-tab'
import { OverviewTab } from '@/features/proposal-detail/overview-tab'
import { ProposalHeader } from '@/features/proposal-detail/proposal-header'
import { TaskTree } from '@/features/task-tree/task-tree'

const TABS = ['tasks', 'overview', 'history'] as const
type TabKey = (typeof TABS)[number]

function ProposalsCrumb({ code }: { code?: string }) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link to="/proposals">การเสนอสินค้า</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {code && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="tabular">{code}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

export default function ProposalDetailPage() {
  const { id = '' } = useParams()
  const { data, error, isPending, refetch } = useProposal(id)

  if (isPending) return <ProposalDetailSkeleton />

  if (error) {
    const notFound = error instanceof ApiError && (error.status === 404 || error.status === 403)
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="การเสนอสินค้า" />
        {notFound ? (
          <EmptyState
            icon={<SearchXIcon className="size-5" />}
            title="ไม่พบการเสนอสินค้านี้ หรือคุณไม่มีสิทธิ์เข้าถึง"
            description="ลิงก์อาจไม่ถูกต้อง รายการถูกลบไปแล้ว หรือคุณยังไม่ได้อยู่ในทีมงาน — ขอให้เจ้าของเพิ่มคุณเป็นทีมงานก่อน"
            action={
              <Button asChild variant="outline">
                <Link to="/proposals">
                  <ArrowLeftIcon /> กลับไปหน้ารายการการเสนอสินค้า
                </Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<TriangleAlertIcon className="size-5" />}
            title="โหลดข้อมูลไม่สำเร็จ"
            description={errorMessage(error)}
            action={
              <Button variant="outline" onClick={() => refetch()}>
                <RotateCwIcon /> ลองอีกครั้ง
              </Button>
            }
          />
        )}
      </div>
    )
  }

  // Keyed so dialogs and local state reset when navigating to another proposal (e.g. after "คัดลอก").
  return <ProposalView key={data.id} proposal={data} />
}

function ProposalView({ proposal }: { proposal: ProposalDetail }) {
  const [params, setParams] = useSearchParams()
  const rawTab = params.get('tab')
  // ?task=<id> always shows the task list — TaskTree opens the drawer from the URL.
  const tab: TabKey = params.get('task') ? 'tasks' : (TABS.find((t) => t === rawTab) ?? 'tasks')

  const setTab = (value: string) => {
    const next = TABS.find((t) => t === value) ?? 'tasks'
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (next === 'tasks') p.delete('tab')
        else {
          p.set('tab', next)
          p.delete('task')
        }
        return p
      },
      { replace: true },
    )
  }

  const openTask = (taskId: string) => {
    setParams((prev) => {
      const p = new URLSearchParams(prev)
      p.delete('tab')
      p.set('task', taskId)
      return p
    })
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <ProposalsCrumb code={proposal.code} />
      <ProposalHeader proposal={proposal} />

      <Tabs value={tab} onValueChange={setTab} className="min-w-0 gap-4">
        <div className="scrollbar-thin -mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <TabsList className="h-9">
            <TabsTrigger value="tasks" className="px-3">
              <ListTreeIcon /> รายการงาน
              <span className="tabular rounded-full bg-foreground/10 px-1.5 text-[11px] leading-4">{proposal.progress.total}</span>
            </TabsTrigger>
            <TabsTrigger value="overview" className="px-3">
              <LayoutDashboardIcon /> ภาพรวม
            </TabsTrigger>
            <TabsTrigger value="history" className="px-3">
              <HistoryIcon /> ประวัติ
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="tasks" className="min-w-0">
          <TaskTree proposal={proposal} />
        </TabsContent>
        <TabsContent value="overview" className="min-w-0">
          <OverviewTab proposal={proposal} onOpenTask={openTask} onGoToTasks={() => setTab('tasks')} />
        </TabsContent>
        <TabsContent value="history" className="min-w-0">
          <HistoryTab proposalId={proposal.id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
