import { diffDays, earliestOnTimeLaunch, isLaunchDate, LAUNCH_DAY_OF_MONTH, launchDateOf, PREP_DAYS, prepStartOf, storeNamesLabel, type ISODate, type Store } from '@flowtrade/shared'
import { CalendarRangeIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, TriangleAlertIcon, ZapIcon } from 'lucide-react'
import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { ProposalListItem } from '@/api'
import { useProposals } from '@/api/hooks'
import { useAuth } from '@/auth/auth'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { dayjs, formatDate } from '@/lib/format'
import { usePrefs } from '@/lib/prefs'
import { cn } from '@/lib/utils'

/**
 * Pick a launch MONTH; the launch date is always the 15th.
 * value/onChange use the full date 'YYYY-MM-15'. Shows the preparation start (launch − PREP_DAYS),
 * past months disabled, short-preparation warnings, and other proposals' launches in each month
 * (stores in `storeIds` flagged as clashes; `excludeProposalId` hides the proposal being edited).
 */
export interface LaunchMonthPickerProps {
  value: ISODate | null
  onChange: (launchDate: ISODate) => void
  today: ISODate
  storeIds?: string[]
  excludeProposalId?: string
  /** Compact layout for dialogs. */
  compact?: boolean
}

type MonthStatus = 'past' | 'short' | 'onTime'

interface MonthCell {
  index: number
  launch: ISODate
  prep: ISODate
  status: MonthStatus
  /** Days from today until launch. */
  left: number
  others: ProposalListItem[]
  /** Other proposals' stores launching this month (grouped), clashes first. */
  stores: { store: Pick<Store, 'id' | 'name' | 'shortName' | 'color'>; count: number; clash: boolean }[]
  clashes: ProposalListItem[]
}

const YEARS_AHEAD = 5
const yearOf = (date: ISODate) => Number(date.slice(0, 4))

export function LaunchMonthPicker({ value, onChange, today, storeIds = [], excludeProposalId, compact = false }: LaunchMonthPickerProps) {
  const { buddhistEra } = usePrefs()
  const { can } = useAuth()
  const earliest = earliestOnTimeLaunch(today)
  const minYear = Math.min(yearOf(today), value ? yearOf(value) : Infinity)
  const maxYear = Math.max(yearOf(today) + YEARS_AHEAD, value ? yearOf(value) : 0)

  const [year, setYear] = useState(() => yearOf(value ?? earliest))
  // Follow the value when it changes from outside (the "earliest" button, a reset, a dialog reopening).
  const [syncedValue, setSyncedValue] = useState(value)
  if (syncedValue !== value) {
    setSyncedValue(value)
    if (value) setYear(yearOf(value))
  }

  const gridRef = useRef<HTMLDivElement>(null)
  const { data: proposals = [] } = useProposals({ scope: can('proposal.read.all') ? 'all' : 'mine', status: 'ACTIVE' })
  const byMonth = useMemo(() => {
    const map = new Map<string, ProposalListItem[]>()
    for (const p of proposals) {
      if (p.id === excludeProposalId || !p.targetDate) continue
      const month = p.targetDate.slice(0, 7)
      map.set(month, [...(map.get(month) ?? []), p])
    }
    return map
  }, [proposals, excludeProposalId])

  const yearText = (y: number) => (buddhistEra ? `พ.ศ. ${dayjs(`${y}-01-01`).format('BBBB')}` : `ค.ศ. ${y}`)
  const legacyValue = value && !isLaunchDate(value) ? value : null

  const sharesStore = (p: ProposalListItem) => p.storeIds.some((id) => storeIds.includes(id))
  const months: MonthCell[] = Array.from({ length: 12 }, (_, index) => {
    const launch = launchDateOf(year, index + 1)
    const prep = prepStartOf(launch)
    const status: MonthStatus = launch < today ? 'past' : prep < today ? 'short' : 'onTime'
    const others = byMonth.get(launch.slice(0, 7)) ?? []
    const clashes = others.filter(sharesStore)
    const grouped = new Map<string, MonthCell['stores'][number]>()
    for (const p of others) {
      for (const store of p.stores) {
        const entry = grouped.get(store.id)
        if (entry) entry.count++
        else grouped.set(store.id, { store, count: 1, clash: storeIds.includes(store.id) })
      }
    }
    const stores = [...grouped.values()].sort((a, b) => Number(b.clash) - Number(a.clash))
    return { index, launch, prep, status, left: diffDays(today, launch), others, stores, clashes }
  })
  const selectedCell = value ? months.find((m) => m.launch.slice(0, 7) === value.slice(0, 7)) : undefined
  const selectedClashes = value ? (byMonth.get(value.slice(0, 7)) ?? []).filter(sharesStore) : []
  const clashStoreNames = [...new Set(selectedClashes.flatMap((p) => p.stores.filter((s) => storeIds.includes(s.id)).map((s) => s.name)))]

  const jumpToEarliest = () => {
    setYear(yearOf(earliest))
    onChange(earliest)
  }

  // Arrow keys move between months (skipping past ones); Home/End jump to the first/last open month.
  const onGridKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const grid = gridRef.current
    const target = e.target as HTMLElement
    const index = Number(target.dataset.month ?? Number.NaN)
    if (!grid || Number.isNaN(index)) return
    const buttons = Array.from(grid.querySelectorAll<HTMLButtonElement>('button[data-month]'))
    const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length || 1
    const steps: Partial<Record<string, number>> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }
    let next = -1
    if (e.key === 'Home') next = buttons.findIndex((b) => !b.disabled)
    else if (e.key === 'End') {
      for (let i = buttons.length - 1; i >= 0; i--) {
        if (!buttons[i].disabled) {
          next = i
          break
        }
      }
    } else {
      const step = steps[e.key]
      if (!step) return
      let i = index + step
      while (i >= 0 && i < buttons.length && buttons[i].disabled) i += step
      next = i
    }
    if (next < 0 || next >= buttons.length) return
    e.preventDefault()
    buttons[next].focus()
  }

  return (
    <div className={cn('@container rounded-xl border bg-card', compact && 'rounded-lg')}>
      {/* Header: year switcher */}
      <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 border-b', compact ? 'px-2.5 py-2' : 'px-3 py-2.5 sm:px-4')}>
        <CalendarRangeIcon className="size-4 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-medium">เลือกเดือนวางขาย</p>
          {!compact && (
            <p className="text-[11px] text-muted-foreground">
              วางขายวันที่ {LAUNCH_DAY_OF_MONTH} ของเดือนเสมอ · เตรียมงานล่วงหน้า {PREP_DAYS} วัน
            </p>
          )}
        </div>
        <div className="ml-auto flex items-center gap-0.5">
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => setYear((y) => y - 1)} disabled={year <= minYear} aria-label={`ปีก่อนหน้า (${yearText(year - 1)})`}>
            <ChevronLeftIcon />
          </Button>
          <p className="tabular min-w-24 text-center text-sm font-semibold" aria-live="polite">
            {yearText(year)}
          </p>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => setYear((y) => y + 1)} disabled={year >= maxYear} aria-label={`ปีถัดไป (${yearText(year + 1)})`}>
            <ChevronRightIcon />
          </Button>
        </div>
      </div>

      <div className={cn('space-y-2.5', compact ? 'p-2' : 'p-2.5 sm:p-3')}>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={value === earliest}
            onClick={jumpToEarliest}
            className="aria-pressed:border-primary aria-pressed:bg-brand-soft aria-pressed:text-brand"
          >
            <ZapIcon />
            เร็วที่สุดที่ทันเวลา {PREP_DAYS} วัน
            <span className="tabular font-normal text-muted-foreground">· {formatDate(earliest, { withYear: !compact })}</span>
          </Button>
          {legacyValue && (
            <p className="text-xs text-muted-foreground">
              วันที่เดิม {formatDate(legacyValue, { long: true })} ไม่ใช่วันที่ {LAUNCH_DAY_OF_MONTH} — เลือกเดือนเพื่อปรับให้ตรงรอบวางขาย
            </p>
          )}
        </div>

        <div
          ref={gridRef}
          role="group"
          aria-label={`เดือนวางขาย ${yearText(year)} — ใช้ปุ่มลูกศรเพื่อเลื่อนระหว่างเดือน`}
          onKeyDown={onGridKeyDown}
          className={cn('grid', compact ? 'grid-cols-2 gap-1.5 @sm:grid-cols-3' : 'grid-cols-2 gap-2 @lg:grid-cols-3')}
        >
          {months.map((m) => (
            <MonthTile
              key={m.launch}
              cell={m}
              year={year}
              today={today}
              selected={value === m.launch}
              legacy={!!legacyValue && selectedCell === m}
              earliest={m.launch === earliest}
              compact={compact}
              onSelect={() => onChange(m.launch)}
            />
          ))}
        </div>

        {selectedClashes.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning-foreground" role="status">
            <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
            <span>
              เดือนนี้มีสินค้าวางขายที่ {clashStoreNames.join(', ')} อยู่แล้ว ({selectedClashes.map((p) => p.code).join(', ')}) — เลือกได้
              แต่ควรคุยกับทีมก่อน
            </span>
          </div>
        )}

        {!compact && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-0.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded bg-primary" /> เดือนที่เลือก
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded border border-warning/50 bg-warning-soft" /> เวลาเตรียมไม่ครบ {PREP_DAYS} วัน
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-5 rounded bg-muted-foreground/60" /> วางขายของโปรเจกต์อื่น
            </span>
            {storeIds.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <TriangleAlertIcon className="size-3 text-warning" /> ห้างเดียวกันวางขายเดือนเดียวกัน
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function MonthTile({
  cell,
  year,
  today,
  selected,
  legacy,
  earliest,
  compact,
  onSelect,
}: {
  cell: MonthCell
  year: number
  today: ISODate
  selected: boolean
  /** The month of a legacy (non-15th) value — outlined so the user sees where it was. */
  legacy: boolean
  earliest: boolean
  compact: boolean
  onSelect: () => void
}) {
  const { launch, prep, status, left, others, stores, clashes } = cell
  const past = status === 'past'
  const short = status === 'short'
  const monthName = dayjs(launch).format('MMMM')
  const thisMonth = launch.slice(0, 7) === today.slice(0, 7)
  const maxChips = compact ? 2 : 3
  const sub = selected ? 'text-primary-foreground/80' : 'text-muted-foreground'

  const ariaLabel = [
    `วางขาย ${formatDate(launch, { long: true })}`,
    `เริ่มเตรียม ${formatDate(prep, { long: true })}`,
    past ? 'ผ่านไปแล้ว เลือกไม่ได้' : short ? `เหลือเวลาเตรียม ${left} วัน ไม่ครบ ${PREP_DAYS} วัน` : `เตรียมได้ครบ ${PREP_DAYS} วัน`,
    others.length ? `มีโปรเจกต์อื่นวางขายเดือนนี้ ${others.length} รายการ` : '',
    clashes.length ? `ในจำนวนนี้ ${clashes.length} รายการเป็นห้างเดียวกับที่เลือก` : '',
  ]
    .filter(Boolean)
    .join(' · ')

  const button = (
    <button
      type="button"
      data-month={cell.index}
      disabled={past}
      aria-pressed={selected}
      aria-label={ariaLabel}
      onClick={onSelect}
      className={cn(
        'group relative flex min-w-0 flex-col items-start gap-0.5 rounded-lg border text-left transition outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        compact ? 'min-h-[4.5rem] px-2 py-1.5' : 'min-h-[6.5rem] px-3 py-2.5',
        past && 'cursor-not-allowed border-dashed bg-muted/30 text-muted-foreground/60',
        !past && !selected && short && 'border-warning/45 bg-warning-soft/35 hover:border-warning hover:bg-warning-soft/70',
        !past && !selected && !short && 'bg-background hover:border-primary/50 hover:bg-accent/40',
        selected && 'border-primary bg-primary text-primary-foreground shadow-sm',
        legacy && !selected && 'border-dashed border-primary/60',
      )}
    >
      <span className="flex w-full items-center justify-between gap-1">
        <span className={cn('truncate font-semibold', compact ? 'text-sm' : 'text-base')}>{monthName}</span>
        {selected ? (
          <CheckIcon className="size-4 shrink-0" strokeWidth={3} aria-hidden />
        ) : clashes.length > 0 && !past ? (
          <TriangleAlertIcon className="size-3.5 shrink-0 text-warning" aria-hidden />
        ) : thisMonth && !compact ? (
          <span className="shrink-0 rounded bg-muted px-1 text-[10px] font-medium text-muted-foreground">เดือนนี้</span>
        ) : null}
      </span>
      {!compact && <span className={cn('tabular text-xs', sub)}>วันที่ {LAUNCH_DAY_OF_MONTH}</span>}
      {!past && (
        <span className={cn('tabular text-[11px] leading-tight', sub)}>
          {compact ? 'เริ่ม' : 'เริ่มเตรียม'} {formatDate(prep, { withYear: yearOf(prep) !== year })}
        </span>
      )}

      {past ? (
        <span className="text-[11px]">ผ่านไปแล้ว</span>
      ) : short ? (
        <span className={cn('tabular inline-flex items-center gap-1 text-[11px] font-medium', selected ? 'text-primary-foreground' : 'text-warning-foreground')}>
          <TriangleAlertIcon className="size-3 shrink-0" aria-hidden />
          เหลือเตรียม {left} วัน
        </span>
      ) : earliest && !selected ? (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-brand">
          <ZapIcon className="size-3 shrink-0" aria-hidden />
          เร็วสุดที่ทันเวลา
        </span>
      ) : null}

      {stores.length > 0 && (
        <span className="mt-auto flex flex-wrap items-center gap-0.5 pt-0.5" aria-hidden>
          {stores.slice(0, maxChips).map(({ store, count, clash }) => (
            <span
              key={store.id}
              className={cn('h-4 max-w-full truncate rounded px-1 text-[9px] leading-4 font-bold text-white', clash && 'ring-2 ring-warning ring-offset-1 ring-offset-card')}
              style={{ backgroundColor: store.color }}
            >
              {store.shortName}
              {count > 1 && <span className="font-medium opacity-85"> ×{count}</span>}
            </span>
          ))}
          {stores.length > maxChips && <span className={cn('text-[9px]', sub)}>+{stores.length - maxChips}</span>}
        </span>
      )}
    </button>
  )

  if (others.length === 0 || past) return button
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent className="max-w-72">
        <div className="space-y-1">
          <p className="font-medium">
            วางขายเดือนนี้ {others.length} โปรเจกต์{clashes.length > 0 ? ` · ห้างเดียวกัน ${clashes.length}` : ''}
          </p>
          {others.slice(0, 5).map((p) => (
            <p key={p.id} className="truncate">
              {storeNamesLabel(p.stores.map((s) => s.name))} · {p.code} · {formatDate(p.targetDate, { withYear: false })}
            </p>
          ))}
          {others.length > 5 && <p className="opacity-80">และอีก {others.length - 5} โปรเจกต์</p>}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
