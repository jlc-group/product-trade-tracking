import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common'
import type { ShelfType, User } from '@flowtrade/shared'
import { CurrentUser, RequirePermission } from '../../auth/decorators.js'
import { UuidPipe, ZodPipe } from '../../common/zod.js'
import {
  createShelfTypeSchema,
  listShelfTypesQuery,
  reorderShelfTypesSchema,
  updateShelfTypeSchema,
  type CreateShelfTypeBody,
  type ReorderShelfTypesBody,
  type UpdateShelfTypeBody,
} from './shelf-types.schemas.js'
import { ShelfTypesService } from './shelf-types.service.js'

@Controller('shelf-types')
export class ShelfTypesController {
  constructor(private readonly shelfTypes: ShelfTypesService) {}

  @Get()
  list(@Query(new ZodPipe(listShelfTypesQuery)) query: { includeInactive: boolean }): Promise<ShelfType[]> {
    return this.shelfTypes.list(query.includeInactive)
  }

  // Static routes before ':id'.
  @Get('usage')
  usage(): Promise<Record<string, number>> {
    return this.shelfTypes.usage()
  }

  @Put('order')
  @RequirePermission('shelfType.manage')
  reorder(@Body(new ZodPipe(reorderShelfTypesSchema)) body: ReorderShelfTypesBody): Promise<true> {
    return this.shelfTypes.reorder(body.ids)
  }

  @Post()
  @RequirePermission('shelfType.manage')
  create(@CurrentUser() user: User, @Body(new ZodPipe(createShelfTypeSchema)) body: CreateShelfTypeBody): Promise<ShelfType> {
    return this.shelfTypes.create(user, body)
  }

  @Patch(':id')
  @RequirePermission('shelfType.manage')
  update(@CurrentUser() user: User, @Param('id', UuidPipe) id: string, @Body(new ZodPipe(updateShelfTypeSchema)) body: UpdateShelfTypeBody): Promise<ShelfType> {
    return this.shelfTypes.update(user, id, body)
  }

  @Delete(':id')
  @RequirePermission('shelfType.manage')
  remove(@CurrentUser() user: User, @Param('id', UuidPipe) id: string): Promise<true> {
    return this.shelfTypes.remove(user, id)
  }
}
