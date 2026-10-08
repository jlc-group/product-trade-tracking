// Small non-React helpers of the production tab (dialog copy, error kinds).
import { ApiError } from '@/api'
import type { OrderErrors, OrderField } from './types'

/** A 409 means the rows moved (the hook already toasted and refetched): close; anything else keeps the form open. */
export const isStale = (error: unknown) => error instanceof ApiError && error.status === 409

/** "PRJ-2026-0023 · ชื่อโปรเจกต์" — the start of every dialog description. */
export const proposalLine = (p: { code: string; title: string }) => `${p.code} · ${p.title}`

const ORDER_FIELDS: readonly OrderField[] = ['manufacturerId', 'referenceNo', 'startedOn', 'productionDays', 'mainContactId', 'coContactIds']

/** A 422's per-field messages for the "ใบสั่งผลิต" fields ("order.startedOn" or "startedOn"), to show under them; dialog order. */
export function serverOrderErrors(error: unknown): OrderErrors {
  const found: OrderErrors = {}
  if (!(error instanceof ApiError) || error.status !== 422 || !error.fields) return found
  for (const [path, message] of Object.entries(error.fields)) {
    const key = path.split('.').pop() as OrderField
    if (ORDER_FIELDS.includes(key) && !found[key]) found[key] = message
  }
  // Keyed in dialog order, so the first one is the control to focus.
  const out: OrderErrors = {}
  for (const key of ORDER_FIELDS) if (found[key]) out[key] = found[key]
  return out
}

/** Control id of an order field inside a dialog's form (OrderFields), e.g. to focus the first invalid one. */
export const orderFieldId = (formId: string, key: OrderField) => `${formId}-order-${key}`
