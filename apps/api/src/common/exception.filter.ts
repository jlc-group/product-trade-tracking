import { ArgumentsHost, Catch, HttpException, Logger, type ExceptionFilter } from '@nestjs/common'
import type { Response } from 'express'
import { Prisma } from '../generated/prisma/client.js'
import { ApiError } from './errors.js'

interface ErrorBody {
  status: number
  code: string
  message: string
  fields?: Record<string, string>
}

const HTTP_CODES: Record<number, string> = { 400: 'BAD_REQUEST', 401: 'UNAUTHENTICATED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 405: 'METHOD_NOT_ALLOWED', 409: 'CONFLICT', 413: 'PAYLOAD_TOO_LARGE', 415: 'UNSUPPORTED_MEDIA_TYPE', 422: 'VALIDATION', 429: 'RATE_LIMITED' }

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions')

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>()
    const body = this.toBody(exception)
    if (body.status >= 500) this.logger.error(exception instanceof Error ? exception.stack ?? exception.message : String(exception))
    res.status(body.status).json(body)
  }

  private toBody(e: unknown): ErrorBody {
    if (e instanceof ApiError) return { status: e.status, code: e.code, message: e.message, ...(e.fields ? { fields: e.fields } : {}) }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') return { status: 409, code: 'CONFLICT', message: 'ข้อมูลซ้ำกับที่มีอยู่แล้ว' }
      if (e.code === 'P2025') return { status: 404, code: 'NOT_FOUND', message: 'ไม่พบข้อมูล' }
      if (e.code === 'P2003') return { status: 409, code: 'IN_USE', message: 'ข้อมูลนี้ถูกใช้งานอยู่ จึงลบหรือแก้ไขไม่ได้' }
    }
    if (e instanceof HttpException) {
      const status = e.getStatus()
      const r = e.getResponse()
      const message = typeof r === 'string' ? r : ((r as { message?: string | string[] }).message ?? e.message)
      return { status, code: HTTP_CODES[status] ?? 'ERROR', message: Array.isArray(message) ? message.join(', ') : message }
    }
    return { status: 500, code: 'INTERNAL', message: 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่' }
  }
}
