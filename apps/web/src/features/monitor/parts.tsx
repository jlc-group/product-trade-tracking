// Building blocks shared by the monitor dashboard sections.
import { BarChart3Icon, ChevronDownIcon, ChevronUpIcon, TableIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { fmt } from './utils'

/** Card for one dashboard section. `id` makes it a jump target for the KPI tiles. */
export function MonitorSection({
  id,
  title,
  description,
  icon,
  action,
  className,
  contentClassName,
  children,
}: {
  id?: string
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  action?: ReactNode
  className?: string
  contentClassName?: string
  children: ReactNode
}) {
  return (
    <Card id={id} className={cn('scroll-mt-20 gap-3', className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-semibold">
          {icon && <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>}
          {title}
        </CardTitle>
        {description && <CardDescription className="text-xs sm:text-sm">{description}</CardDescription>}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className={cn('min-w-0 flex-1', contentClassName)}>{children}</CardContent>
    </Card>
  )
}

/** Chart card with a chart ⇄ table switch, so no value is readable by hover alone. */
export function ChartSection({
  title,
  description,
  icon,
  legend,
  chart,
  table,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  legend?: ReactNode
  chart: ReactNode
  table: ReactNode
  className?: string
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  return (
    <MonitorSection
      title={title}
      description={description}
      icon={icon}
      className={className}
      action={
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          spacing={0}
          value={view}
          onValueChange={(v) => v && setView(v as 'chart' | 'table')}
          aria-label="รูปแบบการแสดงผล"
        >
          <ToggleGroupItem value="chart" aria-label="แสดงเป็นกราฟ" title="แสดงเป็นกราฟ">
            <BarChart3Icon />
          </ToggleGroupItem>
          <ToggleGroupItem value="table" aria-label="แสดงเป็นตาราง" title="แสดงเป็นตาราง">
            <TableIcon />
          </ToggleGroupItem>
        </ToggleGroup>
      }
    >
      {view === 'chart' ? (
        <div className="space-y-3">
          {legend && <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">{legend}</div>}
          {chart}
        </div>
      ) : (
        <div className="overflow-x-auto">{table}</div>
      )}
    </MonitorSection>
  )
}

/** Legend key — mirrors the mark (rect for bars, circle for point markers). */
export function LegendKey({ color, label, shape = 'rect', opacity = 1 }: { color: string; label: ReactNode; shape?: 'rect' | 'dot'; opacity?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('inline-block shrink-0', shape === 'rect' ? 'h-2.5 w-3 rounded-[3px]' : 'size-2.5 rounded-full')} style={{ backgroundColor: color, opacity }} aria-hidden />
      <span>{label}</span>
    </span>
  )
}

/** Tooltip panel for recharts: values lead, labels follow, line keys instead of boxes. */
export function ChartTooltipBox({ title, rows, footer }: { title: ReactNode; rows: { key: string; color: string; label: string; value: number; opacity?: number; strong?: boolean }[]; footer?: ReactNode }) {
  return (
    <div className="min-w-44 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <div className="mb-1.5 font-medium">{title}</div>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-2">
            <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: r.color, opacity: r.opacity ?? 1 }} aria-hidden />
            <span className={cn('tabular min-w-6 text-right font-semibold', r.strong && 'text-danger')}>{fmt(r.value)}</span>
            <span className="text-muted-foreground">{r.label}</span>
          </div>
        ))}
      </div>
      {footer && <div className="mt-1.5 border-t pt-1.5 text-muted-foreground">{footer}</div>}
    </div>
  )
}

/** "Show all N" / "Show less" toggle for long lists. */
export function ShowMoreButton({ expanded, hiddenCount, total, onToggle, noun = 'รายการ' }: { expanded: boolean; hiddenCount: number; total: number; onToggle: () => void; noun?: string }) {
  if (!expanded && hiddenCount <= 0) return null
  return (
    <Button variant="ghost" size="sm" className="mt-1 w-full text-muted-foreground" onClick={onToggle} aria-expanded={expanded}>
      {expanded ? (
        <>
          <ChevronUpIcon /> แสดงน้อยลง
        </>
      ) : (
        <>
          <ChevronDownIcon /> ดูทั้งหมด {fmt(total)} {noun} (อีก {fmt(hiddenCount)})
        </>
      )}
    </Button>
  )
}

/** Plain data table used by the chart ⇄ table switch. */
export function DataTable({ head, rows, caption }: { head: ReactNode[]; rows: ReactNode[][]; caption: string }) {
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="border-b text-xs text-muted-foreground">
          {head.map((h, i) => (
            <th key={i} scope="col" className={cn('py-2 font-medium whitespace-nowrap', i === 0 ? 'pr-3 text-left' : 'px-2 text-right')}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((cells, r) => (
          <tr key={r} className="border-b last:border-0">
            {cells.map((c, i) =>
              i === 0 ? (
                <th key={i} scope="row" className="py-2 pr-3 text-left font-normal">
                  {c}
                </th>
              ) : (
                <td key={i} className="tabular px-2 py-2 text-right">
                  {c}
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
