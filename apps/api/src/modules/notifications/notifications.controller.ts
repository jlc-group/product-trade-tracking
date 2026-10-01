import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common'
import type { AppNotification, User } from '@flowtrade/shared'
import { z } from 'zod'
import { CurrentUser } from '../../auth/decorators.js'
import { toNotification } from '../../common/mappers.js'
import { ZodPipe } from '../../common/zod.js'
import { PrismaService } from '../../prisma/prisma.service.js'

const LIST_LIMIT = 50
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

  /** The caller's own notifications, newest 50. */
  @Get()
  async list(@CurrentUser() user: User): Promise<AppNotification[]> {
    const rows = await this.prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: LIST_LIMIT,
    })
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
