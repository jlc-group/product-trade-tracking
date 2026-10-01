// Non-component helpers for the monitor dashboard.
import type { User } from '@flowtrade/shared'
import { Rectangle, type BarShapeProps } from 'recharts'

const numberFormat = new Intl.NumberFormat('th-TH')

export const fmt = (n: number) => numberFormat.format(n)

/** Short label for charts: nickname, else first name. */
export function shortName(user: Pick<User, 'name' | 'nickname'>) {
  return user.nickname || user.name.split(/\s+/)[0] || user.name
}

/**
 * Bar shape for horizontal stacks: only the segment that ends the stack gets the 4px rounded
 * data-end; inner segments stay square so the 2px surface gap reads cleanly.
 */
export function stackEndShape<T>(isEnd: (row: T) => boolean) {
  return function StackEndShape(p: BarShapeProps) {
    return <Rectangle {...p} radius={isEnd(p.payload as T) ? [0, 4, 4, 0] : 0} />
  }
}

/** Coerce recharts' number | string geometry props. */
export const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0)
