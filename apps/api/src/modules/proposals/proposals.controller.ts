import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common'
import type { Proposal, User } from '@flowtrade/shared'
import type { ProposalDetail, ProposalListItem, ProposalReport } from '@flowtrade/shared/api-types'
import { CurrentUser, RequirePermission } from '../../auth/decorators.js'
import { UuidPipe, ZodPipe } from '../../common/zod.js'
import { PrismaService } from '../../prisma/prisma.service.js'
import { ProposalsReadService } from './proposals.read.js'
import { ProposalReportService } from './proposals.report.js'
import {
  createProposalSchema,
  duplicateSchema,
  listQuerySchema,
  statusSchema,
  targetDateSchema,
  updateProposalSchema,
  type CreateProposalBody,
  type DuplicateBody,
  type ProposalListQuery,
  type StatusBody,
  type TargetDateBody,
  type UpdateProposalBody,
} from './proposals.schemas.js'
import { ProposalsService } from './proposals.service.js'

@Controller('proposals')
export class ProposalsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly read: ProposalsReadService,
    private readonly proposals: ProposalsService,
    private readonly reports: ProposalReportService,
  ) {}

  /** ?q&status&channel&storeId (any of its stores)&shelfTypeId&ownerId&scope=mine|all — sorted by targetDate. */
  @Get()
  list(@CurrentUser() user: User, @Query(new ZodPipe(listQuerySchema)) q: ProposalListQuery): Promise<ProposalListItem[]> {
    return this.read.list(this.prisma, user, q)
  }

  @Get(':id')
  get(@CurrentUser() user: User, @Param('id', UuidPipe) id: string): Promise<ProposalDetail> {
    return this.read.detail(this.prisma, user, id)
  }

  /** Extras for the printable report (PDF export): task users, all task comments, last change per task. */
  @Get(':id/report')
  report(@CurrentUser() user: User, @Param('id', UuidPipe) id: string): Promise<ProposalReport> {
    return this.reports.report(user, id)
  }

  /** Wizard submit — one proposal listed at every selected store. */
  @RequirePermission('proposal.create')
  @Post()
  create(@CurrentUser() user: User, @Body(new ZodPipe(createProposalSchema)) body: CreateProposalBody): Promise<Proposal> {
    return this.proposals.create(user, body)
  }

  @Patch(':id')
  update(@CurrentUser() user: User, @Param('id', UuidPipe) id: string, @Body(new ZodPipe(updateProposalSchema)) body: UpdateProposalBody): Promise<Proposal> {
    return this.proposals.update(user, id, body)
  }

  @Post(':id/status')
  @HttpCode(200)
  changeStatus(@CurrentUser() user: User, @Param('id', UuidPipe) id: string, @Body(new ZodPipe(statusSchema)) body: StatusBody): Promise<Proposal> {
    return this.proposals.changeStatus(user, id, body)
  }

  @Post(':id/target-date')
  @HttpCode(200)
  changeTargetDate(@CurrentUser() user: User, @Param('id', UuidPipe) id: string, @Body(new ZodPipe(targetDateSchema)) body: TargetDateBody): Promise<Proposal> {
    return this.proposals.changeTargetDate(user, id, body)
  }

  @RequirePermission('proposal.create')
  @Post(':id/duplicate')
  duplicate(@CurrentUser() user: User, @Param('id', UuidPipe) id: string, @Body(new ZodPipe(duplicateSchema)) body: DuplicateBody): Promise<Proposal> {
    return this.proposals.duplicate(user, id, body)
  }

  @Delete(':id')
  remove(@CurrentUser() user: User, @Param('id', UuidPipe) id: string): Promise<true> {
    return this.proposals.remove(user, id)
  }
}
