import { createHash, randomBytes } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import type { CookieOptions, Request, Response } from 'express'
import { config } from '../config.js'
import { PrismaService } from '../prisma/prisma.service.js'

const HOUR = 3_600_000
const SLIDE_EVERY_MS = 5 * 60_000

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  private cookieOptions(maxAgeMs?: number): CookieOptions {
    return { httpOnly: true, sameSite: 'lax', secure: config.isProd, path: '/', ...(maxAgeMs ? { maxAge: maxAgeMs } : {}) }
  }

  /** Creates a session and sets the cookie. Only the token's SHA-256 hash is stored. */
  async start(userId: string, req: Request, res: Response) {
    const token = randomBytes(32).toString('base64url')
    const now = Date.now()
    const absolute = new Date(now + config.sessionAbsoluteDays * 24 * HOUR)
    await this.prisma.session.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Math.min(now + config.sessionIdleHours * HOUR, absolute.getTime())),
        absoluteExpiresAt: absolute,
        ip: req.ip ?? null,
        userAgent: req.get('user-agent')?.slice(0, 300) ?? null,
      },
    })
    res.cookie(config.sessionCookie, token, this.cookieOptions(absolute.getTime() - now))
  }

  /** Returns the live session + user for a cookie token, sliding the idle expiry. */
  async resolve(token: string | undefined) {
    if (!token) return null
    const session = await this.prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } })
    const now = new Date()
    if (!session || session.revokedAt || session.expiresAt <= now || session.absoluteExpiresAt <= now || !session.user.isActive) return null
    if (now.getTime() - session.lastSeenAt.getTime() > SLIDE_EVERY_MS) {
      const expiresAt = new Date(Math.min(now.getTime() + config.sessionIdleHours * HOUR, session.absoluteExpiresAt.getTime()))
      await this.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: now, expiresAt } })
    }
    return session
  }

  async end(token: string | undefined, res: Response) {
    if (token) await this.prisma.session.updateMany({ where: { tokenHash: hashToken(token), revokedAt: null }, data: { revokedAt: new Date() } })
    res.clearCookie(config.sessionCookie, this.cookieOptions())
  }

  /** Signs a user out everywhere (deactivation, password reset). */
  async revokeAll(userId: string, exceptSessionId?: string) {
    await this.prisma.session.updateMany({ where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) }, data: { revokedAt: new Date() } })
  }

  readToken(req: Request): string | undefined {
    return (req.cookies as Record<string, string> | undefined)?.[config.sessionCookie]
  }
}
