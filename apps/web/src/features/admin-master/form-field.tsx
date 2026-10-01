import type { ReactNode } from 'react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/** Label + control + hint/error, wired for screen readers via `${id}-hint` / `${id}-error`. */
export function FormField({
  id,
  label,
  required,
  optional,
  hint,
  error,
  aside,
  className,
  children,
}: {
  id: string
  label: ReactNode
  required?: boolean
  optional?: boolean
  hint?: ReactNode
  error?: string
  /** Right-aligned extra next to the label, e.g. a character counter. */
  aside?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('grid content-start gap-1.5', className)}>
      <div className="flex min-h-4 items-center justify-between gap-2">
        <Label htmlFor={id} className="gap-1">
          {label}
          {required && (
            <span className="text-danger" aria-hidden>
              *
            </span>
          )}
          {optional && <span className="text-xs font-normal text-muted-foreground">(ไม่บังคับ)</span>}
        </Label>
        {aside}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

/** aria props for the control inside a <FormField>. */
export function fieldAria(id: string, error: string | undefined, hasHint = false) {
  return {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : hasHint ? `${id}-hint` : undefined,
  } as const
}

export function CharCount({ value, max }: { value: string; max: number }) {
  const n = value.length
  return (
    <span className={cn('tabular text-xs', n > max ? 'font-medium text-danger' : 'text-muted-foreground')} aria-live="polite">
      {n}/{max}
    </span>
  )
}
