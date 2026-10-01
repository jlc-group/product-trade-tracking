import { LEVEL_LABEL, templateLeadDays, type ShelfType, type Store, type TaskTemplate } from '@flowtrade/shared'
import { BlendIcon, CalendarClockIcon } from 'lucide-react'
import { ChannelBadge, ShelfTypeBadge, StoreChip } from '@/components/common/badges'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { levelCounts } from './tree-ops'

interface Props {
  templates: TaskTemplate[]
  storesById: Map<string, Store>
  shelfTypesById: Map<string, ShelfType>
  selectedId: string | null
  pendingActiveId: string | null
  onSelect: (id: string) => void
  onToggleActive: (template: TaskTemplate, isActive: boolean) => void
  className?: string
}

export function TemplateList({ templates, storesById, shelfTypesById, selectedId, pendingActiveId, onSelect, onToggleActive, className }: Props) {
  return (
    <ul className={cn('grid gap-2', className)}>
      {templates.map((t) => {
        const selected = t.id === selectedId
        const shelf = t.shelfTypeId ? shelfTypesById.get(t.shelfTypeId) : undefined
        const store = t.storeId ? storesById.get(t.storeId) : undefined
        const counts = levelCounts(t.items)
        const lead = templateLeadDays(t.items)
        return (
          <li key={t.id}>
            <div
              className={cn(
                'flex rounded-xl border bg-card transition-colors',
                selected ? 'border-primary/50 bg-brand-soft/40 ring-1 ring-primary/25' : 'hover:border-foreground/20',
                !t.isActive && !selected && 'bg-muted/30',
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(t.id)}
                aria-current={selected ? 'true' : undefined}
                className="min-w-0 flex-1 rounded-xl p-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  {t.channel ? (
                    <ChannelBadge channel={t.channel} className="h-5 text-[11px]" />
                  ) : (
                    <span className="inline-flex h-5 items-center gap-1 rounded-md bg-brand-soft px-2 text-[11px] font-medium text-brand" title="ใช้ได้ทั้ง Offline และ Online">
                      <BlendIcon className="size-3.5" aria-hidden />
                      ทุกช่องทาง
                    </span>
                  )}
                  {!t.isActive && <span className="inline-flex h-5 items-center rounded-md bg-muted px-1.5 text-[11px] text-muted-foreground">ปิดใช้งาน</span>}
                </div>
                <div className={cn('mt-1.5 leading-snug font-medium', !t.isActive && 'text-muted-foreground')}>{t.name}</div>
                <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
                  {shelf ? <ShelfTypeBadge shelfType={shelf} className="h-5 text-[11px]" /> : <span className="inline-flex h-5 items-center rounded-md border px-1.5 text-[11px] text-muted-foreground">ทุกประเภท</span>}
                  {store ? (
                    <StoreChip store={store} className="text-xs" />
                  ) : (
                    <span className="text-[11px] text-muted-foreground">{t.channel === null ? 'ทุกห้างและแพลตฟอร์ม' : `ทุก${t.channel === 'OFFLINE' ? 'ห้าง' : 'แพลตฟอร์ม'}`}</span>
                  )}
                </div>
                <div className="tabular mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    {([1, 2, 3] as const)
                      .filter((l) => counts[l] > 0)
                      .map((l) => `${counts[l]} ${LEVEL_LABEL[l]}`)
                      .join(' · ') || 'ยังไม่มีงาน'}
                  </span>
                  <span className="inline-flex items-center gap-1" title="เริ่มงานแรกกี่วันก่อนวันวางขาย">
                    <CalendarClockIcon className="size-3.5" aria-hidden />
                    เตรียม {lead} วัน
                  </span>
                </div>
              </button>
              <div className="flex shrink-0 items-start p-3 pl-1">
                <Switch
                  size="sm"
                  checked={t.isActive}
                  disabled={pendingActiveId === t.id}
                  onCheckedChange={(v) => onToggleActive(t, v)}
                  aria-label={`เปิดใช้งานแม่แบบ ${t.name}`}
                  className="mt-0.5"
                />
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export function TemplateListSkeleton() {
  return (
    <div className="grid gap-2" aria-hidden>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="space-y-2 rounded-xl border bg-card p-3">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  )
}
