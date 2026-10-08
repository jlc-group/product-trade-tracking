import { MANUFACTURER_NAME_MAX, type Manufacturer } from '@flowtrade/shared'
import { ChevronsUpDownIcon, Loader2Icon, PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ApiError } from '@/api'
import { errorMessage, manufacturerMutations, useManufacturers } from '@/api/hooks'
import { useAuth } from '@/auth/auth'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

type Known = Pick<Manufacturer, 'id' | 'name' | 'isActive'> & { note?: string | null }

interface Props {
  id: string
  value: string | null
  onChange: (id: string | null) => void
  /** Manufacturers the record already names, so a deactivated current value still shows (and stays pickable). */
  known?: Pick<Manufacturer, 'id' | 'name' | 'isActive'>[]
  invalid?: boolean
  'aria-describedby'?: string
}

/** Trim and collapse inner spaces — how the API stores a name (and compares it, ignoring case). */
const cleanName = (raw: string) => raw.trim().replace(/\s+/g, ' ')
const sameName = (a: string, b: string) => cleanName(a).toLowerCase() === cleanName(b).toLowerCase()

/**
 * "บริษัทรับผลิต" combobox: search the active list, or add the typed name as a new manufacturer and pick it. Editing,
 * deactivating and ordering the list stay on the admin page (/admin/manufacturers).
 */
export function ManufacturerPicker({ id, value, onChange, known = [], invalid, 'aria-describedby': describedBy }: Props) {
  const { can } = useAuth()
  // ADMIN only: they can re-enable a deactivated one on /admin/manufacturers.
  const canManage = can('manufacturer.manage')
  // Same rule as POST /manufacturers (products precedent): whoever can start a project may add one here.
  const canAdd = canManage || can('proposal.create')
  // Deactivated ones too (any signed-in user may list them): only active ones are offered, but an inactive current value
  // keeps its name and a typed name that matches one points there instead of failing on save.
  const { data: list = [], isPending } = useManufacturers(true)
  const create = manufacturerMutations.useQuickCreate()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  // Shown even if the refetch after the add hasn't landed.
  const [created, setCreated] = useState<Known | null>(null)

  const byId = new Map<string, Known>()
  for (const m of [...known, ...(created ? [created] : []), ...list]) byId.set(m.id, m)
  const current = value ? byId.get(value) : undefined
  const options: Known[] = list.filter((m) => m.isActive)
  if (current && !options.some((m) => m.id === current.id)) options.unshift(current)

  const name = cleanName(q)
  const needle = name.toLowerCase()
  const shown = needle ? options.filter((m) => m.name.toLowerCase().includes(needle)) : options
  const match = name ? [...byId.values()].find((m) => sameName(m.name, name)) : undefined
  const inactiveMatch = match && !match.isActive && match.id !== value ? match : null

  const setOpenAndReset = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setQ('')
      setCreateError(null)
    }
  }

  const pick = (pickedId: string) => {
    onChange(pickedId)
    setOpenAndReset(false)
  }

  async function add() {
    if (!name || create.isPending) return
    if (name.length > MANUFACTURER_NAME_MAX) {
      setCreateError(`ชื่อบริษัทยาวเกินไป (ไม่เกิน ${MANUFACTURER_NAME_MAX} ตัวอักษร)`)
      return
    }
    setCreateError(null)
    try {
      const m = await create.mutateAsync({ name })
      setCreated(m)
      toast.success(`เพิ่มบริษัท “${m.name}” แล้ว และเลือกไว้ให้เรียบร้อย`)
      pick(m.id)
    } catch (error) {
      // A name problem (duplicate, also of a deactivated one) stays here under the search box; anything else is a toast.
      if (error instanceof ApiError && error.status === 422) setCreateError(error.fields?.name ?? error.message)
      else toast.error(errorMessage(error))
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpenAndReset}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" aria-invalid={invalid || undefined} aria-describedby={describedBy} className="h-9 w-full min-w-0 justify-between font-normal">
          <span className={cn('truncate', !current && 'text-muted-foreground')}>
            {current ? current.name : value && isPending ? 'กำลังโหลด…' : 'เลือกบริษัทรับผลิต'}
            {current && !current.isActive && <span className="text-muted-foreground"> (ปิดใช้งาน)</span>}
          </span>
          <ChevronsUpDownIcon className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      {/* Enter picks inside the list; it must not reach the dialog's form around the trigger. */}
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start" onKeyDown={(e) => e.key === 'Enter' && e.stopPropagation()}>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="ค้นหาหรือพิมพ์ชื่อบริษัท…"
            value={q}
            onValueChange={(v) => {
              setQ(v)
              setCreateError(null)
            }}
            aria-invalid={createError ? true : undefined}
            aria-describedby={createError ? `${id}-create-error` : undefined}
          />
          {createError && (
            <p id={`${id}-create-error`} role="alert" className="px-3 pt-2 text-xs text-danger">
              {createError}
            </p>
          )}
          <CommandList className="max-h-64">
            <CommandEmpty>{isPending ? 'กำลังโหลดรายชื่อบริษัท…' : 'ไม่พบบริษัท'}</CommandEmpty>
            {shown.length > 0 && (
              <CommandGroup>
                {shown.map((m) => (
                  <CommandItem key={m.id} value={m.id} onSelect={() => pick(m.id)} data-checked={m.id === value}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">
                        {m.name}
                        {!m.isActive && <span className="text-muted-foreground"> (ปิดใช้งาน)</span>}
                      </span>
                      {m.note && <span className="block truncate text-xs text-muted-foreground">{m.note}</span>}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {inactiveMatch && (
              <CommandGroup className={cn(shown.length > 0 && 'border-t')}>
                <CommandItem value="__inactive__" disabled>
                  <span className="min-w-0 flex-1 text-xs break-words">
                    “{inactiveMatch.name}” ถูกปิดใช้งาน — {canManage ? 'เปิดใช้งานได้ที่หน้าบริษัทรับผลิต' : 'ติดต่อผู้ดูแลระบบเพื่อเปิดใช้งาน'}
                  </span>
                </CommandItem>
              </CommandGroup>
            )}
            {canAdd && name && !match && (
              <CommandGroup className={cn((shown.length > 0 || inactiveMatch) && 'border-t')}>
                <CommandItem value="__create__" disabled={create.isPending} onSelect={() => void add()} className="text-primary data-selected:text-primary">
                  {create.isPending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
                  <span className="min-w-0 flex-1 break-words">เพิ่ม “{name}” เป็นบริษัทใหม่</span>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
