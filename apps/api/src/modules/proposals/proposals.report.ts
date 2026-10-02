import { Injectable } from '@nestjs/common'
import type { User } from '@flowtrade/shared'
import type { ProposalReport, TaskLastActivity } from '@flowtrade/shared/api-types'
import { iso } from '../../common/dates.js'
import { toComment, toUser } from '../../common/mappers.js'
import { ProposalAccessService } from '../../common/proposal-access.service.js'
import { PrismaService } from '../../prisma/prisma.service.js'

/** Read-only extras for the printable report (PDF export) of one proposal. */
@Injectable()
export class ProposalReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProposalAccessService,
  ) {}

  async report(user: User, proposalId: string): Promise<ProposalReport> {
    await this.access.loadVisible(this.prisma, user, proposalId)
    const tasks = await this.prisma.task.findMany({
      where: { proposalId },
      select: { id: true, completedById: true, createdById: true, assignees: { select: { userId: true } } },
    })
    const taskIds = tasks.map((t) => t.id)
    const userIds = new Set(tasks.flatMap((t) => [t.createdById, ...(t.completedById ? [t.completedById] : []), ...t.assignees.map((a) => a.userId)]))
    const [users, comments, logs] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: [...userIds] } }, orderBy: { name: 'asc' } }),
      this.prisma.comment.findMany({ where: { proposalId, taskId: { not: null } }, include: { author: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
      // Newest first, so the first row seen per task is its latest change.
      this.prisma.activityLog.findMany({
        where: { proposalId, entityType: 'TASK', entityId: { in: taskIds } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: { actor: true },
      }),
    ])
    const lastActivity: Record<string, TaskLastActivity> = {}
    for (const a of logs) {
      lastActivity[a.entityId] ??= { action: a.action, summary: a.summary, createdAt: iso(a.createdAt), actor: toUser(a.actor) }
    }
    return {
      users: users.map(toUser),
      comments: comments.map((c) => ({ ...toComment(c), author: toUser(c.author) })),
      lastActivity,
    }
  }
}
