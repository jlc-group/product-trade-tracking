import { addDays, DETAIL_FIELDS_MAX, DETAIL_LABEL_MAX, LEVEL_LABEL, MAX_TASK_LEVEL, PREP_DAYS, type ISODate, type TaskTemplateItem } from '@flowtrade/shared'
import { ArrowDownIcon, ArrowUpIcon, CalendarDaysIcon, ChevronDownIcon, ChevronRightIcon, CornerDownRightIcon, PlusIcon, TableIcon, Trash2Icon, XIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import { formatDate, formatDateRange } from '@/lib/format'
import { cn } from '@/lib/utils'
import { offsetLabel, offsetOfPrepDay, offsetPhrase, prepDay, type ItemIssue, type Items } from './tree-ops'

export interface TreeActions {
  onUpdate: (id: string, patch: Partial<Pick<TaskTemplateItem, 'title' | 'startOffsetDays' | 'dueOffsetDays' | 'responsible' | 'fieldLabels'>>) => void
  onAddChild: (id: string) => void
  onAddSibling: (id: string) => void
  onMove: (id: string, direction: -1 | 1) => void
  onRemove: (id: string) => void
  onToggleCollapse: (id: string) => void
}

interface TreeProps extends TreeActions {
  map: Map<string | null, Items>
  collapsed: ReadonlySet<string>
  issues: ItemIssue[]
  /** Show "missing title" errors only after the first save attempt. */
  showRequired: boolean
  focusId: string | null
  /** Sheet-style numbers ("20", "20.1") by item id. */
  numbers: Map<string, string>
  /** Number of items under each item (all levels), for collapsed rows. */
  descendants: Map<string, number>
  /** Department suggestions for the responsible field. */
  departments: string[]
  /** Example launch date used to show offsets as real dates. */
  exampleLaunch: ISODate
}

/**
 * One day of the prep window, typed counting forward ("วันที่ 4") instead of as a signed offset ("-87").
 * Tolerates in-progress typing ("", "-") and commits whole numbers only.
 */
function DayInput({
  id,
  label,
  offset,
  invalid,
  exampleLaunch,
  onChange,
}: {
  id: string
  label: string
  offset: number
  invalid: boolean
  exampleLaunch: ISODate
  onChange: (offset: number) => void
}) {
  const [text, setText] = useState(String(prepDay(offset)))
  const [synced, setSynced] = useState(offset)
  if (offset !== synced) {
    setSynced(offset)
    setText(String(prepDay(offset)))
  }
  const example = Number.isInteger(offset) ? formatDate(addDays(exampleLaunch, offset)) : null
  return (
    <InputGroup className="w-[5.5rem] bg-card">
      <InputGroupAddon className="text-xs font-normal">วันที่</InputGroupAddon>
      <InputGroupInput
        id={id}
        type="number"
        step={1}
        inputMode="numeric"
        value={text}
        aria-label={label}
        title={example ? `${offsetPhrase(offset)} (${offsetLabel(offset)}) — เช่น ${example} ถ้าวางขาย ${formatDate(exampleLaunch)}` : offsetPhrase(offset)}
        aria-invalid={invalid || undefined}
        onChange={(e) => {
          const raw = e.target.value
          setText(raw)
          if (raw === '' || raw === '-') return
          const day = Number(raw)
          if (Number.isInteger(day)) {
            const n = offsetOfPrepDay(day)
            setSynced(n)
            onChange(n)
          }
        }}
        onBlur={() => setText(String(prepDay(offset)))}
        className="tabular font-medium [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
    </InputGroup>
  )
}

/** Start/due as days 1–90 of the prep window, with the duration and a mini bar showing where the task sits. */
function ScheduleField({
  base,
  name,
  start,
  due,
  startInvalid,
  dueInvalid,
  exampleLaunch,
  onStart,
  onDue,
}: {
  base: string
  name: string
  start: number
  due: number
  startInvalid: boolean
  dueInvalid: boolean
  exampleLaunch: ISODate
  onStart: (offset: number) => void
  onDue: (offset: number) => void
}) {
  const valid = Number.isInteger(start) && Number.isInteger(due) && due >= start
  const from = prepDay(start)
  const to = prepDay(due)
  const outside = valid && (from < 1 || to > PREP_DAYS)
  const pct = (day: number) => Math.min(100, Math.max(0, (day / PREP_DAYS) * 100))
  return (
    <div role="group" aria-labelledby={`${base}-sched`} className="grid gap-1">
      <div className="flex items-center gap-2">
        <span
          id={`${base}-sched`}
          className="text-[11px] whitespace-nowrap text-muted-foreground"
          title={`วันที่ 1 = วันแรกที่เริ่มเตรียม (${offsetLabel(offsetOfPrepDay(1))}) · วันที่ ${PREP_DAYS} = วันสุดท้ายก่อนวางขาย (${offsetLabel(offsetOfPrepDay(PREP_DAYS))})`}
        >
          ช่วงเวลา (วันที่ 1–{PREP_DAYS})
        </span>
        <span className="relative h-1.5 min-w-12 flex-1 overflow-hidden rounded-full bg-foreground/10" aria-hidden>
          {valid && (
            <span
              className={cn('absolute inset-y-0 min-w-1 rounded-full', outside ? 'bg-warning' : 'bg-brand')}
              style={{ left: `${pct(from - 1)}%`, width: `${pct(to) - pct(from - 1)}%` }}
            />
          )}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <DayInput id={`${base}-start`} label={`วันเริ่มของ ${name}`} offset={start} invalid={startInvalid} exampleLaunch={exampleLaunch} onChange={onStart} />
        <span className="text-xs text-muted-foreground">ถึง</span>
        <DayInput id={`${base}-due`} label={`วันเสร็จของ ${name}`} offset={due} invalid={dueInvalid} exampleLaunch={exampleLaunch} onChange={onDue} />
        <span
          className={cn('tabular w-14 shrink-0 text-xs whitespace-nowrap', outside ? 'text-warning-foreground' : 'text-muted-foreground')}
          title={outside ? (to > PREP_DAYS ? `เลยวันสุดท้ายก่อนวางขาย — วันที่ ${PREP_DAYS + 1} คือวันวางขาย` : 'เริ่มก่อนวันแรกของช่วงเตรียมงาน') : undefined}
        >
          {valid ? `${due - start + 1} วัน` : '—'}
        </span>
      </div>
    </div>
  )
}

/** Free-text department with a quick pick list of the standard departments. */
function DepartmentField({ id, name, value, departments, onChange }: { id: string; name: string; value: string | null; departments: string[]; onChange: (v: string | null) => void }) {
  return (
    <div className="grid min-w-[9.5rem] flex-1 gap-1 @3xl:w-40 @3xl:flex-none">
      <Label htmlFor={id} className="text-[11px] font-normal text-muted-foreground">
        แผนกที่รับผิดชอบ
      </Label>
      <InputGroup className="bg-card">
        <InputGroupInput id={id} value={value ?? ''} placeholder="เช่น NPD" autoComplete="off" onChange={(e) => onChange(e.target.value)} />
        <InputGroupAddon align="inline-end">
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <InputGroupButton size="icon-xs" aria-label={`เลือกแผนกที่รับผิดชอบ ${name}`} title="เลือกแผนก">
                <ChevronDownIcon />
              </InputGroupButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">แผนกที่รับผิดชอบ</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={value?.trim() ?? ''} onValueChange={(v) => onChange(v || null)}>
                {departments.map((d) => (
                  <DropdownMenuRadioItem key={d} value={d}>
                    {d}
                  </DropdownMenuRadioItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuRadioItem value="" className="text-muted-foreground">
                  ยังไม่ระบุแผนก
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </InputGroupAddon>
      </InputGroup>
    </div>
  )
}

/** Table row labels: when present, the task starts as a table and the team fills in a value per label. */
function FieldLabelsEditor({ base, name, labels, onChange }: { base: string; name: string; labels: string[]; onChange: (labels: string[]) => void }) {
  const [focusIndex, setFocusIndex] = useState<number | null>(null)
  const set = (k: number, v: string) => onChange(labels.map((l, j) => (j === k ? v : l)))
  const add = () => {
    setFocusIndex(labels.length)
    onChange([...labels, ''])
  }
  return (
    <div className="basis-full pl-8">
      <div className="rounded-lg border bg-card p-2">
        <p className="mb-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
          <TableIcon className="size-3" aria-hidden />
          ตารางข้อมูล — หัวข้อที่ทีมต้องกรอกใน Task นี้
        </p>
        <ol className="grid gap-1 sm:grid-cols-2">
          {labels.map((label, k) => (
            <li key={k} className="flex items-center gap-1">
              <span className="tabular w-5 shrink-0 text-right text-[11px] text-muted-foreground">{k + 1}</span>
              <Input
                id={`${base}-field-${k}`}
                value={label}
                maxLength={DETAIL_LABEL_MAX}
                placeholder="หัวข้อ เช่น ชื่อสินค้าภาษาไทย"
                aria-label={`หัวข้อที่ ${k + 1} ของ ${name}`}
                autoFocus={focusIndex === k}
                onChange={(e) => set(k, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    if (labels.length < DETAIL_FIELDS_MAX) add()
                  }
                }}
                className="h-7 bg-background text-sm"
              />
              <IconAction label={`ลบหัวข้อ ${label || k + 1}`} onClick={() => onChange(labels.filter((_, j) => j !== k))} className="size-7 text-muted-foreground hover:bg-danger-soft hover:text-danger">
                <XIcon />
              </IconAction>
            </li>
          ))}
        </ol>
        <Button type="button" variant="ghost" size="sm" className="mt-1 h-7 text-xs text-brand" onClick={add} disabled={labels.length >= DETAIL_FIELDS_MAX}>
          <PlusIcon /> เพิ่มหัวข้อ
        </Button>
      </div>
    </div>
  )
}

function IconAction({ label, onClick, disabled, className, children }: { label: string; onClick: () => void; disabled?: boolean; className?: string; children: ReactNode }) {
  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={label} title={label} onClick={onClick} disabled={disabled} className={className}>
      {children}
    </Button>
  )
}

function Row({ item, index, count, props }: { item: TaskTemplateItem; index: number; count: number; props: TreeProps }) {
  const kids = props.map.get(item.id) ?? []
  const isCollapsed = props.collapsed.has(item.id)
  const hidden = props.descendants.get(item.id) ?? kids.length
  const rowIssues = props.issues.filter((i) => i.id === item.id && (i.field !== 'title' || props.showRequired))
  const titleIssue = rowIssues.some((i) => i.field === 'title')
  const dueIssue = rowIssues.some((i) => i.field === 'due')
  const startIssue = rowIssues.some((i) => i.field === 'start')
  const num = props.numbers.get(item.id)
  const name = item.title || 'งานที่ยังไม่มีชื่อ'
  const base = `tpl-${item.id}`
  const datesValid = Number.isInteger(item.startOffsetDays) && Number.isInteger(item.dueOffsetDays) && item.dueOffsetDays >= item.startOffsetDays
  const exampleStart = datesValid ? addDays(props.exampleLaunch, item.startOffsetDays) : null
  const exampleDue = datesValid ? addDays(props.exampleLaunch, item.dueOffsetDays) : null
  const [tableOpen, setTableOpen] = useState(false)
  const labelCount = item.fieldLabels.filter((l) => l.trim()).length

  return (
    <div
      className={cn(
        'flex flex-wrap items-end gap-x-2 gap-y-2 rounded-lg px-1.5 py-1.5 transition-colors focus-within:bg-muted/50 hover:bg-muted/40',
        item.level === 1 && 'bg-muted/30',
        rowIssues.length > 0 && 'bg-danger-soft/40 hover:bg-danger-soft/60',
      )}
      data-item-id={item.id}
    >
      <div className="flex min-w-0 flex-[1_1_12rem] items-end gap-1">
        {kids.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? `แสดงงานย่อยของ ${name}` : `ซ่อนงานย่อยของ ${name}`}
            onClick={() => props.onToggleCollapse(item.id)}
            className="mb-0.5 shrink-0"
          >
            <ChevronRightIcon className={cn('transition-transform', !isCollapsed && 'rotate-90')} />
          </Button>
        ) : (
          <span className="w-7 shrink-0" aria-hidden />
        )}
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex min-w-0 items-center gap-1.5 text-[11px]">
            <Label htmlFor={`${base}-title`} className="shrink-0 text-[11px] font-normal text-muted-foreground">
              <span>
                {LEVEL_LABEL[item.level]}
                {num && <span className="tabular font-medium text-foreground/70"> {num}</span>}
              </span>
            </Label>
            {kids.length > 0 && isCollapsed && (
              <button
                type="button"
                className="truncate rounded text-brand underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
                onClick={() => props.onToggleCollapse(item.id)}
              >
                · ซ่อนอยู่ {hidden} งาน — แสดง
              </button>
            )}
            {exampleStart && exampleDue && (
              <span
                className="tabular ml-auto inline-flex min-w-0 items-center gap-1 text-muted-foreground"
                title={`ตัวอย่าง ถ้าวางขาย ${formatDate(props.exampleLaunch)}: เริ่ม ${formatDate(exampleStart)} ถึง ${formatDate(exampleDue)}`}
              >
                <CalendarDaysIcon className="size-3 shrink-0" aria-hidden />
                <span className="sr-only">ตัวอย่างวันจริง</span>
                <span className="truncate">
                  {formatDateRange(exampleStart, exampleDue)} · {item.dueOffsetDays - item.startOffsetDays + 1} วัน
                </span>
              </span>
            )}
          </div>
          <Input
            id={`${base}-title`}
            value={item.title}
            placeholder={item.level === 1 ? 'ชื่อ Task เช่น เตรียมข้อมูลสินค้าสำหรับเสนอห้าง' : 'ชื่องานย่อย เช่น ชื่อสินค้าภาษาไทย'}
            autoFocus={props.focusId === item.id}
            aria-invalid={titleIssue || undefined}
            onChange={(e) => props.onUpdate(item.id, { title: e.target.value })}
            className={cn('h-8 bg-card', item.level === 1 && 'font-medium')}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2 pl-8 @3xl:pl-3">
        <ScheduleField
          base={base}
          name={name}
          start={item.startOffsetDays}
          due={item.dueOffsetDays}
          startInvalid={startIssue}
          dueInvalid={dueIssue}
          exampleLaunch={props.exampleLaunch}
          onStart={(n) => props.onUpdate(item.id, { startOffsetDays: n })}
          onDue={(n) => props.onUpdate(item.id, { dueOffsetDays: n })}
        />
        <DepartmentField
          id={`${base}-resp`}
          name={name}
          value={item.responsible}
          departments={props.departments}
          onChange={(v) => props.onUpdate(item.id, { responsible: v })}
        />
        <div className="flex items-center pb-0.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={tableOpen}
            aria-label={labelCount ? `ตารางข้อมูล ${labelCount} หัวข้อของ ${name}` : `เพิ่มตารางข้อมูลให้ ${name}`}
            title={labelCount ? `ตารางข้อมูล ${labelCount} หัวข้อ — คลิกเพื่อแก้ไข` : 'ให้ Task นี้เริ่มเป็นตารางข้อมูล (หัวข้อ → ข้อมูล)'}
            onClick={() => {
              if (!tableOpen && item.fieldLabels.length === 0) props.onUpdate(item.id, { fieldLabels: [''] })
              setTableOpen((o) => !o)
            }}
            className={cn('tabular h-7 gap-1 px-1.5 text-xs', labelCount ? 'text-brand' : 'text-muted-foreground')}
          >
            <TableIcon />
            {labelCount > 0 && labelCount}
          </Button>
          <IconAction label={`เพิ่มงานย่อยใต้ ${name}`} onClick={() => props.onAddChild(item.id)} className={cn(item.level >= MAX_TASK_LEVEL && 'invisible')} disabled={item.level >= MAX_TASK_LEVEL}>
            <CornerDownRightIcon />
          </IconAction>
          <IconAction label={`เพิ่ม${LEVEL_LABEL[item.level]}ถัดจาก ${name}`} onClick={() => props.onAddSibling(item.id)}>
            <PlusIcon />
          </IconAction>
          <IconAction label={`เลื่อน ${name} ขึ้น`} onClick={() => props.onMove(item.id, -1)} disabled={index === 0}>
            <ArrowUpIcon />
          </IconAction>
          <IconAction label={`เลื่อน ${name} ลง`} onClick={() => props.onMove(item.id, 1)} disabled={index === count - 1}>
            <ArrowDownIcon />
          </IconAction>
          <IconAction label={`ลบ ${name}${kids.length ? ' และงานย่อย' : ''}`} onClick={() => props.onRemove(item.id)} className="text-muted-foreground hover:bg-danger-soft hover:text-danger">
            <Trash2Icon />
          </IconAction>
        </div>
      </div>

      {tableOpen && <FieldLabelsEditor base={base} name={name} labels={item.fieldLabels} onChange={(fieldLabels) => props.onUpdate(item.id, { fieldLabels })} />}

      {rowIssues.length > 0 && (
        <ul className="basis-full space-y-0.5 pl-8 text-xs text-danger">
          {rowIssues.map((i) => (
            <li key={`${i.field}-${i.message}`}>{i.message}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Branch({ parentId, props }: { parentId: string | null; props: TreeProps }) {
  const list = props.map.get(parentId) ?? []
  return (
    <ul className={cn(parentId === null ? 'space-y-3' : 'mt-0.5 ml-3.5 divide-y divide-border/60 border-l pl-2 sm:pl-3')}>
      {list.map((item, k) => (
        <li key={item.id}>
          <Row item={item} index={k} count={list.length} props={props} />
          {(props.map.get(item.id)?.length ?? 0) > 0 && !props.collapsed.has(item.id) && <Branch parentId={item.id} props={props} />}
        </li>
      ))}
    </ul>
  )
}

/** Indented 3-level editor for template items. Layout adapts to its container width (@container). */
export function TemplateTree(props: TreeProps) {
  return (
    <div className="@container">
      <Branch parentId={null} props={props} />
    </div>
  )
}
