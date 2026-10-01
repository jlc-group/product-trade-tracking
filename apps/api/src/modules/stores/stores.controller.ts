import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common'
import type { Store, User } from '@flowtrade/shared'
import { CurrentUser, RequirePermission } from '../../auth/decorators.js'
import { UuidPipe, ZodPipe } from '../../common/zod.js'
import {
  createStoreSchema,
  listStoresQuery,
  reorderStoresSchema,
  updateStoreSchema,
  type CreateStoreBody,
  type ReorderStoresBody,
  type UpdateStoreBody,
} from './stores.schemas.js'
import { StoresService } from './stores.service.js'

@Controller('stores')
export class StoresController {
  constructor(private readonly stores: StoresService) {}

  @Get()
  list(@Query(new ZodPipe(listStoresQuery)) query: { includeInactive: boolean }): Promise<Store[]> {
    return this.stores.list(query.includeInactive)
  }

  // Static routes before ':id'.
  @Get('usage')
  usage(): Promise<Record<string, number>> {
    return this.stores.usage()
  }

  @Put('order')
  @RequirePermission('store.manage')
  reorder(@Body(new ZodPipe(reorderStoresSchema)) body: ReorderStoresBody): Promise<true> {
    return this.stores.reorder(body.ids)
  }

  @Post()
  @RequirePermission('store.manage')
  create(@CurrentUser() user: User, @Body(new ZodPipe(createStoreSchema)) body: CreateStoreBody): Promise<Store> {
    return this.stores.create(user, body)
  }

  @Patch(':id')
  @RequirePermission('store.manage')
  update(@CurrentUser() user: User, @Param('id', UuidPipe) id: string, @Body(new ZodPipe(updateStoreSchema)) body: UpdateStoreBody): Promise<Store> {
    return this.stores.update(user, id, body)
  }

  @Delete(':id')
  @RequirePermission('store.manage')
  remove(@CurrentUser() user: User, @Param('id', UuidPipe) id: string): Promise<true> {
    return this.stores.remove(user, id)
  }
}
