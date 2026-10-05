import type { Store } from '@flowtrade/shared'
import type { ProposalListItem } from '@/api/types'
import { ChannelBadge, StoreLogo } from '@/components/common/badges'
import { ProposalCard } from './proposal-card'

interface StoreGroup {
  store: Store
  items: ProposalListItem[]
  active: number
  overdue: number
}

/** A proposal listed at several stores appears in each of their groups. */
function groupByStore(items: ProposalListItem[]): StoreGroup[] {
  const map = new Map<string, StoreGroup>()
  for (const p of items) {
    for (const store of p.stores) {
      const g = map.get(store.id) ?? { store, items: [], active: 0, overdue: 0 }
      g.items.push(p)
      if (p.status !== 'COMPLETED' && p.status !== 'CANCELLED') g.active += 1
      g.overdue += p.overdueCount
      map.set(store.id, g)
    }
  }
  // Offline stores first, then the admin-defined order.
  return [...map.values()].sort(
    (a, b) => (a.store.channel === b.store.channel ? 0 : a.store.channel === 'OFFLINE' ? -1 : 1) || a.store.sortOrder - b.store.sortOrder || a.store.name.localeCompare(b.store.name, 'th'),
  )
}

/** Cards grouped by store — items arrive already sorted, the order is kept within each group. */
export function GridView({ items }: { items: ProposalListItem[] }) {
  const groups = groupByStore(items)
  return (
    <div className="space-y-8">
      {groups.map((g) => (
        <section key={g.store.id} aria-labelledby={`store-${g.store.id}`} className="space-y-3">
          <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <StoreLogo store={g.store} size="md" />
            <h2 id={`store-${g.store.id}`} className="text-base font-semibold">
              {g.store.name}
            </h2>
            <ChannelBadge channel={g.store.channel} />
            <span className="tabular text-sm text-muted-foreground">
              {g.items.length} รายการ{g.active !== g.items.length && ` · กำลังทำ ${g.active}`}
            </span>
            {g.overdue > 0 && <span className="tabular rounded-full bg-danger-soft px-2 text-xs leading-5 font-medium text-danger">งานเลยกำหนด {g.overdue}</span>}
          </header>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {g.items.map((p) => (
              <li key={p.id} className="min-w-0">
                <ProposalCard p={p} hideStore className="h-full" />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
