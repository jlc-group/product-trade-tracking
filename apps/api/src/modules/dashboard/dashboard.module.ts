import { Module } from '@nestjs/common'
import { DashboardController } from './dashboard.controller.js'
import { DashboardService } from './dashboard.service.js'

/** GET /dashboard/home, /dashboard/badge, /dashboard/summary. Read models are built locally (dashboard.read-models.ts, home.builder.ts). */
@Module({ controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}
