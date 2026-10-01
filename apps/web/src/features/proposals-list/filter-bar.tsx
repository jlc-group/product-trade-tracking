import type { Channel } from '@flowtrade/shared'
import { FilterXIcon, SearchIcon, SlidersHorizontalIcon, XIcon } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useShelfTypes, useStores, useUserLookup } from '@/api/hooks'
import { useCurrentUser } from '@/auth/auth'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { ChannelToggle, OwnerSelect, ScopeToggle, ShelfTypeSelect, StatusSelect, StoreSelect } from './filter-fields'
import type { ListParamsApi } from './params'

/** Debounced search box bound to ?q=. Press "/" anywhere to focus it, Esc to clear. */
function SearchBox({ value, onChange, className }: { value: string; onChange: (q: string) => void; className?: string }) {
  const [text, setText] = useState(value)
  const [synced, setSynced] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  // External change (e.g. "ล้างตัวกรอง" or back/forward) → reflect it in the box.
  if (value !== synced) {
    setSynced(value)
    if (value !== text.trim()) setText(value)
  }

  useEffect(() => {
    const next = text.trim()
    if (next === value) return
    const t = window.setTimeout(() => onChange(next), 250)
    return () => window.clearTimeout(t)
  }, [text, value, onChange])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement | null
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return
      e.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={cn('min-w-0', className)}>
      <Label htmlFor="proposal-search" className="sr-only">
        ค้นหาการเสนอสินค้า
      </Label>
      <InputGroup className="bg-card">
        <InputGroupAddon>
          <SearchIcon aria-hidden />
        </InputGroupAddon>
        <InputGroupInput
          ref={inputRef}
          id="proposal-search"
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && text) {
              e.preventDefault()
              setText('')
              onChange('')
            }
          }}
          placeholder="ค้นหารหัส ชื่อ สินค้า SKU ห้าง หรือเจ้าของ…"
          autoComplete="off"
          className="[&::-webkit-search-cancel-button]:hidden"
        />
        {text ? (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              aria-label="ล้างคำค้นหา"
              onClick={() => {
                setText('')
                onChange('')
                inputRef.current?.focus()
              }}
            >
              <XIcon />
            </InputGroupButton>
          </InputGroupAddon>
        ) : (
          <InputGroupAddon align="inline-end" className="hidden md:flex">
            <kbd className="rounded border bg-muted px-1.5 font-sans text-[10px] text-muted-foreground">/</kbd>
          </InputGroupAddon>
        )}
      </InputGroup>
    </div>
  )
}

export function FilterBar({ list }: { list: ListParamsApi }) {
  const { params, update, clearFilters, activeFilterCount, canReadAll } = list
  const me = useCurrentUser()
  const { data: stores = [] } = useStores(true)
  const { data: shelfTypes = [] } = useShelfTypes(true)
  const { data: users = [] } = useUserLookup()
  const [sheetOpen, setSheetOpen] = useState(false)

  /** Switching channel drops a store / shelf type that belongs to the other channel. */
  const changeChannel = (channel: Channel | null) => {
    const store = stores.find((s) => s.id === params.storeId)
    const shelf = shelfTypes.find((s) => s.id === params.shelfTypeId)
    update({
      channel,
      storeId: channel && store && store.channel !== channel ? null : params.storeId,
      shelfTypeId: channel && shelf && shelf.channel !== channel ? null : params.shelfTypeId,
    })
  }

  /** Fields shared by the inline bar and the mobile sheet. */
  const fields = (prefix: string, stacked: boolean) => {
    const wrap = (id: string, label: string, control: ReactNode) => (
      <div className={cn('min-w-0', stacked ? 'space-y-1.5' : 'max-w-60 flex-1 basis-40')}>
        <Label htmlFor={`${prefix}-${id}`} className={cn(!stacked && 'sr-only')}>
          {label}
        </Label>
        {control}
      </div>
    )
    const width = stacked ? '' : 'bg-card'
    return (
      <>
        {wrap('status', 'สถานะ', <StatusSelect id={`${prefix}-status`} value={params.status} onChange={(status) => update({ status })} className={width} />)}
        {wrap(
          'store',
          'ห้าง / แพลตฟอร์ม',
          <StoreSelect id={`${prefix}-store`} value={params.storeId} onChange={(storeId) => update({ storeId })} stores={stores} channel={params.channel} className={width} />,
        )}
        {wrap(
          'shelf',
          'ประเภท Shelf',
          <ShelfTypeSelect id={`${prefix}-shelf`} value={params.shelfTypeId} onChange={(shelfTypeId) => update({ shelfTypeId })} shelfTypes={shelfTypes} channel={params.channel} className={width} />,
        )}
        {wrap('owner', 'เจ้าของงาน', <OwnerSelect id={`${prefix}-owner`} value={params.ownerId} onChange={(ownerId) => update({ ownerId })} users={users} meId={me.id} className={width} />)}
      </>
    )
  }

  // Search, scope and channel are always visible; the four selects move into a sheet on phones.
  const sheetFilterCount = (params.status !== 'ALL' ? 1 : 0) + (params.storeId ? 1 : 0) + (params.shelfTypeId ? 1 : 0) + (params.ownerId ? 1 : 0)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={params.q} onChange={(q) => update({ q })} className="w-full flex-1 basis-full sm:basis-72 lg:max-w-md" />
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {canReadAll && <ScopeToggle value={params.scope} onChange={(scope) => update({ scope })} />}
          <ChannelToggle value={params.channel} onChange={changeChannel} />
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="ml-auto h-8 md:hidden">
                <SlidersHorizontalIcon />
                ตัวกรอง
                {sheetFilterCount > 0 && <span className="tabular ml-0.5 rounded-full bg-primary px-1.5 text-[10px] leading-4 font-semibold text-primary-foreground">{sheetFilterCount}</span>}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl">
              <SheetHeader className="pb-0">
                <SheetTitle>ตัวกรอง</SheetTitle>
                <SheetDescription>เลือกเงื่อนไขแล้วรายการจะอัปเดตทันที</SheetDescription>
              </SheetHeader>
              <div className="grid gap-4 px-4">{fields('m', true)}</div>
              <SheetFooter className="flex-row gap-2">
                {activeFilterCount > 0 && (
                  <Button variant="outline" className="h-9 flex-1" onClick={clearFilters}>
                    <FilterXIcon />
                    ล้างตัวกรอง
                  </Button>
                )}
                <Button className="h-9 flex-1" onClick={() => setSheetOpen(false)}>
                  ดูผลลัพธ์
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <div className="hidden flex-wrap items-center gap-2 md:flex">
        {fields('d', false)}
        {activeFilterCount > 0 && (
          <Button variant="ghost" className="shrink-0 text-muted-foreground" onClick={clearFilters}>
            <FilterXIcon />
            ล้างตัวกรอง
          </Button>
        )}
      </div>
    </div>
  )
}
