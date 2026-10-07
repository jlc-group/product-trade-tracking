import { Module } from '@nestjs/common'
import { ProductionController } from './production.controller.js'
import { ProductionService } from './production.service.js'

/** /proposals/:id/production: "รอผลิต" — SKUs that passed the buyer, their quantities, confirmation and delivery. */
@Module({
  controllers: [ProductionController],
  providers: [ProductionService],
})
export class ProductionModule {}
