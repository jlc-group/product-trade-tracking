import type { Department } from '@flowtrade/shared'
import { CornerDownLeftIcon, Loader2Icon, PlusIcon } from 'lucide-react'
import { useId, useState, type FormEvent, type Ref } from 'react'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { cleanDepartmentName, DEPARTMENT_NAME_MAX, departmentNameError, serverNameError } from './department-name'

/** Inline "add department" bar — Enter adds, and focus stays put so several can be added in a row. */
export function AddDepartmentForm({
  departments,
  onCreate,
  inputRef,
  className,
}: {
  /** Every department (incl. inactive), for the duplicate-name check. */
  departments: readonly Department[]
  /** Resolve after the list has refetched. */
  onCreate: (name: string) => Promise<unknown>
  inputRef?: Ref<HTMLInputElement>
  className?: string
}) {
  const id = useId()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const length = cleanDepartmentName(value).length

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (saving) return
    const problem = departmentNameError(value, departments)
    if (problem) return setError(problem)
    setSaving(true)
    try {
      await onCreate(cleanDepartmentName(value))
      setValue('')
      setError(null)
    } catch (err) {
      // Non-name errors are toasted by the mutation hook.
      setError(serverNameError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className={cn('rounded-xl border border-dashed bg-card/60 p-3 sm:p-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>เพิ่มแผนก</Label>
        {length > DEPARTMENT_NAME_MAX - 10 && (
          <span className={cn('tabular text-xs', length > DEPARTMENT_NAME_MAX ? 'font-medium text-danger' : 'text-muted-foreground')} aria-live="polite">
            {length}/{DEPARTMENT_NAME_MAX}
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <InputGroup className="sm:flex-1">
          <InputGroupInput
            ref={inputRef}
            id={id}
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && value) {
                e.preventDefault()
                setValue('')
                setError(null)
              }
            }}
            readOnly={saving}
            placeholder="ชื่อแผนกใหม่ เช่น Sales"
            autoComplete="off"
            enterKeyHint="done"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : `${id}-hint`}
          />
          <InputGroupAddon align="inline-end" className="hidden sm:flex">
            <kbd className="inline-flex h-5 items-center gap-0.5 rounded border bg-muted px-1.5 font-sans text-[11px] text-muted-foreground">
              <CornerDownLeftIcon className="size-3" /> Enter
            </kbd>
          </InputGroupAddon>
        </InputGroup>
        <Button type="submit" disabled={saving || !value.trim()}>
          {saving ? <Loader2Icon className="animate-spin" /> : <PlusIcon />} เพิ่มแผนก
        </Button>
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs font-medium text-danger">
          {error}
        </p>
      ) : (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted-foreground">
          แผนกใหม่จะต่อท้ายรายการ และให้ผู้ใช้เลือกได้ทันที
        </p>
      )}
    </form>
  )
}
