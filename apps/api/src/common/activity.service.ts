import { Injectable } from '@nestjs/common'
import type { EntityType, NotificationType, User } from '@flowtrade/shared'
import type { Db } from '../prisma/prisma.service.js'

/** Audit log + in-app notifications. Pass the transaction client so they commit with the change. */
@Injectable()
export class ActivityService {
  log(db: Db, actor: Pick<User, 'id'>, action: string, entityType: EntityType, entityId: string, proposalId: string | null, summary: string) {
    return db.activityLog.create({ data: { actorId: actor.id, action, entityType, entityId, proposalId, summary } })
  }

  /** Notifies each user once, skipping the actor. */
  async notify(
    db: Db,
    userIds: string[],
    n: { type: NotificationType; title: string; body: string; link: string | null },
    exceptUserId?: string,
  ) {
    const targets = [...new Set(userIds)].filter((id) => id !== exceptUserId)
    if (targets.length === 0) return
    await db.notification.createMany({ data: targets.map((userId) => ({ userId, ...n })) })
  }
}
