import { ArrowRightIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Home panel chrome: bordered card with a titled header row. `id` makes it a jump target. */
export function Panel({
  id,
  title,
  icon,
  action,
  children,
  className,
}: {
  id?: string
  title: ReactNode
  icon?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  const headingId = useId()
  return (
    <section id={id} aria-labelledby={headingId} className={cn('flex min-w-0 scroll-mt-20 flex-col rounded-xl border bg-card', className)}>
      <header className="flex min-h-12 items-center gap-2 border-b px-4 py-2.5">
        {icon && <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>}
        <h2 id={headingId} className="min-w-0 truncate text-sm font-semibold">
          {title}
        </h2>
        {action && <div className="ml-auto shrink-0">{action}</div>}
      </header>
      {children}
    </section>
  )
}

export function PanelLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Button asChild variant="ghost" size="sm" className="-mr-2 h-7 gap-1 text-xs text-muted-foreground hover:text-foreground">
      <Link to={to}>
        {children}
        <ArrowRightIcon />
      </Link>
    </Button>
  )
}

/** Full-width "แสดงอีก …" / "แสดงน้อยลง" toggle under a list. */
export function MoreToggle({ expanded, label, onToggle, className }: { expanded: boolean; label: string; onToggle: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className={cn(
        'flex w-full items-center gap-1 px-4 py-2 text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset',
        className,
      )}
    >
      {expanded ? 'แสดงน้อยลง' : label}
      {expanded ? <ChevronUpIcon className="size-3.5" aria-hidden /> : <ChevronDownIcon className="size-3.5" aria-hidden />}
    </button>
  )
}
