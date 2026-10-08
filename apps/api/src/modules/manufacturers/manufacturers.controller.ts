import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common'
import { can, type Manufacturer, type User } from '@flowtrade/shared'
import { CurrentUser, RequirePermission } from '../../auth/decorators.js'
import { forbidden } from '../../common/errors.js'
import { UuidPipe, ZodPipe } from '../../common/zod.js'
import {
  createManufacturerSchema,
  listManufacturersQuery,
  reorderManufacturersSchema,
  updateManufacturerSchema,
  type CreateManufacturerBody,
  type ListManufacturersQuery,
  type ReorderManufacturersBody,
  type UpdateManufacturerBody,
} from './manufacturers.schemas.js'
import { ManufacturersService } from './manufacturers.service.js'

@Controller('manufacturers')
export class ManufacturersController {
  constructor(private readonly manufacturers: ManufacturersService) {}

  /**
   * Any signed-in user. Active ones by default; `includeInactive` adds the deactivated ones (names aren't sensitive):
   * the confirm dialog's picker shows an inactive current value and tells a typed inactive name apart from a new one.
   */
  @Get()
  list(@Query(new ZodPipe(listManufacturersQuery)) query: ListManufacturersQuery): Promise<Manufacturer[]> {
    return this.manufacturers.list(query.includeInactive)
  }

  // Static routes before ':id'.
  @Get('usage')
  @RequirePermission('manufacturer.manage')
  usage(): Promise<Record<string, number>> {
    return this.manufacturers.usage()
  }

  @Put('order')
  @RequirePermission('manufacturer.manage')
  reorder(@CurrentUser() actor: User, @Body(new ZodPipe(reorderManufacturersSchema)) body: ReorderManufacturersBody): Promise<true> {
    return this.manufacturers.reorder(actor, body.ids)
  }

  /** manufacturer.manage, or proposal.create for the confirm dialog's inline add. */
  @Post()
  create(@CurrentUser() actor: User, @Body(new ZodPipe(createManufacturerSchema)) body: CreateManufacturerBody): Promise<Manufacturer> {
    if (!can(actor, 'manufacturer.manage') && !can(actor, 'proposal.create')) throw forbidden()
    return this.manufacturers.create(actor, body)
  }

  @Patch(':id')
  @RequirePermission('manufacturer.manage')
  update(@CurrentUser() actor: User, @Param('id', UuidPipe) id: string, @Body(new ZodPipe(updateManufacturerSchema)) body: UpdateManufacturerBody): Promise<Manufacturer> {
    return this.manufacturers.update(actor, id, body)
  }

  @Delete(':id')
  @RequirePermission('manufacturer.manage')
  remove(@CurrentUser() actor: User, @Param('id', UuidPipe) id: string): Promise<true> {
    return this.manufacturers.remove(actor, id)
  }
}
