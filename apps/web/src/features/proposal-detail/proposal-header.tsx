import { AlertTriangleIcon, CheckCircle2Icon, StickyNoteIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ProposalDetail } from '@/api'
import { ChannelBadge, ShelfTypeBadge, StatusBadge, StoreLogos } from '@/components/common/badges'
import { LaunchCountdown, PageHeader, ProgressRing } from '@/components/common/misc'
import { AvatarStack, UserAvatar } from '@/components/common/user-avatar'
import { displayName, formatDate, relativeDay, today } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PrepStartText } from './launch-summary'
import { ProposalActions } from './proposal-actions'
import { launchWord } from './utils'

function Fact({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0 space-y-1.5', className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  )
}

function ProgressSummary({ proposal, className }: { proposal: ProposalDetail; className?: string }) {
  const { done, total, percent } = proposal.progress
  return (
    <div className={cn('flex items-center gap-4 rounded-lg bg-muted/40 p-3 md:rounded-none md:border-l md:bg-transparent md:p-0 md:pl-8', className)}>
      <div className="relative w-fit">
        <ProgressRing progress={proposal.progress} size={76} stroke={7} showLabel={false} />
        <span className="tabular absolute inset-0 flex items-center justify-center text-base font-semibold" aria-hidden>
          {percent}%
        </span>
      </div>
      <div className="space-y-1">
        <p className="text-sm">
          <span className="tabular text-xl font-semibold">
            {done}/{total}
          </span>{' '}
          <span className="text-muted-foreground">งานเสร็จ</span>
        </p>
        {total === 0 ? (
          <p className="text-xs text-muted-foreground">ยังไม่มีงานในโปรเจกต์นี้</p>
        ) : proposal.overdueCount > 0 ? (
          <p className="flex items-center gap-1 text-xs font-medium text-danger">
            <AlertTriangleIcon className="size-3.5" aria-hidden />
            เลยกำหนด <span className="tabular">{proposal.overdueCount}</span> งาน
          </p>
        ) : done === total ? (
          <p className="flex items-center gap-1 text-xs font-medium text-success">
            <CheckCircle2Icon className="size-3.5" aria-hidden />
            ครบทุกงานแล้ว
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">ไม่มีงานเลยกำหนด</p>
        )}
      </div>
    </div>
  )
}

export function ProposalHeader({ proposal }: { proposal: ProposalDetail }) {
  const word = launchWord(proposal.channel)
  const team = proposal.members
  const nextDue = proposal.nextDueDate
  const nextDueOverdue = !!nextDue && nextDue < today()

  return (
    <section className="rounded-xl border bg-card" aria-label="ข้อมูลการเสนอสินค้า">
      <div className="flex items-start gap-3 p-4 sm:gap-4 sm:p-5">
        <StoreLogos stores={proposal.stores} size="lg" className="sm:hidden" />
        <StoreLogos stores={proposal.stores} size="xl" className="hidden sm:inline-flex" />
        <PageHeader
          className="min-w-0 flex-1 items-start"
          eyebrow={
            <span className="tabular">
              {proposal.code} · {proposal.stores.map((s) => s.name).join(', ')}
            </span>
          }
          title={<span className="break-words">{proposal.title}</span>}
          description={
            <span className="flex flex-wrap items-center gap-1.5 pt-1">
              <ChannelBadge channel={proposal.channel} />
              <ShelfTypeBadge shelfType={proposal.shelfType} />
              <StatusBadge status={proposal.status} />
            </span>
          }
          actions={<ProposalActions proposal={proposal} />}
        />
      </div>

      <div className="grid gap-5 border-t p-4 sm:p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-8">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
          <Fact label={word}>
            <span className="block font-medium">{formatDate(proposal.targetDate, { long: true })}</span>
            <LaunchCountdown targetDate={proposal.targetDate} />
            <PrepStartText targetDate={proposal.targetDate} today={today()} className="mt-0.5" />
          </Fact>
          <Fact label="เจ้าของ">
            <span className="flex min-w-0 items-center gap-2">
              <UserAvatar user={proposal.owner} size="sm" />
              <span className="truncate">{displayName(proposal.owner)}</span>
            </span>
          </Fact>
          <Fact label={team.length ? `ทีมงาน (${team.length})` : 'ทีมงาน'}>
            {team.length ? (
              <span className="flex min-w-0 items-center gap-2">
                <AvatarStack users={team} max={5} />
                {team.length === 1 && <span className="truncate">{team[0].name}</span>}
              </span>
            ) : (
              <span className="text-muted-foreground">ยังไม่มีทีมงาน</span>
            )}
          </Fact>
          <Fact label="ครบกำหนดถัดไป">
            {nextDue ? (
              <>
                <span className="tabular block font-medium">{formatDate(nextDue)}</span>
                <span className={cn('text-xs', nextDueOverdue ? 'font-medium text-danger' : 'text-muted-foreground')}>{relativeDay(nextDue)}</span>
              </>
            ) : (
              <span className="text-muted-foreground">ไม่มีงานค้าง</span>
            )}
          </Fact>
          <Fact label={`สินค้า (${proposal.products.length})`} className="col-span-2 lg:col-span-4">
            <ul className="flex flex-wrap gap-1.5">
              {proposal.products.map((p) => (
                <li
                  key={p.id}
                  title={[p.brand, p.name, p.size].filter(Boolean).join(' · ')}
                  className={cn('inline-flex max-w-full items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 text-xs', !p.isActive && 'opacity-60')}
                >
                  <span className="tabular shrink-0 font-medium text-muted-foreground">{p.sku}</span>
                  <span className="truncate">{p.name}</span>
                </li>
              ))}
            </ul>
          </Fact>
        </dl>
        <ProgressSummary proposal={proposal} className="order-first md:order-last" />
      </div>

      {proposal.note && (
        <div className="flex gap-2 border-t px-4 py-3 text-sm text-muted-foreground sm:px-5">
          <StickyNoteIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="min-w-0 break-words whitespace-pre-line">
            <span className="sr-only">หมายเหตุ: </span>
            {proposal.note}
          </p>
        </div>
      )}
    </section>
  )
}
