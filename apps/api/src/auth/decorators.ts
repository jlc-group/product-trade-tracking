import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common'
import type { Permission, User } from '@flowtrade/shared'
import type { Request } from 'express'

export const IS_PUBLIC = 'ft:isPublic'
export const ALLOW_PENDING_PASSWORD = 'ft:allowPendingPassword'
export const REQUIRED_PERMISSION = 'ft:requiredPermission'

/** No session required. */
export const Public = () => SetMetadata(IS_PUBLIC, true)
/** Reachable while the user still has to replace a temporary password. */
export const AllowPendingPassword = () => SetMetadata(ALLOW_PENDING_PASSWORD, true)
/** Role-based gate; resource rules (owner/member/assignee) are checked in services. */
export const RequirePermission = (permission: Permission) => SetMetadata(REQUIRED_PERMISSION, permission)

export interface AuthedRequest extends Request {
  user?: User
  sessionId?: string
}

/** The signed-in user (guaranteed on non-public routes). */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): User => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>()
  return req.user!
})
