import type { ISODate } from '@flowtrade/shared'

/** Prisma returns @db.Date columns as UTC-midnight Date objects. */
export function toDateOnly(value: Date): ISODate
export function toDateOnly(value: Date | null): ISODate | null
export function toDateOnly(value: Date | null): ISODate | null {
  return value ? value.toISOString().slice(0, 10) : null
}

export function fromDateOnly(value: ISODate): Date
export function fromDateOnly(value: ISODate | null | undefined): Date | null
export function fromDateOnly(value: ISODate | null | undefined): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null
}

export const iso = (value: Date) => value.toISOString()
export const isoOrNull = (value: Date | null) => (value ? value.toISOString() : null)
