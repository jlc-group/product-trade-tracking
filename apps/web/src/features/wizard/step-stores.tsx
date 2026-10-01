import type { Channel } from '@flowtrade/shared'
import { LayersIcon, StoreIcon } from 'lucide-react'
import { Link } from 'react-router'
import { useStores } from '@/api/hooks'
import { useAuth } from '@/auth/auth'
import { StoreLogo } from '@/components/common/badges'
import { EmptyState } from '@/components/common/misc'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Callout, ChoiceCard } from './choice-card'

export function StepStores({
  channel,
  selectedIds,
  onToggle,
  onSetAll,
}: {
  channel: Channel
  selectedIds: string[]
  onToggle: (id: string) => void
  onSetAll: (ids: string[]) => void
}) {
  const { data, isLoading } = useStores()
  const { can } = useAuth()
  const stores = (data ?? []).filter((s) => s.channel === channel)
  const unit = channel === 'ONLINE' ? 'แพลตฟอร์ม' : 'ห้าง'

  if (isLoading) {
    return (
      <div className="grid gap-3 @lg:grid-cols-2 @3xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[84px] rounded-xl" />
        ))}
      </div>
    )
  }

  if (stores.length === 0) {
    return (
      <EmptyState
        icon={<StoreIcon className="size-5" />}
        title={`ยังไม่มี${unit}ในช่องทางนี้`}
        description={can('store.manage') ? `เพิ่ม${unit}ในหน้าข้อมูลหลักก่อน แล้วกลับมาเลือกได้ทันที` : `ติดต่อ Admin ให้เพิ่ม${unit}ที่ต้องการในระบบ`}
        action={
          can('store.manage') ? (
            <Button asChild size="sm" variant="outline">
              <Link to="/admin/stores">ไปหน้าจัดการ{unit}</Link>
            </Button>
          ) : undefined
        }
      />
    )
  }

  const allSelected = stores.every((s) => selectedIds.includes(s.id))

  return (
    <div className="space-y-4">
      <Callout tone="info" icon={<LayersIcon />}>
        เลือกหลาย{unit}ได้ ระบบจะสร้างงานแยกให้{unit}ละ 1 โปรเจกต์
      </Callout>

      <div className="flex items-center justify-between gap-2" aria-live="polite">
        <p className="text-sm">
          เลือกแล้ว <span className="tabular font-semibold text-primary">{selectedIds.length}</span>
          <span className="text-muted-foreground"> จาก {stores.length} {unit}</span>
        </p>
        <Button type="button" variant="ghost" size="xs" className="text-muted-foreground" onClick={() => onSetAll(allSelected ? [] : stores.map((s) => s.id))}>
          {allSelected ? 'ล้างการเลือก' : `เลือกทุก${unit}`}
        </Button>
      </div>

      <div role="group" aria-label={`เลือก${unit}`} className="grid gap-3 @lg:grid-cols-2 @3xl:grid-cols-3">
        {stores.map((s) => {
          const selected = selectedIds.includes(s.id)
          return (
            <ChoiceCard key={s.id} mode="checkbox" selected={selected} onSelect={() => onToggle(s.id)} className="items-center p-3.5">
              <StoreLogo store={s} size="lg" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{s.name}</span>
                <span className="line-clamp-2 block text-xs text-muted-foreground">{s.description || (channel === 'ONLINE' ? 'แพลตฟอร์มออนไลน์' : 'ห้าง / ร้านค้า')}</span>
              </span>
            </ChoiceCard>
          )
        })}
      </div>
    </div>
  )
}
