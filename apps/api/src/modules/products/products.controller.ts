import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { can, type Product, type User } from '@flowtrade/shared'
import { CurrentUser, RequirePermission } from '../../auth/decorators.js'
import { forbidden } from '../../common/errors.js'
import { UuidPipe, ZodPipe } from '../../common/zod.js'
import {
  createProductSchema,
  listProductsQuery,
  updateProductSchema,
  type CreateProductBody,
  type ListProductsQuery,
  type UpdateProductBody,
} from './products.schemas.js'
import { ProductsService } from './products.service.js'

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@Query(new ZodPipe(listProductsQuery)) query: ListProductsQuery): Promise<Product[]> {
    return this.products.list(query.q ?? '', query.includeInactive)
  }

  /** product.manage, or proposal.create for the wizard's quick-add. */
  @Post()
  create(@CurrentUser() user: User, @Body(new ZodPipe(createProductSchema)) body: CreateProductBody): Promise<Product> {
    if (!can(user, 'product.manage') && !can(user, 'proposal.create')) throw forbidden()
    return this.products.create(user, body)
  }

  @Patch(':id')
  @RequirePermission('product.manage')
  update(@CurrentUser() user: User, @Param('id', UuidPipe) id: string, @Body(new ZodPipe(updateProductSchema)) body: UpdateProductBody): Promise<Product> {
    return this.products.update(user, id, body)
  }

  @Delete(':id')
  @RequirePermission('product.manage')
  remove(@CurrentUser() user: User, @Param('id', UuidPipe) id: string): Promise<true> {
    return this.products.remove(user, id)
  }
}
