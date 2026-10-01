import { buildTaskTree, flattenTree, getAncestorIds, isDueWithin, isOverdue, prepStartOf, type ISODate, type Task, type TaskNode, type User } from '@flowtrade/shared'
import { CheckCircle2Icon, CircleIcon, ListChecksIcon, RotateCwIcon } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import type { ProposalDetail } from '@/api'
import { useTasks, useUserLookup } from '@/api/hooks'
import { DueChip, EmptyState, ProgressBar } from '@/components/common/misc'
import { AvatarStack, UserAvatar } from '@/components/common/user-avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { DepartmentChip } from '@/features/task-tree/department'
import { compareDepartments } from '@/features/task-tree/department-utils'
import { displayName, formatDate, formatDateTime, fromNow, today } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PrepWindow } from './launch-summary'
import { launchWord, leafTasks } from './utils'

interface Props {
  proposal: ProposalDetail
  /** Switches to the task list and opens the task drawer. */
  onOpenTask: (taskId: string) => void
  onGoToTasks: () => void
}

const NO_USERS: User[] = []

type Role = 'owner' | 'member' | 'assignee'
const ROLE_TEXT: Record<Role, string> = { owner: 'เจ้าของ', member: 'ทีมงาน', assignee: 'ผู้รับผิดชอบงาน' }

interface Person {
  user: User
  role: Role
  open: number
  overdue: number
}

interface DepartmentStat {
  /** null = no department on the task or any of its parents. */
  name: string | null
  total: number
  done: number
  open: number
  overdue: number
}

function buildOverview(tasks: Task[], proposal: ProposalDetail, lookup: User[], t: ISODate) {
  const tree = buildTaskTree(tasks)
  const byId = new Map(tasks.map((x) => [x.id, x]))
  const leaves = leafTasks(tasks)

  const stats = {
    total: leaves.length,
    done: leaves.filter((x) => x.isDone).length,
    overdue: leaves.filter((x) => isOverdue(x, t)).length,
    dueSoon: leaves.filter((x) => isDueWithin(x, t, 7)).length,
  }

  const groups = tree.map((node) => {
    const nodeLeaves: TaskNode[] = node.children.length ? flattenTree(node.children).filter((n) => n.children.length === 0) : [node]
    return { node, overdue: nodeLeaves.filter((x) => isOverdue(x, t)).length }
  })

  const upcoming = leaves
    .filter((x) => !x.isDone && !!x.dueDate)
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
    .slice(0, 5)
    .map((task) => ({
      task,
      path: getAncestorIds(tasks, task.id)
        .reverse()
        .map((id) => byId.get(id)?.title ?? ''),
    }))

  const users = new Map<string, User>()
  for (const u of [...lookup, ...proposal.members, proposal.owner]) users.set(u.id, u)
  const people = new Map<string, Person>()
  const touch = (id: string, role: Role) => {
    const existing = people.get(id)
    if (existing) return existing
    const user = users.get(id)
    if (!user) return null
    const person: Person = { user, role, open: 0, overdue: 0 }
    people.set(id, person)
    return person
  }
  touch(proposal.ownerId, 'owner')
  for (const id of proposal.memberIds) touch(id, 'member')
  for (const task of tasks) for (const id of task.assigneeIds) touch(id, 'assignee')
  for (const leaf of leaves) {
    if (leaf.isDone) continue
    for (const id of leaf.assigneeIds) {
      const p = people.get(id)
      if (!p) continue
      p.open += 1
      if (isOverdue(leaf, t)) p.overdue += 1
    }
  }
  const peopleList = [...people.values()].sort((a, b) => b.overdue - a.overdue || b.open - a.open || a.user.name.localeCompare(b.user.name, 'th'))

  // Work per department, counted on leaves; a leaf without a department counts for its nearest parent's.
  const departmentOf = (task: Task): string | null => {
    for (let cur: Task | undefined = task; cur; cur = cur.parentId ? byId.get(cur.parentId) : undefined) if (cur.responsible) return cur.responsible
    return null
  }
  const deptMap = new Map<string | null, DepartmentStat>()
  for (const leaf of leaves) {
    const name = departmentOf(leaf)
    const d = deptMap.get(name) ?? { name, total: 0, done: 0, open: 0, overdue: 0 }
    d.total += 1
    if (leaf.isDone) d.done += 1
    else d.open += 1
    if (isOverdue(leaf, t)) d.overdue += 1
    deptMap.set(name, d)
  }
  const departments = [...deptMap.values()].sort((a, b) => (a.name === null ? 1 : b.name === null ? -1 : compareDepartments(a.name, b.name)))

  return { tree, stats, groups, upcoming, people: peopleList, users, departments }
}

export function OverviewTab({ proposal, onOpenTask, onGoToTasks }: Props) {
  const { data: tasks, isPending, isError, refetch } = useTasks(proposal.id)
  const { data: lookup = NO_USERS } = useUserLookup()
  const t = today()
  const model = useMemo(() => buildOverview(tasks ?? [], proposal, lookup, t), [tasks, proposal, lookup, t])

  if (isPending) return <OverviewSkeleton />
  if (isError)
    return (
      <EmptyState
        title="โหลดรายการงานไม่สำเร็จ"
        description="ตรวจการเชื่อมต่อแล้วลองอีกครั้ง"
        action={
          <Button variant="outline" onClick={() => refetch()}>
            <RotateCwIcon /> ลองอีกครั้ง
          </Button>
        }
      />
    )
  if (tasks.length === 0)
    return (
      <EmptyState
        icon={<ListChecksIcon className="size-5" />}
        title="ยังไม่มีงานในโปรเจกต์นี้"
        description="เพิ่ม Task แรกในแท็บรายการงาน แล้วภาพรวมความคืบหน้าจะแสดงที่นี่"
        action={<Button onClick={onGoToTasks}>ไปที่รายการงาน</Button>}
      />
    )

  const { stats, groups, upcoming, people, users, departments } = model
  const percent = stats.total ? Math.round((stats.done / stats.total) * 100) : 0
  const word = launchWord(proposal.channel)
  const showPrepWindow = proposal.status !== 'CANCELLED'

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="min-w-0 space-y-4 lg:col-span-2">
        {showPrepWindow && <PrepWindow word={word} targetDate={proposal.targetDate} today={t} progress={{ done: stats.done, total: stats.total, percent }} />}
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="งานทั้งหมด" value={stats.total} sub={`${groups.length} Task หลัก`} />
          <Stat label="เสร็จแล้ว" value={stats.done} sub={`${percent}% ของทั้งหมด`} subClass={percent === 100 ? 'text-success' : undefined} />
          <Stat
            label="เลยกำหนด"
            value={stats.overdue}
            valueClass={stats.overdue ? 'text-danger' : undefined}
            sub={stats.overdue ? 'ต้องเร่งติดตาม' : 'ไม่มีงานเลยกำหนด'}
            className={stats.overdue ? 'border-danger/30 bg-danger-soft/40' : undefined}
          />
          <Stat
            label="ครบกำหนดใน 7 วัน"
            value={stats.dueSoon}
            valueClass={stats.dueSoon ? 'text-warning-foreground' : undefined}
            sub={stats.dueSoon ? 'เตรียมส่งให้ทัน' : 'สัปดาห์นี้โล่ง'}
          />
        </dl>

        <Card className="gap-0 pb-0">
          <CardHeader className="border-b">
            <CardTitle>ความคืบหน้าตาม Task หลัก</CardTitle>
            <CardDescription>กดที่งานเพื่อเปิดรายละเอียดในรายการงาน</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <ul className="divide-y">
              {groups.map(({ node, overdue }) => (
                <li key={node.id}>
                  <button
                    type="button"
                    onClick={() => onOpenTask(node.id)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-inset"
                  >
                    {node.isDone ? (
                      <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-success" aria-label="เสร็จแล้ว" />
                    ) : (
                      <CircleIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" aria-label="ยังไม่เสร็จ" />
                    )}
                    <span className="flex min-w-0 flex-1 flex-col gap-2">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className={cn('min-w-0 font-medium break-words', node.isDone && 'text-muted-foreground line-through decoration-1')}>{node.title}</span>
                        {overdue > 0 && <span className="tabular rounded bg-danger-soft px-1.5 py-0.5 text-[11px] font-medium text-danger">เลยกำหนด {overdue}</span>}
                        <DueChip startDate={node.startDate} dueDate={node.dueDate} isDone={node.isDone} compact className="sm:ml-auto" />
                      </span>
                      <ProgressBar progress={node.progress} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="min-w-0 space-y-4">
        <Card className="gap-0 pb-2">
          <CardHeader className="pb-2">
            <CardTitle>ครบกำหนดถัดไป</CardTitle>
            <CardDescription>งานที่ยังไม่เสร็จ เรียงตามวันครบกำหนด</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {upcoming.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">ไม่มีงานค้างที่กำหนดวันไว้</p>
            ) : (
              <ul>
                {upcoming.map(({ task, path }) => {
                  const assignees = task.assigneeIds.map((id) => users.get(id)).filter((u): u is User => !!u)
                  return (
                    <li key={task.id}>
                      <button
                        type="button"
                        onClick={() => onOpenTask(task.id)}
                        className="flex w-full flex-col gap-1 px-4 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-inset"
                      >
                        <span className="block truncate text-sm font-medium">{task.title}</span>
                        {path.length > 0 && <span className="block truncate text-xs text-muted-foreground">{path.join(' › ')}</span>}
                        <span className="flex items-center justify-between gap-2">
                          <DueChip startDate={task.startDate} dueDate={task.dueDate} isDone={task.isDone} compact className="-ml-1.5" />
                          <span className="flex min-w-0 items-center gap-1.5">
                            {task.responsible && <DepartmentChip name={task.responsible} className="max-w-28" />}
                            {assignees.length ? (
                              <AvatarStack users={assignees} size="xs" />
                            ) : (
                              !task.responsible && <span className="text-xs text-muted-foreground">ยังไม่มีผู้รับผิดชอบ</span>
                            )}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {departments.some((d) => d.name !== null) && (
          <Card className="gap-0 pb-2">
            <CardHeader className="pb-2">
              <CardTitle>งานตามแผนก</CardTitle>
              <CardDescription>งานค้างของแต่ละแผนกที่รับผิดชอบ (งานที่ไม่ระบุแผนกนับตามงานแม่)</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <ul>
                {departments.map((d) => (
                  <li key={d.name ?? '__none__'} className="space-y-1.5 px-4 py-2">
                    <span className="flex min-w-0 items-center justify-between gap-2">
                      {d.name ? <DepartmentChip name={d.name} /> : <span className="text-xs text-muted-foreground">ยังไม่ระบุแผนก</span>}
                      <span className="tabular shrink-0 text-xs">
                        {d.open === 0 ? (
                          <span className="font-medium text-success">เสร็จครบ</span>
                        ) : (
                          <>
                            <span className="font-medium">ค้าง {d.open}</span>
                            {d.overdue > 0 && <span className="font-medium text-danger"> · เลยกำหนด {d.overdue}</span>}
                          </>
                        )}
                      </span>
                    </span>
                    <ProgressBar progress={{ done: d.done, total: d.total, percent: d.total ? Math.round((d.done / d.total) * 100) : 0 }} />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <Card className="gap-0 pb-2">
          <CardHeader className="pb-2">
            <CardTitle>ผู้เกี่ยวข้อง</CardTitle>
            <CardDescription>จำนวนงานที่ยังค้างของแต่ละคน</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <ul>
              {people.map((p) => (
                <li key={p.user.id} className="flex items-center gap-3 px-4 py-2">
                  <UserAvatar user={p.user} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{displayName(p.user)}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {ROLE_TEXT[p.role]}
                      {p.user.position ? ` · ${p.user.position}` : ''}
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-right text-xs">
                    {p.open > 0 ? <span className="block font-medium">ค้าง {p.open}</span> : <span className="block text-muted-foreground">ไม่มีงานค้าง</span>}
                    {p.overdue > 0 && <span className="block font-medium text-danger">เลยกำหนด {p.overdue}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle>ข้อมูลโปรเจกต์</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
              <InfoRow label={word}>
                <span className="tabular">{formatDate(proposal.targetDate, { long: true })}</span>
              </InfoRow>
              <InfoRow label="เริ่มเตรียม">
                <span className="tabular">{formatDate(prepStartOf(proposal.targetDate), { long: true })}</span>
              </InfoRow>
              <InfoRow label="แม่แบบงาน">{proposal.template?.name ?? <span className="text-muted-foreground">ไม่ได้ใช้แม่แบบ</span>}</InfoRow>
              <InfoRow label="สร้างเมื่อ">
                <span className="tabular">{formatDateTime(proposal.createdAt)}</span>
              </InfoRow>
              <InfoRow label="แก้ไขล่าสุด">
                <time dateTime={proposal.updatedAt} title={formatDateTime(proposal.updatedAt)}>
                  {fromNow(proposal.updatedAt)}
                </time>
              </InfoRow>
              {proposal.completedAt && (
                <InfoRow label="ปิดงานเมื่อ">
                  <span className="tabular">{formatDateTime(proposal.completedAt)}</span>
                </InfoRow>
              )}
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  sub,
  className,
  valueClass,
  subClass,
}: {
  label: string
  value: number
  sub: string
  className?: string
  valueClass?: string
  subClass?: string
}) {
  return (
    <div className={cn('rounded-xl border bg-card p-3 sm:p-4', className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('tabular mt-1 text-2xl font-semibold', valueClass)}>{value}</dd>
      <dd className={cn('mt-0.5 truncate text-xs text-muted-foreground', subClass)}>{sub}</dd>
    </div>
  )
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right">{children}</dd>
    </>
  )
}

export function OverviewSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-3" aria-busy="true" aria-label="กำลังโหลดภาพรวม">
      <div className="space-y-4 lg:col-span-2">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <div className="space-y-4 rounded-xl border bg-card p-4">
          <Skeleton className="h-5 w-48" />
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-1.5 w-full" />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-4">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </div>
  )
}
