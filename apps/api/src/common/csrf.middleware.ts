import { Injectable, type NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import { config } from '../config.js'
import { forbidden } from './errors.js'

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * CSRF defence for cookie auth: unsafe methods must carry `X-FlowTrade-Request: 1`
 * (cross-site forms can't set custom headers) and, when present, a matching Origin.
 */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    if (SAFE.has(req.method)) return next()
    if (req.get('x-flowtrade-request') !== '1') return next(forbidden('คำขอไม่ถูกต้อง (missing X-FlowTrade-Request header)'))
    const origin = req.get('origin')
    if (origin && origin !== config.webOrigin) return next(forbidden('คำขอจากแหล่งที่ไม่ได้รับอนุญาต'))
    next()
  }
}
