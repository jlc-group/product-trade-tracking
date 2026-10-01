import { Module } from '@nestjs/common'
import { DashboardController } from './dashboard.controller.js'
import { DashboardService } from './dashboard.service.js'

/** GET /dashboard/home, GET /dashboard/summary. Read models are built locally (dashboard.read-models.ts). */
@Module({ controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}
