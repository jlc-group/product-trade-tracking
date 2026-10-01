// Responsible departments in the wizard plan: suggestions for the datalist and a stable colour per name.
import { DEFAULT_DEPARTMENTS } from '@flowtrade/shared'

const KNOWN: Record<string, string> = {
  NPD: '#2563eb',
  Graphics: '#7c3aed',
  'Marketing (แบรนด์)': '#db2777',
  Purchase: '#d97706',
  JOY: '#0d9488',
}
const PALETTE = ['#0891b2', '#65a30d', '#c026d3', '#ea580c', '#4f46e5', '#059669', '#be123c', '#64748b']

/** Same name → same colour everywhere (known departments get fixed colours). */
export function departmentColor(name: string): string {
  const key = name.trim()
  if (KNOWN[key]) return KNOWN[key]
  let hash = 0
  for (const ch of key.toLowerCase()) hash = (hash * 31 + ch.codePointAt(0)!) | 0
  return PALETTE[Math.abs(hash) % PALETTE.length]
}

/** Default departments first, then any other name already used in the plan (case-insensitive unique). */
export function departmentOptions(used: (string | null | undefined)[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const name of [...DEFAULT_DEPARTMENTS, ...used]) {
    const value = name?.trim()
    if (!value || seen.has(value.toLowerCase())) continue
    seen.add(value.toLowerCase())
    out.push(value)
  }
  return out
}

/** "NPD 29 · Graphics 2 · …" counts, most used first; blanks counted separately. */
export function departmentCounts(values: (string | null | undefined)[]) {
  const counts = new Map<string, number>()
  let unassigned = 0
  for (const v of values) {
    const name = v?.trim()
    if (!name) unassigned++
    else counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return { list: [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })), unassigned }
}
