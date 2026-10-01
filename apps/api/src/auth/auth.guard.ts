import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { can, type Permission } from '@flowtrade/shared'
import { forbidden, unauthenticated } from '../common/errors.js'
import { toUser } from '../common/mappers.js'
import { ALLOW_PENDING_PASSWORD, IS_PUBLIC, REQUIRED_PERMISSION, type AuthedRequest } from './decorators.js'
import { SessionService } from './session.service.js'

/**
 * Global guard: resolves the session cookie on every request, then enforces
 * @Public, the forced password change, and @RequirePermission.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>()
    const targets = [ctx.getHandler(), ctx.getClass()]
    const session = await this.sessions.resolve(this.sessions.readToken(req))
    if (session) {
      req.user = toUser(session.user)
      req.sessionId = session.id
    }
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true
    if (!req.user) throw unauthenticated()
    if (req.user.mustChangePassword && !this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD, targets)) {
      throw forbidden('กรุณาเปลี่ยนรหัสผ่านชั่วคราวก่อนใช้งาน')
    }
    const permission = this.reflector.getAllAndOverride<Permission | undefined>(REQUIRED_PERMISSION, targets)
    if (permission && !can(req.user, permission)) throw forbidden()
    return true
  }
}
