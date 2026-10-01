import type { TaskLevel } from '@flowtrade/shared'
import { CornerDownLeftIcon, PlusIcon, XIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useCreateTask } from '@/api/hooks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useTreeEnv } from './tree-context'
import { addLabel, childLabel, INDENT } from './tree-utils'

/** Vertical guide lines for each ancestor level — sits before the chevron column. */
export function IndentGuides({ depth, className }: { depth: number; className?: string }) {
  return (
    <span className={cn('flex shrink-0 self-stretch', className)} aria-hidden>
      {Array.from({ length: depth }, (_, i) => (
        <span key={i} className="relative shrink-0 before:absolute before:inset-y-0 before:left-4 before:w-px before:bg-border" style={{ width: INDENT }} />
      ))}
    </span>
  )
}

/** Space reserved for the drag handle so rows and add-rows line up (wide layout only). */
export function HandleSpacer() {
  return <span className="hidden w-4 shrink-0 @3xl:block" aria-hidden />
}

interface InlineAddProps {
  parentId: string | null
  /** Level of the parent; null = adding a top-level task. */
  parentLevel: TaskLevel | null
  /** Indentation depth of the new item. */
  depth?: number
  active: boolean
  onActivate: () => void
  onClose: () => void
  /** 'tree' draws guides and aligns with rows; 'plain' is a full-width row (drawer). */
  variant?: 'tree' | 'plain'
  withHandleSpace?: boolean
  className?: string
}

/**
 * "+ เพิ่ม Sub task" row that turns into an input. Enter creates and keeps the input open
 * for rapid entry; Esc (or leaving it empty) closes it. Typing only re-renders this row.
 */
export function InlineAdd({ parentId, parentLevel, depth = 0, active, onActivate, onClose, variant = 'tree', withHandleSpace, className }: InlineAddProps) {
  const label = addLabel(parentLevel)
  const noun = parentLevel === null ? 'งานหลัก' : childLabel(parentLevel)
  return (
    <div className={cn('flex min-h-10 items-center gap-1.5', variant === 'tree' ? 'pr-3 pl-2' : '', className)}>
      {variant === 'tree' && (
        <>
          {withHandleSpace && <HandleSpacer />}
          <IndentGuides depth={depth} />
          <span className="w-5 shrink-0" aria-hidden />
        </>
      )}
      {active ? (
        <AddInput parentId={parentId} noun={noun} onClose={onClose} />
      ) : (
        <button
          type="button"
          onClick={onActivate}
          className="-ml-1 inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 text-xs font-medium text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <PlusIcon className="size-3.5" />
          {label}
        </button>
      )}
    </div>
  )
}

function AddInput({ parentId, noun, onClose }: { parentId: string | null; noun: string; onClose: () => void }) {
  const { proposal } = useTreeEnv()
  const createTask = useCreateTask()
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const id = useId()

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.scrollIntoView({ block: 'nearest' })
  }, [])

  const submit = () => {
    const title = value.trim()
    if (!title) return
    setValue('')
    inputRef.current?.focus()
    createTask.mutateAsync({ proposalId: proposal.id, parentId, title }).catch(() => {
      // error already toasted by the hook — give the text back so it can be fixed and resent
      setValue((v) => v || title)
    })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5 py-1">
      <Label htmlFor={id} className="sr-only">
        ชื่อ {noun} ใหม่
      </Label>
      <Input
        id={id}
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (!value.trim()) onClose()
        }}
        placeholder={`พิมพ์ชื่อ ${noun} แล้วกด Enter`}
        maxLength={200}
        autoComplete="off"
        data-local-escape=""
        className="h-8 min-w-0 flex-1 bg-background"
      />
      <span className="hidden shrink-0 items-center gap-1 text-[11px] text-muted-foreground @xl:inline-flex">
        <CornerDownLeftIcon className="size-3" />
        เพิ่ม · Esc ปิด
      </span>
      <Button type="button" size="sm" onMouseDown={(e) => e.preventDefault()} onClick={submit} disabled={!value.trim()}>
        เพิ่ม
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="ปิดช่องเพิ่มงาน" onMouseDown={(e) => e.preventDefault()} onClick={onClose}>
        <XIcon />
      </Button>
    </div>
  )
}
