import { ArrowRightIcon, PackageCheckIcon } from 'lucide-react'
import type { ProposalDetail } from '@/api'
import { useCurrentUser } from '@/auth/auth'
import { Button } from '@/components/ui/button'
import { usePresentationSummary } from './hooks'
import { canRecordPresentation } from './permissions'

/** "พร้อมนำเสนอ" banner under the proposal header: every prep task is done and nothing has been presented yet. */
export function PresentationReadyBanner({ proposal, onCreate }: { proposal: ProposalDetail; onCreate: () => void }) {
  const me = useCurrentUser()
  const summary = usePresentationSummary(proposal)
  const canRecord = canRecordPresentation(me, proposal)
  if (summary.isLoading || !summary.gateOpen || summary.hasTracks || !canRecord || proposal.status === 'CANCELLED') return null

  const { done, total } = proposal.progress
  return (
    <div role="note" className="flex flex-col gap-3 rounded-xl border border-success/25 bg-success-soft px-4 py-3 text-sm text-success sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 gap-3">
        <PackageCheckIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="min-w-0 space-y-0.5">
          <p className="font-medium">
            งานเตรียมข้อมูลครบ <span className="tabular">{done}/{total}</span> แล้ว — พร้อมนำเสนอ <span className="tabular">{summary.storesTotal}</span> {summary.storeWord}
          </p>
          <p className="text-xs opacity-90">① สร้างชุดนำเสนอ → ② บันทึกว่านำเสนอแล้ว → ③ บันทึกผลพิจารณา</p>
        </div>
      </div>
      <Button className="w-full sm:w-auto" onClick={onCreate}>
        สร้างชุดนำเสนอ
        <ArrowRightIcon />
      </Button>
    </div>
  )
}
