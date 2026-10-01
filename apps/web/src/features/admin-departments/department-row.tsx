import type { Department } from '@flowtrade/shared'
import { Building2Icon, CheckIcon, Loader2Icon, PencilIcon, Trash2Icon, UsersIcon, XIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ActiveSwitch, InactiveBadge, type ConfirmFn } from '@/features/admin-master/row-controls'
import { cn } from '@/lib/utils'
import { cleanDepartmentName, departmentNameError, serverNameError } from './department-name'

/** Users in the department: a number, `undefined` while loading, `null` when the count could not be loaded. */
export type UserCount = number | null | undefined

export interface DepartmentRowProps {
  department: Department
  users: UserCount
  /** Every department (incl. inactive), for the duplicate-name check. */
  departments: readonly Department[]
  /** Drag handle from <SortableList>. */
  handle: ReactNode
  confirm: ConfirmFn
  /** Resolve after the list has refetched. */
  onRename: (name: string) => Promise<unknown>
  onSetActive: (active: boolean) => Promise<unknown>
  onDelete: () => Promise<unknown>
}

function DepartmentTile({ muted }: { muted: boolean }) {
  return (
    <span
      className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand ring-1 ring-brand/15 ring-inset transition', muted && 'bg-muted text-muted-foreground ring-border')}
      aria-hidden
    >
      <Building2Icon className="size-4" />
    </span>
  )
}

export function UserCountLabel({ count, className }: { count: UserCount; className?: string }) {
  if (count === undefined) return <span className={cn('h-4 w-20 animate-pulse rounded bg-muted', className)} aria-hidden />
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs whitespace-nowrap', count ? 'text-foreground' : 'text-muted-foreground', className)}>
      <UsersIcon className={cn('size-3.5', count ? 'text-brand' : 'text-muted-foreground/60')} />
      {count === null ? (
        'ไม่ทราบจำนวนผู้ใช้'
      ) : count > 0 ? (
        <span>
          ผู้ใช้ <span className="tabular font-semibold">{count}</span> คน
        </span>
      ) : (
        'ยังไม่มีผู้ใช้'
      )}
    </span>
  )
}

/** Inline rename: Enter saves, Esc cancels. */
function RenameField({
  department,
  departments,
  users,
  onSave,
  onClose,
}: {
  department: Department
  departments: readonly Department[]
  users: UserCount
  onSave: (name: string) => Promise<unknown>
  onClose: () => void
}) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(department.name)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (saving) return
    const name = cleanDepartmentName(value)
    if (name === department.name) return onClose()
    const problem = departmentNameError(value, departments, department.id)
    if (problem) return setError(problem)
    setSaving(true)
    try {
      await onSave(name)
    } catch (err) {
      // Other errors are toasted by the mutation hook; stay open so the name isn't lost.
      setError(serverNameError(err))
      setSaving(false)
      return
    }
    onClose()
  }

  // Focus with the current name selected, ready to overtype.
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const hint = users ? `ผู้ใช้ ${users} คนในแผนกนี้จะเห็นชื่อใหม่ทันที · Enter บันทึก · Esc ยกเลิก` : 'Enter เพื่อบันทึก · Esc เพื่อยกเลิก'

  return (
    <form onSubmit={submit} noValidate className="min-w-0 flex-1 sm:max-w-md" aria-label={`เปลี่ยนชื่อแผนก ${department.name}`}>
      <div className="flex items-center gap-1.5">
        <Input
          ref={inputRef}
          id={id}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              if (!saving) onClose()
            }
          }}
          readOnly={saving}
          autoComplete="off"
          aria-label={`ชื่อใหม่ของแผนก ${department.name}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : `${id}-hint`}
          className="min-w-0 flex-1"
        />
        <Button type="submit" size="icon-sm" aria-label="บันทึกชื่อแผนก" disabled={saving}>
          {saving ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="ยกเลิกการเปลี่ยนชื่อ" onClick={onClose} disabled={saving}>
          <XIcon />
        </Button>
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs font-medium text-danger">
          {error}
        </p>
      ) : (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </form>
  )
}

/** One department: card on mobile, row on wider screens. */
export function DepartmentRow({ department, users, departments, handle, confirm, onRename, onSetActive, onDelete }: DepartmentRowProps) {
  const navigate = useNavigate()
  const { name } = department

  // Optimistic switch state, cleared once the list has refetched (no flicker back).
  const [optimistic, setOptimistic] = useState<boolean | null>(null)
  const checked = optimistic ?? department.isActive
  const toggle = async (next: boolean) => {
    setOptimistic(next)
    try {
      await onSetActive(next)
    } catch {
      // toasted by the mutation hook
    } finally {
      setOptimistic(null)
    }
  }

  // Inline rename; focus goes back to the pencil button when it closes.
  const [editing, setEditing] = useState(false)
  const editRef = useRef<HTMLButtonElement>(null)
  const refocus = useRef(false)
  useEffect(() => {
    if (!editing && refocus.current) {
      refocus.current = false
      editRef.current?.focus()
    }
  }, [editing])
  const stopEditing = () => {
    refocus.current = true
    setEditing(false)
  }

  const [deleting, setDeleting] = useState(false)
  const inUse = typeof users === 'number' && users > 0
  const runDelete = async () => {
    if (users === undefined || deleting) return
    if (inUse) {
      // Soft-disabled: touch screens get no tooltip, so explain on tap instead.
      if (checked) {
        const ok = await confirm({
          title: `ลบ “${name}” ไม่ได้`,
          description: `ยังมีผู้ใช้ ${users} คนอยู่ในแผนกนี้ — ปิดใช้งานแทนได้ แผนกจะถูกซ่อนจากตัวเลือกตอนเพิ่มหรือแก้ไขผู้ใช้ แต่ผู้ใช้เดิมยังอยู่ในแผนกนี้ตามปกติ และเปิดกลับได้ทุกเมื่อ`,
          confirmLabel: 'ปิดใช้งานแทน',
          cancelLabel: 'ปิด',
        })
        if (ok) await toggle(false)
      } else {
        const ok = await confirm({
          title: `ลบ “${name}” ไม่ได้`,
          description: `ยังมีผู้ใช้ ${users} คนอยู่ในแผนกนี้ (ปิดใช้งานอยู่แล้ว) — ย้ายผู้ใช้ไปแผนกอื่นที่หน้า “ผู้ใช้และสิทธิ์” ก่อน แล้วจึงลบได้`,
          confirmLabel: 'ไปหน้าผู้ใช้และสิทธิ์',
          cancelLabel: 'ปิด',
        })
        if (ok) navigate('/admin/users')
      }
      return
    }
    const ok = await confirm({
      title: `ลบแผนก “${name}” ?`,
      description:
        users === null
          ? 'ลบถาวรและกู้คืนไม่ได้ — ถ้ายังมีผู้ใช้อยู่ในแผนกนี้ ระบบจะไม่ให้ลบ'
          : 'ลบถาวรและกู้คืนไม่ได้ — ยังไม่มีผู้ใช้อยู่ในแผนกนี้ และแผนกจะหายจากตัวเลือกทันที',
      confirmLabel: 'ลบแผนก',
      destructive: true,
    })
    if (!ok) return
    setDeleting(true)
    try {
      await onDelete()
    } catch {
      // IN_USE (someone was just moved in) and other errors are toasted by the hook
    } finally {
      setDeleting(false)
    }
  }

  const deleteTip =
    users === undefined
      ? 'กำลังตรวจสอบจำนวนผู้ใช้…'
      : inUse
        ? checked
          ? `ลบไม่ได้ เพราะมีผู้ใช้ ${users} คนในแผนกนี้ — ปิดใช้งานแทนได้`
          : `ลบไม่ได้ เพราะมีผู้ใช้ ${users} คนในแผนกนี้ — ย้ายผู้ใช้ไปแผนกอื่นก่อน`
        : 'ลบแผนก'
  const deleteBlocked = users === undefined || inUse || deleting
  const muted = !checked

  return (
    <div className={cn('flex items-start gap-2 rounded-[inherit] py-3 pr-3 pl-1.5 sm:items-center sm:gap-3 sm:pr-4 sm:pl-2', muted && 'bg-muted/35')}>
      <div className="pt-0.5 sm:pt-0">{handle}</div>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
          <DepartmentTile muted={muted} />
          {editing ? (
            <RenameField department={department} departments={departments} users={users} onSave={onRename} onClose={stopEditing} />
          ) : (
            <div className="flex min-h-9 min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
              <span className={cn('min-w-0 font-medium break-words', muted && 'text-muted-foreground')}>{name}</span>
              {muted && <InactiveBadge />}
            </div>
          )}
        </div>

        {!editing && (
          <div className="flex items-center justify-between gap-3 pl-12 sm:justify-end sm:gap-4 sm:pl-0">
            <UserCountLabel count={users} className="sm:w-28" />
            <div className="flex items-center gap-1">
              <ActiveSwitch name={name} checked={checked} pending={optimistic !== null} onCheckedChange={(v) => void toggle(v)} />
              <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button ref={editRef} variant="ghost" size="icon-sm" aria-label={`เปลี่ยนชื่อ ${name}`} onClick={() => setEditing(true)}>
                    <PencilIcon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>เปลี่ยนชื่อ</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={inUse ? `ลบ ${name} ไม่ได้ — มีผู้ใช้ ${users} คน` : `ลบ ${name}`}
                    aria-disabled={deleteBlocked || undefined}
                    onClick={() => void runDelete()}
                    className={cn(
                      deleteBlocked ? 'cursor-not-allowed text-muted-foreground/45 hover:bg-transparent hover:text-muted-foreground/70' : 'text-muted-foreground hover:bg-danger-soft hover:text-danger',
                    )}
                  >
                    {deleting ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{deleteTip}</TooltipContent>
              </Tooltip>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function DepartmentListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 sm:space-y-0 sm:divide-y sm:rounded-xl sm:border sm:bg-card" aria-busy="true" aria-label="กำลังโหลดรายชื่อแผนก">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border bg-card px-3 py-3.5 sm:rounded-none sm:border-0 sm:bg-transparent sm:px-4">
          <Skeleton className="h-6 w-4" />
          <Skeleton className="size-9 rounded-lg" />
          <Skeleton className="h-4 w-36 max-w-[40%]" />
          <span className="flex-1" />
          <Skeleton className="hidden h-4 w-24 sm:block" />
          <Skeleton className="h-5 w-9 rounded-full" />
          <Skeleton className="hidden size-7 sm:block" />
          <Skeleton className="hidden size-7 sm:block" />
        </div>
      ))}
    </div>
  )
}
