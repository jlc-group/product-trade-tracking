import { BadgeCheckIcon, CheckCircle2Icon, FactoryIcon, Loader2Icon, PackageCheckIcon, PackageXIcon, TriangleAlertIcon, TruckIcon, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TONE_SOFT } from '@/features/presentation/model'
import { cn } from '@/lib/utils'
import type { NextCard as NextCardData, NextCardButton, ProductionTabAction } from './types'

const KIND_ICON: Record<NextCardData['kind'], LucideIcon> = {
  pending: FactoryIcon,
  review: TriangleAlertIcon,
  active: FactoryIcon,
  done: BadgeCheckIcon,
  cancelled: PackageXIcon,
}

const BUTTON_ICON: Record<NextCardButton['icon'], LucideIcon> = {
  confirm: CheckCircle2Icon,
  produced: PackageCheckIcon,
  delivered: TruckIcon,
}

/**
 * "ขั้นต่อไป" of the production tab (same markup as the presentation NextActionCard): one button, or a calm note. `busy`
 * holds the button (spinner, disabled) while what its dialog needs is still loading.
 */
export function NextCard({ card, onAction, busy }: { card: NextCardData; onAction: (a: ProductionTabAction) => void; busy?: boolean }) {
  const Icon = KIND_ICON[card.kind]
  const ButtonIcon = card.primary ? BUTTON_ICON[card.primary.icon] : null
  return (
    <section aria-label="ขั้นต่อไป" className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full [&_svg]:size-5', TONE_SOFT[card.tone])}>
          <Icon aria-hidden />
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-xs font-medium text-muted-foreground">ขั้นต่อไป</p>
          <h2 className="text-base font-semibold break-words">{card.title}</h2>
          {card.reason && <p className="text-sm break-words text-muted-foreground">{card.reason}</p>}
        </div>
        {(card.primary || card.note) && (
          <div className="flex flex-col gap-2 sm:ml-auto sm:shrink-0 sm:flex-row sm:items-center">
            {card.primary && ButtonIcon ? (
              <Button className="w-full sm:w-auto" disabled={busy} aria-busy={busy || undefined} onClick={() => onAction(card.primary!.action)}>
                {busy ? <Loader2Icon className="animate-spin" /> : <ButtonIcon />}
                {card.primary.label}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground sm:max-w-60 sm:text-right">{card.note}</p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
