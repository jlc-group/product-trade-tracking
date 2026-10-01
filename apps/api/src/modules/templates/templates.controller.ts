import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import type { TaskTemplate, User } from '@flowtrade/shared'
import type { TemplatePreviewItem } from '@flowtrade/shared/api-types'
import { CurrentUser, RequirePermission } from '../../auth/decorators.js'
import { UuidPipe, ZodPipe } from '../../common/zod.js'
import {
  createTemplateSchema,
  listQuerySchema,
  previewQuerySchema,
  suggestQuerySchema,
  updateTemplateSchema,
  type CreateTemplateBody,
  type PreviewQuery,
  type SuggestQuery,
  type UpdateTemplateBody,
} from './templates.schemas.js'
import { TemplatesService } from './templates.service.js'

@Controller('task-templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  list(@Query(new ZodPipe(listQuerySchema)) q: { includeInactive: boolean }): Promise<TaskTemplate[]> {
    return this.templates.list(q.includeInactive)
  }

  /** Declared before ':id'. Returns null (empty 200 body) when nothing fits. */
  @Get('suggest')
  suggest(@Query(new ZodPipe(suggestQuerySchema)) q: SuggestQuery): Promise<TaskTemplate | null> {
    return this.templates.suggest(q)
  }

  @Get(':id')
  get(@Param('id', UuidPipe) id: string): Promise<TaskTemplate> {
    return this.templates.get(id)
  }

  @Get(':id/preview')
  preview(@Param('id', UuidPipe) id: string, @Query(new ZodPipe(previewQuerySchema)) q: PreviewQuery): Promise<TemplatePreviewItem[]> {
    return this.templates.preview(id, q)
  }

  @RequirePermission('template.manage')
  @Post()
  create(@CurrentUser() user: User, @Body(new ZodPipe(createTemplateSchema)) body: CreateTemplateBody): Promise<TaskTemplate> {
    return this.templates.create(user, body)
  }

  @RequirePermission('template.manage')
  @Patch(':id')
  update(@CurrentUser() user: User, @Param('id', UuidPipe) id: string, @Body(new ZodPipe(updateTemplateSchema)) body: UpdateTemplateBody): Promise<TaskTemplate> {
    return this.templates.update(user, id, body)
  }

  @RequirePermission('template.manage')
  @Delete(':id')
  remove(@CurrentUser() user: User, @Param('id', UuidPipe) id: string): Promise<true> {
    return this.templates.remove(user, id)
  }
}
