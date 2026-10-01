/** Error thrown by services; the global filter turns it into { status, code, message, fields }. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message)
  }
}

export const unauthenticated = (message = 'กรุณาเข้าสู่ระบบอีกครั้ง') => new ApiError(401, 'UNAUTHENTICATED', message)
export const forbidden = (message = 'คุณไม่มีสิทธิ์ทำรายการนี้') => new ApiError(403, 'FORBIDDEN', message)
export const notFound = (what: string) => new ApiError(404, 'NOT_FOUND', `ไม่พบ${what}`)
export const invalid = (message: string, fields?: Record<string, string>) => new ApiError(422, 'VALIDATION', message, fields)
export const conflict = (message: string, code = 'CONFLICT') => new ApiError(409, code, message)
