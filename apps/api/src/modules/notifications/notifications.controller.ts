import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common'
import type { AppNotification, User } from '@flowtrade/shared'
import { z } from 'zod'
import { CurrentUser } from '../../auth/decorators.js'
import { toNotification } from '../../common/mappers.js'
import { ZodPipe } from '../../common/zod.js'
import { NotificationType } from '../../generated/prisma/client.js'
import { PrismaService } from '../../prisma/prisma.service.js'

const LIST_LIMIT = 50
/**
 * Notices addressed to the person (assigned, comment, status …), as opposed to ACTIVITY (others' movements). Listed by
 * value rather than `not: 'ACTIVITY'`, so the query also works on a database that doesn't have that enum value yet.
 */
const DIRECT_TYPES = Object.values(NotificationType).filter((t) => t !== NotificationType.ACTIVITY)
const NEWEST_FIRST = [{ createdAt: 'desc' as const }, { id: 'desc' as const }]
/** Read notifications are kept this long (unread ones stay until read). */
const READ_KEEP_MS = 60 * 24 * 60 * 60 * 1000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const idMessage = 'กรุณาระบุการแจ้งเตือน'

const markReadSchema = z.object(
  {
    /** A notification id, or "all". */
    id: z.string({ message: idMessage }).trim().min(1, idMessage),
  },
  { message: 'ข้อมูลไม่ถูกต้อง' },
)

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The caller's own notifications, newest first: the newest 50 of any type plus every unread direct notice (newest 50),
   * so a burst of ACTIVITY rows can't push an unread assignment or comment out of the bell. Their read ones older than
   * 60 days are dropped on the way.
   */
  @Get()
  async list(@CurrentUser() user: User): Promise<AppNotification[]> {
    await this.prisma.notification.deleteMany({ where: { userId: user.id, isRead: true, createdAt: { lt: new Date(Date.now() - READ_KEEP_MS) } } })
    const [newest, unreadDirect] = await Promise.all([
      this.prisma.notification.findMany({ where: { userId: user.id }, orderBy: NEWEST_FIRST, take: LIST_LIMIT }),
      this.prisma.notification.findMany({ where: { userId: user.id, isRead: false, type: { in: DIRECT_TYPES } }, orderBy: NEWEST_FIRST, take: LIST_LIMIT }),
    ])
    const rows = [...new Map([...newest, ...unreadDirect].map((r) => [r.id, r])).values()]
    rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
    return rows.map(toNotification)
  }

  /** Marks one (or "all") of the caller's own notifications read. Unknown ids are a no-op. */
  @Post('read')
  @HttpCode(200)
  async markRead(@CurrentUser() user: User, @Body(new ZodPipe(markReadSchema)) body: z.output<typeof markReadSchema>): Promise<true> {
    if (body.id === 'all') {
      await this.prisma.notification.updateMany({ where: { userId: user.id, isRead: false }, data: { isRead: true } })
    } else if (UUID_RE.test(body.id)) {
      await this.prisma.notification.updateMany({ where: { id: body.id, userId: user.id }, data: { isRead: true } })
    }
    return true
  }
}
