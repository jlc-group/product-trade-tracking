import { Module } from '@nestjs/common'
import { StoresController } from './stores.controller.js'
import { StoresService } from './stores.service.js'

/** /stores — retailers (offline) and platforms (online). */
@Module({
  controllers: [StoresController],
  providers: [StoresService],
})
export class StoresModule {}
