import { Module } from '@nestjs/common'
import { ActivityController } from './activity.controller.js'

/** GET /activity — audit trail (ActivityService itself is global, in src/common). */
@Module({ controllers: [ActivityController] })
export class ActivityModule {}
