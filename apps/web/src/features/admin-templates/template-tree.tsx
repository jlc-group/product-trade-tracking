import { addDays, LEVEL_LABEL, MAX_TASK_LEVEL, type ISODate, type TaskTemplateItem } from '@flowtrade/shared'
import { ArrowDownIcon, ArrowUpIcon, CalendarDaysIcon, ChevronDownIcon, ChevronRightIcon, CornerDownRightIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import { formatDate, formatDateRange } from '@/lib/format'
import { cn } from '@/lib/utils'
import { offsetLabel, offsetPhrase, type ItemIssue, type Items } from './tree-ops'

export interface TreeActions {
  onUpdate: (id: string, patch: Partial<Pick<TaskTemplateItem, 'title' | 'startOffsetDays' | 'dueOffsetDays' | 'responsible'>>) => void
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

/** Number field that tolerates in-progress typing ("-", "") and commits whole numbers only. */
function OffsetField({
  id,
  label,
  value,
  invalid,
  exampleLaunch,
  onChange,
}: {
  id: string
  label: string
  value: number
  invalid: boolean
  exampleLaunch: ISODate
  onChange: (n: number) => void
}) {
  const [text, setText] = useState(String(value))
  const [synced, setSynced] = useState(value)
  if (value !== synced) {
    setSynced(value)
    setText(String(value))
  }
  const example = Number.isInteger(value) ? formatDate(addDays(exampleLaunch, value)) : null
  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-[11px] font-normal whitespace-nowrap text-muted-foreground">
        {label}
        <span className={cn('tabular font-semibold', value < 0 ? 'text-brand' : value > 0 ? 'text-success' : 'text-danger')}>{offsetLabel(value)}</span>
      </Label>
      <Input
        id={id}
        type="number"
        step={1}
        inputMode="numeric"
        value={text}
        title={example ? `${offsetPhrase(value)} — เช่น ${example} ถ้าวางขาย ${formatDate(exampleLaunch)}` : offsetPhrase(value)}
        aria-invalid={invalid || undefined}
        onChange={(e) => {
          const raw = e.target.value
          setText(raw)
          if (raw === '' || raw === '-') return
          const n = Number(raw)
          if (Number.isInteger(n)) {
            setSynced(n)
            onChange(n)
          }
        }}
        onBlur={() => setText(String(value))}
        className="tabular h-8 w-[4.75rem] text-right"
      />
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

      <div className="flex flex-wrap items-end gap-2 pl-8 @3xl:pl-0">
        <OffsetField
          id={`${base}-start`}
          label="เริ่ม"
          value={item.startOffsetDays}
          invalid={startIssue}
          exampleLaunch={props.exampleLaunch}
          onChange={(n) => props.onUpdate(item.id, { startOffsetDays: n })}
        />
        <OffsetField
          id={`${base}-due`}
          label="ถึง"
          value={item.dueOffsetDays}
          invalid={dueIssue}
          exampleLaunch={props.exampleLaunch}
          onChange={(n) => props.onUpdate(item.id, { dueOffsetDays: n })}
        />
        <DepartmentField
          id={`${base}-resp`}
          name={name}
          value={item.responsible}
          departments={props.departments}
          onChange={(v) => props.onUpdate(item.id, { responsible: v })}
        />
        <div className="flex items-center pb-0.5">
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
