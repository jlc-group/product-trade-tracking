import { Module } from '@nestjs/common'
import { DepartmentsController } from './departments.controller.js'
import { DepartmentsService } from './departments.service.js'

/** /departments — the admin-managed list users.department must come from. */
@Module({
  controllers: [DepartmentsController],
  providers: [DepartmentsService],
})
export class DepartmentsModule {}
