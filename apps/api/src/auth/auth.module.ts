import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { AuthController } from './auth.controller.js'
import { AuthGuard } from './auth.guard.js'
import { SessionService } from './session.service.js'

@Module({
  controllers: [AuthController],
  providers: [SessionService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [SessionService],
})
export class AuthModule {}
