// Building blocks shared by the presentation dialogs (create, record, schedule, re-pitch, withdraw).
import type { User } from '@flowtrade/shared'
import {
  BadgeCheckIcon,
  CalendarClockIcon,
  CircleSlashIcon,
  CircleXIcon,
  Loader2Icon,
  MessageCircleQuestionMarkIcon,
  PackageIcon,
  PlusIcon,
  PresentationIcon,
  RotateCcwIcon,
  SendIcon,
  UserPlusIcon,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useUserLookup } from '@/api/hooks'
import { AvatarStack } from '@/components/common/user-avatar'
import { UserPicker } from '@/components/common/user-picker'
import { Button } from '@/components/ui/button'
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { EVENT_LABEL, STAGE_META } from './model'
import type { EditableKind, Tone } from './types'

/** Label + control + hint / error. Pass `group` for checklists and chip groups (label is a <p id={`${id}-label`}>). */
export function Field({
  id,
  label,
  required,
  optional,
  description,
  hint,
  error,
  aside,
  group,
  className,
  children,
}: {
  id: string
  label: ReactNode
  required?: boolean
  optional?: boolean
  /** Muted line right under the label. */
  description?: ReactNode
  /** Muted line under the control (replaced by the error). */
  hint?: ReactNode
  error?: string
  /** Right-aligned next to the label, e.g. select-all buttons. */
  aside?: ReactNode
  group?: boolean
  className?: string
  children: ReactNode
}) {
  const text = (
    <>
      {label}
      {required && (
        <span className="text-danger" aria-hidden>
          *
        </span>
      )}
      {optional && <span className="font-normal text-muted-foreground">(ไม่บังคับ)</span>}
    </>
  )
  return (
    <div className={cn('grid min-w-0 content-start gap-2', className)}>
      <div className="flex min-h-4 flex-wrap items-center justify-between gap-x-2 gap-y-1">
        {group ? (
          <p id={`${id}-label`} className="flex items-center gap-1 text-sm leading-none font-medium">
            {text}
          </p>
        ) : (
          <Label htmlFor={id} className="gap-1">
            {text}
          </Label>
        )}
        {aside}
      </div>
      {description && <p className="-mt-1 text-xs text-muted-foreground">{description}</p>}
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-danger">
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

/** "เลือกทั้งหมด (n)" / "ไม่เลือกเลย" next to a checklist label. */
export function SelectAllButtons({ total, selected, onAll, onNone }: { total: number; selected: number; onAll: () => void; onNone: () => void }) {
  return (
    <span className="flex items-center gap-1">
      <Button type="button" variant="ghost" size="xs" disabled={total === 0 || selected >= total} onClick={onAll}>
        เลือกทั้งหมด ({total})
      </Button>
      <Button type="button" variant="ghost" size="xs" disabled={selected === 0} onClick={onNone}>
        ไม่เลือกเลย
      </Button>
    </span>
  )
}

/** Field hint under a PeoplePicker limited to the project team (pickableIds). */
export const PICKER_HINT = 'เลือกได้เฉพาะทีมโปรเจกต์ — เพิ่มสมาชิกได้ที่หัวโปรเจกต์'

type PickedPerson = Pick<User, 'id' | 'name' | 'nickname' | 'avatarColor' | 'isActive'> & Partial<Pick<User, 'position' | 'department'>>

/** Full-width people button (presenters, preparer, production order contacts) on top of UserPicker. */
export function PeoplePicker({
  id,
  value,
  onChange,
  usersById,
  allowedIds,
  excludeIds,
  single,
  placeholder,
  invalid,
  'aria-describedby': describedBy,
}: {
  id: string
  value: string[]
  onChange: (ids: string[]) => void
  /** Also resolves people the active-user lookup no longer lists. */
  usersById: ReadonlyMap<string, PickedPerson>
  /**
   * Only these people are offered (PresentationModel.pickableIds); someone already picked stays listed so they can be
   * removed — a deactivated one too, marked "(ปิดใช้งาน)" (usersById resolves them).
   */
  allowedIds?: ReadonlySet<string>
  /** Never offered, e.g. the main contact in the co-contact picker. */
  excludeIds?: readonly string[]
  single?: boolean
  placeholder: string
  invalid?: boolean
  'aria-describedby'?: string
}) {
  const { data: lookup } = useUserLookup()
  const users = value.map((x) => usersById.get(x)).filter((u): u is PickedPerson => !!u)
  const offered = (u: User) => !excludeIds?.includes(u.id) && (!allowedIds || allowedIds.has(u.id) || value.includes(u.id))
  const hidden = allowedIds || excludeIds?.length ? (lookup ?? []).filter((u) => !offered(u)).map((u) => u.id) : undefined
  // The lookup lists active users only: a picked person missing from it was deactivated (once it has loaded).
  const listed = new Set(lookup?.map((u) => u.id))
  const inactivePicked = lookup ? users.filter((u) => !listed.has(u.id)) : undefined
  return (
    <UserPicker
      single={single}
      value={value}
      onChange={onChange}
      excludeIds={hidden}
      inactivePicked={inactivePicked}
      trigger={
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className="h-9 w-full justify-start gap-2 px-2.5 font-normal"
        >
          {users.length ? (
            <>
              <AvatarStack users={users} max={4} size="xs" />
              <span className="truncate">{users.length === 1 ? users[0].nickname || users[0].name : `${users.length} คน`}</span>
            </>
          ) : (
            <>
              <UserPlusIcon className="text-muted-foreground" />
              <span className="text-muted-foreground">{placeholder}</span>
            </>
          )}
        </Button>
      }
    />
  )
}

/** Small rounded quick-fill chip (info requests, expected-result dates). */
export function QuickChip({ onClick, plus, children }: { onClick: () => void; plus?: boolean; children: ReactNode }) {
  return (
    <Button type="button" variant="outline" size="xs" className="rounded-full" onClick={onClick}>
      {plus && <PlusIcon />}
      {children}
    </Button>
  )
}

/** Quote box: the buyer's request (warning) or the last rejection (danger). */
export function QuoteBox({ tone, title, children }: { tone: 'warning' | 'danger'; title: ReactNode; children: ReactNode }) {
  return (
    <div className={cn('rounded-lg border p-3', tone === 'warning' ? 'border-warning/30 bg-warning-soft' : 'border-danger/20 bg-danger-soft')}>
      <p className={cn('text-xs font-medium', tone === 'warning' ? 'text-warning-foreground' : 'text-danger')}>{title}</p>
      <div className="mt-1 text-sm whitespace-pre-line text-foreground">{children}</div>
    </div>
  )
}

const TONE_CHIP: Record<Tone, string> = {
  brand: STAGE_META.AWAITING.chip,
  info: STAGE_META.IN_REVIEW.chip,
  warning: STAGE_META.NEEDS_INFO.chip,
  success: STAGE_META.PASSED.chip,
  danger: STAGE_META.REJECTED.chip,
  muted: STAGE_META.WITHDRAWN.chip,
}

const KIND_LOOK: Record<EditableKind, { icon: LucideIcon; tone: Tone }> = {
  CREATED: { icon: PackageIcon, tone: 'brand' },
  SCHEDULED: { icon: CalendarClockIcon, tone: 'muted' },
  PRESENTED: { icon: PresentationIcon, tone: 'info' },
  NEEDS_INFO: { icon: MessageCircleQuestionMarkIcon, tone: 'warning' },
  INFO_SENT: { icon: SendIcon, tone: 'info' },
  PASSED: { icon: BadgeCheckIcon, tone: 'success' },
  REJECTED: { icon: CircleXIcon, tone: 'danger' },
  WITHDRAWN: { icon: CircleSlashIcon, tone: 'muted' },
  REPITCH: { icon: RotateCcwIcon, tone: 'brand' },
}

/** Read-only chip of the event being edited (replaces the choice cards in edit mode). */
export function EventKindBadge({ kind, className }: { kind: EditableKind; className?: string }) {
  const { icon: Icon, tone } = KIND_LOOK[kind]
  return (
    <span className={cn('inline-flex h-6 w-fit items-center gap-1 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap', TONE_CHIP[tone], className)}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {EVENT_LABEL[kind]}
    </span>
  )
}

/** Cancel + submit footer; the submit shows a spinner while pending. */
export function DialogActions({ label, pending, disabled }: { label: ReactNode; pending: boolean; disabled?: boolean }) {
  return (
    <DialogFooter>
      <DialogClose asChild>
        <Button type="button" variant="outline">
          ยกเลิก
        </Button>
      </DialogClose>
      <Button type="submit" disabled={disabled || pending}>
        {pending && <Loader2Icon className="animate-spin" />}
        {label}
      </Button>
    </DialogFooter>
  )
}

/** Shown instead of a form when its store / event no longer exists or moved on (e.g. changed by a teammate meanwhile). */
export function GoneNotice() {
  return (
    <>
      <DialogHeader>
        <DialogTitle>ข้อมูลเปลี่ยนไปแล้ว</DialogTitle>
        <DialogDescription>ขั้นตอนของรายการนี้เปลี่ยนไปแล้ว — ปิดหน้าต่างนี้แล้วเลือกใหม่จากตารางผลพิจารณา</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            ปิด
          </Button>
        </DialogClose>
      </DialogFooter>
    </>
  )
}
