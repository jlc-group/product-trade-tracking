import type { Health } from '@/api'
import { TONE_SOFT } from '@/features/presentation/model'
import { cn } from '@/lib/utils'

/** "ล่าช้า" / "เสี่ยง" chip of proposalHealth(); the reason is its tooltip, so print it next to the chip too. */
export function HealthChip({ health, className }: { health: Pick<Health, 'level' | 'reason'>; className?: string }) {
  const late = health.level === 'LATE'
  return (
    <span
      title={health.reason}
      className={cn('inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-medium whitespace-nowrap', late ? TONE_SOFT.danger : TONE_SOFT.warning, className)}
    >
      {late ? 'ล่าช้า' : 'เสี่ยง'}
    </span>
  )
}
