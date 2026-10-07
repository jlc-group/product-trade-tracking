import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common'
import type { ProductionView, User } from '@flowtrade/shared'
import { CurrentUser } from '../../auth/decorators.js'
import { UuidPipe, ZodPipe } from '../../common/zod.js'
import {
  advanceSchema,
  backSchema,
  cancelSchema,
  confirmSchema,
  datesSchema,
  keepSchema,
  planSchema,
  quantitiesSchema,
  type AdvanceBody,
  type BackBody,
  type CancelBody,
  type ConfirmBody,
  type DatesBody,
  type KeepBody,
  type PlanBody,
  type QuantitiesBody,
} from './production.schemas.js'
import { ProductionService } from './production.service.js'

/** Every route answers the proposal's whole ProductionView. */
@Controller('proposals/:id/production')
export class ProductionController {
  constructor(private readonly production: ProductionService) {}

  @Get()
  get(@CurrentUser() user: User, @Param('id', UuidPipe) id: string): Promise<ProductionView> {
    return this.production.get(user, id)
  }

  @Put('quantities')
  saveQuantities(@CurrentUser() user: User, @Param('id', UuidPipe) id: string, @Body(new ZodPipe(quantitiesSchema)) body: QuantitiesBody): Promise<ProductionView> {
    return this.production.saveQuantities(user, id, body)
  }

  @Patch('plan')
  savePlan(@CurrentUser() user: User, @Param('id', UuidPipe) id: string, @Body(new ZodPipe(planSchema)) body: PlanBody): Promise<ProductionView> {
    return this.production.savePlan(user, id, body)
  }

  @Post('confirm')
  @HttpCode(200)
  confirm(@CurrentUser() user: User, @Param('id', UuidPipe) id: string, @Body(new ZodPipe(confirmSchema)) body: ConfirmBody): Promise<ProductionView> {
    return this.production.confirm(user, id, body)
  }

  @Post('advance')
  @HttpCode(200)
  advance(@CurrentUser() user: User, @Param('id', UuidPipe) id: string, @Body(new ZodPipe(advanceSchema)) body: AdvanceBody): Promise<ProductionView> {
    return this.production.advance(user, id, body)
  }

  @Post('items/:productId/back')
  @HttpCode(200)
  back(
    @CurrentUser() user: User,
    @Param('id', UuidPipe) id: string,
    @Param('productId', UuidPipe) productId: string,
    @Body(new ZodPipe(backSchema)) body: BackBody,
  ): Promise<ProductionView> {
    return this.production.back(user, id, productId, body)
  }

  @Patch('items/:productId/dates')
  editDates(
    @CurrentUser() user: User,
    @Param('id', UuidPipe) id: string,
    @Param('productId', UuidPipe) productId: string,
    @Body(new ZodPipe(datesSchema)) body: DatesBody,
  ): Promise<ProductionView> {
    return this.production.editDates(user, id, productId, body)
  }

  @Post('items/:productId/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() user: User,
    @Param('id', UuidPipe) id: string,
    @Param('productId', UuidPipe) productId: string,
    @Body(new ZodPipe(cancelSchema)) body: CancelBody,
  ): Promise<ProductionView> {
    return this.production.cancel(user, id, productId, body)
  }

  @Post('items/:productId/restore')
  @HttpCode(200)
  restore(@CurrentUser() user: User, @Param('id', UuidPipe) id: string, @Param('productId', UuidPipe) productId: string): Promise<ProductionView> {
    return this.production.restore(user, id, productId)
  }

  @Post('items/:productId/keep')
  @HttpCode(200)
  keep(
    @CurrentUser() user: User,
    @Param('id', UuidPipe) id: string,
    @Param('productId', UuidPipe) productId: string,
    @Body(new ZodPipe(keepSchema)) body: KeepBody,
  ): Promise<ProductionView> {
    return this.production.keep(user, id, productId, body)
  }
}
