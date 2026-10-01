import { Module } from '@nestjs/common'
import { TemplatesController } from './templates.controller.js'
import { TemplatesService } from './templates.service.js'

/** /task-templates — list, suggest, get, preview, create, update (items replace all), delete. */
@Module({
  controllers: [TemplatesController],
  providers: [TemplatesService],
})
export class TemplatesModule {}
