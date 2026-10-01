import { diffDays, todayBangkok, type ISODate } from '@flowtrade/shared'
import dayjs from 'dayjs'
import buddhistEra from 'dayjs/plugin/buddhistEra'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/th'
import { usePrefsStore } from './prefs'

dayjs.extend(buddhistEra)
dayjs.extend(relativeTime)
dayjs.locale('th')

export { dayjs }

/** Read at call time (not a hook): App remounts the routes when the preference flips. */
const isBE = () => usePrefsStore.get().buddhistEra

/** "15 ต.ค. 69" (BE) or "15 ต.ค. 26" (CE). Pass { long: true } for "15 ตุลาคม 2569". */
export function formatDate(date: ISODate | string | null | undefined, opts: { long?: boolean; withYear?: boolean } = {}) {
  if (!date) return '—'
  const d = dayjs(date)
  const year = opts.withYear === false ? '' : isBE() ? (opts.long ? ' BBBB' : ' BB') : opts.long ? ' YYYY' : ' YY'
  return d.format(`${opts.long ? 'D MMMM' : 'D MMM'}${year}`).trim()
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'
  return dayjs(value).format(`D MMM ${isBE() ? 'BB' : 'YY'} HH:mm`)
}

export function formatDateRange(start: ISODate | null | undefined, due: ISODate | null | undefined) {
  if (!start && !due) return 'ยังไม่กำหนดวัน'
  if (start && due) {
    if (start === due) return formatDate(due, { withYear: false })
    return `${formatDate(start, { withYear: false })} – ${formatDate(due, { withYear: false })}`
  }
  return due ? `ภายใน ${formatDate(due, { withYear: false })}` : `เริ่ม ${formatDate(start, { withYear: false })}`
}

/** Number of calendar days a task spans, inclusive. */
export function spanDays(start: ISODate | null | undefined, due: ISODate | null | undefined) {
  if (!start || !due) return null
  return diffDays(start, due) + 1
}

export function fromNow(value: string) {
  return dayjs(value).fromNow()
}

export function today(): ISODate {
  return todayBangkok()
}

/** "วันนี้", "พรุ่งนี้", "อีก 5 วัน", "เมื่อวาน", "เลยมา 3 วัน" */
export function relativeDay(date: ISODate | null | undefined) {
  if (!date) return ''
  const n = diffDays(today(), date)
  if (n === 0) return 'วันนี้'
  if (n === 1) return 'พรุ่งนี้'
  if (n === -1) return 'เมื่อวาน'
  return n > 0 ? `อีก ${n} วัน` : `เลยมา ${-n} วัน`
}

export function daysUntil(date: ISODate) {
  return diffDays(today(), date)
}

// Thai leading vowels (เ แ โ ใ ไ) are written before the consonant they follow in speech, and
// above/below marks can't stand alone — skip both so "เฟิร์น" becomes "ฟ", not "เ".
const NOT_INITIAL = /[\u0E40-\u0E44\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/u

function firstLetter(word: string | undefined) {
  if (!word) return ''
  for (const ch of word) if (!NOT_INITIAL.test(ch)) return ch
  return word[0] ?? ''
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return firstLetter(parts[0]) + firstLetter(parts[1])
}

export function displayName(user: { name: string; nickname?: string | null }) {
  return user.nickname ? `${user.name} (${user.nickname})` : user.name
}
