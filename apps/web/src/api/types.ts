export * from '@flowtrade/shared/api-types'
export type { AppNotification } from '@flowtrade/shared'

/** Error raised by the HTTP client from the API error envelope: { status, code, message, fields? }. */
export class ApiError extends Error {
  status: number
  code: string
  fields?: Record<string, string>
  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message)
    this.status = status
    this.code = code
    this.fields = fields
  }
}
