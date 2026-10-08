import type { User } from '@flowtrade/shared'
import { CheckIcon, UserPlusIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useUserLookup } from '@/api/hooks'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { AvatarStack, UserAvatar } from './user-avatar'

/** A picked person the active-user lookup no longer lists (deactivated), as the caller still knows them. */
export type InactivePickedUser = Pick<User, 'id' | 'name' | 'avatarColor'> & Partial<Pick<User, 'nickname' | 'position' | 'department'>>

interface UserPickerProps {
  value: string[]
  onChange: (ids: string[]) => void
  /** Allow only one selection (closes on pick). */
  single?: boolean
  placeholder?: string
  disabled?: boolean
  /** Custom trigger; defaults to an avatar stack button. */
  trigger?: ReactNode
  align?: 'start' | 'center' | 'end'
  excludeIds?: string[]
  /**
   * Picked people the lookup no longer lists (deactivated): shown after the others, marked "(ปิดใช้งาน)", only so they
   * can be unticked one by one — never offered for a new pick (they leave the list once unticked).
   */
  inactivePicked?: readonly InactivePickedUser[]
  /** id of the default trigger button, so a <Label htmlFor> can point at it. */
  id?: string
  /** Accessible name of the default trigger when there is no visible label. */
  'aria-label'?: string
}

export function UserPicker({
  value,
  onChange,
  single,
  placeholder = 'เลือกผู้รับผิดชอบ',
  disabled,
  trigger,
  align = 'start',
  excludeIds = [],
  inactivePicked = [],
  id,
  'aria-label': ariaLabel,
}: UserPickerProps) {
  const [open, setOpen] = useState(false)
  const { data: users = [] } = useUserLookup()
  const selected = users.filter((u) => value.includes(u.id))
  const options = users.filter((u) => !excludeIds.includes(u.id))

  const toggle = (u: User) => {
    if (single) {
      onChange([u.id])
      setOpen(false)
      return
    }
    onChange(value.includes(u.id) ? value.filter((id) => id !== u.id) : [...value, u.id])
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        {trigger ?? (
          <Button id={id} aria-label={ariaLabel} type="button" variant="outline" className="h-9 justify-start gap-2 px-2.5 font-normal" disabled={disabled}>
            {selected.length ? (
              <>
                <AvatarStack users={selected} max={4} size="xs" />
                <span className="truncate text-sm">{selected.length === 1 ? selected[0].name : `${selected.length} คน`}</span>
              </>
            ) : (
              <>
                <UserPlusIcon className="text-muted-foreground" />
                <span className="text-muted-foreground">{placeholder}</span>
              </>
            )}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align={align} onClick={(e) => e.stopPropagation()}>
        <Command>
          <CommandInput placeholder="ค้นหาชื่อ…" />
          <CommandList>
            <CommandEmpty>ไม่พบผู้ใช้</CommandEmpty>
            <CommandGroup>
              {options.map((u) => {
                const isOn = value.includes(u.id)
                return (
                  <CommandItem key={u.id} value={`${u.name} ${u.nickname ?? ''} ${u.username ?? ''} ${u.email ?? ''}`} onSelect={() => toggle(u)} className="gap-2">
                    <UserAvatar user={u} size="sm" tooltip={false} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{u.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{u.position ?? u.department ?? u.username ?? u.email ?? ''}</span>
                    </span>
                    <CheckIcon className={cn('size-4 text-primary', isOn ? 'opacity-100' : 'opacity-0')} />
                  </CommandItem>
                )
              })}
              {inactivePicked
                .filter((u) => value.includes(u.id))
                .map((u) => (
                  <CommandItem
                    key={u.id}
                    value={`${u.name} ${u.nickname ?? ''} (ปิดใช้งาน)`}
                    // Single: already the pick, so it just closes; multi: unticks.
                    onSelect={() => (single ? setOpen(false) : onChange(value.filter((x) => x !== u.id)))}
                    className="gap-2"
                  >
                    <UserAvatar user={{ ...u, isActive: false }} size="sm" tooltip={false} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">
                        {u.name} <span className="text-muted-foreground">(ปิดใช้งาน)</span>
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">{u.position ?? u.department ?? ''}</span>
                    </span>
                    <CheckIcon className="size-4 text-primary" />
                  </CommandItem>
                ))}
            </CommandGroup>
          </CommandList>
        </Command>
        {!single && value.length > 0 && (
          <div className="border-t p-1.5">
            <Button type="button" variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => onChange([])}>
              ล้างการเลือก
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
