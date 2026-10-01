import { Body, Controller, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common'
import type { User } from '@flowtrade/shared'
import { CurrentUser, RequirePermission, type AuthedRequest } from '../../auth/decorators.js'
import { UuidPipe, ZodPipe } from '../../common/zod.js'
import { createUserSchema, setActiveSchema, updateUserSchema, type CreateUserBody, type SetActiveBody, type UpdateUserBody } from './users.schemas.js'
import { UsersService, type CreateUserResult, type IssuedPasswordResult, type SetActiveResult } from './users.service.js'

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Active users for pickers — any signed-in user. */
  @Get('lookup')
  lookup(): Promise<User[]> {
    return this.users.lookup()
  }

  @RequirePermission('user.manage')
  @Get()
  list(): Promise<User[]> {
    return this.users.list()
  }

  @RequirePermission('user.manage')
  @Post()
  create(@CurrentUser() actor: User, @Body(new ZodPipe(createUserSchema)) body: CreateUserBody): Promise<CreateUserResult> {
    return this.users.create(actor, body)
  }

  @RequirePermission('user.manage')
  @Patch(':id')
  update(@CurrentUser() actor: User, @Param('id', UuidPipe) id: string, @Body(new ZodPipe(updateUserSchema)) body: UpdateUserBody): Promise<User> {
    return this.users.update(actor, id, body)
  }

  @RequirePermission('user.manage')
  @Post(':id/active')
  @HttpCode(200)
  setActive(@CurrentUser() actor: User, @Param('id', UuidPipe) id: string, @Body(new ZodPipe(setActiveSchema)) body: SetActiveBody): Promise<SetActiveResult> {
    return this.users.setActive(actor, id, body.isActive)
  }

  @RequirePermission('user.manage')
  @Post(':id/reset-password')
  @HttpCode(200)
  resetPassword(@CurrentUser() actor: User, @Param('id', UuidPipe) id: string, @Req() req: AuthedRequest): Promise<IssuedPasswordResult> {
    return this.users.resetPassword(actor, id, req.sessionId)
  }
}
