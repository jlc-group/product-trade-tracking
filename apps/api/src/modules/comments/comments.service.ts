import { Injectable } from '@nestjs/common'
import type { Task, User } from '@flowtrade/shared'
import type { CommentWithAuthor } from '@flowtrade/shared/api-types'
import { ActivityService } from '../../common/activity.service.js'
import { invalid, notFound } from '../../common/errors.js'
import { taskInclude, toComment, toTask, toUser } from '../../common/mappers.js'
import { ProposalAccessService } from '../../common/proposal-access.service.js'
import { PrismaService, type Db } from '../../prisma/prisma.service.js'

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProposalAccessService,
    private readonly activity: ActivityService,
  ) {}

  private async findTask(db: Db, id: string): Promise<Task> {
    const row = await db.task.findUnique({ where: { id }, include: taskInclude })
    if (!row) throw notFound('งาน')
    return toTask(row)
  }

  async list(user: User, taskId: string): Promise<CommentWithAuthor[]> {
    const task = await this.findTask(this.prisma, taskId)
    await this.access.loadVisible(this.prisma, user, task.proposalId)
    const rows = await this.prisma.comment.findMany({ where: { taskId }, include: { author: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
    return rows.map((c) => ({ ...toComment(c), author: toUser(c.author) }))
  }

  /** Comment count per task of one proposal (tasks without comments are absent). */
  async counts(user: User, proposalId: string): Promise<Record<string, number>> {
    await this.access.loadVisible(this.prisma, user, proposalId)
    const groups = await this.prisma.comment.groupBy({ by: ['taskId'], where: { proposalId, taskId: { not: null } }, _count: { _all: true } })
    const out: Record<string, number> = {}
    for (const g of groups) if (g.taskId) out[g.taskId] = g._count._all
    return out
  }

  create(user: User, taskId: string, body: string): Promise<CommentWithAuthor> {
    return this.prisma.$transaction(async (tx) => {
      const task = await this.findTask(tx, taskId)
      const proposal = await this.access.loadVisible(tx, user, task.proposalId)
      const text = body.trim()
      if (!text) throw invalid('กรุณาพิมพ์ข้อความ', { body: 'กรุณาพิมพ์ข้อความ' })
      const row = await tx.comment.create({ data: { proposalId: proposal.id, taskId: task.id, authorId: user.id, body: text } })
      await this.activity.notify(
        tx,
        [...task.assigneeIds, proposal.ownerId],
        { type: 'COMMENT', title: `${user.name} แสดงความคิดเห็น`, body: `${task.title}: ${text.slice(0, 80)}`, link: `/proposals/${proposal.id}?task=${task.id}` },
        user.id,
      )
      return { ...toComment(row), author: user }
    })
  }
}
