import { FactoryIcon } from 'lucide-react'
import { Link } from 'react-router'
import type { ProposalDetail } from '@/api'
import { TONE_TEXT } from '@/features/presentation/model'
import { cn } from '@/lib/utils'
import { useProductionSummary } from './hooks'
import { productionHeaderLine } from './model'

/** "ผลิต: …" in the header's ProgressSummary, under the presentation line. Links to ?tab=production. */
export function ProductionHeaderLine({ proposal }: { proposal: ProposalDetail }) {
  const { isLoading, summary } = useProductionSummary(proposal.id)
  const line = summary && productionHeaderLine(summary)
  if (isLoading || !line) return null
  return (
    <Link
      to={{ search: '?tab=production' }}
      className="flex w-fit max-w-full flex-wrap items-center gap-x-1.5 gap-y-1 rounded-sm text-xs outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <FactoryIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="text-muted-foreground">ผลิต:</span>
      <span className={cn('font-medium', TONE_TEXT[line.tone])}>{line.text}</span>
    </Link>
  )
}

/** Tab pill (K27): SKUs waiting for confirmation; else "!" when a confirmed SKU needs review; else a dot when overdue. */
export function ProductionTabCount({ proposal }: { proposal: ProposalDetail }) {
  const { isLoading, summary } = useProductionSummary(proposal.id)
  if (isLoading || !summary || proposal.status === 'CANCELLED') return null
  const pill = 'tabular rounded-full px-1.5 text-[11px] leading-4 bg-warning-soft font-semibold text-warning-foreground'
  if (summary.pending > 0)
    return (
      <span className={pill}>
        <span aria-hidden>{summary.pending}</span>
        <span className="sr-only">รอยืนยันเริ่มผลิต {summary.pending} SKU</span>
      </span>
    )
  if (summary.flagged > 0)
    return (
      <span className={pill}>
        <span aria-hidden>!</span>
        <span className="sr-only">ต้องตรวจสอบ {summary.flagged} SKU</span>
      </span>
    )
  if (summary.overdueDays > 0)
    return (
      <span className="inline-flex items-center">
        <span className="size-2 rounded-full bg-danger" aria-hidden />
        <span className="sr-only">เลยกำหนดผลิต {summary.overdueDays} วัน</span>
      </span>
    )
  return null
}
