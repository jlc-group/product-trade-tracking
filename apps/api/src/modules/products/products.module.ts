import { Module } from '@nestjs/common'
import { ProductsController } from './products.controller.js'
import { ProductsService } from './products.service.js'

/** /products — product master data (also quick-added from the proposal wizard). */
@Module({
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
