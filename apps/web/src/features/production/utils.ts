// Small non-React helpers of the production tab (DOM focus, dialog copy, error kinds).
import { ApiError } from '@/api'

export const qtyInputId = (productId: string) => `production-qty-${productId}`

/** Focus (and scroll to) a row's quantity input. */
export function focusQty(productId: string) {
  const el = document.getElementById(qtyInputId(productId))
  if (!el) return
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  el.focus({ preventScroll: true })
}

/** A 409 means the rows moved (the hook already toasted and refetched): close; anything else keeps the form open. */
export const isStale = (error: unknown) => error instanceof ApiError && error.status === 409

/** "PRJ-2026-0023 · ชื่อโปรเจกต์" — the start of every dialog description. */
export const proposalLine = (p: { code: string; title: string }) => `${p.code} · ${p.title}`
