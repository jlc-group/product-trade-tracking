import { Module } from '@nestjs/common'
import { CommentsController } from './comments.controller.js'
import { CommentsService } from './comments.service.js'

/** Task comments and per-proposal comment counts. */
@Module({
  controllers: [CommentsController],
  providers: [CommentsService],
})
export class CommentsModule {}
