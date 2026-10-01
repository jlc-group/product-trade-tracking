import type { Channel, Task } from '@flowtrade/shared'

/** Short word for the launch date: "วันวางขาย" (offline) / "วันเปิดขาย" (online). */
export function launchWord(channel: Channel) {
  return channel === 'ONLINE' ? 'วันเปิดขาย' : 'วันวางขาย'
}

/** Short word for the retailer: "ห้าง" (offline) / "แพลตฟอร์ม" (online). */
export function storeWord(channel: Channel) {
  return channel === 'ONLINE' ? 'แพลตฟอร์ม' : 'ห้าง'
}

/** Tasks without children — the actionable items that progress counts. */
export function leafTasks<T extends Pick<Task, 'id' | 'parentId'>>(tasks: T[]): T[] {
  const parents = new Set(tasks.map((t) => t.parentId).filter((id): id is string => !!id))
  return tasks.filter((t) => !parents.has(t.id))
}

/** "ช้าลง 7 วัน" / "เร็วขึ้น 3 วัน" / "วันเดิม" */
export function shiftLabel(days: number) {
  if (days === 0) return 'วันเดิม'
  return days > 0 ? `ช้าลง ${days} วัน` : `เร็วขึ้น ${-days} วัน`
}

export function sameSet(a: readonly string[], b: readonly string[]) {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((x) => set.has(x))
}
