import { canStartPresentation, compareProjects, isOpenStore, stageSummary, storeWord, type ISODate } from '@flowtrade/shared'
import { ChevronDownIcon, ChevronUpIcon, FolderPlusIcon, PauseIcon, RocketIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import type { HomeProject } from '@/api'
import { useAuth } from '@/auth/auth'
import { ShelfTypeBadge, StatusBadge } from '@/components/common/badges'
import { EmptyState, LaunchCountdown } from '@/components/common/misc'
import { Button } from '@/components/ui/button'
import { headerLine, TONE_TEXT } from '@/features/presentation/model'
import { StageCounts, StageProgress, StoreStageLogos } from '@/features/presentation/stage-badge'
import { useIsMobile } from '@/hooks/use-mobile'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { HealthChip } from './health-chip'
import { projectHref, storeHref } from './links'
import { MoreToggle, Panel, PanelLink } from './panel'

/** Rows shown per round before "แสดงอีก". */
const ROUND_LIMIT = 8
/** Upcoming rounds shown expanded (past rounds always are). */
const OPEN_ROUNDS = 2

interface Round {
  date: ISODate
  projects: HomeProject[]
}

/** By launch date (always the 15th; a legacy date just forms its own round), oldest first. */
function groupRounds(projects: HomeProject[]): Round[] {
  const rounds: Round[] = []
  for (const p of [...projects].sort(compareProjects)) {
    const last = rounds.at(-1)
    if (last?.date === p.proposal.targetDate) last.projects.push(p)
    else rounds.push({ date: p.proposal.targetDate, projects: [p] })
  }
  return rounds
}

/** Where the project stands (§3.0.1): prep progress, ready, the buyer header line, or the verdict. */
function PhaseLine({ project }: { project: HomeProject }) {
  const { phase, prep, stores, proposal } = project
  const word = storeWord(proposal.channel)
  switch (phase) {
    case 'CLOSED':
      return <span className="text-xs text-muted-foreground">ปิดโปรเจกต์แล้ว</span>
    case 'PREP':
      return (
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>
            เตรียมข้อมูล <span className="tabular">{prep.done}/{prep.total}</span>
          </span>
          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden>
            <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, prep.percent))}%` }} />
          </span>
          <span className="tabular">{prep.percent}%</span>
          {prep.overdue > 0 && <span className="tabular rounded bg-danger-soft px-1.5 leading-5 font-medium text-danger">เลยกำหนด {prep.overdue}</span>}
        </span>
      )
    case 'READY':
      return (
        <span className="text-xs font-medium text-brand">
          งานเตรียมครบ {prep.total}/{prep.total} · พร้อมนำเสนอ Buyer
        </span>
      )
    case 'LISTED': {
      const passed = stores.filter((s) => s.stage === 'PASSED').length
      if (project.production) return <ProductionPhaseLine project={project} passed={passed} />
      return (
        <span className="text-xs font-medium text-success">
          ได้ลง {passed} จาก {stores.length} {word} · พร้อมวางขาย
        </span>
      )
    }
    default: {
      // BUYER / NOT_LISTED: the presentation tab's header line.
      const line = headerLine(stageSummary(stores), canStartPresentation(prep), word, proposal.status)
      if (!line) return null
      const pending = phase === 'BUYER' ? (project.production?.pending ?? 0) : 0
      return (
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className={cn('font-medium', TONE_TEXT[line.tone])}>{line.text}</span>
          {phase === 'BUYER' && <StageProgress items={stores} className="w-16 shrink-0" />}
          {pending > 0 && <span className="font-medium text-warning-foreground">· รอยืนยันผลิต {pending} SKU</span>}
          {phase === 'BUYER' && proposal.status === 'COMPLETED' && <span className="text-muted-foreground">· ปิดโปรเจกต์แล้ว</span>}
        </span>
      )
    }
  }
}

/** LISTED with production (§6.3, K21): review → confirm → making → delivered. */
function ProductionPhaseLine({ project, passed }: { project: HomeProject; passed: number }) {
  const prod = project.production!
  const word = storeWord(project.proposal.channel)
  const closed = project.proposal.status === 'COMPLETED' && <span className="text-muted-foreground">· ปิดโปรเจกต์แล้ว</span>
  let body
  if (prod.flagged > 0) body = <span className="font-medium text-warning-foreground">ผลิต: {prod.flagged} SKU ที่ยืนยันแล้วต้องตรวจสอบ</span>
  else if (prod.state === 'PENDING')
    body = (
      <span className={cn('font-medium', prod.overdueDays > 0 ? 'text-danger' : 'text-warning-foreground')}>
        ได้ลง {passed}/{project.stores.length} {word} · รอยืนยันเริ่มผลิต {prod.pending} SKU
      </span>
    )
  else if (prod.state === 'ACTIVE') {
    const pct = prod.confirmed > 0 ? Math.round((prod.delivered / prod.confirmed) * 100) : 0
    body = (
      <>
        <span className="font-medium text-info">
          กำลังผลิต · ส่งแล้ว <span className="tabular">{prod.delivered}/{prod.confirmed}</span> SKU
        </span>
        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden>
          <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </span>
        {prod.overdueDays > 0 ? (
          <span className="font-medium text-danger">· เลยกำหนดผลิต {prod.overdueDays} วัน</span>
        ) : (
          <span className="tabular text-muted-foreground">· กำหนด {formatDate(prod.deadline, { withYear: false })}</span>
        )}
      </>
    )
  } else body = <span className="font-medium text-success">ส่งเข้าคลังครบ {prod.delivered} SKU · พร้อมวางขาย</span>
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {body}
      {closed}
    </span>
  )
}

export function ProjectRow({ project }: { project: HomeProject }) {
  const isMobile = useIsMobile()
  const { proposal, health } = project
  return (
    <li className="relative px-4 py-2.5 transition-colors hover:bg-muted/50">
      <div className="flex items-start justify-between gap-2">
        <Link
          to={projectHref(project)}
          className="line-clamp-2 min-w-0 text-sm leading-snug font-medium outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring/60 focus-visible:after:ring-inset"
        >
          {proposal.title}
        </Link>
        {health ? (
          <HealthChip health={health} className="mt-px" />
        ) : (
          (proposal.status === 'DRAFT' || proposal.status === 'COMPLETED') && <StatusBadge status={proposal.status} className="h-5 shrink-0 px-2 text-[11px]" />
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span className="tabular">{proposal.code}</span>
        <ShelfTypeBadge shelfType={proposal.shelfType} className="h-5 px-1.5 text-[11px]" />
      </div>
      {health && <p className={cn('mt-1 text-xs font-medium', health.level === 'LATE' ? 'text-danger' : 'text-warning-foreground')}>{health.reason}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <StoreStageLogos items={project.stores} max={isMobile ? 4 : 5} href={(storeId) => storeHref(proposal, storeId)} />
        <PhaseLine project={project} />
      </div>
    </li>
  )
}

/** Round header: launch date, countdown ("เลยวันวางขาย" while results are missing), project count, every store's stage. */
export function LaunchRoundHeader({ date, projects }: { date: ISODate; projects: HomeProject[] }) {
  const late = projects.some((p) => p.health?.level === 'LATE')
  const open = projects.some((p) => p.stores.some(isOpenStore))
  const stores = projects.flatMap((p) => p.stores)
  return (
    <div className="px-4 pt-3 pb-1">
      <div className="flex items-center gap-2 text-xs font-semibold">
        <span className={cn('size-1.5 shrink-0 rounded-full', late ? 'bg-danger' : 'bg-primary')} aria-hidden />
        <h3 className={cn('min-w-0', late ? 'text-danger' : 'text-foreground')}>
          รอบ<span className="hidden sm:inline">วางขาย</span> {formatDate(date)}
        </h3>
        <span className="text-muted-foreground" aria-hidden>
          ·
        </span>
        <LaunchCountdown targetDate={date} open={open} />
        <span className="tabular ml-auto rounded-full bg-muted px-1.5 leading-4 text-muted-foreground">
          <span aria-hidden>{projects.length}</span>
          <span className="sr-only">{projects.length} โปรเจกต์</span>
        </span>
      </div>
      {stores.some((s) => s.stage) && (
        <div className="mt-1.5 flex min-w-0 items-center gap-2 pl-3.5">
          <StageProgress items={stores} className="w-32 shrink-0" />
          <StageCounts items={stores} className="hidden min-w-0 truncate sm:inline" />
        </div>
      )}
    </div>
  )
}

function RoundSection({ round }: { round: Round }) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? round.projects : round.projects.slice(0, ROUND_LIMIT)
  const hidden = round.projects.length - ROUND_LIMIT
  return (
    <section className="pb-1">
      <LaunchRoundHeader date={round.date} projects={round.projects} />
      <ul className="divide-y">
        {shown.map((p) => (
          <ProjectRow key={p.proposal.id} project={p} />
        ))}
      </ul>
      {hidden > 0 && <MoreToggle expanded={expanded} label={`แสดงอีก ${hidden}`} onToggle={() => setExpanded((v) => !v)} />}
    </section>
  )
}

/** "โปรเจกต์ของฉัน · ตามรอบวางขาย": involved projects grouped by launch round; later rounds fold into one line. */
export function ProjectRounds({ projects, onHold, today }: { projects: HomeProject[]; onHold: number; today: ISODate }) {
  const { can } = useAuth()
  const [showLater, setShowLater] = useState(false)
  const rounds = useMemo(() => groupRounds(projects), [projects])
  const firstUpcoming = rounds.findIndex((r) => r.date >= today)
  const openCount = firstUpcoming === -1 ? rounds.length : firstUpcoming + OPEN_ROUNDS
  const shown = showLater ? rounds : rounds.slice(0, openCount)
  const later = rounds.slice(openCount)

  return (
    <Panel
      id="projects"
      className="@container"
      title={
        <>
          โปรเจกต์ของฉัน<span className="hidden @min-[25rem]:inline"> · ตามรอบวางขาย</span>
        </>
      }
      icon={<RocketIcon />}
      action={<PanelLink to="/proposals?scope=mine&status=ACTIVE">รายการเสนอสินค้า</PanelLink>}
    >
      {projects.length === 0 ? (
        <EmptyState
          className="m-4 border-0 bg-transparent py-8"
          icon={<FolderPlusIcon className="size-5" />}
          title="ยังไม่มีโปรเจกต์ที่คุณเกี่ยวข้อง"
          description="โปรเจกต์ที่คุณเป็นเจ้าของ เป็นสมาชิก หรือมีงานอยู่จะแสดงที่นี่"
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              {can('proposal.create') && (
                <Button asChild size="sm">
                  <Link to="/proposals/new">เสนอสินค้าใหม่</Link>
                </Button>
              )}
              {can('proposal.read.all') && <PanelLink to="/proposals">ดูทุกโปรเจกต์ของฝ่าย</PanelLink>}
            </div>
          }
        />
      ) : (
        <div className="divide-y">
          {shown.map((r) => (
            <RoundSection key={r.date} round={r} />
          ))}
          {later.length > 0 && (
            <div className="flex items-start gap-2 px-4 py-2.5 text-xs text-muted-foreground">
              <span className="min-w-0 flex-1">
                {showLater
                  ? `รอบถัดไป ${later.length} รอบ`
                  : `รอบถัดไป: ${later.map((r) => `${formatDate(r.date)} (${r.projects.length})`).join(' · ')}`}
              </span>
              <button
                type="button"
                onClick={() => setShowLater((v) => !v)}
                aria-expanded={showLater}
                className="inline-flex shrink-0 items-center gap-0.5 font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                {showLater ? 'ซ่อน' : 'แสดง'}
                {showLater ? <ChevronUpIcon className="size-3.5" aria-hidden /> : <ChevronDownIcon className="size-3.5" aria-hidden />}
              </button>
            </div>
          )}
        </div>
      )}
      {onHold > 0 && (
        <Link
          to="/proposals?scope=mine&status=ON_HOLD"
          className="flex items-center gap-1.5 border-t px-4 py-2.5 text-xs font-medium text-muted-foreground outline-none hover:bg-muted/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset"
        >
          <PauseIcon className="size-3.5" aria-hidden />
          พักไว้ <span className="tabular">{onHold}</span> โปรเจกต์ →
        </Link>
      )}
    </Panel>
  )
}
