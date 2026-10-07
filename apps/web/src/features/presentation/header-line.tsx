import { ArrowRightIcon, PresentationIcon } from 'lucide-react'
import { Link } from 'react-router'
import type { ProposalDetail } from '@/api'
import { cn } from '@/lib/utils'
import { usePresentationSummary } from './hooks'
import { TONE_TEXT } from './model'
import { StageBar } from './stage-badge'

/** One line in the header's ProgressSummary: what the presentation track needs next. Links to ?tab=present. */
export function PresentationHeaderLine({ proposal }: { proposal: ProposalDetail }) {
  const summary = usePresentationSummary(proposal)
  const line = summary.header
  // Hidden while loading so "ขั้นต่อไป" doesn't flash before the stored tracks arrive.
  if (summary.isLoading || !line) return null

  return (
    <Link
      to={{ search: '?tab=present' }}
      className="flex w-fit max-w-full flex-wrap items-center gap-x-1.5 gap-y-1 rounded-sm text-xs outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {line.kind === 'next' ? (
        <span className="flex items-center gap-1 font-medium text-brand">
          <PresentationIcon className="size-3.5 shrink-0" aria-hidden />
          {line.text}
          <ArrowRightIcon className="size-3.5 shrink-0" aria-hidden />
        </span>
      ) : (
        <>
          <span className="text-muted-foreground">{line.prefix}</span>
          <span className={cn('font-medium', TONE_TEXT[line.tone])}>{line.text}</span>
          {line.showBar && summary.items.length > 0 && <StageBar items={summary.items} variant="mini" word={summary.storeWord} />}
        </>
      )}
    </Link>
  )
}
