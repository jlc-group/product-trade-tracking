import { CHANNEL_LABEL, prepStartOf, templateLeadDays, type ShelfType, type Store, type TaskTemplate } from '@flowtrade/shared'
import { CalendarDaysIcon, GlobeIcon, LayersIcon, ListTreeIcon, PackageIcon, StoreIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { ShelfTypeBadge, StoreLogo } from '@/components/common/badges'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate, relativeDay } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { StepInfo, TemplateChoice, WizardState } from './wizard-state'

export function WizardSummary({
  state,
  steps,
  stores,
  shelfType,
  template,
  templateLoading,
  isReachable,
  onJump,
  className,
}: {
  state: WizardState
  steps: StepInfo[]
  stores: Store[]
  shelfType: ShelfType | null
  template: TaskTemplate | null
  templateLoading: boolean
  isReachable: (step: number) => boolean
  onJump: (step: number) => void
  className?: string
}) {
  const ChannelIcon = state.channel === 'ONLINE' ? GlobeIcon : StoreIcon
  const unit = state.channel === 'ONLINE' ? 'แพลตฟอร์ม' : 'ห้าง'

  return (
    <div className={cn('space-y-1', className)}>
      <Row step={0} label={steps[0].label} icon={<ChannelIcon />} state={state} isReachable={isReachable} onJump={onJump} filled={!!state.channel}>
        {state.channel && CHANNEL_LABEL[state.channel]}
      </Row>

      <Row step={1} label={steps[1].label} icon={<PackageIcon />} state={state} isReachable={isReachable} onJump={onJump} filled={state.products.length > 0}>
        {state.products.length > 0 && (
          <span className="block space-y-0.5">
            {state.products.slice(0, 3).map((p) => (
              <span key={p.id} className="block truncate">
                {p.name}
              </span>
            ))}
            {state.products.length > 3 && <span className="tabular block text-muted-foreground">และอีก {state.products.length - 3} รายการ</span>}
          </span>
        )}
      </Row>

      <Row step={2} label={steps[2].label} icon={<StoreIcon />} state={state} isReachable={isReachable} onJump={onJump} filled={stores.length > 0}>
        {stores.length > 0 && (
          <span className="block space-y-1">
            {stores.map((s) => (
              <span key={s.id} className="flex min-w-0 items-center gap-2">
                <StoreLogo store={s} size="sm" />
                <span className="truncate">{s.name}</span>
              </span>
            ))}
          </span>
        )}
      </Row>

      <Row step={3} label={steps[3].label} icon={<LayersIcon />} state={state} isReachable={isReachable} onJump={onJump} filled={!!shelfType}>
        {shelfType && <ShelfTypeBadge shelfType={shelfType} />}
      </Row>

      <Row step={4} label={steps[4].label} icon={<CalendarDaysIcon />} state={state} isReachable={isReachable} onJump={onJump} filled={!!state.targetDate}>
        {state.targetDate && (
          <span className="block">
            {formatDate(state.targetDate, { long: true })}
            <span className="tabular block text-xs text-muted-foreground">{relativeDay(state.targetDate)}</span>
            <span className="tabular block text-xs text-muted-foreground">เริ่มเตรียม {formatDate(prepStartOf(state.targetDate))}</span>
          </span>
        )}
      </Row>

      <Row step={5} label="แม่แบบ Task" icon={<ListTreeIcon />} state={state} isReachable={isReachable} onJump={onJump} filled={!!state.channel}>
        {state.channel && <TemplateLine choice={state.template} template={template} loading={templateLoading} />}
      </Row>

      {stores.length > 0 && (
        <div className="mt-3 rounded-lg bg-brand-soft px-3 py-2.5 text-sm text-brand">
          จะสร้าง <span className="tabular font-semibold">{stores.length}</span> โปรเจกต์
          <span className="text-brand/80"> · {unit}ละ 1 โปรเจกต์</span>
        </div>
      )}
    </div>
  )
}

function TemplateLine({ choice, template, loading }: { choice: TemplateChoice; template: TaskTemplate | null; loading: boolean }) {
  if (choice.kind === 'none') return <>ไม่ใช้แม่แบบ</>
  if (loading) return <Skeleton className="h-4 w-32" />
  if (!template) return <span className="text-muted-foreground">ยังไม่มีแม่แบบที่ตรงกัน</span>
  return (
    <span className="block">
      <span className="line-clamp-2">{template.name}</span>
      <span className="tabular block text-xs text-muted-foreground">
        {choice.kind === 'auto' ? 'แนะนำอัตโนมัติ · ' : ''}ใช้เวลาประมาณ {templateLeadDays(template.items)} วัน
      </span>
    </span>
  )
}

function Row({
  step,
  label,
  icon,
  filled,
  state,
  isReachable,
  onJump,
  children,
}: {
  step: number
  label: string
  icon: ReactNode
  filled: boolean
  state: WizardState
  isReachable: (step: number) => boolean
  onJump: (step: number) => void
  children: ReactNode
}) {
  const active = state.step === step
  const reachable = isReachable(step) && !active
  const body = (
    <>
      <span className={cn('mt-0.5 shrink-0 [&_svg]:size-4', active ? 'text-primary' : 'text-muted-foreground')}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={cn('block text-xs', active ? 'font-medium text-primary' : 'text-muted-foreground')}>{label}</span>
        <span className={cn('mt-0.5 block text-sm', !filled && 'text-muted-foreground/70')}>{filled ? children : 'ยังไม่ได้เลือก'}</span>
      </span>
    </>
  )
  const base = cn('flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left', active && 'bg-accent/60')
  if (!reachable) return <div className={base}>{body}</div>
  return (
    <button type="button" onClick={() => onJump(step)} className={cn(base, 'transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50')} title={`แก้ไข${label}`}>
      {body}
    </button>
  )
}
