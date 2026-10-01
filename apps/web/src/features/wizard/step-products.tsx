import type { Product } from '@flowtrade/shared'
import { Loader2Icon, PackageSearchIcon, PlusIcon, SearchIcon, XIcon } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { useProducts } from '@/api/hooks'
import { EmptyState } from '@/components/common/misc'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { ChoiceCard } from './choice-card'
import { QuickAddProductDialog } from './quick-add-product-dialog'

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

export function StepProducts({
  selected,
  onToggle,
  onAdd,
  onRemove,
  onClear,
}: {
  selected: Product[]
  onToggle: (product: Product) => void
  onAdd: (product: Product) => void
  onRemove: (id: string) => void
  onClear: () => void
}) {
  const id = useId()
  const [q, setQ] = useState('')
  const debouncedQ = useDebounced(q.trim(), 250)
  // keepPrevious: the last results stay on screen while a new search loads (no skeleton flash per keystroke).
  const { data: products, isLoading, isFetching } = useProducts(debouncedQ, false, { keepPrevious: true })
  const [addOpen, setAddOpen] = useState(false)
  const selectedIds = new Set(selected.map((p) => p.id))

  return (
    <div className="space-y-5">
      {/* Selected chips */}
      <div className="rounded-xl border bg-card p-3 sm:p-4" aria-live="polite">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-medium">
            เลือกแล้ว <span className="tabular text-primary">{selected.length}</span> รายการ
          </p>
          {selected.length > 0 && (
            <Button type="button" variant="ghost" size="xs" className="text-muted-foreground" onClick={onClear}>
              ล้างทั้งหมด
            </Button>
          )}
        </div>
        {selected.length === 0 ? (
          <p className="text-sm text-muted-foreground">ยังไม่ได้เลือกสินค้า — แตะที่การ์ดสินค้าด้านล่างเพื่อเลือก</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {selected.map((p) => (
              <li key={p.id} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-primary/25 bg-brand-soft py-0.5 pr-1 pl-2.5 text-xs text-brand">
                <span className="tabular shrink-0 font-semibold">{p.sku}</span>
                <span className="truncate">{p.name}</span>
                <button
                  type="button"
                  onClick={() => onRemove(p.id)}
                  aria-label={`เอา ${p.name} ออก`}
                  className="flex size-5 shrink-0 items-center justify-center rounded-full outline-none hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <XIcon className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Search + quick add */}
      <div className="flex flex-col gap-2 @md:flex-row @md:items-end">
        <div className="grid flex-1 gap-1.5">
          <Label htmlFor={`${id}-search`} className="sr-only">
            ค้นหาสินค้า
          </Label>
          <InputGroup className="h-10 bg-card">
            <InputGroupAddon>{isFetching && products ? <Loader2Icon className="animate-spin" /> : <SearchIcon />}</InputGroupAddon>
            <InputGroupInput id={`${id}-search`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาด้วยชื่อ, SKU, แบรนด์, หมวดหมู่ หรือบาร์โค้ด" autoComplete="off" />
            {q && (
              <InputGroupAddon align="inline-end">
                <button type="button" aria-label="ล้างคำค้นหา" onClick={() => setQ('')} className="rounded p-0.5 hover:bg-muted hover:text-foreground">
                  <XIcon className="size-3.5" />
                </button>
              </InputGroupAddon>
            )}
          </InputGroup>
        </div>
        <Button type="button" variant="outline" className="h-10 gap-1.5" onClick={() => setAddOpen(true)}>
          <PlusIcon />
          เพิ่มสินค้าใหม่
        </Button>
      </div>

      {/* Results */}
      {isLoading && !products ? (
        <div className="grid gap-3 @xl:grid-cols-2 @4xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[92px] rounded-xl" />
          ))}
        </div>
      ) : !products || products.length === 0 ? (
        <EmptyState
          icon={<PackageSearchIcon className="size-5" />}
          title={debouncedQ ? `ไม่พบสินค้าที่ตรงกับ “${debouncedQ}”` : 'ยังไม่มีสินค้าในระบบ'}
          description={debouncedQ ? 'ลองค้นด้วยคำอื่น หรือเพิ่มเป็นสินค้าใหม่ได้เลย' : 'เพิ่มสินค้าตัวแรกเพื่อเริ่มการเสนอ'}
          action={
            <Button type="button" size="sm" onClick={() => setAddOpen(true)}>
              <PlusIcon />
              {debouncedQ ? `เพิ่ม “${debouncedQ}” เป็นสินค้าใหม่` : 'เพิ่มสินค้าใหม่'}
            </Button>
          }
        />
      ) : (
        <>
          <p className="tabular text-xs text-muted-foreground">
            {debouncedQ ? `พบ ${products.length} รายการ` : `สินค้าทั้งหมด ${products.length} รายการ`}
          </p>
          <div className={cn('grid gap-3 @xl:grid-cols-2 @4xl:grid-cols-3', isFetching && 'opacity-70 transition-opacity')}>
            {products.map((p) => (
              <ChoiceCard key={p.id} mode="checkbox" selected={selectedIds.has(p.id)} onSelect={() => onToggle(p)} className="p-3.5">
                <ProductCardBody product={p} />
              </ChoiceCard>
            ))}
          </div>
        </>
      )}

      <QuickAddProductDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        initialName={q}
        onCreated={(p) => {
          onAdd(p)
          setAddOpen(false)
          setQ('')
        }}
      />
    </div>
  )
}

function ProductCardBody({ product }: { product: Product }) {
  return (
    <span className="min-w-0 flex-1 space-y-1">
      <span className="flex items-center justify-between gap-2">
        <span className="tabular truncate font-mono text-[11px] font-medium tracking-tight text-muted-foreground">{product.sku}</span>
        {product.category && <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{product.category}</span>}
      </span>
      <span className="line-clamp-2 block text-sm leading-snug font-medium">{product.name}</span>
      <span className="block truncate text-xs text-muted-foreground">
        {[product.brand, product.size].filter(Boolean).join(' · ') || '—'}
      </span>
    </span>
  )
}
