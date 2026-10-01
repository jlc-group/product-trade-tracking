import type { User } from '@flowtrade/shared'
import { UsersIcon } from 'lucide-react'
import { useMemo } from 'react'
import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts'
import type { DashboardSummary } from '@/api/types'
import { EmptyState } from '@/components/common/misc'
import { UserAvatar } from '@/components/common/user-avatar'
import { displayName, initials } from '@/lib/format'
import { ChartSection, ChartTooltipBox, DataTable, LegendKey } from './parts'
import { fmt, num, shortName, stackEndShape } from './utils'

interface Row {
  id: string
  user: User
  overdue: number
  week: number
  other: number
  open: number
}

const ROW_H = 34
const OVERDUE = 'var(--danger)'
const WEEK = 'var(--warning)'
const OTHER = 'var(--primary)'
const OTHER_OPACITY = 0.35

const overdueShape = stackEndShape<Row>((r) => r.week === 0 && r.other === 0)
const weekShape = stackEndShape<Row>((r) => r.other === 0)
const otherShape = stackEndShape<Row>(() => true)

/** Avatar dot (the person's own color) + short name. */
function PersonTick({ x, y, row }: { x: number; y: number; row: Row | undefined }) {
  if (!row) return null
  const label = shortName(row.user)
  return (
    <g transform={`translate(${x},${y})`}>
      <title>{displayName(row.user)}</title>
      <circle cx={-102} cy={0} r={10} fill={row.user.avatarColor} />
      <text x={-102} y={0} dy="0.35em" textAnchor="middle" fontSize={8.5} fontWeight={600} className="fill-white">
        {initials(row.user.nickname || row.user.name)}
      </text>
      <text x={-86} y={0} dy="0.35em" textAnchor="start" fontSize={12} fill="var(--foreground)">
        {label.length > 10 ? `${label.slice(0, 9)}…` : label}
      </text>
    </g>
  )
}

/** Inside-segment count, only when it fits; otherwise the tooltip and table carry it. */
function SegmentLabel(p: { x?: unknown; y?: unknown; width?: unknown; height?: unknown; value?: unknown }) {
  const w = num(p.width)
  const v = num(p.value)
  if (v <= 0 || w < 20) return null
  return (
    <text x={num(p.x) + w / 2} y={num(p.y) + num(p.height) / 2} dy="0.35em" textAnchor="middle" fontSize={10.5} fontWeight={700} className="tabular fill-white">
      {v}
    </text>
  )
}

export function WorkloadChart({ data, className }: { data: DashboardSummary['workload']; className?: string }) {
  const rows = useMemo<Row[]>(
    () =>
      data.map((w) => ({
        id: w.user.id,
        user: w.user,
        overdue: w.overdue,
        week: w.dueThisWeek,
        other: Math.max(0, w.open - w.overdue - w.dueThisWeek),
        open: w.open,
      })),
    [data],
  )
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows])
  const peopleWithOverdue = rows.filter((r) => r.overdue > 0).length

  const legend = (
    <>
      <LegendKey color={OVERDUE} label="เลยกำหนด" />
      <LegendKey color={WEEK} label="ครบกำหนดใน 7 วัน" />
      <LegendKey color={OTHER} opacity={OTHER_OPACITY} label="งานค้างอื่น ๆ" />
    </>
  )

  if (rows.length === 0) {
    return (
      <ChartSection
        className={className}
        icon={<UsersIcon />}
        title="ภาระงานรายคน"
        chart={<EmptyState icon={<UsersIcon className="size-5" />} title="ไม่มีใครมีงานค้าง" description="งานทุกชิ้นที่มีผู้รับผิดชอบถูกติ๊กเสร็จแล้ว" className="py-10" />}
        table={<p className="py-6 text-center text-sm text-muted-foreground">ไม่มีข้อมูล</p>}
      />
    )
  }

  const chart = (
    <div style={{ height: rows.length * ROW_H + 8 }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 36, bottom: 4, left: 0 }} barCategoryGap={8}>
          <XAxis type="number" hide allowDecimals={false} domain={[0, 'dataMax']} />
          <YAxis
            type="category"
            dataKey="id"
            width={116}
            interval={0}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
            tick={(p: { x: number | string; y: number | string; payload: { value: unknown } }) => <PersonTick x={num(p.x)} y={num(p.y)} row={byId.get(String(p.payload.value))} />}
          />
          <RTooltip
            cursor={{ fill: 'var(--muted)', opacity: 0.7 }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as Row | undefined
              if (!active || !row) return null
              return (
                <ChartTooltipBox
                  title={displayName(row.user)}
                  rows={[
                    { key: 'o', color: OVERDUE, label: 'เลยกำหนด', value: row.overdue, strong: row.overdue > 0 },
                    { key: 'w', color: WEEK, label: 'ครบกำหนดใน 7 วัน', value: row.week },
                    { key: 'x', color: OTHER, opacity: OTHER_OPACITY, label: 'งานค้างอื่น ๆ', value: row.other },
                  ]}
                  footer={`รวมงานค้าง ${fmt(row.open)} งาน`}
                />
              )
            }}
          />
          <Bar dataKey="overdue" stackId="w" fill={OVERDUE} barSize={18} stroke="var(--card)" strokeWidth={2} shape={overdueShape} animationDuration={500}>
            <LabelList dataKey="overdue" content={SegmentLabel} />
          </Bar>
          <Bar dataKey="week" stackId="w" fill={WEEK} barSize={18} stroke="var(--card)" strokeWidth={2} shape={weekShape} animationDuration={500} />
          <Bar dataKey="other" stackId="w" fill={OTHER} fillOpacity={OTHER_OPACITY} barSize={18} stroke="var(--card)" strokeWidth={2} shape={otherShape} animationDuration={500}>
            <LabelList
              dataKey="open"
              content={(p) => (
                <text x={num(p.x) + num(p.width) + 6} y={num(p.y) + num(p.height) / 2} dy="0.35em" fontSize={12} fontWeight={600} fill="var(--foreground)" className="tabular">
                  {fmt(num(p.value))}
                </text>
              )}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )

  const table = (
    <DataTable
      caption="ภาระงานค้างของแต่ละคน"
      head={['ผู้รับผิดชอบ', 'เลยกำหนด', 'ใน 7 วัน', 'อื่น ๆ', 'รวม']}
      rows={rows.map((r) => [
        <span key="u" className="flex items-center gap-2">
          <UserAvatar user={r.user} size="sm" tooltip={false} />
          <span className="truncate">{displayName(r.user)}</span>
        </span>,
        <span key="o" className={r.overdue > 0 ? 'font-semibold text-danger' : undefined}>
          {fmt(r.overdue)}
        </span>,
        fmt(r.week),
        fmt(r.other),
        <span key="t" className="font-semibold">
          {fmt(r.open)}
        </span>,
      ])}
    />
  )

  return (
    <ChartSection
      className={className}
      icon={<UsersIcon />}
      title="ภาระงานรายคน"
      description={
        peopleWithOverdue > 0
          ? `งานที่ยังไม่เสร็จของแต่ละคน · ${fmt(peopleWithOverdue)} คนมีงานเลยกำหนด เรียงจากมากไปน้อย`
          : 'งานที่ยังไม่เสร็จของแต่ละคน (นับงานระดับล่างสุดที่ได้รับมอบหมาย)'
      }
      legend={legend}
      chart={chart}
      table={table}
    />
  )
}
