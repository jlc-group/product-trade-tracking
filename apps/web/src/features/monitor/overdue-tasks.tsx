import { LEVEL_LABEL, type User } from '@flowtrade/shared'
import { AlarmClockIcon, PartyPopperIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useUserLookup } from '@/api/hooks'
import type { TaskWithContext } from '@/api/types'
import { PriorityBadge, StoreLogos } from '@/components/common/badges'
import { EmptyState } from '@/components/common/misc'
import { AvatarStack } from '@/components/common/user-avatar'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate, relativeDay } from '@/lib/format'
import { MonitorSection, ShowMoreButton } from './parts'
import { fmt } from './utils'

const LIMIT = 8

const taskLink = (x: TaskWithContext) => `/proposals/${x.proposal.id}?task=${x.task.id}`

function PathLine({ x }: { x: TaskWithContext }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      <span className="shrink-0 rounded bg-muted px-1 py-px text-[10px] font-medium">{LEVEL_LABEL[x.task.level]}</span>
      <span className="truncate">{x.path.length > 0 ? x.path.join(' › ') : 'งานระดับบนสุด'}</span>
    </span>
  )
}

function Assignees({ users }: { users: User[] }) {
  if (users.length === 0) return <span className="text-xs font-medium text-warning-foreground">ยังไม่มีผู้รับผิดชอบ</span>
  return <AvatarStack users={users} max={3} size="sm" />
}

function DueCell({ date }: { date: string }) {
  return (
    <span className="flex flex-col leading-tight">
      <span className="tabular text-xs font-semibold text-danger">{relativeDay(date)}</span>
      <span className="tabular text-xs text-muted-foreground">{formatDate(date)}</span>
    </span>
  )
}

export function OverdueTasks({ items, className }: { items: TaskWithContext[]; className?: string }) {
  const navigate = useNavigate()
  const { data: users = [] } = useUserLookup()
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])
  const assigneesOf = (x: TaskWithContext) => x.task.assigneeIds.map((id) => userById.get(id)).filter((u): u is User => !!u)

  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? items : items.slice(0, LIMIT)
  const proposalCount = new Set(items.map((x) => x.proposal.id)).size

  return (
    <MonitorSection
      id="overdue-tasks"
      className={className}
      icon={<AlarmClockIcon className={items.length > 0 ? 'text-danger' : undefined} />}
      title={
        <>
          งานที่เลยกำหนด
          {items.length > 0 && <span className="tabular rounded-full bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger">{fmt(items.length)}</span>}
        </>
      }
      description={
        items.length > 0
          ? `จาก ${fmt(proposalCount)} โปรเจกต์ เรียงจากที่เลยกำหนดนานที่สุด — กดที่งานเพื่อเปิดในโปรเจกต์`
          : 'งานที่ถึงกำหนดส่งแล้วแต่ยังไม่ติ๊กเสร็จ'
      }
    >
      {items.length === 0 ? (
        <EmptyState
          icon={<PartyPopperIcon className="size-5 text-success" />}
          title="ไม่มีงานที่เลยกำหนด"
          description="ทุกงานยังอยู่ในกำหนดเวลา หากมีงานที่ถึงกำหนดแล้วยังไม่เสร็จ จะแสดงที่นี่ทันที"
          className="py-10"
        />
      ) : (
        <div className="@container">
          {/* Wide: table */}
          <div className="hidden @2xl:block">
            <Table>
              <TableHeader>
                <TableRow className="text-xs hover:bg-transparent">
                  <TableHead className="text-muted-foreground">งาน</TableHead>
                  <TableHead className="text-muted-foreground">โปรเจกต์</TableHead>
                  <TableHead className="text-muted-foreground">กำหนดส่ง</TableHead>
                  <TableHead className="text-muted-foreground">ผู้รับผิดชอบ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((x) => (
                  <TableRow key={x.task.id} className="cursor-pointer" onClick={() => navigate(taskLink(x))}>
                    <TableCell className="max-w-0 w-[45%] py-2.5 whitespace-normal">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <PriorityBadge priority={x.task.priority} hideMedium />
                        <Link
                          to={taskLink(x)}
                          onClick={(e) => e.stopPropagation()}
                          className="truncate font-medium outline-none hover:text-primary hover:underline focus-visible:underline focus-visible:ring-2 focus-visible:ring-ring/50"
                        >
                          {x.task.title}
                        </Link>
                      </div>
                      <PathLine x={x} />
                    </TableCell>
                    <TableCell className="max-w-0 w-[28%] py-2.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <StoreLogos stores={x.stores} size="sm" max={2} />
                        <span className="min-w-0 leading-tight">
                          <span className="tabular block text-xs font-medium">{x.proposal.code}</span>
                          <span className="block truncate text-xs text-muted-foreground">{x.proposal.title}</span>
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-2.5">
                      <DueCell date={x.task.dueDate!} />
                    </TableCell>
                    <TableCell className="py-2.5">
                      <Assignees users={assigneesOf(x)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Narrow: cards */}
          <ul className="space-y-2 @2xl:hidden">
            {shown.map((x) => (
              <li key={x.task.id}>
                <Link
                  to={taskLink(x)}
                  className="block space-y-2 rounded-lg border p-3 outline-none hover:border-primary/40 hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <PriorityBadge priority={x.task.priority} hideMedium />
                      <span className="truncate text-sm font-medium">{x.task.title}</span>
                    </div>
                    <PathLine x={x} />
                  </div>
                  <div className="flex items-center gap-2">
                    <StoreLogos stores={x.stores} size="sm" max={2} />
                    <span className="tabular min-w-0 flex-1 truncate text-xs text-muted-foreground">{x.proposal.code}</span>
                    <span
                      className="inline-flex h-6 shrink-0 items-center rounded-md bg-danger-soft px-1.5 text-xs font-medium whitespace-nowrap text-danger tabular"
                      title={`กำหนดส่ง ${formatDate(x.task.dueDate, { long: true })}`}
                    >
                      {relativeDay(x.task.dueDate)}
                      <span className="hidden @xs:inline">&nbsp;· {formatDate(x.task.dueDate, { withYear: false })}</span>
                    </span>
                    <span className="shrink-0">
                      <Assignees users={assigneesOf(x)} />
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <ShowMoreButton expanded={expanded} hiddenCount={items.length - shown.length} total={items.length} onToggle={() => setExpanded((v) => !v)} noun="งาน" />
        </div>
      )}
    </MonitorSection>
  )
}
