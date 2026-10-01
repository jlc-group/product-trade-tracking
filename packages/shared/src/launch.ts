// Business rules for launch (on-shelf) dates.
// Launches always happen on the 15th of a month; preparation starts PREP_DAYS earlier.
import { addDays } from './task-tree.js'
import type { ISODate } from './types.js'

export const LAUNCH_DAY_OF_MONTH = 15
export const PREP_DAYS = 90

const pad = (n: number) => String(n).padStart(2, '0')

/** The launch date of a month: YYYY-MM-15 (month is 1–12). */
export function launchDateOf(year: number, month: number): ISODate {
  return `${year}-${pad(month)}-${pad(LAUNCH_DAY_OF_MONTH)}`
}

/** true when the date is a valid launch date (the 15th). */
export function isLaunchDate(date: ISODate | null | undefined): boolean {
  return !!date && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number(date.slice(8, 10)) === LAUNCH_DAY_OF_MONTH
}

/** First day of preparation for a launch date (launch − PREP_DAYS). */
export function prepStartOf(launch: ISODate): ISODate {
  return addDays(launch, -PREP_DAYS)
}

/** Earliest launch date whose whole preparation window is still ahead of `today`. */
export function earliestOnTimeLaunch(today: ISODate): ISODate {
  const [y, m] = today.split('-').map(Number)
  for (let i = 0; i < 24; i++) {
    const date = launchDateOf(y + Math.floor((m - 1 + i) / 12), ((m - 1 + i) % 12) + 1)
    if (prepStartOf(date) >= today) return date
  }
  return launchDateOf(y + 2, m)
}

/**
 * Fallback department suggestions for task "responsible" (the real list is the admin-managed
 * departments table — GET /departments). Keep in sync with the company list.
 */
export const DEFAULT_DEPARTMENTS = ['Jlcall', 'System AI', 'Purchase', 'HR and Account', 'Branding & Marketing', 'General', 'NPD', 'Graphics'] as const
