import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common'
import type { User } from '@flowtrade/shared'
import type { Response } from 'express'
import { z } from 'zod'
import { ActivityService } from '../common/activity.service.js'
import { ApiError, invalid } from '../common/errors.js'
import { toUser } from '../common/mappers.js'
import { ZodPipe } from '../common/zod.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { AllowPendingPassword, CurrentUser, Public, type AuthedRequest } from './decorators.js'
import { getDummyHash, hashPassword, verifyPassword } from './password.js'
import { SessionService } from './session.service.js'

/**
 * `email` carries the sign-in identifier: an email address or a username (trimmed, case-insensitive).
 * Usernames can never contain "@" (USERNAME_RE), so "@" → email lookup, otherwise → username lookup.
 */
const loginSchema = z.object({
  email: z
    .string({ message: 'กรุณากรอกอีเมลหรือชื่อผู้ใช้' })
    .trim()
    .min(1, 'กรุณากรอกอีเมลหรือชื่อผู้ใช้')
    .max(254, 'อีเมลหรือชื่อผู้ใช้ยาวเกินไป')
    .transform((v) => v.toLowerCase()),
  password: z.string({ message: 'กรุณากรอกรหัสผ่าน' }).min(1, 'กรุณากรอกรหัสผ่าน'),
})
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'กรุณากรอกรหัสผ่านปัจจุบัน'),
  newPassword: z.string().min(8, 'รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร').max(128, 'รหัสผ่านยาวเกินไป'),
})

const LOCK_STEPS: [failures: number, minutes: number][] = [
  [15, 60 * 24 * 365],
  [10, 60],
  [5, 15],
]

@Controller('auth')
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly activity: ActivityService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body(new ZodPipe(loginSchema)) body: z.output<typeof loginSchema>, @Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response): Promise<User> {
    const generic = new ApiError(401, 'INVALID_CREDENTIALS', 'ชื่อผู้ใช้/อีเมล หรือรหัสผ่านไม่ถูกต้อง')
    const user = await this.prisma.user.findUnique({ where: body.email.includes('@') ? { email: body.email } : { username: body.email } })
    if (!user) {
      await verifyPassword(await getDummyHash(), body.password)
      throw generic
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) throw new ApiError(423, 'LOCKED', 'บัญชีถูกล็อกชั่วคราวเพราะใส่รหัสผ่านผิดหลายครั้ง กรุณาลองใหม่ภายหลังหรือติดต่อผู้ดูแลระบบ')
    if (!(await verifyPassword(user.passwordHash, body.password))) {
      const failures = user.failedLoginCount + 1
      const step = LOCK_STEPS.find(([n]) => failures >= n)
      await this.prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: failures, lockedUntil: step && failures % 5 === 0 ? new Date(Date.now() + step[1] * 60_000) : undefined } })
      throw generic
    }
    if (!user.isActive) throw new ApiError(403, 'INACTIVE', 'บัญชีนี้ถูกปิดการใช้งาน กรุณาติดต่อผู้ดูแลระบบ')
    const updated = await this.prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } })
    await this.sessions.start(user.id, req, res)
    return toUser(updated)
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    await this.sessions.end(this.sessions.readToken(req), res)
    return true
  }

  /** The signed-in user, or null (never 401 — the SPA calls this on boot). */
  @Public()
  @Get('me')
  me(@Req() req: AuthedRequest): User | null {
    return req.user ?? null
  }

  @AllowPendingPassword()
  @Post('change-password')
  @HttpCode(200)
  async changePassword(@CurrentUser() user: User, @Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response, @Body(new ZodPipe(changePasswordSchema)) body: z.output<typeof changePasswordSchema>): Promise<User> {
    const row = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    if (!(await verifyPassword(row.passwordHash, body.currentPassword))) throw invalid('รหัสผ่านปัจจุบันไม่ถูกต้อง', { currentPassword: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' })
    if (body.newPassword === body.currentPassword) throw invalid('รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม', { newPassword: 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม' })
    const lowered = body.newPassword.toLowerCase()
    const emailName = row.email?.split('@')[0]
    if ((emailName && lowered.includes(emailName)) || (row.username && lowered.includes(row.username))) {
      throw invalid('รหัสผ่านต้องไม่มีชื่อผู้ใช้หรือชื่ออีเมลอยู่ข้างใน', { newPassword: 'รหัสผ่านต้องไม่มีชื่อผู้ใช้หรือชื่ออีเมลอยู่ข้างใน' })
    }
    const updated = await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(body.newPassword), mustChangePassword: false } })
    // New session id after a credential change; other devices are signed out.
    await this.sessions.revokeAll(user.id)
    await this.sessions.start(user.id, req, res)
    await this.activity.log(this.prisma, user, 'user.changePassword', 'USER', user.id, null, `${user.name} เปลี่ยนรหัสผ่าน`)
    return toUser(updated)
  }
}
