import {
  BadgeCheckIcon,
  CalendarClockIcon,
  CircleSlashIcon,
  CircleXIcon,
  MessageCircleQuestionMarkIcon,
  PackageIcon,
  PencilIcon,
  PresentationIcon,
  RotateCcwIcon,
  SendIcon,
  Undo2Icon,
  type LucideIcon,
} from 'lucide-react'
import { useId } from 'react'
import { UserAvatar } from '@/components/common/user-avatar'
import { Button } from '@/components/ui/button'
import { dayjs, formatDate, formatDateTime, fromNow } from '@/lib/format'
import { cn } from '@/lib/utils'
import { eventQuote, eventTitle, isEditableKind } from './model'
import { canChangeEvent } from './permissions'
import type { EventKind, PresentationModel, TimelineItem, TrackEvent, TrackView } from './types'

const EVENT_STYLE: Record<EventKind, { icon: LucideIcon; tone: string }> = {
  CREATED: { icon: PackageIcon, tone: 'bg-brand-soft text-brand' },
  SCHEDULED: { icon: CalendarClockIcon, tone: 'bg-muted text-muted-foreground' },
  PRESENTED: { icon: PresentationIcon, tone: 'bg-info-soft text-info' },
  NEEDS_INFO: { icon: MessageCircleQuestionMarkIcon, tone: 'bg-warning-soft text-warning-foreground' },
  INFO_SENT: { icon: SendIcon, tone: 'bg-info-soft text-info' },
  PASSED: { icon: BadgeCheckIcon, tone: 'bg-success-soft text-success' },
  REJECTED: { icon: CircleXIcon, tone: 'bg-danger-soft text-danger' },
  WITHDRAWN: { icon: CircleSlashIcon, tone: 'bg-muted text-muted-foreground' },
  REPITCH: { icon: RotateCcwIcon, tone: 'bg-brand-soft text-brand' },
  REVERTED: { icon: Undo2Icon, tone: 'bg-muted text-muted-foreground' },
  EDITED: { icon: PencilIcon, tone: 'bg-muted text-muted-foreground' },
}

/** Rounds newest first; events inside a round newest first. */
function groupByRound(items: TimelineItem[]) {
  const groups: { round: number; items: TimelineItem[] }[] = []
  for (const item of items) {
    const group = groups.find((g) => g.round === item.round)
    if (group) group.items.push(item)
    else groups.push({ round: item.round, items: [item] })
  }
  return groups.sort((a, b) => b.round - a.round).map((g) => ({ round: g.round, items: [...g.items].reverse() }))
}

/** Small facts under an entry that its title doesn't carry. */
function eventMeta(e: TrackEvent, model: PresentationModel) {
  const people = (ids: string[]) => (ids.length ? `ผู้นำเสนอ: ${ids.map((id) => model.userName(id)).join(', ')}` : null)
  const parts: (string | null)[] = []
  switch (e.kind) {
    case 'CREATED':
      parts.push(e.meetingDate ? `นัด ${formatDate(e.meetingDate)}` : null, people(e.presenterIds))
      break
    case 'SCHEDULED':
      parts.push(people(e.presenterIds), e.contactName ? `Buyer / ผู้ติดต่อ: ${e.contactName}` : null)
      break
    case 'PRESENTED':
    case 'INFO_SENT':
      parts.push(e.expectedResultDate ? `คาดว่าจะทราบผล ${formatDate(e.expectedResultDate)}` : null)
      break
    case 'REPITCH':
      parts.push(`${e.tasks.length} งาน`, e.meetingDate ? `นัด ${formatDate(e.meetingDate)}` : null, people(e.presenterIds))
      break
  }
  return parts.filter(Boolean).join(' · ') || null
}

/** A store's event log (§4.13), grouped by round. Reverted entries stay, dimmed; edited ones show their patched values. */
export function TrackTimeline({ view, model, onEdit }: { view: TrackView; model: PresentationModel; onEdit: (eventId: string) => void }) {
  const id = useId()
  const groups = groupByRound(view.timeline)
  const perms = { canRecord: model.canRecord, canFinalize: model.canFinalize }
  const canEdit = (item: TimelineItem) => view.inProposal && !item.reverted && isEditableKind(item.event.kind) && canChangeEvent(item.event.kind, perms)

  return (
    <div className="space-y-4">
      {groups.map((group, gi) => (
        <section key={group.round} aria-labelledby={`${id}-r${group.round}`} className={cn(gi > 0 && 'border-t pt-4')}>
          <h4 id={`${id}-r${group.round}`} className="mb-3 text-xs font-medium text-muted-foreground">
            รอบที่ {group.round}
          </h4>
          <ol>
            {group.items.map((item, i) => (
              <TimelineEntry
                key={item.event.id}
                item={item}
                view={view}
                model={model}
                isLast={i === group.items.length - 1}
                onEdit={canEdit(item) ? () => onEdit(item.event.id) : undefined}
              />
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}

function TimelineEntry({ item, view, model, isLast, onEdit }: { item: TimelineItem; view: TrackView; model: PresentationModel; isLast: boolean; onEdit?: () => void }) {
  const e = item.effective
  const { icon: Icon, tone } = EVENT_STYLE[e.kind]
  const title = eventTitle(item, view.packageSeq, { word: model.storeWord, productIds: model.proposal.productIds, userName: model.userName })
  const actor = model.usersById.get(item.event.actorId)
  const recordedAt = item.event.recordedAt
  const meta = eventMeta(e, model)
  const quote = eventQuote(e)

  return (
    <li className={cn('relative flex gap-3', !isLast && 'pb-5', item.reverted && 'opacity-60')}>
      {!isLast && <span className="absolute top-9 bottom-1 left-4 w-px -translate-x-1/2 bg-border" aria-hidden />}
      <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', tone)} aria-hidden>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-sm font-medium break-words">
            <span className={cn(item.reverted && 'line-through')}>{title}</span>
            {item.reverted && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(ยกเลิกแล้ว)</span>}
            {item.edited && (
              <span className="ml-1.5 inline-flex h-5 items-center rounded-full bg-muted px-1.5 align-middle text-[11px] font-medium text-muted-foreground">แก้ไขแล้ว</span>
            )}
          </p>
          {onEdit && (
            <Button variant="ghost" size="xs" className="-my-0.5 text-muted-foreground" onClick={onEdit} aria-label={`แก้ไข: ${title}`}>
              <PencilIcon />
              แก้ไข
            </Button>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
          <span className="tabular">{formatDate('date' in e ? e.date : recordedAt)}</span>
          <span aria-hidden>·</span>
          <span className="inline-flex min-w-0 items-center gap-1">
            {actor && <UserAvatar user={actor} size="xs" />}
            <span className="truncate">{model.userName(item.event.actorId)}</span>
          </span>
          <span aria-hidden>·</span>
          <time dateTime={recordedAt} title={formatDateTime(recordedAt)}>
            บันทึก {fromNow(recordedAt)} · <span className="tabular">{dayjs(recordedAt).format('HH:mm')}</span>
          </time>
        </div>
        {meta && <p className="mt-1 text-xs break-words text-muted-foreground">{meta}</p>}
        {quote && <div className="mt-2 rounded-lg bg-muted/50 p-3 text-sm break-words whitespace-pre-line">{quote}</div>}
      </div>
    </li>
  )
}
