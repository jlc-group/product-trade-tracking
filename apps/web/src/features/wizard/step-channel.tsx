import type { Channel, Store } from '@flowtrade/shared'
import { GlobeIcon, StoreIcon } from 'lucide-react'
import { useShelfTypes, useStores } from '@/api/hooks'
import { StoreLogo } from '@/components/common/badges'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { ChoiceCard } from './choice-card'

const OPTIONS: { channel: Channel; title: string; description: string; examples: string; icon: typeof StoreIcon }[] = [
  {
    channel: 'OFFLINE',
    title: 'ออฟไลน์ (เข้าห้าง)',
    description: 'นำสินค้าเข้าวางบน Shelf ของห้างและร้านค้า',
    examples: 'Big C, Watsons, 7-Eleven, Lotus’s, CJ …',
    icon: StoreIcon,
  },
  {
    channel: 'ONLINE',
    title: 'ออนไลน์ (Marketplace)',
    description: 'ลงขายสินค้าบนแพลตฟอร์มออนไลน์',
    examples: 'Shopee, Lazada, TikTok Shop …',
    icon: GlobeIcon,
  },
]

export function StepChannel({ value, onChange }: { value: Channel | null; onChange: (channel: Channel) => void }) {
  const { data: stores, isLoading } = useStores()
  const { data: shelfTypes = [] } = useShelfTypes()

  return (
    <div role="radiogroup" aria-label="ช่องทาง" className="grid gap-4 @xl:grid-cols-2">
      {OPTIONS.map((o) => {
        const selected = value === o.channel
        const channelStores = (stores ?? []).filter((s) => s.channel === o.channel)
        const shelfCount = shelfTypes.filter((s) => s.channel === o.channel).length
        return (
          <ChoiceCard key={o.channel} mode="radio" selected={selected} onSelect={() => onChange(o.channel)} hideMarker className="flex-col gap-4 p-5 sm:p-6">
            <div className="flex w-full items-start justify-between gap-3">
              <span
                className={cn(
                  'flex size-12 items-center justify-center rounded-2xl transition-colors',
                  selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground group-hover/choice:text-primary',
                )}
              >
                <o.icon className="size-6" />
              </span>
              <ChannelMarker selected={selected} />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-semibold">{o.title}</p>
              <p className="text-sm text-muted-foreground">{o.description}</p>
            </div>
            <div className="w-full space-y-2 border-t pt-4">
              {isLoading ? (
                <div className="flex gap-1.5">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-6 w-9 rounded-md" />
                  ))}
                </div>
              ) : channelStores.length > 0 ? (
                <StoreLogoRow stores={channelStores} />
              ) : (
                <p className="text-xs text-muted-foreground">{o.examples}</p>
              )}
              {channelStores.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {channelStores
                    .slice(0, 4)
                    .map((s) => s.name)
                    .join(', ')}
                  {channelStores.length > 4 ? ' …' : ''}
                  <span className="tabular">
                    {' '}
                    · {channelStores.length} {o.channel === 'ONLINE' ? 'แพลตฟอร์ม' : 'ห้าง'} · {shelfCount} ประเภท
                  </span>
                </p>
              )}
            </div>
          </ChoiceCard>
        )
      })}
    </div>
  )
}

function ChannelMarker({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-5 items-center justify-center rounded-full border-2 transition-colors',
        selected ? 'border-primary bg-primary' : 'border-input bg-background group-hover/choice:border-primary/50',
      )}
    >
      {selected && <span className="size-2 rounded-full bg-primary-foreground" />}
    </span>
  )
}

function StoreLogoRow({ stores }: { stores: Store[] }) {
  const shown = stores.slice(0, 6)
  const rest = stores.length - shown.length
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {shown.map((s) => (
        <StoreLogo key={s.id} store={s} size="sm" />
      ))}
      {rest > 0 && <span className="tabular text-xs text-muted-foreground">+{rest}</span>}
    </div>
  )
}
