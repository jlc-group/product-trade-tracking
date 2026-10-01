import { Module } from '@nestjs/common'
import { ShelfTypesController } from './shelf-types.controller.js'
import { ShelfTypesService } from './shelf-types.service.js'

/** /shelf-types — shelf types (offline) and listing types (online). */
@Module({
  controllers: [ShelfTypesController],
  providers: [ShelfTypesService],
})
export class ShelfTypesModule {}
