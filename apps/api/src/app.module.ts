import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { AuthModule } from './auth/auth.module.js'
import { CommonModule } from './common/common.module.js'
import { CsrfMiddleware } from './common/csrf.middleware.js'
import { AllExceptionsFilter } from './common/exception.filter.js'
import { ActivityModule } from './modules/activity/activity.module.js'
import { CommentsModule } from './modules/comments/comments.module.js'
import { DashboardModule } from './modules/dashboard/dashboard.module.js'
import { DepartmentsModule } from './modules/departments/departments.module.js'
import { HealthController } from './health.controller.js'
import { ManufacturersModule } from './modules/manufacturers/manufacturers.module.js'
import { NotificationsModule } from './modules/notifications/notifications.module.js'
import { PresentationModule } from './modules/presentation/presentation.module.js'
import { ProductionModule } from './modules/production/production.module.js'
import { ProductsModule } from './modules/products/products.module.js'
import { ProposalsModule } from './modules/proposals/proposals.module.js'
import { ShelfTypesModule } from './modules/shelf-types/shelf-types.module.js'
import { StoresModule } from './modules/stores/stores.module.js'
import { TasksModule } from './modules/tasks/tasks.module.js'
import { TemplatesModule } from './modules/templates/templates.module.js'
import { UsersModule } from './modules/users/users.module.js'
import { PrismaModule } from './prisma/prisma.service.js'

@Module({
  imports: [
    PrismaModule,
    CommonModule,
    AuthModule,
    UsersModule,
    DepartmentsModule,
    StoresModule,
    ShelfTypesModule,
    ProductsModule,
    ManufacturersModule,
    TemplatesModule,
    ProposalsModule,
    TasksModule,
    PresentationModule,
    ProductionModule,
    CommentsModule,
    ActivityModule,
    NotificationsModule,
    DashboardModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CsrfMiddleware).forRoutes('*path')
  }
}
