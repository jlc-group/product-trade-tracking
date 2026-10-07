import { addDays, STATUS_LABEL, STATUS_ORDER, type ISODate, type Store } from '@flowtrade/shared'
import type { TaskWithContext } from '@/api'
import { formatDate } from '@/lib/format'

export type GroupTone = 'danger' | 'brand' | 'default' | 'muted'

export interface TaskGroup {
  key: string
  title: string
  subtitle?: string
  tone: GroupTone
  items: TaskWithContext[]
  /** Set when grouped by project. */
  project?: { id: string; code: string; title: string; stores: Store[] }
}

type DueBucket = 'overdue' | 'past' | 'today' | 'tomorrow' | 'week' | 'later' | 'none' | 'uncounted'

const BUCKET_ORDER: DueBucket[] = ['overdue', 'past', 'today', 'tomorrow', 'week', 'later', 'none', 'uncounted']

/** Open tasks the due filters and the badge leave out (parents, non-IN_PROGRESS projects) get their own group. */
function bucketOf(item: TaskWithContext, isDone: boolean, today: ISODate): DueBucket {
  if (!isDone && item.countable === false) return 'uncounted'
  const due = item.task.dueDate
  if (!due) return 'none'
  if (due < today) return isDone ? 'past' : 'overdue'
  if (due === today) return 'today'
  if (due === addDays(today, 1)) return 'tomorrow'
  if (due <= addDays(today, 7)) return 'week'
  return 'later'
}

const short = (d: ISODate) => formatDate(d, { withYear: false })

/** What the group holds: tasks of DRAFT / ON_HOLD / COMPLETED projects and/or parent tasks. */
function uncountedSubtitle(items: TaskWithContext[]) {
  const statuses = STATUS_ORDER.filter((s) => s !== 'IN_PROGRESS' && items.some((i) => i.proposal.status === s))
  const parts = [statuses.length > 0 && `โปรเจกต์${statuses.map((s) => STATUS_LABEL[s]).join('/')}`, items.some((i) => i.proposal.status === 'IN_PROGRESS') && 'งานแม่ที่มีงานย่อย']
  return parts.filter(Boolean).join(' · ')
}

function bucketMeta(bucket: DueBucket, today: ISODate, items: TaskWithContext[]): Pick<TaskGroup, 'title' | 'subtitle' | 'tone'> {
  switch (bucket) {
    case 'overdue':
      return { title: 'เลยกำหนด', subtitle: 'จัดการก่อนเป็นอันดับแรก', tone: 'danger' }
    case 'past':
      return { title: 'ครบกำหนดไปแล้ว', tone: 'muted' }
    case 'today':
      return { title: 'วันนี้', subtitle: formatDate(today, { long: true }), tone: 'brand' }
    case 'tomorrow':
      return { title: 'พรุ่งนี้', subtitle: short(addDays(today, 1)), tone: 'default' }
    case 'week':
      return { title: 'ภายใน 7 วัน', subtitle: `${short(addDays(today, 2))} – ${short(addDays(today, 7))}`, tone: 'default' }
    case 'later':
      return { title: 'หลังจากนั้น', subtitle: `ตั้งแต่ ${short(addDays(today, 8))}`, tone: 'muted' }
    case 'none':
      return { title: 'ยังไม่กำหนดวัน', subtitle: 'ควรกำหนดวันครบกำหนดให้ชัดเจน', tone: 'muted' }
    case 'uncounted':
      return { title: 'ไม่นับเป็นงานเลยกำหนด', subtitle: uncountedSubtitle(items), tone: 'muted' }
  }
}

export function groupByDue(items: TaskWithContext[], isDone: (item: TaskWithContext) => boolean, today: ISODate): TaskGroup[] {
  const buckets = new Map<DueBucket, TaskWithContext[]>()
  for (const item of items) {
    const b = bucketOf(item, isDone(item), today)
    buckets.set(b, [...(buckets.get(b) ?? []), item])
  }
  return BUCKET_ORDER.filter((b) => buckets.has(b)).map((b) => ({ key: b, items: buckets.get(b)!, ...bucketMeta(b, today, buckets.get(b)!) }))
}

export function groupByProject(items: TaskWithContext[], isDone: (item: TaskWithContext) => boolean, today: ISODate): TaskGroup[] {
  const groups = new Map<string, TaskGroup>()
  for (const item of items) {
    const existing = groups.get(item.proposal.id)
    if (existing) {
      existing.items.push(item)
      continue
    }
    groups.set(item.proposal.id, {
      key: item.proposal.id,
      title: item.proposal.title,
      tone: 'default',
      items: [item],
      project: { id: item.proposal.id, code: item.proposal.code, title: item.proposal.title, stores: item.stores },
    })
  }
  const earliest = (g: TaskGroup) => g.items.reduce((min, i) => (i.task.dueDate && i.task.dueDate < min ? i.task.dueDate : min), '9999-12-31')
  return [...groups.values()]
    .map((g) => {
      const overdue = g.items.filter((i) => i.countable !== false && !isDone(i) && !!i.task.dueDate && i.task.dueDate < today).length
      return { ...g, tone: overdue > 0 ? ('danger' as const) : ('default' as const), subtitle: overdue > 0 ? `เลยกำหนด ${overdue} งาน` : undefined }
    })
    .sort((a, b) => earliest(a).localeCompare(earliest(b)))
}

/** Case-insensitive match over the task (incl. its department), its path, project and stores. */
export function matchesQuery(item: TaskWithContext, q: string) {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return [item.task.title, item.task.description ?? '', ...item.task.detailFields.flatMap((f) => [f.label, f.value]), item.task.responsible ?? '', ...item.path, item.proposal.title, item.proposal.code, ...item.stores.flatMap((s) => [s.name, s.shortName])]
    .join('\n')
    .toLowerCase()
    .includes(needle)
}
