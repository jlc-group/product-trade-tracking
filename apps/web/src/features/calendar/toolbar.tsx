import { ChevronLeftIcon, ChevronRightIcon, GlobeIcon, StoreIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { ChannelFilter, Layer } from './model'

export function CalendarToolbar({
  label,
  isCurrentMonth,
  onPrev,
  onNext,
  onToday,
  layers,
  onLayersChange,
  channel,
  onChannelChange,
  summary,
}: {
  label: string
  isCurrentMonth: boolean
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  layers: Layer[]
  onLayersChange: (layers: Layer[]) => void
  channel: ChannelFilter
  onChannelChange: (channel: ChannelFilter) => void
  summary: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border bg-card">
            <Button variant="ghost" size="icon" className="rounded-r-none" aria-label="เดือนก่อนหน้า" onClick={onPrev}>
              <ChevronLeftIcon />
            </Button>
            <Button variant="ghost" size="icon" className="rounded-l-none border-l" aria-label="เดือนถัดไป" onClick={onNext}>
              <ChevronRightIcon />
            </Button>
          </div>
          <h2 className="min-w-0 truncate text-xl font-semibold tracking-tight" aria-live="polite">
            {label}
          </h2>
          <Button variant="outline" size="sm" onClick={onToday} disabled={isCurrentMonth} className="ml-1 shrink-0">
            วันนี้
          </Button>
        </div>
        <div className="min-h-5 text-sm text-muted-foreground">{summary}</div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="multiple"
          variant="outline"
          size="sm"
          spacing={0}
          value={layers}
          // Keep at least one layer on — an empty calendar is never what the user wants here.
          onValueChange={(v: string[]) => v.length > 0 && onLayersChange(v as Layer[])}
          aria-label="ข้อมูลที่แสดงบนปฏิทิน"
          className="bg-card"
        >
          <ToggleGroupItem value="launches" className="gap-1.5 data-[state=off]:text-muted-foreground">
            <span className="h-2.5 w-3 rounded-[3px] border border-brand bg-brand group-data-[state=off]/toggle:bg-transparent" aria-hidden />
            วันวางขาย
          </ToggleGroupItem>
          <ToggleGroupItem value="tasks" className="gap-1.5 data-[state=off]:text-muted-foreground">
            <span className="size-2 rounded-full border border-primary bg-primary group-data-[state=off]/toggle:bg-transparent" aria-hidden />
            งานของฉัน
          </ToggleGroupItem>
        </ToggleGroup>

        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={0}
          value={channel}
          onValueChange={(v: string) => v && onChannelChange(v as ChannelFilter)}
          aria-label="ช่องทาง"
          className="bg-card"
        >
          <ToggleGroupItem value="ALL" className="px-3">
            ทั้งหมด
          </ToggleGroupItem>
          <ToggleGroupItem value="OFFLINE" className="gap-1.5">
            <StoreIcon aria-hidden /> Offline
          </ToggleGroupItem>
          <ToggleGroupItem value="ONLINE" className="gap-1.5">
            <GlobeIcon aria-hidden /> Online
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  )
}
