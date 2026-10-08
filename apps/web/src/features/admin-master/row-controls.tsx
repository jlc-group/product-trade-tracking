import { FolderKanbanIcon, PencilIcon, Trash2Icon } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { useConfirm } from '@/components/common/misc'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export type ConfirmFn = ReturnType<typeof useConfirm>[0]

/**
 * Optimistic active/inactive switch state. `setActive` should resolve after the
 * list has been refetched, so the switch never flickers back. The toast hints default to the proposal wizard's wording.
 */
export function useActiveToggle({
  name,
  isActive,
  setActive,
  onHint,
  offHint,
}: {
  name: string
  isActive: boolean
  setActive: (active: boolean) => Promise<unknown>
  onHint?: string
  offHint?: string
}) {
  const [optimistic, setOptimistic] = useState<boolean | null>(null)
  const checked = optimistic ?? isActive
  const toggle = async (next: boolean) => {
    setOptimistic(next)
    try {
      await setActive(next)
      if (next) toast.success(`เปิดใช้งาน ${name} แล้ว`, { description: onHint ?? 'กลับมาให้เลือกในขั้นตอนเสนอสินค้าได้ตามปกติ' })
      else toast.success(`ปิดใช้งาน ${name} แล้ว`, { description: offHint ?? 'จะไม่แสดงให้เลือกในการเสนอสินค้าใหม่ — โปรเจกต์เดิมไม่ได้รับผลกระทบ' })
    } catch {
      // error toast comes from the mutation hook
    } finally {
      setOptimistic(null)
    }
  }
  return { checked, pending: optimistic !== null, toggle }
}

export function ActiveSwitch({ name, checked, pending, onCheckedChange, showState = true }: { name: string; checked: boolean; pending?: boolean; onCheckedChange: (v: boolean) => void; showState?: boolean }) {
  const id = useId()
  return (
    <div className="flex items-center gap-2">
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={pending} />
      <Label htmlFor={id} className={cn('text-xs font-normal', checked ? 'text-foreground' : 'text-muted-foreground', !showState && 'sr-only')}>
        <span className="sr-only">ใช้งาน {name}: </span>
        <span className={cn('w-14', showState ? 'inline-block' : '')}>{checked ? 'ใช้งาน' : 'ปิดอยู่'}</span>
      </Label>
    </div>
  )
}

export function InactiveBadge({ className }: { className?: string }) {
  return <span className={cn('inline-flex h-5 items-center rounded-full border border-dashed border-muted-foreground/40 bg-muted px-2 text-[11px] font-medium text-muted-foreground', className)}>ปิดใช้งาน</span>
}

export function UsageLabel({ count, className }: { count: number | undefined; className?: string }) {
  if (count === undefined) return <span className={cn('h-4 w-24 animate-pulse rounded bg-muted', className)} aria-hidden />
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs whitespace-nowrap', count > 0 ? 'text-foreground' : 'text-muted-foreground', className)}>
      <FolderKanbanIcon className={cn('size-3.5', count > 0 ? 'text-brand' : 'text-muted-foreground/60')} />
      {count > 0 ? (
        <span>
          ใช้ใน <span className="tabular font-semibold">{count}</span> โปรเจกต์
        </span>
      ) : (
        'ยังไม่ถูกใช้'
      )}
    </span>
  )
}

export function EditButton({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`แก้ไข ${name}`} onClick={onClick}>
          <PencilIcon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>แก้ไข</TooltipContent>
    </Tooltip>
  )
}

/** How the delete guard words what uses a record (`usage` = number of projects). */
export interface UsedBy {
  /** "การเสนอสินค้า 3 รายการ" (after "ถูกใช้ใน") */
  count: (usage: number) => string
  /** What deactivating hides it from: "การเสนอสินค้าใหม่" */
  hiddenFrom: string
  /** What keeps showing it: "โปรเจกต์เดิม" */
  kept: string
  /** "การเสนอสินค้าใด" (after "ยังไม่มี") */
  none: string
}

const USED_BY_PROPOSALS: UsedBy = { count: (n) => `การเสนอสินค้า ${n} รายการ`, hiddenFrom: 'การเสนอสินค้าใหม่', kept: 'โปรเจกต์เดิม', none: 'การเสนอสินค้าใด' }

/**
 * Delete with guard: when the record is used (by proposals unless `usedBy` says otherwise) the button is soft-disabled
 * (still focusable, with a tooltip) and offers "ปิดการใช้งานแทน" instead.
 */
export function DeleteButton({
  name,
  noun,
  usage,
  isActive,
  confirm,
  onDelete,
  onDeactivate,
  deleteNote,
  usedBy = USED_BY_PROPOSALS,
}: {
  name: string
  /** e.g. "ห้าง", "แพลตฟอร์ม", "ประเภท Shelf", "สินค้า" */
  noun: string
  usage: number | undefined
  isActive: boolean
  confirm: ConfirmFn
  onDelete: () => Promise<unknown>
  onDeactivate: () => Promise<unknown>
  /** Extra consequence sentence appended to the delete confirmation. */
  deleteNote?: ReactNode
  usedBy?: UsedBy
}) {
  const [busy, setBusy] = useState(false)
  const inUse = (usage ?? 0) > 0
  const unknown = usage === undefined

  const run = async () => {
    if (unknown || busy) return
    if (inUse) {
      if (!isActive) return
      const ok = await confirm({
        title: `ลบ “${name}” ไม่ได้`,
        description: `${noun}นี้ถูกใช้ใน${usedBy.count(usage ?? 0)} จึงต้องเก็บไว้ให้ประวัติครบ — ปิดการใช้งานแทนได้ ระบบจะซ่อนจาก${usedBy.hiddenFrom} แต่${usedBy.kept}ยังเห็นตามปกติ และเปิดกลับได้ทุกเมื่อ`,
        confirmLabel: 'ปิดการใช้งานแทน',
      })
      if (ok) await onDeactivate()
      return
    }
    const ok = await confirm({
      title: `ลบ “${name}” ?`,
      description: (
        <>
          ลบถาวรและกู้คืนไม่ได้ ยังไม่มี{usedBy.none}ใช้{noun}นี้{deleteNote ? <> — {deleteNote}</> : null}
        </>
      ),
      confirmLabel: `ลบ${noun}`,
      destructive: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      await onDelete()
      toast.success(`ลบ ${name} แล้ว`)
    } catch {
      // IN_USE / permission errors are toasted by the hook
    } finally {
      setBusy(false)
    }
  }

  const tip = unknown
    ? 'กำลังตรวจสอบการใช้งาน…'
    : inUse
      ? isActive
        ? `ลบไม่ได้ เพราะใช้อยู่ใน ${usage} โปรเจกต์ — คลิกเพื่อปิดการใช้งานแทน`
        : `ลบไม่ได้ เพราะใช้อยู่ใน ${usage} โปรเจกต์ (ปิดใช้งานอยู่แล้ว)`
      : `ลบ${noun}`
  const blocked = unknown || (inUse && !isActive)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={inUse ? `ลบ ${name} ไม่ได้ — ใช้อยู่ใน ${usage} โปรเจกต์` : `ลบ ${name}`}
          aria-disabled={blocked || undefined}
          onClick={run}
          className={cn(
            inUse ? 'text-muted-foreground/50 hover:text-muted-foreground' : 'text-muted-foreground hover:bg-danger-soft hover:text-danger',
            blocked && 'cursor-not-allowed hover:bg-transparent',
          )}
        >
          <Trash2Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  )
}
