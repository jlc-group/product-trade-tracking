import { DEFAULT_DEPARTMENTS } from '@flowtrade/shared'

/** Longest department name accepted in the UI. */
export const DEPARTMENT_MAX_LENGTH = 100

const DEFAULTS: readonly string[] = DEFAULT_DEPARTMENTS

/** Suggested departments: the standard ones first, then any others already in use (A→Z). */
export function departmentOptions(used: Iterable<string | null | undefined>): string[] {
  const extra = new Set<string>()
  for (const raw of used) {
    const v = raw?.trim()
    if (v && !DEFAULTS.some((d) => d.toLowerCase() === v.toLowerCase())) extra.add(v)
  }
  return [...DEFAULTS, ...[...extra].sort((a, b) => a.localeCompare(b, 'th'))]
}

/** Trim, empty → null, and reuse the spelling of a known department ("npd" → "NPD"). */
export function canonicalDepartment(raw: string | null | undefined, options: readonly string[]): string | null {
  const v = raw?.trim().replace(/\s+/g, ' ')
  if (!v) return null
  return options.find((o) => o.toLowerCase() === v.toLowerCase()) ?? v.slice(0, DEPARTMENT_MAX_LENGTH)
}

/** Order for lists of departments: the standard ones in their usual order, then the rest A→Z. */
export function compareDepartments(a: string, b: string) {
  const ia = DEFAULTS.indexOf(a)
  const ib = DEFAULTS.indexOf(b)
  if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  return a.localeCompare(b, 'th')
}
