import { BadgeCheckIcon, CheckIcon, CircleSlashIcon, CircleXIcon, HourglassIcon, MessageCircleQuestionMarkIcon, PresentationIcon, type LucideIcon } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router'
import { StoreLogo, StoreLogos } from '@/components/common/badges'
import { cn } from '@/lib/utils'
import { STAGE_META, STAGE_ORDER, stageLabel, stageLong, UNTRACKED_LABEL } from './model'
import type { PresentationStage, StageBarItem, StoreSnapshot } from './types'

const STAGE_ICON: Record<PresentationStage, LucideIcon> = {
  AWAITING: PresentationIcon,
  IN_REVIEW: HourglassIcon,
  NEEDS_INFO: MessageCircleQuestionMarkIcon,
  PASSED: BadgeCheckIcon,
  REJECTED: CircleXIcon,
  WITHDRAWN: CircleSlashIcon,
}

export function StageIcon({ stage, className }: { stage: PresentationStage; className?: string }) {
  const Icon = STAGE_ICON[stage]
  return <Icon className={className} aria-hidden />
}

/** Stage chip, with " · รอบที่ n" from round 2 on. */
export function StageBadge({ stage, round = 1, className }: { stage: PresentationStage; round?: number; className?: string }) {
  return (
    <span className={cn('inline-flex h-6 items-center gap-1 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap', STAGE_META[stage].chip, className)}>
      <StageIcon stage={stage} className="size-3.5 shrink-0" />
      {stageLabel(stage, round)}
    </span>
  )
}

/** Small stage dot; null = not in any package yet. */
export function StageDot({ stage, className }: { stage: PresentationStage | null; className?: string }) {
  return <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', stage ? STAGE_META[stage].dot : 'bg-border', className)} />
}

type NodeState = 'done' | 'current' | 'future'

const STEP_LABELS = ['นำเสนอ', 'พิจารณา', 'ผล'] as const
/** Which of the three nodes a stage sits on. */
const STEP_OF: Record<PresentationStage, number> = { AWAITING: 0, IN_REVIEW: 1, NEEDS_INFO: 1, PASSED: 2, REJECTED: 2, WITHDRAWN: 0 }

function nodeStates(stage: PresentationStage, withdrawnFrom: PresentationStage | null | undefined): NodeState[] {
  // WITHDRAWN stops (muted) on the node where the track was when it was withdrawn.
  const at = stage === 'WITHDRAWN' ? STEP_OF[withdrawnFrom ?? 'AWAITING'] : STEP_OF[stage]
  return [0, 1, 2].map((i) => (i < at ? 'done' : i === at ? 'current' : 'future'))
}

function TrackNode({ state, index, stage, round, size }: { state: NodeState; index: number; stage: PresentationStage; round: number; size: 'sm' | 'lg' }) {
  const icon = size === 'lg' ? 'size-4' : 'size-3.5'
  return (
    <span
      className={cn(
        'tabular relative z-10 flex shrink-0 items-center justify-center rounded-full border-2 font-semibold',
        size === 'lg' ? 'size-8 text-sm' : 'size-6 text-[11px]',
        state === 'done' ? 'border-primary bg-card text-primary' : state === 'current' ? STAGE_META[stage].node : 'border-border bg-card text-muted-foreground',
      )}
    >
      {state === 'done' ? <CheckIcon className={icon} strokeWidth={3} /> : state === 'current' ? <StageIcon stage={stage} className={icon} /> : index + 1}
      {index === 1 && round >= 2 && (
        <span className="tabular absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-card text-[10px] text-foreground ring-1 ring-border">{round}</span>
      )}
    </span>
  )
}

/** Three nodes นำเสนอ · พิจารณา · ผล. `sm` for rows; `lg` (labels + sub-lines) for the store sheet. */
export function StageTrack({
  stage,
  round = 1,
  withdrawnFrom,
  size = 'sm',
  sub,
  storeName,
  word = 'ห้าง',
  className,
}: {
  stage: PresentationStage
  round?: number
  /** WITHDRAWN only (TrackView.withdrawnFrom). */
  withdrawnFrom?: PresentationStage | null
  size?: 'sm' | 'lg'
  /** lg: one line under each node. */
  sub?: [ReactNode, ReactNode, ReactNode]
  /** For the accessible label "{store}: {long label}". */
  storeName?: string
  word?: string
  className?: string
}) {
  const states = nodeStates(stage, withdrawnFrom)
  const label = `${storeName ? `${storeName}: ` : ''}${stageLong(stage, word)}${round >= 2 ? ` · รอบที่ ${round}` : ''}`
  const connector = (i: number) => (states[i - 1] === 'done' ? 'bg-primary/60' : 'bg-border')

  if (size === 'sm') {
    return (
      <div role="img" aria-label={label} className={cn('inline-flex shrink-0 items-center', className)}>
        {states.map((s, i) => (
          <Fragment key={i}>
            {i > 0 && <span aria-hidden className={cn('h-0.5 w-5', connector(i))} />}
            <TrackNode state={s} index={i} stage={stage} round={round} size="sm" />
          </Fragment>
        ))}
      </div>
    )
  }
  return (
    <div role="img" aria-label={label} className={cn('flex items-start', className)}>
      {states.map((s, i) => (
        <div key={i} className="relative flex flex-1 flex-col items-center gap-1.5 text-center">
          {i > 0 && <span aria-hidden className={cn('absolute top-4 right-1/2 left-[-50%] h-0.5 -translate-y-1/2', connector(i))} />}
          <TrackNode state={s} index={i} stage={stage} round={round} size="lg" />
          <span className={cn('text-xs leading-tight', s === 'future' ? 'text-muted-foreground' : 'font-medium text-foreground')}>{STEP_LABELS[i]}</span>
          {sub?.[i] != null && <span className="text-[11px] leading-tight text-muted-foreground">{sub[i]}</span>}
        </div>
      ))}
    </div>
  )
}

function countsLabel(items: StageBarItem[]) {
  const parts = STAGE_ORDER.map((s) => [s, items.filter((it) => it.stage === s).length] as const)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${STAGE_META[s].label} ${n}`)
  const untracked = items.filter((it) => !it.stage).length
  if (untracked) parts.push(`ยังไม่ได้นำเสนอ ${untracked}`)
  return parts.join(' · ')
}

/** Thin bar next to the header line, one segment per proposal store. */
export function StageBar({ items, className }: { items: StageBarItem[]; variant?: 'mini'; word?: string; className?: string }) {
  return (
    <span role="img" aria-label={countsLabel(items)} className={cn('flex h-1.5 w-28 shrink-0 gap-0.5', className)}>
      {items.map((it) => (
        <span key={it.store.id} className={cn('flex-1 rounded-full', it.stage ? STAGE_META[it.stage].dot : 'bg-border')} />
      ))}
    </span>
  )
}

/** Final results first, then the open stages, then stores not presented yet. */
const PROGRESS_ORDER: PresentationStage[] = ['PASSED', 'REJECTED', 'WITHDRAWN', 'NEEDS_INFO', 'IN_REVIEW', 'AWAITING']

/** One thin bar split by how many stores sit in each stage. */
export function StageProgress({ items, className }: { items: StageBarItem[]; className?: string }) {
  const total = items.length
  if (!total) return null
  const parts = PROGRESS_ORDER.map((s) => [s, items.filter((it) => it.stage === s).length] as const).filter(([, n]) => n > 0)
  return (
    <div role="img" aria-label={countsLabel(items)} className={cn('flex h-2 gap-0.5 overflow-hidden rounded-full bg-muted', className)}>
      {parts.map(([s, n]) => (
        <span key={s} className={cn('h-full first:rounded-l-full last:rounded-r-full', STAGE_META[s].dot)} style={{ width: `${(n / total) * 100}%` }} />
      ))}
    </div>
  )
}

/** "ผ่าน 3 · ต้องการข้อมูลเพิ่ม 2 · ยังไม่ได้นำเสนอ 1" — the text StageProgress / StageBar announce. */
export function StageCounts({ items, className }: { items: StageBarItem[]; className?: string }) {
  const text = countsLabel(items)
  return text ? <span className={cn('text-xs text-muted-foreground', className)}>{text}</span> : null
}

const MORE_SIZE = { sm: 'h-6 min-w-6 px-1 text-[9px] rounded-md', md: 'h-8 min-w-8 px-1.5 text-[10px] rounded-lg' }

/**
 * Every store as its own logo with a corner stage dot (untracked: plain border dot); up to `max` tiles, the last
 * one "+n" when there are more. `href` turns tracked stores into links (their store sheet).
 */
export function StoreStageLogos({
  items,
  max = 5,
  size = 'sm',
  href,
  className,
}: {
  items: StageBarItem[]
  max?: number
  size?: 'sm' | 'md'
  href?: (storeId: string) => string | null
  className?: string
}) {
  const shown = items.length > max ? items.slice(0, max - 1) : items
  const rest = items.length - shown.length
  return (
    <span className={cn('inline-flex shrink-0 flex-wrap items-center gap-1.5', className)}>
      {shown.map((it) => {
        const label = `${it.store.name}: ${it.stage ? stageLabel(it.stage, it.round) : UNTRACKED_LABEL}`
        const to = it.trackId ? href?.(it.store.id) : null
        const logo = (
          <>
            <StoreLogo store={it.store} size={size} />
            <StageDot stage={it.stage} className="absolute -right-0.5 -bottom-0.5 size-2 ring-2 ring-card" />
          </>
        )
        return to ? (
          <Link
            key={it.store.id}
            to={to}
            aria-label={label}
            className="relative z-10 inline-flex rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1"
          >
            {logo}
          </Link>
        ) : (
          <span key={it.store.id} className="relative inline-flex">
            {logo}
            <span className="sr-only">{label}</span>
          </span>
        )
      })}
      {rest > 0 && (
        <span
          className={cn('tabular inline-flex shrink-0 items-center justify-center bg-muted font-bold text-muted-foreground', MORE_SIZE[size])}
          title={items.slice(shown.length).map((it) => it.store.name).join(', ')}
        >
          +{rest}
          <span className="sr-only"> {items.slice(shown.length).map((it) => it.store.name).join(', ')}</span>
        </span>
      )}
    </span>
  )
}

const TILE: Record<PresentationStage, { short: string; text: string; active: string }> = {
  AWAITING: { short: 'รอนำเสนอ', text: 'text-brand', active: 'border-primary bg-brand-soft ring-primary/20' },
  IN_REVIEW: { short: 'รอพิจารณา', text: 'text-info', active: 'border-info bg-info-soft ring-info/20' },
  NEEDS_INFO: { short: 'ต้องการข้อมูลเพิ่ม', text: 'text-warning-foreground', active: 'border-warning bg-warning-soft ring-warning/25' },
  PASSED: { short: 'ผ่าน', text: 'text-success', active: 'border-success bg-success-soft ring-success/20' },
  REJECTED: { short: 'ไม่ผ่าน', text: 'text-danger', active: 'border-danger bg-danger-soft ring-danger/20' },
  WITHDRAWN: { short: 'ยุตินำเสนอ', text: 'text-muted-foreground', active: 'border-border bg-muted ring-border' },
}

/** Board tile: stage, count and the stores in it; clicking filters the rows. */
export function StageTile({
  stage,
  stores,
  active,
  onClick,
}: {
  stage: PresentationStage
  stores: StoreSnapshot[]
  active: boolean
  onClick: () => void
}) {
  const meta = TILE[stage]
  const empty = stores.length === 0
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={empty && !active}
      onClick={onClick}
      title={stores.map((s) => s.name).join(', ') || undefined}
      className={cn(
        'flex min-w-0 flex-1 flex-col gap-2 rounded-lg border p-3 sm:min-w-[9.5rem] text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none',
        active ? cn('ring-2', meta.active) : empty ? 'border-dashed bg-transparent' : 'bg-card hover:bg-muted/50',
      )}
    >
      <span className={cn('flex items-center gap-1.5 text-xs font-medium', empty ? 'text-muted-foreground' : meta.text)}>
        <StageIcon stage={stage} className="size-3.5 shrink-0" />
        {meta.short}
      </span>
      <span className="flex items-end justify-between gap-2">
        <span className={cn('tabular text-2xl leading-none font-semibold', empty ? 'text-muted-foreground/50' : 'text-foreground')}>{stores.length}</span>
        {!empty && <StoreLogos stores={stores} size="sm" max={3} />}
      </span>
    </button>
  )
}
