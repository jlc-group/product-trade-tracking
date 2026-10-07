import { Module } from '@nestjs/common'
import { PresentationController } from './presentation.controller.js'
import { PresentationService } from './presentation.service.js'

/** /proposals/:id/presentation: "นำเสนอ Buyer" packages, store tracks and their events. */
@Module({
  controllers: [PresentationController],
  providers: [PresentationService],
})
export class PresentationModule {}
