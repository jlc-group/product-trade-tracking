import type { TeamPulse } from '@/api'
import { ArrowRightIcon, GaugeIcon } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from '@/lib/utils'

const numberLink = 'rounded whitespace-nowrap outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60'

/** "ภาพรวมฝ่าย" (dashboard.monitor): department alarms in one line, each number a link to the same list in Monitor. */
export function TeamStrip({ team }: { team: TeamPulse }) {
  const parts: { key: string; to: string; label: string; tone?: string; body: ReactNode }[] = []
  if (team.late > 0)
    parts.push({ key: 'late', to: '/admin#at-risk', label: `ล่าช้า ${team.late} โปรเจกต์`, tone: 'text-danger', body: <>ล่าช้า <span className="tabular font-semibold">{team.late}</span></> })
  if (team.atRisk > 0)
    parts.push({ key: 'risk', to: '/admin#at-risk', label: `เสี่ยง ${team.atRisk} โปรเจกต์`, tone: 'text-warning-foreground', body: <>เสี่ยง <span className="tabular font-semibold">{team.atRisk}</span></> })
  if (team.buyerOverdue > 0)
    parts.push({
      key: 'buyer',
      to: '/admin#buyer',
      label: `ติดตาม Buyer เลยกำหนด ${team.buyerOverdue} เรื่อง`,
      body: (
        <>
          <span className="hidden sm:inline">ติดตาม </span>Buyer เลยกำหนด <span className="tabular font-semibold">{team.buyerOverdue}</span>
          <span className="hidden sm:inline"> เรื่อง</span>
        </>
      ),
    })
  if (team.overdueTasks > 0)
    parts.push({
      key: 'tasks',
      to: '/admin#overdue',
      label: `งานเลยกำหนด ${team.overdueTasks} งาน`,
      body: (
        <>
          งานเลยกำหนด <span className="tabular font-semibold">{team.overdueTasks}</span>
          <span className="hidden sm:inline"> งาน</span>
        </>
      ),
    })

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border bg-muted/40 px-4 py-2 text-sm">
      <span className="inline-flex shrink-0 items-center gap-1.5 font-medium">
        <GaugeIcon className="size-4 text-muted-foreground" aria-hidden />
        ภาพรวมฝ่าย{parts.length === 0 && ':'}
      </span>
      <span className="order-3 min-w-0 basis-full sm:order-none sm:flex-1 sm:basis-auto">
        {parts.length === 0 ? (
          <span className="text-muted-foreground">ไม่มีเรื่องเร่งด่วน</span>
        ) : (
          parts.map((p, i) => (
            <Fragment key={p.key}>
              {i > 0 && (
                <span className="text-muted-foreground" aria-hidden>
                  {' · '}
                </span>
              )}
              <Link to={p.to} aria-label={`${p.label} — ดูใน Monitor`} className={cn(numberLink, p.tone)}>
                {p.body}
              </Link>
            </Fragment>
          ))
        )}
      </span>
      <Link to="/admin" className={cn(numberLink, 'ml-auto inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground')}>
        Monitor<span className="hidden sm:inline"> ภาพรวม</span>
        <ArrowRightIcon className="size-3.5" aria-hidden />
      </Link>
    </div>
  )
}
