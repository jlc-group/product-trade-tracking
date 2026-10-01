import { Building2Icon, CheckIcon, PlusIcon, XIcon } from 'lucide-react'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { canonicalDepartment, DEPARTMENT_MAX_LENGTH } from './department-utils'

/** Small read-only label for the responsible department, e.g. [🏢 NPD]. */
export function DepartmentChip({ name, className }: { name: string; className?: string }) {
  return (
    <span
      title={`แผนกที่รับผิดชอบ: ${name}`}
      className={cn('inline-flex h-6 max-w-full min-w-0 items-center gap-1 rounded-md bg-muted px-1.5 text-xs font-medium text-foreground/80', className)}
    >
      <Building2Icon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
      <span className="sr-only">แผนก </span>
      <span className="truncate">{name}</span>
    </span>
  )
}

export function DepartmentDatalist({ id, options }: { id: string; options: readonly string[] }) {
  return (
    <datalist id={id}>
      {options.map((o) => (
        <option key={o} value={o} />
      ))}
    </datalist>
  )
}

/** One-click department buttons. They never take focus, so an input next to them keeps its draft. */
function DepartmentSuggestions({ options, value, onPick, className }: { options: readonly string[]; value: string | null; onPick: (name: string) => void; className?: string }) {
  return (
    <div role="group" aria-label="เลือกแผนก" className={cn('flex flex-wrap gap-1', className)}>
      {options.map((o) => {
        const active = o === value
        return (
          <button
            key={o}
            type="button"
            aria-pressed={active}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(o)}
            className={cn(
              'inline-flex h-6 max-w-full items-center gap-1 rounded-md border px-1.5 text-xs transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              active ? 'border-primary bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {active && <CheckIcon className="size-3 shrink-0" aria-hidden />}
            <span className="truncate">{o}</span>
          </button>
        )
      })}
    </div>
  )
}

// ---------- tree row: chip that opens a small editor ----------

interface DepartmentPopoverProps {
  value: string | null
  options: readonly string[]
  /** Called with the new department (null = cleared) only when it actually changes. */
  onChange: (next: string | null) => void
  /** Task title, for accessible labels. */
  taskTitle: string
}

/**
 * The department chip of a tree row. Clicking it opens a popover with an input (+ datalist),
 * one-click suggestions and a clear button. Clicking outside saves what was typed; Esc discards.
 */
export function DepartmentPopover({ value, options, onChange, taskTitle }: DepartmentPopoverProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const discard = useRef(false)
  const inputId = useId()
  const listId = useId()

  const commit = (raw: string | null) => {
    const next = canonicalDepartment(raw, options)
    if (next !== value) onChange(next)
  }

  const onOpenChange = (next: boolean) => {
    if (next) {
      setDraft(value ?? '')
      discard.current = false
    } else if (!discard.current) {
      commit(draft)
    }
    setOpen(next)
  }

  const pick = (raw: string | null) => {
    discard.current = true
    commit(raw)
    setOpen(false)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      pick(draft)
    }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        {value ? (
          <button
            type="button"
            aria-label={`แผนกที่รับผิดชอบ: ${value} — คลิกเพื่อเปลี่ยน`}
            className="inline-flex max-w-full min-w-0 rounded-md outline-none hover:opacity-80 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <DepartmentChip name={value} className="hover:bg-muted/70" />
          </button>
        ) : (
          <button
            type="button"
            aria-label={`ระบุแผนกที่รับผิดชอบ “${taskTitle}”`}
            className="inline-flex h-6 items-center gap-1 rounded-md border border-dashed border-muted-foreground/30 px-1.5 text-xs text-muted-foreground/80 transition-colors outline-none hover:border-muted-foreground/60 hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <PlusIcon className="size-3" aria-hidden />
            แผนก
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 gap-2 p-3"
        onEscapeKeyDown={() => {
          discard.current = true
        }}
      >
        <Label htmlFor={inputId} className="text-xs text-muted-foreground">
          แผนกที่รับผิดชอบ
        </Label>
        <Input
          id={inputId}
          list={listId}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={(e) => e.currentTarget.select()}
          placeholder="พิมพ์ชื่อแผนก หรือเลือกด้านล่าง"
          maxLength={DEPARTMENT_MAX_LENGTH}
          autoComplete="off"
          className="h-8 bg-background"
        />
        <DepartmentDatalist id={listId} options={options} />
        <DepartmentSuggestions options={options} value={value} onPick={pick} />
        <div className="flex items-center justify-between gap-2 pt-1">
          <Button type="button" variant="ghost" size="sm" disabled={!value} onClick={() => pick(null)} className="-ml-1.5 text-muted-foreground">
            <XIcon />
            ล้างแผนก
          </Button>
          <Button type="button" size="sm" onClick={() => pick(draft)}>
            บันทึก
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ---------- drawer: autosaving input ----------

interface DepartmentInputProps {
  id?: string
  serverValue: string | null
  options: readonly string[]
  /** Called with the new department (null = cleared) only when it actually changes. */
  onSave: (next: string | null) => void
}

/**
 * Department input that saves on blur / Enter (and on unmount, so closing the drawer never
 * loses an edit). Esc reverts. Suggestions underneath save with one click.
 */
export function DepartmentInput({ id, serverValue, options, onSave }: DepartmentInputProps) {
  const listId = useId()
  const [draft, setDraft] = useState(serverValue ?? '')
  const [base, setBase] = useState(serverValue)
  if (base !== serverValue) {
    // saved elsewhere (or by us) — follow the server
    setBase(serverValue)
    setDraft(serverValue ?? '')
  }

  const saved = useRef(serverValue)
  const latest = useRef({ draft, options, onSave })
  useLayoutEffect(() => {
    latest.current = { draft, options, onSave }
  })
  useEffect(() => {
    saved.current = serverValue
  }, [serverValue])

  const save = useCallback((raw: string | null) => {
    const { options: opts, onSave: send } = latest.current
    const next = canonicalDepartment(raw, opts)
    if (next === saved.current) {
      setDraft(next ?? '')
      return
    }
    saved.current = next
    setDraft(next ?? '')
    send(next)
  }, [])

  const commit = useCallback(() => save(latest.current.draft), [save])
  useEffect(() => () => commit(), [commit])

  return (
    <div className="space-y-2">
      <InputGroup className="h-9 bg-background">
        <InputGroupAddon>
          <Building2Icon />
        </InputGroupAddon>
        <InputGroupInput
          id={id}
          list={listId}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault()
              e.currentTarget.blur()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              latest.current = { ...latest.current, draft: saved.current ?? '' }
              setDraft(saved.current ?? '')
              e.currentTarget.blur()
            }
          }}
          data-local-escape=""
          placeholder="ยังไม่ระบุ — พิมพ์ชื่อแผนก หรือเลือกด้านล่าง"
          maxLength={DEPARTMENT_MAX_LENGTH}
          autoComplete="off"
        />
        {draft && (
          <InputGroupAddon align="inline-end">
            <InputGroupButton size="icon-xs" aria-label="ล้างแผนก" onMouseDown={(e) => e.preventDefault()} onClick={() => save(null)}>
              <XIcon />
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>
      <DepartmentDatalist id={listId} options={options} />
      <DepartmentSuggestions options={options} value={serverValue} onPick={(name) => save(name)} />
    </div>
  )
}
