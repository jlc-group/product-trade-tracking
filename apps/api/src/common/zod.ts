import { Injectable, type PipeTransform } from '@nestjs/common'
import { z } from 'zod'
import { ApiError, invalid } from './errors.js'

/** Parse with zod; on failure throw 422 with the first Thai message and per-field messages. */
export function parse<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value)
  if (result.success) return result.data
  const fields: Record<string, string> = {}
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_'
    fields[key] ??= issue.message
  }
  throw invalid(result.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง', fields)
}

/** Usage: @Body(new ZodPipe(schema)) body: z.output<typeof schema> */
@Injectable()
export class ZodPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}
  transform(value: unknown) {
    return parse(this.schema, value)
  }
}

// ---------- reusable field schemas ----------

export const zId = z.uuid({ message: 'รหัสอ้างอิงไม่ถูกต้อง' })
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD')
export const zChannel = z.enum(['OFFLINE', 'ONLINE'], { message: 'ช่องทางไม่ถูกต้อง' })
export const zRole = z.enum(['ADMIN', 'MANAGER', 'USER'], { message: 'บทบาทไม่ถูกต้อง' })
export const zStatus = z.enum(['DRAFT', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED'], { message: 'สถานะไม่ถูกต้อง' })
export const zPriority = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT'], { message: 'ระดับความสำคัญไม่ถูกต้อง' })
export const zColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'สีต้องเป็นรหัส hex เช่น #2563eb')
/** Query-string boolean: "true"/"1" → true. */
export const zBoolQuery = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => v === true || v === 'true' || v === '1')

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Route-param pipe: a malformed id is simply "not found". Usage: @Param('id', UuidPipe) id: string */
@Injectable()
export class UuidPipe implements PipeTransform<string, string> {
  transform(value: string) {
    if (!UUID_RE.test(value)) throw new ApiError(404, 'NOT_FOUND', 'ไม่พบข้อมูล')
    return value
  }
}
