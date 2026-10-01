import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common'
import { can, type Department, type User } from '@flowtrade/shared'
import { CurrentUser, RequirePermission } from '../../auth/decorators.js'
import { forbidden } from '../../common/errors.js'
import { UuidPipe, ZodPipe } from '../../common/zod.js'
import {
  createDepartmentSchema,
  listDepartmentsQuery,
  reorderDepartmentsSchema,
  updateDepartmentSchema,
  type CreateDepartmentBody,
  type ListDepartmentsQuery,
  type ReorderDepartmentsBody,
  type UpdateDepartmentBody,
} from './departments.schemas.js'
import { DepartmentsService } from './departments.service.js'

@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  /** Active departments for pickers (any signed-in user); inactive ones too with department.manage. */
  @Get()
  list(@CurrentUser() user: User, @Query(new ZodPipe(listDepartmentsQuery)) query: ListDepartmentsQuery): Promise<Department[]> {
    if (query.includeInactive && !can(user, 'department.manage')) throw forbidden()
    return this.departments.list(query.includeInactive)
  }

  // Static routes before ':id'.
  @Get('usage')
  @RequirePermission('department.manage')
  usage(): Promise<Record<string, number>> {
    return this.departments.usage()
  }

  @Put('order')
  @RequirePermission('department.manage')
  reorder(@CurrentUser() actor: User, @Body(new ZodPipe(reorderDepartmentsSchema)) body: ReorderDepartmentsBody): Promise<true> {
    return this.departments.reorder(actor, body.ids)
  }

  @Post()
  @RequirePermission('department.manage')
  create(@CurrentUser() actor: User, @Body(new ZodPipe(createDepartmentSchema)) body: CreateDepartmentBody): Promise<Department> {
    return this.departments.create(actor, body)
  }

  @Patch(':id')
  @RequirePermission('department.manage')
  update(@CurrentUser() actor: User, @Param('id', UuidPipe) id: string, @Body(new ZodPipe(updateDepartmentSchema)) body: UpdateDepartmentBody): Promise<Department> {
    return this.departments.update(actor, id, body)
  }

  @Delete(':id')
  @RequirePermission('department.manage')
  remove(@CurrentUser() actor: User, @Param('id', UuidPipe) id: string): Promise<true> {
    return this.departments.remove(actor, id)
  }
}
