import { Module } from '@nestjs/common'
import { ProposalsController } from './proposals.controller.js'
import { ProposalsReadService } from './proposals.read.js'
import { ProposalReportService } from './proposals.report.js'
import { ProposalsService } from './proposals.service.js'

/**
 * /proposals — list (scope + filters), detail, wizard create (one per store), update,
 * status, target date (optional task shift), duplicate, delete, printable report extras.
 * Exports ProposalsReadService so the dashboard builds identical ProposalListItems.
 */
@Module({
  controllers: [ProposalsController],
  providers: [ProposalsReadService, ProposalsService, ProposalReportService],
  exports: [ProposalsReadService],
})
export class ProposalsModule {}
