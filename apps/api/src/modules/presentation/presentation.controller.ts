import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common'
import type { PresentationData, User } from '@flowtrade/shared'
import { CurrentUser } from '../../auth/decorators.js'
import { UuidPipe, ZodPipe } from '../../common/zod.js'
import {
  createPackageSchema,
  editSchema,
  recordSchema,
  revertSchema,
  scheduleSchema,
  type CreatePackageBody,
  type EditBody,
  type RecordBody,
  type RevertBody,
  type ScheduleBody,
} from './presentation.schemas.js'
import { PresentationService } from './presentation.service.js'

/** Every route answers the proposal's whole PresentationData. */
@Controller()
export class PresentationController {
  constructor(private readonly presentation: PresentationService) {}

  @Get('proposals/:id/presentation')
  get(@CurrentUser() user: User, @Param('id', UuidPipe) id: string): Promise<PresentationData> {
    return this.presentation.get(user, id)
  }

  @Post('proposals/:id/presentation/packages')
  createPackage(@CurrentUser() user: User, @Param('id', UuidPipe) id: string, @Body(new ZodPipe(createPackageSchema)) body: CreatePackageBody): Promise<PresentationData> {
    return this.presentation.createPackage(user, id, body)
  }

  @Delete('proposals/:id/presentation/packages/:packageId')
  deletePackage(@CurrentUser() user: User, @Param('id', UuidPipe) id: string, @Param('packageId', UuidPipe) packageId: string): Promise<PresentationData> {
    return this.presentation.deletePackage(user, id, packageId)
  }

  @Post('proposals/:id/presentation/record')
  @HttpCode(200)
  record(@CurrentUser() user: User, @Param('id', UuidPipe) id: string, @Body(new ZodPipe(recordSchema)) body: RecordBody): Promise<PresentationData> {
    return this.presentation.record(user, id, body)
  }

  @Post('proposals/:id/presentation/tracks/:trackId/schedule')
  @HttpCode(200)
  schedule(
    @CurrentUser() user: User,
    @Param('id', UuidPipe) id: string,
    @Param('trackId', UuidPipe) trackId: string,
    @Body(new ZodPipe(scheduleSchema)) body: ScheduleBody,
  ): Promise<PresentationData> {
    return this.presentation.schedule(user, id, trackId, body)
  }

  @Post('proposals/:id/presentation/tracks/:trackId/revert')
  @HttpCode(200)
  revert(
    @CurrentUser() user: User,
    @Param('id', UuidPipe) id: string,
    @Param('trackId', UuidPipe) trackId: string,
    @Body(new ZodPipe(revertSchema)) body: RevertBody,
  ): Promise<PresentationData> {
    return this.presentation.revert(user, id, trackId, body.targetEventId)
  }

  @Post('proposals/:id/presentation/tracks/:trackId/edit')
  @HttpCode(200)
  edit(
    @CurrentUser() user: User,
    @Param('id', UuidPipe) id: string,
    @Param('trackId', UuidPipe) trackId: string,
    @Body(new ZodPipe(editSchema)) body: EditBody,
  ): Promise<PresentationData> {
    return this.presentation.edit(user, id, trackId, body)
  }

  @Delete('proposals/:id/presentation/tracks/:trackId')
  removeTrack(@CurrentUser() user: User, @Param('id', UuidPipe) id: string, @Param('trackId', UuidPipe) trackId: string): Promise<PresentationData> {
    return this.presentation.removeTrack(user, id, trackId)
  }
}
