import { addDays, diffDays, LEVEL_LABEL, PREP_DAYS, prepStartOf, type ISODate, type TaskLevel } from '@flowtrade/shared'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronRightIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  CornerDownRightIcon,
  EllipsisVerticalIcon,
  FlagIcon,
  ListTreeIcon,
  PlayIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
  TriangleAlertIcon,
  Undo2Icon,
} from 'lucide-react'
import { useId, useMemo, useState, type Dispatch, type KeyboardEvent, type ReactNode } from 'react'
import { ThaiCalendar } from '@/components/common/date-field'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { dayjs, formatDate, spanDays } from '@/lib/format'
import { cn } from '@/lib/utils'
import { departmentColor, departmentCounts, departmentOptions } from './department'
import { newPlanKey, offsetFor, type PlanAction, type PlanRow } from './plan-state'

interface Scale {
  start: ISODate
  days: number
}

interface Tick {
  date: ISODate
  pct: number
  label: string
}

/** One grid for the sticky header and every row (wide layouts), so the columns line up. */
const ROW_GRID = '@4xl:grid-cols-[minmax(0,1.7fr)_8.5rem_13.5rem_minmax(6rem,1fr)_2rem]'

const pct = (scale: Scale, date: ISODate) => (diffDays(scale.start, date) / scale.days) * 100

/** Stops the wizard's global "Enter = next step" while typing here. */
const swallowEnter = (e: KeyboardEvent, onEnter?: () => void) => {
  if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
  e.preventDefault()
  onEnter?.()
}

/** Month boundaries inside the scale (labels thinned out when there are many). */
function monthTicks(scale: Scale): Tick[] {
  const end = addDays(scale.start, scale.days - 1)
  const out: Tick[] = []
  let d = dayjs(scale.start).startOf('month').add(1, 'month')
  while (d.format('YYYY-MM-DD') <= end && out.length < 60) {
    const date = d.format('YYYY-MM-DD')
    out.push({ date, pct: pct(scale, date), label: d.format('MMM') })
    d = d.add(1, 'month')
  }
  const every = Math.max(1, Math.ceil(out.length / 6))
  return out.map((t, i) => (i % every === 0 ? t : { ...t, label: '' }))
}

export function TimelineEditor({
  rows,
  targetDate,
  today,
  dispatch,
  templateName,
  edited,
  onReset,
  dateLabel,
  expandMainTasks = true,
}: {
  rows: PlanRow[]
  targetDate: ISODate
  today: ISODate
  dispatch: Dispatch<PlanAction>
  templateName: string | null
  edited: boolean
  onReset: (() => void) | null
  dateLabel: string
  /** Main tasks start expanded so their sub tasks are visible right away. */
  expandMainTasks?: boolean
}) {
  const listId = useId()
  /** Rows the user expanded/collapsed by hand; everything else follows the default. */
  const [openState, setOpenState] = useState<Record<string, boolean>>({})
  const [addingUnder, setAddingUnder] = useState<string | null>(null)

  const prepStart = prepStartOf(targetDate)
  const included = rows.filter((r) => !r.excluded)
  const scale = useMemo<Scale>(() => {
    // Start at the preparation start (or today when the window is already short), or earlier if a task does.
    const anchor = prepStart > today ? prepStart : today
    const start = [anchor, ...included.map((r) => r.startDate)].sort()[0]
    const end = [targetDate, ...included.map((r) => r.dueDate)].sort().at(-1)!
    return { start, days: Math.max(1, diffDays(start, end) + 1) }
  }, [included, today, targetDate, prepStart])
  const ticks = useMemo(() => monthTicks(scale), [scale])
  const departments = useMemo(() => departmentOptions(rows.map((r) => r.responsible)), [rows])

  const roots = rows.filter((r) => r.parentKey === null)
  const childrenOf = (key: string) => rows.filter((r) => r.parentKey === key)
  const firstAfter = roots.findIndex((r) => r.startDate >= targetDate && r.dueDate > targetDate)
  const launchIndex = firstAfter === -1 ? roots.length : firstAfter
  const counts = { 1: 0, 2: 0, 3: 0 } as Record<TaskLevel, number>
  for (const r of included) counts[r.level]++
  const customCount = included.filter((r) => r.custom).length
  const clampedCount = included.filter((r) => r.clamped).length
  const deptCounts = departmentCounts(included.map((r) => r.responsible))

  const parents = rows.filter((r) => r.childCount > 0)
  const isOpen = (row: PlanRow) => openState[row.key] ?? (expandMainTasks && row.level === 1)
  const allOpen = parents.length > 0 && parents.every(isOpen)
  const setAll = (open: boolean) => setOpenState(Object.fromEntries(parents.map((r) => [r.key, open])))
  const toggle = (row: PlanRow) => setOpenState((prev) => ({ ...prev, [row.key]: !isOpen(row) }))
  const startAdd = (row: PlanRow) => {
    setOpenState((prev) => ({ ...prev, [row.key]: true }))
    setAddingUnder(row.key)
  }

  const renderRow = (row: PlanRow) => {
    const kids = childrenOf(row.key)
    const open = isOpen(row)
    const siblings = rows.filter((r) => r.parentKey === row.parentKey)
    const index = siblings.indexOf(row)
    return (
      <li key={row.key}>
        <TimelineRow
          row={row}
          open={open}
          hasChildren={kids.length > 0}
          onToggle={() => toggle(row)}
          onAddChild={row.level < 3 ? () => startAdd(row) : null}
          dispatch={dispatch}
          targetDate={targetDate}
          today={today}
          scale={scale}
          ticks={ticks}
          prepStart={prepStart}
          listId={listId}
          canMoveUp={index > 0}
          canMoveDown={index < siblings.length - 1}
        />
        {open && (
          <ul className="space-y-px">
            {kids.map(renderRow)}
            {row.level < 3 && !row.excluded && (
              <li>
                {addingUnder === row.key ? (
                  <AddTaskRow parent={row} targetDate={targetDate} today={today} dispatch={dispatch} listId={listId} onDone={() => setAddingUnder(null)} />
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingUnder(row.key)}
                    className="flex w-full items-center gap-1.5 rounded-md py-1 text-left text-xs text-muted-foreground hover:bg-muted/50 hover:text-primary"
                    style={{ paddingLeft: `${row.level * 1.25 + 0.5}rem` }}
                  >
                    <PlusIcon className="size-3.5" />
                    เพิ่ม {LEVEL_LABEL[(row.level + 1) as TaskLevel]} ใต้ “{row.title || 'งานนี้'}”
                  </button>
                )}
              </li>
            )}
          </ul>
        )}
      </li>
    )
  }

  return (
    <section className="@container rounded-xl border bg-card" data-wizard-no-enter aria-labelledby="timeline-title">
      <datalist id={listId}>
        {departments.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>

      <div className="flex flex-wrap items-start gap-3 border-b px-4 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <ListTreeIcon className="size-4" />
        </span>
        <div className="min-w-0 flex-1 basis-64">
          <h3 id="timeline-title" className="text-sm font-semibold">
            ไทม์ไลน์งานและแผนกที่รับผิดชอบ
          </h3>
          <p className="text-xs text-muted-foreground">
            ระบบวางทุกงานไว้ในช่วงเตรียม {PREP_DAYS} วันก่อน{dateLabel}ให้แล้ว — แก้ชื่อ แผนก วันเริ่ม หรือระยะเวลาได้ทันที และพิมพ์เพิ่มงานของคุณเองได้ เปลี่ยนเดือนวางขาย งานทั้งหมดจะเลื่อนตาม
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {templateName && (
            <span className="max-w-64 truncate rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground" title={templateName}>
              แม่แบบ: {templateName}
            </span>
          )}
          {parents.length > 0 && (
            <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setAll(!allOpen)}>
              {allOpen ? <ChevronsDownUpIcon /> : <ChevronsUpDownIcon />}
              {allOpen ? 'ย่อทั้งหมด' : 'ขยายทั้งหมด'}
            </Button>
          )}
          {edited && onReset && (
            <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={onReset}>
              <RotateCcwIcon />
              ใช้ตามแม่แบบ
            </Button>
          )}
        </div>
      </div>

      {clampedCount > 0 && (
        <p className="flex items-start gap-2 border-b bg-warning-soft/60 px-4 py-2 text-xs text-warning-foreground" role="status">
          <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
          <span className="tabular">
            {clampedCount} งานควรเริ่มก่อนวันนี้ (เวลาเตรียมไม่ครบ {PREP_DAYS} วัน) จึงเลื่อนมาเริ่มวันนี้ — วันเริ่มที่เป็นสีส้มคืองานเหล่านี้
          </span>
        </p>
      )}

      {/* Sticky column header with the time scale (wide layouts) */}
      <div
        className={cn(
          'sticky top-14 z-10 hidden items-end gap-x-2 border-b bg-card/95 px-3 py-1.5 text-[10px] font-medium text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-card/85 @4xl:grid',
          ROW_GRID,
        )}
      >
        <span className="pl-7">งาน</span>
        <span>แผนกที่รับผิดชอบ</span>
        <span>วันเริ่ม – ครบกำหนด · วัน</span>
        <ScaleHeader scale={scale} ticks={ticks} targetDate={targetDate} prepStart={prepStart} today={today} />
        <span />
      </div>

      <ol className="space-y-px p-2">
        <PrepRow prepStart={prepStart} today={today} scale={scale} />
        {roots.map((row, i) => (
          <FragmentWithLaunch key={row.key} showLaunch={i === launchIndex} targetDate={targetDate} scale={scale} label={dateLabel}>
            {renderRow(row)}
          </FragmentWithLaunch>
        ))}
        {launchIndex === roots.length && <LaunchRow targetDate={targetDate} scale={scale} label={dateLabel} />}
        {roots.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">ยังไม่มีงาน — พิมพ์ชื่องานแรกในช่องด้านล่างได้เลย</li>}
      </ol>

      <div className="border-t p-2">
        <AddTaskRow parent={null} targetDate={targetDate} today={today} dispatch={dispatch} listId={listId} />
      </div>

      <div className="tabular flex flex-wrap items-center gap-x-3 gap-y-1 border-t bg-muted/30 px-4 py-2 text-xs text-muted-foreground" aria-live="polite">
        <span>
          จะสร้าง <span className="font-semibold text-foreground">{included.length}</span> งาน
        </span>
        <span>
          Task {counts[1]} · Sub task {counts[2]} · Mini task {counts[3]}
        </span>
        {customCount > 0 && <span className="text-brand">เพิ่มเอง {customCount} งาน</span>}
        {rows.length - included.length > 0 && <span>ไม่ใช้ {rows.length - included.length} งาน</span>}
        {deptCounts.list.length > 0 && (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span>แผนก:</span>
            {deptCounts.list.map((d) => (
              <span key={d.name} className="inline-flex items-center gap-1">
                <span className="size-2 rounded-full" style={{ backgroundColor: departmentColor(d.name) }} aria-hidden />
                {d.name} {d.count}
              </span>
            ))}
            {deptCounts.unassigned > 0 && <span>· ยังไม่ระบุ {deptCounts.unassigned}</span>}
          </span>
        )}
      </div>
    </section>
  )
}

function ScaleHeader({ scale, ticks, targetDate, prepStart, today }: { scale: Scale; ticks: Tick[]; targetDate: ISODate; prepStart: ISODate; today: ISODate }) {
  const launch = pct(scale, targetDate)
  const showToday = today >= scale.start && today <= addDays(scale.start, scale.days - 1) && today !== prepStart
  return (
    <span className="relative block h-8 overflow-hidden" aria-hidden>
      <span className="absolute top-0 left-0 whitespace-nowrap">{formatDate(scale.start, { withYear: false })}</span>
      {ticks.map(
        (t) =>
          t.label && (
            <span key={t.date} className="absolute top-3.5 pl-0.5 whitespace-nowrap" style={{ left: `${t.pct}%` }}>
              {t.label}
            </span>
          ),
      )}
      {ticks.map((t) => (
        <span key={`${t.date}-tick`} className="absolute bottom-0 h-1.5 w-px bg-border" style={{ left: `${t.pct}%` }} />
      ))}
      {showToday && <span className="absolute bottom-0 h-3 w-0.5 rounded bg-foreground/60" style={{ left: `${pct(scale, today)}%` }} title="วันนี้" />}
      <FlagIcon className="absolute top-0 size-3 text-success" style={{ left: `calc(${launch}% - 1px)` }} />
    </span>
  )
}

function FragmentWithLaunch({ showLaunch, children, targetDate, scale, label }: { showLaunch: boolean; children: ReactNode; targetDate: ISODate; scale: Scale; label: string }) {
  return (
    <>
      {showLaunch && <LaunchRow targetDate={targetDate} scale={scale} label={label} />}
      {children}
    </>
  )
}

/** "Preparation starts" marker at the top: the launch date back-tracked PREP_DAYS. */
function PrepRow({ prepStart, today, scale }: { prepStart: ISODate; today: ISODate; scale: Scale }) {
  const short = prepStart < today
  return (
    <li className={cn('grid items-center gap-x-2 rounded-md border px-1 py-1', ROW_GRID, short ? 'border-warning/40 bg-warning-soft/50' : 'border-brand/25 bg-brand-soft/60')}>
      <p className={cn('flex flex-wrap items-center gap-x-2 pl-1.5 text-xs font-medium @4xl:col-span-3', short ? 'text-warning-foreground' : 'text-brand')}>
        <PlayIcon className="size-3.5" />
        เริ่มเตรียมงาน · {formatDate(prepStart, { long: true })}
        <span className="font-normal opacity-80">
          (นับย้อนหลัง {PREP_DAYS} วันจากวันวางขาย{short ? ` — เลยมาแล้ว งานจึงเริ่มวันนี้ ${formatDate(today, { withYear: false })}` : ''})
        </span>
      </p>
      <span className="relative hidden h-3 @4xl:block" aria-hidden>
        <span className={cn('absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded', short ? 'bg-warning' : 'bg-brand')} style={{ left: `${Math.max(0, pct(scale, short ? today : prepStart))}%` }} />
      </span>
      <span className="hidden @4xl:block" />
    </li>
  )
}

function LaunchRow({ targetDate, scale, label }: { targetDate: ISODate; scale: Scale; label: string }) {
  return (
    <li className={cn('grid items-center gap-x-2 rounded-md border border-success/30 bg-success-soft/60 px-1 py-1', ROW_GRID)}>
      <p className="flex items-center gap-2 pl-1.5 text-xs font-medium text-success @4xl:col-span-3">
        <FlagIcon className="size-3.5" />
        {label} · {formatDate(targetDate, { long: true })}
      </p>
      <span className="relative hidden h-3 @4xl:block" aria-hidden>
        <span className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded bg-success" style={{ left: `${pct(scale, targetDate)}%` }} />
      </span>
      <span className="hidden @4xl:block" />
    </li>
  )
}

function DateButton({ value, onChange, min, ariaLabel, warning }: { value: ISODate; onChange: (d: ISODate) => void; min?: ISODate; ariaLabel: string; warning?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className={cn(
            'tabular h-7 rounded-md border border-transparent px-1.5 text-xs whitespace-nowrap hover:border-input hover:bg-background focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none',
            warning && 'bg-warning-soft font-medium text-warning-foreground',
          )}
        >
          {formatDate(value, { withYear: false })}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <ThaiCalendar
          selected={value}
          min={min}
          onSelect={(d) => {
            if (d) onChange(d)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

/** Free-text department with suggestions (datalist): '' means "not set". */
function DepartmentInput({
  value,
  onChange,
  listId,
  label,
  disabled,
  onEnter,
  className,
}: {
  value: string
  onChange: (value: string) => void
  listId: string
  label: string
  disabled?: boolean
  onEnter?: () => void
  className?: string
}) {
  const name = value.trim()
  return (
    <label className={cn('relative flex w-[8.5rem] shrink-0 items-center', className)}>
      <span className="sr-only">{label}</span>
      <span
        aria-hidden
        className={cn('pointer-events-none absolute left-2 size-2 rounded-full', !name && 'border border-dashed border-muted-foreground/60')}
        style={name ? { backgroundColor: departmentColor(name) } : undefined}
      />
      <Input
        list={listId}
        value={value}
        disabled={disabled}
        maxLength={80}
        placeholder="ระบุแผนก"
        title={name || 'ยังไม่ระบุแผนก'}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
          e.preventDefault()
          if (onEnter) onEnter()
          else e.currentTarget.blur()
        }}
        className="h-7 pr-1.5 pl-5 text-xs"
      />
    </label>
  )
}

function TimelineRow({
  row,
  open,
  hasChildren,
  onToggle,
  onAddChild,
  dispatch,
  targetDate,
  today,
  scale,
  ticks,
  prepStart,
  listId,
  canMoveUp,
  canMoveDown,
}: {
  row: PlanRow
  open: boolean
  hasChildren: boolean
  onToggle: () => void
  onAddChild: (() => void) | null
  dispatch: Dispatch<PlanAction>
  targetDate: ISODate
  today: ISODate
  scale: Scale
  ticks: Tick[]
  prepStart: ISODate
  listId: string
  canMoveUp: boolean
  canMoveDown: boolean
}) {
  const days = spanDays(row.startDate, row.dueDate) ?? 1
  const left = pct(scale, row.startDate)
  const width = Math.max(1.2, (days / scale.days) * 100)
  const titleId = `plan-title-${row.key}`
  const name = row.title || 'งานนี้'
  const prepLeft = Math.max(0, pct(scale, prepStart))
  const launch = pct(scale, targetDate)
  const afterLaunch = row.dueDate > targetDate && row.startDate < targetDate && !row.excluded

  const setStart = (d: ISODate) => dispatch({ type: 'plan/shift', key: row.key, days: offsetFor(targetDate, d) - offsetFor(targetDate, row.startDate) })
  const setDue = (d: ISODate) => dispatch({ type: 'plan/update', key: row.key, patch: { startOffset: offsetFor(targetDate, row.startDate), dueOffset: offsetFor(targetDate, d) } })
  const setDuration = (n: number) => {
    if (!Number.isFinite(n) || n < 1) return
    const start = offsetFor(targetDate, row.startDate)
    dispatch({ type: 'plan/update', key: row.key, patch: { startOffset: start, dueOffset: start + Math.min(n, 730) - 1 } })
  }

  return (
    <div
      className={cn(
        'group flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md px-1 py-0.5 transition-colors hover:bg-muted/40 @4xl:grid',
        ROW_GRID,
        row.level === 1 && 'bg-muted/35',
        row.excluded && 'opacity-55',
      )}
    >
      {/* Title */}
      <div className="flex min-w-0 flex-1 basis-64 items-center gap-1" style={{ paddingLeft: `${(row.level - 1) * 1.25}rem` }}>
        {hasChildren ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={`${open ? 'ย่อ' : 'ขยาย'}งานย่อยของ ${name}`}
            className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronRightIcon className={cn('size-4 transition-transform', open && 'rotate-90')} />
          </button>
        ) : row.level > 1 ? (
          <CornerDownRightIcon className="mx-1 size-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
        ) : (
          <span className="size-6 shrink-0" aria-hidden />
        )}
        <label htmlFor={titleId} className="sr-only">
          ชื่องาน
        </label>
        <Input
          id={titleId}
          value={row.title}
          title={row.title}
          disabled={row.excluded}
          onChange={(e) => dispatch({ type: 'plan/update', key: row.key, patch: { title: e.target.value } })}
          onKeyDown={(e) => swallowEnter(e, () => (e.target as HTMLInputElement).blur())}
          placeholder="ชื่องาน"
          aria-invalid={!row.title.trim() || undefined}
          className={cn(
            'h-7 min-w-0 flex-1 border-transparent bg-transparent px-1.5 text-sm shadow-none hover:border-input focus-visible:bg-background',
            row.level === 1 && 'font-medium',
            row.excluded && 'line-through',
          )}
        />
        {row.custom && <span className="shrink-0 rounded bg-brand-soft px-1.5 py-0.5 text-[10px] font-medium text-brand">เพิ่มเอง</span>}
        {hasChildren && !open && <span className="tabular shrink-0 text-[11px] text-muted-foreground">{row.childCount} งานย่อย</span>}
        {afterLaunch && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="inline-flex shrink-0 items-center rounded bg-info-soft px-1 text-[10px] font-medium text-info">
                หลังวางขาย
              </span>
            </TooltipTrigger>
            <TooltipContent>งานนี้ครบกำหนดหลังวันวางขาย</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Department · dates · bar · actions (wraps under the title on narrow layouts) */}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5 @4xl:contents">
        <DepartmentInput
          value={row.responsible ?? ''}
          onChange={(v) => dispatch({ type: 'plan/update', key: row.key, patch: { responsible: v === '' ? null : v } })}
          listId={listId}
          label={`แผนกที่รับผิดชอบ ${name}`}
          disabled={row.excluded}
        />

        <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
          <DateButton
            value={row.startDate}
            min={today}
            onChange={setStart}
            warning={row.clamped && !row.excluded}
            ariaLabel={`วันเริ่มของ ${name}${row.clamped ? ' (เลื่อนมาเริ่มวันนี้)' : ''}`}
          />
          <span aria-hidden>–</span>
          <DateButton value={row.dueDate} min={row.startDate} onChange={setDue} ariaLabel={`วันครบกำหนดของ ${name}`} />
          <label className="ml-1 flex items-center gap-1">
            <span className="sr-only">ระยะเวลา (วัน) ของ {name}</span>
            <Input
              type="number"
              min={1}
              max={730}
              inputMode="numeric"
              value={days}
              disabled={row.excluded}
              onChange={(e) => setDuration(Number(e.target.value))}
              onKeyDown={(e) => swallowEnter(e)}
              className="tabular h-7 w-12 px-1.5 text-right text-xs"
            />
            <span>วัน</span>
          </label>
        </div>

        {/* Gantt bar */}
        <div className="relative hidden h-4 overflow-hidden rounded bg-muted/50 @4xl:block" aria-hidden>
          <span className="absolute inset-y-0 bg-brand-soft" style={{ left: `${prepLeft}%`, width: `${Math.max(0, launch - prepLeft)}%` }} />
          {ticks.map((t) => (
            <span key={t.date} className="absolute inset-y-0 w-px bg-border" style={{ left: `${t.pct}%` }} />
          ))}
          <span className="absolute inset-y-0 w-px bg-success/70" style={{ left: `${launch}%` }} />
          <span
            className={cn(
              'absolute top-1/2 h-2 -translate-y-1/2 rounded-full',
              row.excluded ? 'bg-muted-foreground/30' : row.custom ? 'bg-brand/70' : row.clamped ? 'bg-warning' : row.level === 1 ? 'bg-primary' : 'bg-primary/55',
            )}
            style={{ left: `${Math.min(left, 99)}%`, width: `${Math.min(width, 100 - Math.min(left, 99))}%` }}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end">
          {row.excluded ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={`นำ ${name} กลับมาใช้`} onClick={() => dispatch({ type: 'plan/restore', key: row.key })}>
                  <Undo2Icon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>นำกลับมาใช้</TooltipContent>
            </Tooltip>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`ตัวเลือกของ ${name}`} className="text-muted-foreground">
                  <EllipsisVerticalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {onAddChild && (
                  <DropdownMenuItem onSelect={onAddChild}>
                    <PlusIcon /> เพิ่ม {LEVEL_LABEL[(row.level + 1) as TaskLevel]}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem disabled={!canMoveUp} onSelect={() => dispatch({ type: 'plan/move', key: row.key, direction: -1 })}>
                  <ArrowUpIcon /> เลื่อนขึ้น
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canMoveDown} onSelect={() => dispatch({ type: 'plan/move', key: row.key, direction: 1 })}>
                  <ArrowDownIcon /> เลื่อนลง
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => dispatch({ type: 'plan/remove', key: row.key })}>
                  <Trash2Icon /> {row.custom ? 'ลบงานนี้' : 'ไม่ใช้งานนี้'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  )
}

/** Inline "type a title → Enter" row. parent = null adds a main Task. */
function AddTaskRow({
  parent,
  targetDate,
  today,
  dispatch,
  listId,
  onDone,
}: {
  parent: PlanRow | null
  targetDate: ISODate
  today: ISODate
  dispatch: Dispatch<PlanAction>
  listId: string
  onDone?: () => void
}) {
  const defaultStart = parent ? parent.startDate : addDays(targetDate, -14) < today ? today : addDays(targetDate, -14)
  const defaultDays = parent ? Math.max(1, Math.min(3, spanDays(parent.startDate, parent.dueDate) ?? 1)) : 5
  const [title, setTitle] = useState('')
  const [responsible, setResponsible] = useState('')
  const [start, setStart] = useState<ISODate>(defaultStart)
  const [days, setDays] = useState(defaultDays)
  const level = parent ? ((parent.level + 1) as TaskLevel) : 1
  const label = LEVEL_LABEL[level]

  const add = () => {
    const t = title.trim()
    if (!t) return
    const startOffset = offsetFor(targetDate, start < today ? today : start)
    dispatch({
      type: 'plan/add',
      item: {
        key: newPlanKey(),
        parentKey: parent?.key ?? null,
        title: t,
        startOffset,
        dueOffset: startOffset + Math.max(1, days) - 1,
        responsible: responsible.trim() || null,
        custom: true,
      },
    })
    // Keep the department and dates so several tasks for the same team can be typed in a row.
    setTitle('')
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-primary/30 bg-brand-soft/30 px-2 py-1.5"
      style={{ marginLeft: parent ? `${parent.level * 1.25}rem` : undefined }}
    >
      <PlusIcon className="ml-1 size-4 shrink-0 text-primary" aria-hidden />
      <label className="sr-only" htmlFor={`add-${parent?.key ?? 'root'}`}>
        ชื่อ {label} ใหม่
      </label>
      <Input
        id={`add-${parent?.key ?? 'root'}`}
        value={title}
        autoFocus={!!parent}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && onDone) {
            e.preventDefault()
            onDone()
          }
          swallowEnter(e, add)
        }}
        placeholder={parent ? `พิมพ์ชื่อ ${label} แล้วกด Enter` : 'พิมพ์ชื่องานหลักของคุณเอง แล้วกด Enter เพื่อเพิ่มลงไทม์ไลน์'}
        className="h-8 min-w-0 flex-1 basis-60 border-transparent bg-background/80 shadow-none focus-visible:bg-background"
      />
      <DepartmentInput value={responsible} onChange={setResponsible} listId={listId} label={`แผนกที่รับผิดชอบ ${label} ใหม่ (ไม่บังคับ)`} onEnter={add} className="[&_input]:h-8 [&_input]:bg-background/80" />
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        เริ่ม
        <DateButton value={start} min={today} onChange={setStart} ariaLabel={`วันเริ่มของ ${label} ใหม่`} />
        <label className="flex items-center gap-1">
          <span className="sr-only">ระยะเวลา (วัน)</span>
          <Input
            type="number"
            min={1}
            max={730}
            value={days}
            onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))}
            onKeyDown={(e) => swallowEnter(e, add)}
            className="tabular h-7 w-14 px-1.5 text-right text-xs"
          />
          วัน
        </label>
      </div>
      <Button type="button" size="sm" onClick={add} disabled={!title.trim()}>
        เพิ่ม{parent ? '' : 'งาน'}
      </Button>
      {onDone && (
        <Button type="button" size="sm" variant="ghost" onClick={onDone} className="text-muted-foreground">
          ปิด
        </Button>
      )}
    </div>
  )
}
