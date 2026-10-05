import type { Store } from '@flowtrade/shared'
import { StoreIcon } from 'lucide-react'
import { useMemo } from 'react'
import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts'
import type { DashboardSummary } from '@/api/types'
import { StoreLogo } from '@/components/common/badges'
import { EmptyState } from '@/components/common/misc'
import { useIsMobile } from '@/hooks/use-mobile'
import { ChartSection, ChartTooltipBox, DataTable, LegendKey } from './parts'
import { fmt, num, stackEndShape } from './utils'

interface Row {
  id: string
  store: Store
  active: number
  completed: number
  overdueTasks: number
  total: number
}

const ROW_H = 34
const ACTIVE = 'var(--chart-1)'
const COMPLETED = 'var(--success)'
const OVERDUE = 'var(--danger)'

const activeShape = stackEndShape<Row>((r) => r.completed === 0)
const completedShape = stackEndShape<Row>(() => true)

/** Store tile + name as the category tick (the store's own color encodes the store). */
function StoreTick({ x, y, row, compact }: { x: number; y: number; row: Row | undefined; compact: boolean }) {
  if (!row) return null
  const tileW = compact ? 40 : 38
  return (
    <g transform={`translate(${x},${y})`}>
      <title>{row.store.name}</title>
      <rect x={-(compact ? tileW + 6 : 134)} y={-10} width={tileW} height={20} rx={5} fill={row.store.color} />
      <text x={-(compact ? tileW / 2 + 6 : 134 - tileW / 2)} y={0} dy="0.35em" textAnchor="middle" fontSize={9} fontWeight={700} className="fill-white">
        {row.store.shortName.length > 6 ? row.store.shortName.slice(0, 6) : row.store.shortName}
      </text>
      {!compact && (
        <text x={-134 + tileW + 6} y={0} dy="0.35em" textAnchor="start" fontSize={12} fill="var(--foreground)">
          {row.store.name.length > 14 ? `${row.store.name.slice(0, 13)}…` : row.store.name}
        </text>
      )}
    </g>
  )
}

export function StoreChart({
  data,
  overdueTasks,
  className,
}: {
  data: DashboardSummary['byStore']
  overdueTasks: DashboardSummary['overdueTasks']
  className?: string
}) {
  const compact = useIsMobile()
  const rows = useMemo<Row[]>(
    () =>
      data
        .map((r) => ({ id: r.store.id, store: r.store, active: r.active, completed: r.completed, overdueTasks: r.overdueTasks, total: r.active + r.completed }))
        .sort((a, b) => b.active - a.active || b.total - a.total || a.store.sortOrder - b.store.sortOrder),
    [data],
  )
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows])
  // Summing the rows would count a multi-store proposal once per store; count each task once, if one of its stores is shown.
  const totalOverdue = overdueTasks.filter((x) => x.stores.some((s) => byId.has(s.id))).length

  if (rows.length === 0) {
    return (
      <ChartSection
        className={className}
        icon={<StoreIcon />}
        title="แยกตามห้าง / แพลตฟอร์ม"
        chart={<EmptyState title="ยังไม่มีโปรเจกต์ในห้างใด" description="เมื่อเริ่มเสนอสินค้าเข้าห้างหรือแพลตฟอร์ม จะเห็นการกระจายงานที่นี่" className="py-10" />}
        table={<p className="py-6 text-center text-sm text-muted-foreground">ไม่มีข้อมูล</p>}
      />
    )
  }

  const chart = (
    <div style={{ height: rows.length * ROW_H + 8 }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 52, bottom: 4, left: 0 }} barCategoryGap={8}>
          <XAxis type="number" hide allowDecimals={false} domain={[0, 'dataMax']} />
          <YAxis
            type="category"
            dataKey="id"
            width={compact ? 50 : 142}
            interval={0}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
            tick={(p: { x: number | string; y: number | string; payload: { value: unknown } }) => (
              <StoreTick x={num(p.x)} y={num(p.y)} row={byId.get(String(p.payload.value))} compact={compact} />
            )}
          />
          <RTooltip
            cursor={{ fill: 'var(--muted)', opacity: 0.7 }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as Row | undefined
              if (!active || !row) return null
              return (
                <ChartTooltipBox
                  title={row.store.name}
                  rows={[
                    { key: 'a', color: ACTIVE, label: 'โปรเจกต์ที่กำลังดำเนินการ', value: row.active },
                    { key: 'c', color: COMPLETED, label: 'โปรเจกต์ที่เสร็จสิ้น', value: row.completed },
                    { key: 'o', color: OVERDUE, label: 'งานเลยกำหนด', value: row.overdueTasks, strong: row.overdueTasks > 0 },
                  ]}
                />
              )
            }}
          />
          <Bar dataKey="active" name="กำลังดำเนินการ" stackId="s" fill={ACTIVE} barSize={16} stroke="var(--card)" strokeWidth={2} shape={activeShape} animationDuration={500} />
          <Bar dataKey="completed" name="เสร็จสิ้น" stackId="s" fill={COMPLETED} barSize={16} stroke="var(--card)" strokeWidth={2} shape={completedShape} animationDuration={500}>
            <LabelList
              dataKey="total"
              content={(p) => {
                const row = rows[num(p.index)]
                if (!row) return null
                const x = num(p.x) + num(p.width) + 6
                const cy = num(p.y) + num(p.height) / 2
                const label = fmt(row.total)
                const markerX = x + label.length * 7 + 12
                return (
                  <g>
                    <text x={x} y={cy} dy="0.35em" fontSize={12} fontWeight={600} fill="var(--foreground)" className="tabular">
                      {label}
                    </text>
                    {row.overdueTasks > 0 && (
                      <g>
                        <circle cx={markerX} cy={cy} r={9} fill={OVERDUE} stroke="var(--card)" strokeWidth={2} />
                        <text x={markerX} y={cy} dy="0.35em" textAnchor="middle" fontSize={9.5} fontWeight={700} className="fill-white">
                          {row.overdueTasks > 99 ? '99+' : row.overdueTasks}
                        </text>
                      </g>
                    )}
                  </g>
                )
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )

  const table = (
    <DataTable
      caption="จำนวนโปรเจกต์และงานเลยกำหนด แยกตามห้าง / แพลตฟอร์ม"
      head={['ห้าง / แพลตฟอร์ม', 'กำลังดำเนินการ', 'เสร็จสิ้น', 'งานเลยกำหนด']}
      rows={rows.map((r) => [
        <span key="s" className="flex items-center gap-2">
          <StoreLogo store={r.store} size="sm" />
          <span className="truncate">{r.store.name}</span>
        </span>,
        fmt(r.active),
        fmt(r.completed),
        <span key="o" className={r.overdueTasks > 0 ? 'font-semibold text-danger' : undefined}>
          {fmt(r.overdueTasks)}
        </span>,
      ])}
    />
  )

  return (
    <ChartSection
      className={className}
      icon={<StoreIcon />}
      title="แยกตามห้าง / แพลตฟอร์ม"
      description={`จำนวนโปรเจกต์ต่อห้าง${totalOverdue > 0 ? ` · วงกลมแดงคือจำนวนงานที่เลยกำหนด (รวม ${fmt(totalOverdue)} งาน)` : ''}`}
      legend={
        <>
          <LegendKey color={ACTIVE} label="กำลังดำเนินการ" />
          <LegendKey color={COMPLETED} label="เสร็จสิ้น" />
          <LegendKey color={OVERDUE} label="งานเลยกำหนด (จำนวนงาน)" shape="dot" />
        </>
      }
      chart={chart}
      table={table}
    />
  )
}
