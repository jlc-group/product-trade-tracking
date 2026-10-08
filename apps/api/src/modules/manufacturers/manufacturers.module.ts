import { Module } from '@nestjs/common'
import { ManufacturersController } from './manufacturers.controller.js'
import { ManufacturersService } from './manufacturers.service.js'

/** /manufacturers — the admin-managed "บริษัทรับผลิต" list every production order picks from. */
@Module({
  controllers: [ManufacturersController],
  providers: [ManufacturersService],
})
export class ManufacturersModule {}
