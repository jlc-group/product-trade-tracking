// Small helpers shared by the presentation dialogs.
import { useState } from 'react'
import { formatDate } from '@/lib/format'
import type { PresentationModel, TrackEvent, TrackView } from './types'

/**
 * The value as it was while the dialog was open: a parent that clears its dialog target on close
 * doesn't re-render the closing (still animating) content with empty props.
 */
export function useHeldWhileClosed<T>(open: boolean, value: T): T {
  const [held, setHeld] = useState(value)
  if (open && JSON.stringify(held) !== JSON.stringify(value)) setHeld(value)
  return open ? value : held
}

/** aria props for the control inside a <Field>. */
export function fieldAria(id: string, error: string | undefined, hasHint = false) {
  return {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : hasHint ? `${id}-hint` : undefined,
  } as const
}

export const hasErrors = (errors: Partial<Record<string, string>>) => Object.values(errors).some(Boolean)

/** First message per field over several stores' errors (same result for several stores). */
export function mergeErrors<K extends string>(list: Partial<Record<K, string>>[]): Partial<Record<K, string>> {
  const out: Partial<Record<K, string>> = {}
  for (const errors of list) {
    for (const [k, msg] of Object.entries(errors) as [K, string | undefined][]) if (msg) out[k] ??= msg
  }
  return out
}

/** "PRJ-2026-0023 · TEST003" — the start of every dialog description. */
export const proposalLine = (model: PresentationModel) => `${model.proposal.code} · ${model.proposal.title}`

/** rec.desc.edit: "{code} · {title} — บันทึกเมื่อ {date} โดย {name}" (the event as first recorded). */
export function editDescription(model: PresentationModel, event: TrackEvent) {
  return `${proposalLine(model)} — บันทึกเมื่อ ${formatDate(event.recordedAt)} โดย ${model.userName(event.actorId)}`
}

/** The non-reverted timeline item an edit dialog targets (its `effective` copy has the edits applied). */
export function editTarget(view: TrackView | undefined, eventId: string | undefined) {
  if (!view || !eventId) return null
  return view.timeline.find((i) => i.event.id === eventId && !i.reverted) ?? null
}
