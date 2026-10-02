// Task details in "table" form: rows of label → value (DescriptionFormat 'FIELDS').
import type { DetailField, DetailFieldInput } from './types.js'

export const DETAIL_FIELDS_MAX = 100
export const DETAIL_LABEL_MAX = 200
export const DETAIL_VALUE_MAX = 2000

export interface DetailFieldDraft {
  label: string
  value: string
}

/**
 * Text → rows, for switching a task from free text to a table. One row per non-empty line;
 * "label: value" splits at the first colon, a line without one becomes a label with no value.
 */
export function parseDetailText(text: string | null): DetailFieldDraft[] {
  const rows: DetailFieldDraft[] = []
  for (const raw of (text ?? '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const colon = line.search(/[:：]/)
    const label = (colon >= 0 ? line.slice(0, colon) : line).trim().slice(0, DETAIL_LABEL_MAX)
    const value = (colon >= 0 ? line.slice(colon + 1) : '').trim().slice(0, DETAIL_VALUE_MAX)
    if (label) rows.push({ label, value })
    else if (value && rows.length) rows[rows.length - 1].value = `${rows[rows.length - 1].value}\n${value}`.trim()
    if (rows.length >= DETAIL_FIELDS_MAX) break
  }
  return rows
}

/** Rows → text ("label: value" per line), for switching back to free text or copying. */
export function formatDetailFields(fields: Pick<DetailField, 'label' | 'value'>[]): string {
  return fields.map((f) => (f.value.trim() ? `${f.label}: ${f.value.trim().replace(/\s*\n\s*/g, ' ')}` : `${f.label}:`)).join('\n')
}

/** How many rows have a value. */
export function detailFieldsProgress(fields: Pick<DetailField, 'value'>[]): { filled: number; total: number } {
  return { filled: fields.filter((f) => f.value.trim() !== '').length, total: fields.length }
}

/** The row changes a task PATCH can carry (UpdateTaskInput). */
export interface DetailFieldsPatch {
  detailFields?: DetailFieldInput[]
  detailAppend?: DetailFieldInput[]
  detailLabels?: Record<string, string>
  detailRemove?: string[]
  detailValues?: Record<string, string>
}

export const hasDetailPatch = (p: DetailFieldsPatch) =>
  p.detailFields !== undefined || p.detailAppend !== undefined || p.detailLabels !== undefined || p.detailRemove !== undefined || p.detailValues !== undefined

/**
 * Applies a PATCH's row changes to the latest rows, in this order: replace → remove → rename → fill → append.
 * Rename / fill / remove are by id, so changes to different rows by different people never overwrite each other.
 * `missing` = ids to rename or fill that no longer exist (removing a gone row is fine).
 */
export function applyDetailPatch(current: DetailField[], patch: DetailFieldsPatch, newId: () => string): { fields: DetailField[]; missing: string[] } {
  const row = (r: DetailFieldInput): DetailField => ({ id: r.id ?? newId(), label: r.label.trim(), value: (r.value ?? '').trim() })
  let fields = patch.detailFields ? patch.detailFields.map(row) : current
  if (patch.detailRemove?.length) {
    const gone = new Set(patch.detailRemove)
    fields = fields.filter((f) => !gone.has(f.id))
  }
  const known = new Set(fields.map((f) => f.id))
  const missing = [...Object.keys(patch.detailLabels ?? {}), ...Object.keys(patch.detailValues ?? {})].filter((id) => !known.has(id))
  if (patch.detailLabels || patch.detailValues) {
    const labels = patch.detailLabels ?? {}
    const values = patch.detailValues ?? {}
    fields = fields.map((f) => ({
      ...f,
      label: Object.hasOwn(labels, f.id) ? labels[f.id].trim() : f.label,
      value: Object.hasOwn(values, f.id) ? values[f.id].trim() : f.value,
    }))
  }
  if (patch.detailAppend?.length) fields = [...fields, ...patch.detailAppend.map(row)]
  return { fields, missing: [...new Set(missing)] }
}

/** Table labels as a template stores them: trimmed, blanks dropped, capped like task rows. */
export function cleanFieldLabels(labels: readonly unknown[] | null | undefined): string[] {
  return (labels ?? [])
    .flatMap((l) => (typeof l === 'string' && l.trim() ? [l.trim().slice(0, DETAIL_LABEL_MAX)] : []))
    .slice(0, DETAIL_FIELDS_MAX)
}

/** Defensive read of the stored JSON (anything that isn't a well-formed row is skipped). */
export function readDetailFields(json: unknown): DetailField[] {
  if (!Array.isArray(json)) return []
  return json.flatMap((r: unknown) => {
    if (!r || typeof r !== 'object') return []
    const { id, label, value } = r as Record<string, unknown>
    return typeof id === 'string' && typeof label === 'string' ? [{ id, label, value: typeof value === 'string' ? value : '' }] : []
  })
}
