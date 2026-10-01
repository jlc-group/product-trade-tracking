import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common'
import type { Task, User } from '@flowtrade/shared'
import type { TaskWithContext } from '@flowtrade/shared/api-types'
import { CurrentUser } from '../../auth/decorators.js'
import { UuidPipe, ZodPipe } from '../../common/zod.js'
import {
  createTaskSchema,
  moveTaskSchema,
  myTasksQuerySchema,
  toggleTaskSchema,
  updateTaskSchema,
  type CreateTaskBody,
  type MoveTaskBody,
  type MyTasksQuery,
  type ToggleTaskBody,
  type UpdateTaskBody,
} from './tasks.schemas.js'
import { TasksService, type ToggleResult } from './tasks.service.js'

@Controller()
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  // Declared before any tasks/:id route.
  @Get('tasks/mine')
  mine(@CurrentUser() user: User, @Query(new ZodPipe(myTasksQuerySchema)) query: MyTasksQuery): Promise<TaskWithContext[]> {
    return this.tasks.mine(user, query)
  }

  @Get('proposals/:id/tasks')
  listByProposal(@CurrentUser() user: User, @Param('id', UuidPipe) id: string): Promise<Task[]> {
    return this.tasks.listByProposal(user, id)
  }

  @Post('tasks')
  create(@CurrentUser() user: User, @Body(new ZodPipe(createTaskSchema)) body: CreateTaskBody): Promise<Task> {
    return this.tasks.create(user, body)
  }

  @Patch('tasks/:id')
  update(@CurrentUser() user: User, @Param('id', UuidPipe) id: string, @Body(new ZodPipe(updateTaskSchema)) body: UpdateTaskBody): Promise<Task> {
    return this.tasks.update(user, id, body)
  }

  @Post('tasks/:id/toggle')
  @HttpCode(200)
  toggle(@CurrentUser() user: User, @Param('id', UuidPipe) id: string, @Body(new ZodPipe(toggleTaskSchema)) body: ToggleTaskBody): Promise<ToggleResult> {
    return this.tasks.toggle(user, id, body.isDone)
  }

  @Post('tasks/:id/move')
  @HttpCode(200)
  move(@CurrentUser() user: User, @Param('id', UuidPipe) id: string, @Body(new ZodPipe(moveTaskSchema)) body: MoveTaskBody): Promise<Task[]> {
    return this.tasks.move(user, id, body)
  }

  @Post('tasks/:id/duplicate')
  duplicate(@CurrentUser() user: User, @Param('id', UuidPipe) id: string): Promise<Task> {
    return this.tasks.duplicate(user, id)
  }

  @Delete('tasks/:id')
  remove(@CurrentUser() user: User, @Param('id', UuidPipe) id: string): Promise<{ removed: string[] }> {
    return this.tasks.remove(user, id)
  }
}
