import { Controller, Get, Query } from '@nestjs/common'
import { can, type User } from '@flowtrade/shared'
import type { ActivityWithActor } from '@flowtrade/shared/api-types'
import { z } from 'zod'
import { CurrentUser } from '../../auth/decorators.js'
import { forbidden, notFound } from '../../common/errors.js'
import { toActivity, toUser } from '../../common/mappers.js'
import { ProposalAccessService } from '../../common/proposal-access.service.js'
import { ZodPipe } from '../../common/zod.js'
import { PrismaService } from '../../prisma/prisma.service.js'

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const limitMessage = `จำนวนรายการต้องเป็นจำนวนเต็มตั้งแต่ 1 ถึง ${MAX_LIMIT}`
const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v)

const listQuery = z.object({
  /** Empty = all activity (needs activity.read.all). */
  proposalId: z.preprocess(emptyToUndefined, z.string({ message: 'รหัสอ้างอิงไม่ถูกต้อง' }).trim().optional()),
  limit: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number({ message: limitMessage })
      .int(limitMessage)
      .min(1, limitMessage)
      .transform((n) => Math.min(n, MAX_LIMIT))
      .optional(),
  ),
})

@Controller('activity')
export class ActivityController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProposalAccessService,
  ) {}

  /** Newest first. With proposalId: anyone who can view that proposal; otherwise activity.read.all. */
  @Get()
  async list(@CurrentUser() user: User, @Query(new ZodPipe(listQuery)) query: z.output<typeof listQuery>): Promise<ActivityWithActor[]> {
    const proposalId = query.proposalId || undefined
    if (proposalId) {
      // A malformed id is simply "not found" (no id leaks), same as a proposal the user can't see.
      if (!UUID_RE.test(proposalId)) throw notFound('การเสนอสินค้า')
      await this.access.loadVisible(this.prisma, user, proposalId)
    } else if (!can(user, 'activity.read.all')) {
      throw forbidden()
    }
    const rows = await this.prisma.activityLog.findMany({
      where: proposalId ? { proposalId } : {},
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit ?? DEFAULT_LIMIT,
      include: { actor: true },
    })
    return rows.map((a) => ({ ...toActivity(a), actor: toUser(a.actor) }))
  }
}
