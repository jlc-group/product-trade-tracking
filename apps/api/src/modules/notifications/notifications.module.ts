import { Module } from '@nestjs/common'
import { NotificationsController } from './notifications.controller.js'

/** GET /notifications, POST /notifications/read (notifications are created via the global ActivityService). */
@Module({ controllers: [NotificationsController] })
export class NotificationsModule {}
