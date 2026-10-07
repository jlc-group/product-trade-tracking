import { Injectable } from '@nestjs/common'
import { addDays, healthRank, isCountableStatus, isDueWithin, isOverdue, todayBangkok, type ProposalStatus, type Task, type User } from '@flowtrade/shared'
import type { DashboardSummary, HomeDashboard, NavBadges } from '@flowtrade/shared/api-types'
import { iso, toDateOnly } from '../../common/dates.js'
import { taskInclude, toProposal, toStore, toTask, toUser } from '../../common/mappers.js'
import { PrismaService } from '../../prisma/prisma.service.js'
import {
  byTargetDate,
  CLOSED_STATUSES,
  compareTreeOrder,
  groupByProposal,
  listInclude,
  sortUsers,
  toListItem,
  withContext,
  type TreeOrderKey,
} from './dashboard.read-models.js'
import { buildHome, buildProjects, overdueBuyerRows } from './home.builder.js'
import { countOverdueTasks, loadHomeRows, loadOpenTracks, loadPassedTracks, loadProductionItems, loadProjectRows } from './home.queries.js'

const ALL_STATUSES: ProposalStatus[] = ['DRAFT', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED']
const CHANNELS = ['OFFLINE', 'ONLINE'] as const

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /** "วันนี้ฉันต้องทำอะไร": my agenda, my projects by launch round, my latest buyer results (+ team strip). One query wave. */
  async home(user: User): Promise<HomeDashboard> {
    const today = todayBangkok()
    return buildHome(user, today, await loadHomeRows(this.prisma, user, today))
  }

  /** Sidebar badge: my overdue leaf tasks in IN_PROGRESS proposals (= the agenda's overdue task rows). */
  async badge(user: User): Promise<NavBadges> {
    return { overdueTasks: await countOverdueTasks(this.prisma, user.id, todayBangkok()) }
  }

  /**
   * (dashboard.monitor) KPIs over live proposals (not cancelled / completed) and their leaf tasks. Overdue counts only
   * IN_PROGRESS leaves; at-risk and the overdue buyer steps use the home rules (same numbers as the home strip), and
   * at-risk also lists COMPLETED proposals with a production alarm.
   */
  async summary(user: User): Promise<DashboardSummary> {
    const t = todayBangkok()
    const [all, activeRows, storeRows, userRows, projectRows, openTracks, passedTracks, productionItems] = await Promise.all([
      this.prisma.proposal.findMany({ select: { id: true, status: true, completedAt: true, stores: { select: { storeId: true } } } }),
      this.prisma.proposal.findMany({ where: { status: { notIn: CLOSED_STATUSES } }, include: listInclude, orderBy: { code: 'asc' } }),
      this.prisma.store.findMany({ where: { isActive: true }, orderBy: [{ channel: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.user.findMany({ where: { isActive: true } }),
      loadProjectRows(this.prisma, user.id, t, true),
      loadOpenTracks(this.prisma, user.id, true),
      loadPassedTracks(this.prisma, user.id, t, true),
      loadProductionItems(this.prisma, user.id, t, true),
    ])
    const { projects, open } = buildProjects(projectRows, openTracks, passedTracks, productionItems, t)
    const health = new Map(projects.map((p) => [p.brief.id, p.health]))
    // COMPLETED proposals still alarming about production (production normally runs after close-out).
    const doneIds = projects.filter((p) => p.brief.status === 'COMPLETED' && p.health).map((p) => p.brief.id)
    const activeIds = activeRows.map((p) => p.id)
    const [taskRows, doneRows, doneTasks] = await Promise.all([
      activeIds.length ? this.prisma.task.findMany({ where: { proposalId: { in: activeIds } }, include: taskInclude }) : [],
      doneIds.length ? this.prisma.proposal.findMany({ where: { id: { in: doneIds } }, include: listInclude, orderBy: { code: 'asc' } }) : [],
      doneIds.length ? this.prisma.task.findMany({ where: { proposalId: { in: doneIds } }, select: { id: true, proposalId: true, parentId: true, isDone: true, dueDate: true } }) : [],
    ])

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
    const countable = (task: Task) => isCountableStatus(rowById.get(task.proposalId)!.status)
    const overdueLeaves = liveLeaves.filter((x) => isOverdue(x.task, t) && countable(x.task))

    const tasksByProposal = groupByProposal(tasks.map((x) => x.task))
    const items = activeRows.map((row) => toListItem(row, tasksByProposal.get(row.id) ?? [], t))
    const proposals = new Map(items.map((p) => [p.id, p]))
    const plain = new Map(activeRows.map((row) => [row.id, toProposal(row)]))
    const ctx = (x: (typeof tasks)[number]) => withContext(x.task, plain.get(x.task.proposalId)!, proposals.get(x.task.proposalId)!.stores, x.path)

    const doneTasksBy = groupByProposal(doneTasks.map((x) => ({ ...x, dueDate: toDateOnly(x.dueDate) })))
    const doneItems = doneRows.map((row) => toListItem(row, doneTasksBy.get(row.id) ?? [], t))

    const month = t.slice(0, 7)
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
      // A proposal listed at several stores counts once at each of them.
      byStore: storeRows
        .map((s) => ({
          store: toStore(s),
          active: items.filter((p) => p.storeIds.includes(s.id)).length,
          completed: all.filter((p) => p.status === 'COMPLETED' && p.stores.some((x) => x.storeId === s.id)).length,
          overdueTasks: overdueLeaves.filter((x) => proposals.get(x.task.proposalId)?.storeIds.includes(s.id)).length,
        }))
        .filter((r) => r.active + r.completed > 0),
      upcomingLaunches: items.filter((p) => p.targetDate >= t && p.targetDate <= in45).sort(byTargetDate),
      atRisk: [...items, ...doneItems]
        .flatMap((p) => {
          const h = isCountableStatus(p.status) || p.status === 'COMPLETED' ? health.get(p.id) : null
          return h ? [{ ...p, health: h }] : []
        })
        .sort((a, b) => healthRank(a.health) - healthRank(b.health) || a.targetDate.localeCompare(b.targetDate) || a.code.localeCompare(b.code)),
      overdueTasks: [...overdueLeaves].sort((a, b) => a.task.dueDate!.localeCompare(b.task.dueDate!)).map(ctx),
      workload: sortUsers(userRows.map(toUser))
        .map((user) => {
          const mine: Task[] = liveLeaves.filter((x) => !x.task.isDone && x.task.assigneeIds.includes(user.id)).map((x) => x.task)
          return {
            user,
            open: mine.length,
            overdue: mine.filter((x) => isOverdue(x, t) && countable(x)).length,
            dueThisWeek: mine.filter((x) => isDueWithin(x, t, 7)).length,
          }
        })
        .filter((w) => w.open > 0)
        .sort((a, b) => b.overdue - a.overdue || b.open - a.open),
      buyerOverdue: overdueBuyerRows(user, open, t),
    }
  }
}
