import type { Channel } from '@flowtrade/shared'
import { GlobeIcon, StoreIcon } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

export const CHANNELS: Channel[] = ['OFFLINE', 'ONLINE']

/** Active channel tab, kept in `?channel=online` so it survives reloads and links. */
export function useChannelParam(): [Channel, (channel: Channel) => void] {
  const [params, setParams] = useSearchParams()
  const channel: Channel = params.get('channel') === 'online' ? 'ONLINE' : 'OFFLINE'
  const setChannel = (next: Channel) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (next === 'ONLINE') p.set('channel', 'online')
        else p.delete('channel')
        return p
      },
      { replace: true },
    )
  return [channel, setChannel]
}

export function isChannel(value: string): value is Channel {
  return value === 'OFFLINE' || value === 'ONLINE'
}

/** Tab triggers "Offline (ห้าง) 6 | Online (แพลตฟอร์ม) 4" — place inside <Tabs>. */
export function ChannelTabsList({
  labels,
  shortLabels,
  counts,
  className,
}: {
  labels: Record<Channel, string>
  /** Used below the sm breakpoint so both tabs fit on a phone. */
  shortLabels?: Record<Channel, string>
  counts: Partial<Record<Channel, number>>
  className?: string
}) {
  return (
    <TabsList className={cn('h-9! w-full sm:w-fit', className)}>
      {CHANNELS.map((c) => {
        const Icon = c === 'OFFLINE' ? StoreIcon : GlobeIcon
        return (
          <TabsTrigger key={c} value={c} className="group/tab gap-1.5 px-3">
            <Icon />
            {shortLabels ? (
              <>
                <span className="sm:hidden">{shortLabels[c]}</span>
                <span className="hidden sm:inline">{labels[c]}</span>
              </>
            ) : (
              <span>{labels[c]}</span>
            )}
            <span className="tabular min-w-5 rounded-full bg-muted px-1.5 text-[11px] leading-5 font-semibold text-muted-foreground group-data-active/tab:bg-brand-soft group-data-active/tab:text-brand">
              {counts[c] ?? '–'}
            </span>
          </TabsTrigger>
        )
      })}
    </TabsList>
  )
}
