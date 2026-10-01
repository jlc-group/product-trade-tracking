// Individual filter controls. Each takes an `id` so the same control can render both inline
// (desktop) and inside the mobile filter sheet without clashing ids.
import { CHANNEL_SHORT, CHANNEL_TERMS, STATUS_LABEL, STATUS_ORDER, type Channel, type ShelfType, type Store, type User } from '@flowtrade/shared'
import { GlobeIcon, LayoutListIcon, StoreIcon, UserIcon, UsersIcon } from 'lucide-react'
import { StoreLogo, statusDotClass } from '@/components/common/badges'
import { UserAvatar } from '@/components/common/user-avatar'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import type { Scope, StatusFilter } from './params'

const ALL = '__all__'
const CHANNELS: Channel[] = ['OFFLINE', 'ONLINE']

interface FieldProps<T> {
  id: string
  value: T
  onChange: (value: T) => void
  className?: string
}

export function StatusSelect({ id, value, onChange, className }: FieldProps<StatusFilter>) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as StatusFilter)}>
      <SelectTrigger id={id} className={cn('w-full', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        <SelectItem value="ALL">ทุกสถานะ</SelectItem>
        <SelectItem value="ACTIVE">
          <span className="size-1.5 rounded-full bg-primary/70" aria-hidden />
          กำลังทำ (ยังไม่ปิดงาน)
        </SelectItem>
        <SelectSeparator />
        {STATUS_ORDER.map((s) => (
          <SelectItem key={s} value={s}>
            <span className={cn('size-1.5 rounded-full', statusDotClass(s))} aria-hidden />
            {STATUS_LABEL[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function StoreSelect({ id, value, onChange, stores, channel, className }: FieldProps<string | null> & { stores: Store[]; channel: Channel | null }) {
  const groups = CHANNELS.filter((c) => !channel || c === channel)
    .map((c) => ({ channel: c, items: stores.filter((s) => s.channel === c) }))
    .filter((g) => g.items.length > 0)
  return (
    <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? null : v)}>
      <SelectTrigger id={id} className={cn('w-full', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="start" className="max-h-80">
        <SelectItem value={ALL}>
          <StoreIcon className="text-muted-foreground" aria-hidden />
          ทุกห้าง / แพลตฟอร์ม
        </SelectItem>
        {groups.map((g) => (
          <SelectGroup key={g.channel}>
            <SelectSeparator />
            <SelectLabel>
              {CHANNEL_SHORT[g.channel]} · {CHANNEL_TERMS[g.channel].store}
            </SelectLabel>
            {g.items.map((s) => (
              <SelectItem key={s.id} value={s.id} className={cn(!s.isActive && 'text-muted-foreground')}>
                <StoreLogo store={s} size="sm" className="h-5 min-w-5 text-[8px]" />
                <span className="truncate">{s.name}</span>
                {!s.isActive && <span className="text-xs">(ปิดใช้งาน)</span>}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}

export function ShelfTypeSelect({ id, value, onChange, shelfTypes, channel, className }: FieldProps<string | null> & { shelfTypes: ShelfType[]; channel: Channel | null }) {
  const groups = CHANNELS.filter((c) => !channel || c === channel)
    .map((c) => ({ channel: c, items: shelfTypes.filter((s) => s.channel === c) }))
    .filter((g) => g.items.length > 0)
  return (
    <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? null : v)}>
      <SelectTrigger id={id} className={cn('w-full', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="start" className="max-h-80">
        <SelectItem value={ALL}>
          <LayoutListIcon className="text-muted-foreground" aria-hidden />
          ทุกประเภท Shelf
        </SelectItem>
        {groups.map((g) => (
          <SelectGroup key={g.channel}>
            <SelectSeparator />
            <SelectLabel>
              {CHANNEL_SHORT[g.channel]} · {CHANNEL_TERMS[g.channel].shelf}
            </SelectLabel>
            {g.items.map((s) => (
              <SelectItem key={s.id} value={s.id} className={cn(!s.isActive && 'text-muted-foreground')}>
                <span className="size-2 rounded-sm" style={{ backgroundColor: s.color }} aria-hidden />
                <span className="truncate">{s.name}</span>
                {!s.isActive && <span className="text-xs">(ปิดใช้งาน)</span>}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}

export function OwnerSelect({ id, value, onChange, users, meId, className }: FieldProps<string | null> & { users: User[]; meId: string }) {
  const me = users.find((u) => u.id === meId)
  const others = users.filter((u) => u.id !== meId)
  return (
    <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? null : v)}>
      <SelectTrigger id={id} className={cn('w-full', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="start" className="max-h-80">
        <SelectItem value={ALL}>
          <UsersIcon className="text-muted-foreground" aria-hidden />
          เจ้าของทุกคน
        </SelectItem>
        {me && (
          <SelectItem value={me.id}>
            <UserAvatar user={me} size="xs" tooltip={false} className="ring-0" />
            <span className="truncate">{me.name}</span>
            <span className="text-xs text-muted-foreground">(ฉัน)</span>
          </SelectItem>
        )}
        {others.length > 0 && <SelectSeparator />}
        {others.map((u) => (
          <SelectItem key={u.id} value={u.id}>
            <UserAvatar user={u} size="xs" tooltip={false} className="ring-0" />
            <span className="truncate">{u.name}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Segmented control: ทั้งหมด / Offline / Online. */
export function ChannelToggle({ value, onChange, className }: { value: Channel | null; onChange: (v: Channel | null) => void; className?: string }) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      spacing={0}
      value={value ?? ALL}
      onValueChange={(v) => v && onChange(v === ALL ? null : (v as Channel))}
      aria-label="ช่องทางการขาย"
      className={cn('bg-card', className)}
    >
      <ToggleGroupItem value={ALL} className="px-3 data-[state=on]:bg-secondary data-[state=on]:text-foreground">
        ทุกช่องทาง
      </ToggleGroupItem>
      <ToggleGroupItem value="OFFLINE" className="px-3 data-[state=on]:bg-secondary data-[state=on]:text-foreground">
        <StoreIcon aria-hidden className="hidden sm:block" />
        Offline
      </ToggleGroupItem>
      <ToggleGroupItem value="ONLINE" className="px-3 data-[state=on]:bg-info-soft data-[state=on]:text-info">
        <GlobeIcon aria-hidden className="hidden sm:block" />
        Online
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

/** "ของฉัน / ทั้งหมด" — only rendered for users with proposal.read.all. */
export function ScopeToggle({ value, onChange, className }: { value: Scope; onChange: (v: Scope) => void; className?: string }) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      spacing={0}
      value={value}
      onValueChange={(v) => v && onChange(v as Scope)}
      aria-label="ขอบเขตการแสดงผล"
      className={cn('bg-card', className)}
    >
      <ToggleGroupItem value="mine" className="px-3 data-[state=on]:bg-brand-soft data-[state=on]:text-brand">
        <UserIcon aria-hidden />
        ของฉัน
      </ToggleGroupItem>
      <ToggleGroupItem value="all" className="px-3 data-[state=on]:bg-brand-soft data-[state=on]:text-brand">
        <UsersIcon aria-hidden />
        ทั้งหมด
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
