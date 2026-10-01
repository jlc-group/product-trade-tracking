import { Body, Controller, Get, Param, Post } from '@nestjs/common'
import type { User } from '@flowtrade/shared'
import type { CommentWithAuthor } from '@flowtrade/shared/api-types'
import { z } from 'zod'
import { CurrentUser } from '../../auth/decorators.js'
import { UuidPipe, ZodPipe } from '../../common/zod.js'
import { CommentsService } from './comments.service.js'

const createCommentSchema = z.object(
  { body: z.string({ message: 'กรุณาพิมพ์ข้อความ' }).max(5000, 'ข้อความยาวเกินไป (ไม่เกิน 5,000 ตัวอักษร)') },
  { message: 'ข้อมูลไม่ถูกต้อง' },
)

@Controller()
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get('tasks/:id/comments')
  list(@CurrentUser() user: User, @Param('id', UuidPipe) id: string): Promise<CommentWithAuthor[]> {
    return this.comments.list(user, id)
  }

  @Post('tasks/:id/comments')
  create(@CurrentUser() user: User, @Param('id', UuidPipe) id: string, @Body(new ZodPipe(createCommentSchema)) body: z.output<typeof createCommentSchema>): Promise<CommentWithAuthor> {
    return this.comments.create(user, id, body.body)
  }

  @Get('proposals/:id/comment-counts')
  counts(@CurrentUser() user: User, @Param('id', UuidPipe) id: string): Promise<Record<string, number>> {
    return this.comments.counts(user, id)
  }
}
