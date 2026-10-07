import { addDays } from '@flowtrade/shared'
import { AlarmClockIcon, CalendarCheck2Icon, CheckCircle2Icon, FolderKanbanIcon, GaugeIcon, ListTodoIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { DashboardSummary } from '@/api/types'
import { dayjs, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { fmt } from './utils'

type Tone = 'default' | 'danger' | 'success'

interface Tile {
  key: string
  label: string
  value: ReactNode
  caption: ReactNode
  icon: ReactNode
  tone?: Tone
  href?: string
  meter?: number
}

function StatTile({ tile }: { tile: Tile }) {
  const tone = tile.tone ?? 'default'
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className={cn('text-xs leading-snug font-medium', tone === 'danger' ? 'text-danger' : 'text-muted-foreground')}>{tile.label}</span>
        <span
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4',
            tone === 'danger' ? 'bg-danger text-white' : tone === 'success' ? 'bg-success-soft text-success' : 'bg-brand-soft text-brand',
          )}
          aria-hidden
        >
          {tile.icon}
        </span>
      </div>
      <div className={cn('mt-1 text-2xl leading-tight font-semibold tracking-tight sm:text-[1.7rem]', tone === 'danger' && 'text-danger')}>{tile.value}</div>
      {tile.meter !== undefined && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-brand-soft" aria-hidden>
          <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(100, tile.meter))}%` }} />
        </div>
      )}
      <p className={cn('mt-1.5 line-clamp-2 text-xs', tone === 'danger' ? 'text-danger/80' : 'text-muted-foreground')}>{tile.caption}</p>
    </>
  )
  const className = cn(
    'flex min-w-0 flex-col rounded-xl border bg-card p-3.5 transition-colors sm:p-4',
    tone === 'danger' && 'border-danger/30 bg-danger-soft',
    tile.href && 'outline-none hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50',
    tile.href && tone === 'danger' && 'hover:border-danger/60',
  )
  return tile.href ? (
    <a href={tile.href} className={className}>
      {body}
    </a>
  ) : (
    <div className={className}>{body}</div>
  )
}

export function KpiTiles({ data }: { data: DashboardSummary }) {
  const { kpis, today: t } = data
  const count = (s: string) => data.byStatus.find((b) => b.status === s)?.count ?? 0

  const tiles: Tile[] = [
    {
      key: 'active',
      label: 'โปรเจกต์ที่กำลังดำเนินการ',
      value: fmt(kpis.activeProposals),
      caption: `กำลังทำ ${fmt(count('IN_PROGRESS'))} · ร่าง ${fmt(count('DRAFT'))} · พักไว้ ${fmt(count('ON_HOLD'))}`,
      icon: <FolderKanbanIcon />,
    },
    {
      key: 'launch30',
      label: 'วางขายใน 30 วัน',
      value: fmt(kpis.launchesNext30),
      caption: `ตั้งแต่วันนี้ถึง ${formatDate(addDays(t, 30), { withYear: false })}`,
      icon: <CalendarCheck2Icon />,
      href: '#upcoming-launches',
    },
    {
      key: 'open',
      label: 'งานค้างทั้งหมด',
      value: fmt(kpis.openTasks),
      caption: 'นับงานระดับล่างสุดที่ยังไม่ติ๊กเสร็จ',
      icon: <ListTodoIcon />,
    },
    {
      key: 'overdue',
      label: 'งานเลยกำหนด',
      value: fmt(kpis.overdueTasks),
      caption: kpis.overdueTasks > 0 ? 'ไม่รวมโปรเจกต์ร่าง/พักไว้ — กดเพื่อดูรายการ' : 'ไม่มีงานเลยกำหนดในโปรเจกต์ที่กำลังทำ',
      icon: <AlarmClockIcon />,
      tone: kpis.overdueTasks > 0 ? 'danger' : 'success',
      href: kpis.overdueTasks > 0 ? '#overdue' : undefined,
    },
    {
      key: 'done',
      label: 'เสร็จเดือนนี้',
      value: fmt(kpis.completedThisMonth),
      caption: `โปรเจกต์ที่ปิดในเดือน${dayjs(t).format('MMMM')}`,
      icon: <CheckCircle2Icon />,
      tone: 'success',
    },
    {
      key: 'progress',
      label: 'ความคืบหน้าเฉลี่ย',
      value: (
        <>
          {kpis.avgProgress}
          <span className="ml-0.5 text-base font-medium text-muted-foreground">%</span>
        </>
      ),
      caption: 'เฉลี่ยจากโปรเจกต์ที่กำลังดำเนินการ',
      icon: <GaugeIcon />,
      meter: kpis.avgProgress,
    },
  ]

  return (
    <section aria-label="ตัวเลขสรุป" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {tiles.map((tile) => (
        <StatTile key={tile.key} tile={tile} />
      ))}
    </section>
  )
}
