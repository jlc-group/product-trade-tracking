import { CheckIcon } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import type { StepInfo } from './wizard-state'

export function WizardStepper({
  steps,
  current,
  isComplete,
  isReachable,
  onJump,
}: {
  steps: StepInfo[]
  current: number
  isComplete: (step: number) => boolean
  isReachable: (step: number) => boolean
  onJump: (step: number) => void
}) {
  return (
    <nav aria-label="ขั้นตอนการเสนอสินค้า">
      {/* Compact (phone / tablet) */}
      <div className="space-y-2 lg:hidden">
        <div className="flex items-baseline justify-between gap-3">
          <p className="tabular text-xs font-medium text-muted-foreground">
            ขั้นที่ {current + 1} จาก {steps.length}
          </p>
          <p className="truncate text-sm font-semibold">{steps[current].label}</p>
        </div>
        <Progress value={((current + 1) / steps.length) * 100} aria-label={`ขั้นที่ ${current + 1} จาก ${steps.length}`} className="h-1.5" />
      </div>

      {/* Full (desktop) */}
      <ol className="hidden items-start lg:flex">
        {steps.map((s, i) => {
          const complete = isComplete(i)
          const active = i === current
          const reachable = isReachable(i)
          return (
            <li key={i} className="relative flex flex-1 flex-col items-center">
              {/* connector to the previous step */}
              {i > 0 && (
                <span aria-hidden className={cn('absolute top-4 right-1/2 left-[-50%] h-0.5 -translate-y-1/2', i <= current || complete ? 'bg-primary/60' : 'bg-border')} />
              )}
              <button
                type="button"
                onClick={() => onJump(i)}
                disabled={!reachable || active}
                aria-current={active ? 'step' : undefined}
                className="group relative z-10 flex flex-col items-center gap-1.5 rounded-lg px-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default"
              >
                <span
                  className={cn(
                    'tabular flex size-8 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors',
                    active
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm ring-4 ring-primary/15'
                      : complete
                        ? 'border-primary bg-card text-primary group-enabled:group-hover:bg-brand-soft'
                        : reachable
                          ? 'border-border bg-card text-foreground group-enabled:group-hover:border-primary/50'
                          : 'border-border bg-muted text-muted-foreground',
                  )}
                >
                  {complete && !active ? <CheckIcon className="size-4" strokeWidth={3} /> : i + 1}
                </span>
                <span
                  className={cn(
                    'line-clamp-2 max-w-[9rem] text-center text-xs leading-tight',
                    active ? 'font-semibold text-foreground' : complete ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {s.label}
                </span>
                <span className="sr-only">{complete ? '(เสร็จแล้ว)' : active ? '(ขั้นปัจจุบัน)' : ''}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
