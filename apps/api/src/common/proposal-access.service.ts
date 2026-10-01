import { Injectable } from '@nestjs/common'
import { canViewProposal, type Proposal, type User } from '@flowtrade/shared'
import type { Db } from '../prisma/prisma.service.js'
import { invalid, notFound } from './errors.js'
import { proposalInclude, toProposal } from './mappers.js'

/** Loading + visibility rules shared by proposals, tasks, comments and activity. */
@Injectable()
export class ProposalAccessService {
  async load(db: Db, id: string): Promise<Proposal> {
    const row = await db.proposal.findUnique({ where: { id }, include: proposalInclude })
    if (!row) throw notFound('การเสนอสินค้า')
    return toProposal(row)
  }

  assignedCount(db: Db, userId: string, proposalId: string) {
    return db.taskAssignee.count({ where: { userId, task: { proposalId } } })
  }

  /** 404 (not 403) when the user can't see it, so ids don't leak. */
  async assertView(db: Db, user: User, proposal: Proposal) {
    if (canViewProposal(user, proposal)) return
    if (canViewProposal(user, proposal, await this.assignedCount(db, user.id, proposal.id))) return
    throw notFound('การเสนอสินค้า')
  }

  async loadVisible(db: Db, user: User, id: string) {
    const proposal = await this.load(db, id)
    await this.assertView(db, user, proposal)
    return proposal
  }

  /** Validates that every id is an existing, active user; returns them de-duplicated. */
  async activeUserIds(db: Db, ids: string[]) {
    const unique = [...new Set(ids)]
    if (unique.length === 0) return unique
    const users = await db.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, isActive: true } })
    for (const id of unique) {
      const u = users.find((x) => x.id === id)
      if (!u) throw invalid('ไม่พบผู้ใช้ที่เลือก')
      if (!u.isActive) throw invalid(`${u.name} ถูกปิดการใช้งานแล้ว เลือกผู้รับผิดชอบคนอื่น`)
    }
    return unique
  }
}
