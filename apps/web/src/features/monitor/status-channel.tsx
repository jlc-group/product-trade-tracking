import { CHANNEL_LABEL, CHANNEL_SHORT, STATUS_LABEL, STATUS_ORDER, type Channel, type ProposalStatus } from '@flowtrade/shared'
import { GlobeIcon, PieChartIcon, StoreIcon } from 'lucide-react'
import { useMemo } from 'react'
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts'
import type { DashboardSummary } from '@/api/types'
import { EmptyState } from '@/components/common/misc'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ChartSection, ChartTooltipBox, DataTable } from './parts'
import { fmt, num } from './utils'

// Status colors match <StatusBadge> so a status reads the same everywhere in the app.
const STATUS_COLOR: Record<ProposalStatus, { fill: string; opacity?: number }> = {
  DRAFT: { fill: 'var(--muted-foreground)', opacity: 0.45 },
  IN_PROGRESS: { fill: 'var(--brand)' },
  ON_HOLD: { fill: 'var(--warning)' },
  COMPLETED: { fill: 'var(--success)' },
  CANCELLED: { fill: 'var(--danger)', opacity: 0.75 },
}

const CHANNEL_COLOR: Record<Channel, string> = {
  OFFLINE: 'var(--chart-1)',
  ONLINE: 'var(--chart-2)',
}

const ROW_H = 32

interface StatusRow {
  status: ProposalStatus
  label: string
  count: number
}

function ChannelSplit({ byChannel, byStore }: { byChannel: DashboardSummary['byChannel']; byStore: DashboardSummary['byStore'] }) {
  const total = byChannel.reduce((s, c) => s + c.count, 0)
  const channels = (['OFFLINE', 'ONLINE'] as const).map((channel) => {
    const count = byChannel.find((c) => c.channel === channel)?.count ?? 0
    const stores = byStore.filter((r) => r.store.channel === channel && r.active > 0).sort((a, b) => b.active - a.active)
    return { channel, count, pct: total > 0 ? Math.round((count / total) * 100) : 0, stores }
  })

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">ช่องทาง</h3>
        <p className="text-xs text-muted-foreground">นับเฉพาะโปรเจกต์ที่ยังไม่ปิด (ร่าง · กำลังดำเนินการ · พักไว้)</p>
      </div>
      {total === 0 ? (
        <p className="rounded-lg bg-muted/60 px-3 py-4 text-center text-sm text-muted-foreground">ยังไม่มีโปรเจกต์ที่กำลังดำเนินการ</p>
      ) : (
        <>
          {/* proportion bar — 2px surface gap between the two parts */}
          <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={channels.map((c) => `${CHANNEL_SHORT[c.channel]} ${c.count} โปรเจกต์ (${c.pct}%)`).join(', ')}>
            {channels
              .filter((c) => c.count > 0)
              .map((c) => (
                <Tooltip key={c.channel}>
                  <TooltipTrigger asChild>
                    <span className="h-full transition-[flex-grow] duration-500" style={{ flexGrow: c.count, flexBasis: 0, backgroundColor: CHANNEL_COLOR[c.channel] }} />
                  </TooltipTrigger>
                  <TooltipContent>
                    {CHANNEL_LABEL[c.channel]}: {fmt(c.count)} โปรเจกต์ ({c.pct}%)
                  </TooltipContent>
                </Tooltip>
              ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {channels.map((c) => {
              const Icon = c.channel === 'OFFLINE' ? StoreIcon : GlobeIcon
              return (
                <div key={c.channel} className="min-w-0 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="h-2.5 w-3 shrink-0 rounded-[3px]" style={{ backgroundColor: CHANNEL_COLOR[c.channel] }} aria-hidden />
                    <Icon className="size-3.5" aria-hidden />
                    {CHANNEL_SHORT[c.channel]}
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl font-semibold">{fmt(c.count)}</span>
                    <span className="tabular text-xs text-muted-foreground">โปรเจกต์ · {c.pct}%</span>
                  </div>
                  {c.stores.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {c.stores.slice(0, 4).map((r) => (
                        <span key={r.store.id} className="inline-flex h-5 items-center gap-1 rounded-md bg-muted/70 px-1.5 text-[11px]" title={`${r.store.name}: ${r.active} โปรเจกต์`}>
                          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: r.store.color }} aria-hidden />
                          <span className="text-muted-foreground">{r.store.shortName}</span>
                          <span className="tabular font-semibold">{r.active}</span>
                        </span>
                      ))}
                      {c.stores.length > 4 && <span className="self-center text-[11px] text-muted-foreground">+{c.stores.length - 4}</span>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export function StatusChannelCard({ data, className }: { data: DashboardSummary; className?: string }) {
  const rows = useMemo<StatusRow[]>(
    () => STATUS_ORDER.map((status) => ({ status, label: STATUS_LABEL[status], count: data.byStatus.find((b) => b.status === status)?.count ?? 0 })),
    [data.byStatus],
  )
  const total = rows.reduce((s, r) => s + r.count, 0)

  const chart =
    total === 0 ? (
      <EmptyState icon={<PieChartIcon className="size-5" />} title="ยังไม่มีการเสนอสินค้า" description="เมื่อมีโปรเจกต์แรก จะเห็นสัดส่วนสถานะที่นี่" className="py-8" />
    ) : (
      <div style={{ height: rows.length * ROW_H + 8 }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 0 }} barCategoryGap={8}>
            <XAxis type="number" hide allowDecimals={false} domain={[0, 'dataMax']} />
            <YAxis
              type="category"
              dataKey="label"
              width={104}
              interval={0}
              tickLine={false}
              axisLine={{ stroke: 'var(--border)' }}
              tick={{ fontSize: 12, fill: 'var(--foreground)' }}
            />
            <RTooltip
              cursor={{ fill: 'var(--muted)', opacity: 0.7 }}
              isAnimationActive={false}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as StatusRow | undefined
                if (!active || !row) return null
                const c = STATUS_COLOR[row.status]
                return (
                  <ChartTooltipBox
                    title={row.label}
                    rows={[{ key: 'n', color: c.fill, opacity: c.opacity, label: 'โปรเจกต์', value: row.count }]}
                    footer={`${total > 0 ? Math.round((row.count / total) * 100) : 0}% ของทั้งหมด ${fmt(total)} โปรเจกต์`}
                  />
                )
              }}
            />
            <Bar dataKey="count" barSize={16} radius={[0, 4, 4, 0]} animationDuration={500}>
              {rows.map((r) => (
                <Cell key={r.status} fill={STATUS_COLOR[r.status].fill} fillOpacity={STATUS_COLOR[r.status].opacity ?? 1} />
              ))}
              <LabelList
                dataKey="count"
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
    <div className="space-y-4">
      <DataTable caption="จำนวนการเสนอสินค้าแยกตามสถานะ" head={['สถานะ', 'โปรเจกต์', 'สัดส่วน']} rows={rows.map((r) => [r.label, fmt(r.count), `${total > 0 ? Math.round((r.count / total) * 100) : 0}%`])} />
      <DataTable
        caption="โปรเจกต์ที่ยังไม่ปิดแยกตามช่องทาง"
        head={['ช่องทาง', 'โปรเจกต์ที่ยังไม่ปิด']}
        rows={data.byChannel.map((c) => [CHANNEL_LABEL[c.channel], fmt(c.count)])}
      />
    </div>
  )

  return (
    <ChartSection
      className={className}
      icon={<PieChartIcon />}
      title="สถานะและช่องทาง"
      description={`การเสนอสินค้าทั้งหมด ${fmt(total)} โปรเจกต์ แยกตามสถานะ`}
      chart={
        <div className="space-y-5">
          {chart}
          <div className="border-t pt-4">
            <ChannelSplit byChannel={data.byChannel} byStore={data.byStore} />
          </div>
        </div>
      }
      table={table}
    />
  )
}
