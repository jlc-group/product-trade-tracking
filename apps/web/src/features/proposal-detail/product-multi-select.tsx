import type { Product } from '@flowtrade/shared'
import { ChevronsUpDownIcon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { useProducts } from '@/api/hooks'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface Props {
  id?: string
  value: string[]
  onChange: (ids: string[]) => void
  /** Products already on the proposal — keeps inactive ones displayable. */
  knownProducts?: Product[]
  invalid?: boolean
  describedBy?: string
}

/** Searchable multi-select for products, with removable SKU chips. */
export function ProductMultiSelect({ id, value, onChange, knownProducts = [], invalid, describedBy }: Props) {
  const [open, setOpen] = useState(false)
  const { data: products = [], isPending } = useProducts()
  const byId = new Map<string, Product>()
  for (const p of [...knownProducts, ...products]) byId.set(p.id, p)
  const selected = value.map((pid) => byId.get(pid)).filter((p): p is Product => !!p)

  const toggle = (pid: string) => onChange(value.includes(pid) ? value.filter((x) => x !== pid) : [...value, pid])

  return (
    <div className="grid gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            className="h-9 w-full justify-between font-normal"
          >
            <span className={cn('truncate', value.length === 0 && 'text-muted-foreground')}>
              {value.length ? `เลือกแล้ว ${value.length} รายการ — กดเพื่อเพิ่มหรือเอาออก` : 'ค้นหาและเลือกสินค้า'}
            </span>
            <ChevronsUpDownIcon className="text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
          <Command>
            <CommandInput placeholder="ค้นหาชื่อสินค้า, SKU หรือแบรนด์…" />
            <CommandList className="max-h-64">
              <CommandEmpty>{isPending ? 'กำลังโหลดสินค้า…' : 'ไม่พบสินค้า — ลองค้นด้วย SKU หรือแบรนด์'}</CommandEmpty>
              <CommandGroup>
                {products.map((p) => {
                  const on = value.includes(p.id)
                  return (
                    <CommandItem key={p.id} value={`${p.sku} ${p.name} ${p.brand}`} onSelect={() => toggle(p.id)} data-checked={on}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{p.name}</span>
                        <span className="tabular block truncate text-xs text-muted-foreground">
                          {p.sku} · {p.brand}
                          {p.size ? ` · ${p.size}` : ''}
                        </span>
                      </span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="สินค้าที่เลือก">
          {selected.map((p) => (
            <li key={p.id} className="inline-flex max-w-full items-center gap-1 rounded-md border bg-muted/40 py-0.5 pr-0.5 pl-2 text-xs">
              <span className="tabular shrink-0 font-medium text-muted-foreground">{p.sku}</span>
              <span className="truncate">{p.name}</span>
              <Button type="button" variant="ghost" size="icon-xs" aria-label={`เอา ${p.name} ออก`} onClick={() => toggle(p.id)}>
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
