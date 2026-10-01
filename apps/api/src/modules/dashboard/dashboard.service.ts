import { Injectable } from '@nestjs/common'
import { addDays, can, isDueWithin, isOverdue, todayBangkok, type Proposal, type ProposalStatus, type Store, type Task, type User } from '@flowtrade/shared'
import type { DashboardSummary, HomeSummary, ProposalListItem } from '@flowtrade/shared/api-types'
import { fromDateOnly, iso } from '../../common/dates.js'
import { proposalInclude, taskInclude, toProposal, toStore, toTask, toUser } from '../../common/mappers.js'
import type { Prisma } from '../../generated/prisma/client.js'
import { PrismaService } from '../../prisma/prisma.service.js'
import {
  byTargetDate,
  CLOSED_STATUSES,
  compareTreeOrder,
  groupByProposal,
  listInclude,
  sortUsers,
  taskLiteSelect,
  toListItem,
  toTaskLite,
  withContext,
  type ListRow,
  type TreeOrderKey,
} from './dashboard.read-models.js'

const DAY_MS = 86_400_000
const ALL_STATUSES: ProposalStatus[] = ['DRAFT', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED']
const CHANNELS = ['OFFLINE', 'ONLINE'] as const

/** "My tasks" rows for the home page: the task, its proposal (+ store) and up to two ancestors (max depth is 3). */
const ancestorSelect = { id: true, title: true, sortOrder: true } satisfies Prisma.TaskSelect
const homeTaskInclude = {
  ...taskInclude,
  proposal: { include: { ...proposalInclude, store: true } },
  parent: { select: { ...ancestorSelect, parent: { select: ancestorSelect } } },
} satisfies Prisma.TaskInclude

type HomeTaskRow = Prisma.TaskGetPayload<{ include: typeof homeTaskInclude }>
type Ancestor = { id: string; title: string; sortOrder: number }

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /** the caller's leaf tasks (not in cancelled proposals), their proposals, upcoming launches they can see. */
  async home(user: User): Promise<HomeSummary> {
    const t = todayBangkok()
    const in7 = addDays(t, 7)
    const weekAgo = new Date(Date.now() - 7 * DAY_MS)
    const visible: Prisma.ProposalWhereInput = can(user, 'proposal.read.all')
      ? {}
      : { OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }, { tasks: { some: { assignees: { some: { userId: user.id } } } } }] }

    const [mineRows, myRows, upcomingRows] = await Promise.all([
      this.prisma.task.findMany({
        where: {
          assignees: { some: { userId: user.id } },
          children: { none: {} },
          proposal: { status: { not: 'CANCELLED' } },
          // Done tasks only matter for "done this week".
          OR: [{ isDone: false }, { completedAt: { gte: weekAgo } }],
        },
        include: homeTaskInclude,
      }),
      this.prisma.proposal.findMany({
        where: { OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }], status: { notIn: CLOSED_STATUSES } },
        include: listInclude,
        orderBy: { code: 'asc' },
      }),
      this.prisma.proposal.findMany({
        where: { AND: [visible, { status: { not: 'CANCELLED' }, targetDate: { gte: fromDateOnly(t), lte: fromDateOnly(addDays(t, 30)) } }] },
        include: listInclude,
        orderBy: { code: 'asc' },
      }),
    ])

    const toItem = await this.listItemBuilder([...myRows, ...upcomingRows], t)

    const proposals = new Map<string, { proposal: Proposal; store: Store }>()
    const contextOf = (row: HomeTaskRow) => {
      let p = proposals.get(row.proposalId)
      if (!p) {
        p = { proposal: toProposal(row.proposal), store: toStore(row.proposal.store) }
        proposals.set(row.proposalId, p)
      }
      return p
    }
    const mine = mineRows
      .map((row) => {
        const ancestors = [row.parent?.parent, row.parent].filter((a): a is Ancestor => !!a)
        const key: TreeOrderKey = { code: row.proposal.code, path: [...ancestors, row].map((x) => ({ sortOrder: x.sortOrder, id: x.id })) }
        return { row, task: toTask(row), key, path: ancestors.map((a) => a.title) }
      })
      .sort((a, b) => compareTreeOrder(a.key, b.key))
    const ctx = (m: (typeof mine)[number]) => {
      const { proposal, store } = contextOf(m.row)
      return withContext(m.task, proposal, store, m.path)
    }

    const open = mine.filter((m) => !m.task.isDone)
    const overdue = open.filter((m) => isOverdue(m.task, t))
    const weekAgoIso = iso(weekAgo)
    return {
      today: t,
      overdue: overdue.map(ctx),
      dueToday: open.filter((m) => m.task.dueDate === t).map(ctx),
      dueThisWeek: open
        .filter((m) => !!m.task.dueDate && m.task.dueDate > t && m.task.dueDate <= in7)
        .sort((a, b) => a.task.dueDate!.localeCompare(b.task.dueDate!))
        .map(ctx),
      myProposals: myRows.map(toItem).sort(byTargetDate),
      upcomingLaunches: upcomingRows.map(toItem).sort(byTargetDate),
      counts: {
        open: open.length,
        overdue: overdue.length,
        doneThisWeek: mine.filter((m) => m.task.isDone && (m.task.completedAt ?? '') >= weekAgoIso).length,
      },
    }
  }

  /** (dashboard.monitor) KPIs over live proposals (not cancelled / completed) and their leaf tasks. */
  async summary(): Promise<DashboardSummary> {
    const t = todayBangkok()
    const [all, activeRows, storeRows, userRows] = await Promise.all([
      this.prisma.proposal.findMany({ select: { id: true, status: true, storeId: true, completedAt: true } }),
      this.prisma.proposal.findMany({ where: { status: { notIn: CLOSED_STATUSES } }, include: listInclude, orderBy: { code: 'asc' } }),
      this.prisma.store.findMany({ where: { isActive: true }, orderBy: [{ channel: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.user.findMany({ where: { isActive: true } }),
    ])
    const activeIds = activeRows.map((p) => p.id)
    const taskRows = activeIds.length ? await this.prisma.task.findMany({ where: { proposalId: { in: activeIds } }, include: taskInclude }) : []

    // Live proposals' tasks (proposal code, then tree pre-order).
    const rowById = new Map(activeRows.map((p) => [p.id, p]))
    const taskById = new Map(taskRows.map((x) => [x.id, x]))
    const parentIds = new Set(taskRows.map((x) => x.parentId).filter((id): id is string => !!id))
    const ancestorsOf = (id: string) => {
      const out: (typeof taskRows)[number][] = []
      let current = taskById.get(id)?.parentId ?? null
      while (current) {
        const parent = taskById.get(current)
        if (!parent || out.includes(parent)) break
        out.unshift(parent)
        current = parent.parentId
      }
      return out
    }
    const tasks = taskRows
      .map((row) => {
        const ancestors = ancestorsOf(row.id)
        const key: TreeOrderKey = { code: rowById.get(row.proposalId)!.code, path: [...ancestors, row].map((x) => ({ sortOrder: x.sortOrder, id: x.id })) }
        return { task: toTask(row), key, path: ancestors.map((a) => a.title) }
      })
      .sort((a, b) => compareTreeOrder(a.key, b.key))

    const liveLeaves = tasks.filter((x) => !parentIds.has(x.task.id))
    const overdueLeaves = liveLeaves.filter((x) => isOverdue(x.task, t))

    const tasksByProposal = groupByProposal(tasks.map((x) => x.task))
    const items = activeRows.map((row) => toListItem(row, tasksByProposal.get(row.id) ?? [], t))
    const proposals = new Map(items.map((p) => [p.id, p]))
    const plain = new Map(activeRows.map((row) => [row.id, toProposal(row)]))
    const ctx = (x: (typeof tasks)[number]) => withContext(x.task, plain.get(x.task.proposalId)!, proposals.get(x.task.proposalId)!.store, x.path)

    const month = t.slice(0, 7)
    const in14 = addDays(t, 14)
    const in30 = addDays(t, 30)
    const in45 = addDays(t, 45)

    return {
      today: t,
      kpis: {
        activeProposals: items.length,
        completedThisMonth: all.filter((p) => p.status === 'COMPLETED' && (p.completedAt ? iso(p.completedAt) : '').slice(0, 7) === month).length,
        launchesNext30: items.filter((p) => p.targetDate >= t && p.targetDate <= in30).length,
        openTasks: liveLeaves.filter((x) => !x.task.isDone).length,
        overdueTasks: overdueLeaves.length,
        avgProgress: items.length ? Math.round(items.reduce((s, p) => s + p.progress.percent, 0) / items.length) : 0,
      },
      byStatus: ALL_STATUSES.map((status) => ({ status, count: all.filter((p) => p.status === status).length })),
      byChannel: CHANNELS.map((channel) => ({ channel, count: items.filter((p) => p.channel === channel).length })),
      byStore: storeRows
        .map((s) => ({
          store: toStore(s),
          active: items.filter((p) => p.storeId === s.id).length,
          completed: all.filter((p) => p.storeId === s.id && p.status === 'COMPLETED').length,
          overdueTasks: overdueLeaves.filter((x) => proposals.get(x.task.proposalId)?.storeId === s.id).length,
        }))
        .filter((r) => r.active + r.completed > 0),
      upcomingLaunches: items.filter((p) => p.targetDate >= t && p.targetDate <= in45).sort(byTargetDate),
      atRisk: items.filter((p) => p.overdueCount > 0 || (p.targetDate <= in14 && p.progress.percent < 70)).sort((a, b) => b.overdueCount - a.overdueCount),
      overdueTasks: [...overdueLeaves].sort((a, b) => a.task.dueDate!.localeCompare(b.task.dueDate!)).map(ctx),
      workload: sortUsers(userRows.map(toUser))
        .map((user) => {
          const mine: Task[] = liveLeaves.filter((x) => !x.task.isDone && x.task.assigneeIds.includes(user.id)).map((x) => x.task)
          return {
            user,
            open: mine.length,
            overdue: mine.filter((x) => isOverdue(x, t)).length,
            dueThisWeek: mine.filter((x) => isDueWithin(x, t, 7)).length,
          }
        })
        .filter((w) => w.open > 0)
        .sort((a, b) => b.overdue - a.overdue || b.open - a.open),
    }
  }

  /** Loads the summary tasks of the given proposals once and returns a row → ProposalListItem mapper. */
  private async listItemBuilder(rows: ListRow[], today: string): Promise<(row: ListRow) => ProposalListItem> {
    const ids = [...new Set(rows.map((r) => r.id))]
    const lite = ids.length ? (await this.prisma.task.findMany({ where: { proposalId: { in: ids } }, select: taskLiteSelect })).map(toTaskLite) : []
    const byProposal = groupByProposal(lite)
    return (row) => toListItem(row, byProposal.get(row.id) ?? [], today)
  }
}
