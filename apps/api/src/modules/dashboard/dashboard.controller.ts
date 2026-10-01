import { Controller, Get } from '@nestjs/common'
import type { User } from '@flowtrade/shared'
import type { DashboardSummary, HomeSummary } from '@flowtrade/shared/api-types'
import { CurrentUser, RequirePermission } from '../../auth/decorators.js'
import { DashboardService } from './dashboard.service.js'

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /** Signed in: the caller's own tasks / proposals. */
  @Get('home')
  home(@CurrentUser() user: User): Promise<HomeSummary> {
    return this.dashboard.home(user)
  }

  @RequirePermission('dashboard.monitor')
  @Get('summary')
  summary(): Promise<DashboardSummary> {
    return this.dashboard.summary()
  }
}
