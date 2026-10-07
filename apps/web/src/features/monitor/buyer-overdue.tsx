import type { ISODate } from '@flowtrade/shared'
import { PresentationIcon, ShieldCheckIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { BuyerAgendaItem } from '@/api/types'
import { EmptyState } from '@/components/common/misc'
import { BuyerAgendaRow } from '@/features/home/agenda-rows'
import { useUsersById } from '@/features/home/users'
import { cn } from '@/lib/utils'
import { MonitorSection, ShowMoreButton } from './parts'
import { fmt } from './utils'

const LIMIT = 6

/** Org-wide overdue buyer rows (merged, role-agnostic). Read-only: the project team records them on the proposal. */
export function BuyerOverdue({ items, today, className }: { items: BuyerAgendaItem[]; today: ISODate; className?: string }) {
  const users = useUsersById()
  const [expanded, setExpanded] = useState(false)
  const sorted = useMemo(
    () => [...items].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.proposal.code.localeCompare(b.proposal.code)),
    [items],
  )
  const shown = expanded ? sorted : sorted.slice(0, LIMIT)
  const proposalCount = new Set(items.map((x) => x.proposal.id)).size

  return (
    <MonitorSection
      id="buyer"
      className={className}
      icon={<PresentationIcon className={cn(items.length > 0 && 'text-danger')} />}
      title={
        <>
          ติดตาม Buyer เลยกำหนด (ทั้งฝ่าย)
          {items.length > 0 && <span className="tabular rounded-full bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger">{fmt(items.length)}</span>}
        </>
      }
      description={
        items.length > 0
          ? `${fmt(items.length)} เรื่อง จาก ${fmt(proposalCount)} โปรเจกต์ เรียงจากที่เลยกำหนดนานที่สุด — ทีมโปรเจกต์บันทึกได้ที่แท็บนำเสนอ Buyer`
          : 'นัดนำเสนอที่เลยวันแล้วยังไม่บันทึก การรอผลที่เลยวันที่คาด และการส่งข้อมูลเพิ่มที่เลยกำหนด'
      }
    >
      {items.length === 0 ? (
        <EmptyState
          icon={<ShieldCheckIcon className="size-5 text-success" />}
          title="ไม่มีเรื่อง Buyer เลยกำหนด"
          description="นัดนำเสนอ การรอผล และการส่งข้อมูลเพิ่มของทุกโปรเจกต์ยังอยู่ในกำหนด"
          className="py-10"
        />
      ) : (
        <>
          <ul className="-mx-3 divide-y sm:-mx-4">
            {shown.map((item) => (
              <BuyerAgendaRow key={item.key} item={item} today={today} users={users} readOnly />
            ))}
          </ul>
          <ShowMoreButton expanded={expanded} hiddenCount={sorted.length - shown.length} total={sorted.length} onToggle={() => setExpanded((v) => !v)} noun="เรื่อง" />
        </>
      )}
    </MonitorSection>
  )
}
