import { Injectable } from '@nestjs/common'
import { canViewProposal, ROLE_PERMISSIONS, type Proposal, type Role, type User } from '@flowtrade/shared'
import type { Db } from '../prisma/prisma.service.js'
import { invalid, notFound } from './errors.js'
import { proposalInclude, toProposal } from './mappers.js'

/** Roles that see every proposal (canViewProposal). */
const READ_ALL_ROLES = (Object.keys(ROLE_PERMISSIONS) as Role[]).filter((role) => ROLE_PERMISSIONS[role].includes('proposal.read.all'))
/** assertCanView's default refusal (presenters, the preparer). */
export const CAN_VIEW_ONLY = 'เลือกได้เฉพาะคนที่เปิดดูโปรเจกต์นี้ได้ (เจ้าของ สมาชิก หรือผู้รับผิดชอบงาน)'

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

  /**
   * People named on a proposal (presenters, the preparer, production order contacts) must be able to open it, or the
   * step never reaches their home page: the owner, members, assignees of its tasks, or active users who see every
   * proposal. `keep` = people already saved there, who may stay (a member removed since, a deactivated manager).
   * `field` = the 422 `fields` key to report the refusal under (the client shows it under that control).
   */
  async assertCanView(
    db: Db,
    proposal: Proposal,
    ids: (string | null | undefined)[],
    keep: (string | null | undefined)[] = [],
    message = CAN_VIEW_ONLY,
    field?: string,
  ) {
    const known = new Set([proposal.ownerId, ...proposal.memberIds, ...keep])
    const rest = [...new Set(ids.filter((id): id is string => !!id && !known.has(id)))]
    if (rest.length === 0) return
    const allowed = await db.user.count({
      where: { id: { in: rest }, OR: [{ isActive: true, role: { in: READ_ALL_ROLES } }, { assignments: { some: { task: { proposalId: proposal.id } } } }] },
    })
    if (allowed !== rest.length) throw invalid(message, field ? { [field]: message } : undefined)
  }
}
