import type { Product } from '@flowtrade/shared'
import { PackageIcon, PlusIcon, RotateCwIcon, SearchIcon, SearchXIcon, XIcon } from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'
import { productMutations, useProducts, useProposals } from '@/api/hooks'
import { useAuth } from '@/auth/auth'
import { EmptyState, PageHeader, useConfirm } from '@/components/common/misc'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ProductFormDialog } from '@/features/admin-master/product-form-dialog'
import { ProductCardList, ProductListSkeleton, ProductTable, type ProductRowActions } from '@/features/admin-master/product-list'
import { useIsMobile } from '@/hooks/use-mobile'

const ALL = '__all__'
type StatusFilter = 'all' | 'active' | 'inactive'
const STATUS_OPTIONS: { value: Exclude<StatusFilter, 'all'>; label: string }[] = [
  { value: 'active', label: 'ใช้งานอยู่' },
  { value: 'inactive', label: 'ปิดใช้งาน' },
]

/** Distinct values with counts, sorted A→Z (Thai-aware). */
function facet(products: Product[], pick: (p: Product) => string) {
  const counts = new Map<string, number>()
  for (const p of products) {
    const v = pick(p).trim()
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'th')).map(([value, count]) => ({ value, count }))
}

function matches(p: Product, needle: string) {
  if (!needle) return true
  return [p.sku, p.name, p.brand, p.category, p.size, p.barcode].some((f) => f?.toLowerCase().includes(needle))
}

function FilterSelect({ id, label, value, onChange, allLabel, options }: { id: string; label: string; value: string; onChange: (v: string) => void; allLabel: string; options: { value: string; label: string; count?: number }[] }) {
  const selected = options.find((o) => o.value === value)
  return (
    <div className="min-w-0">
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="h-8 w-full sm:w-44">
          <SelectValue placeholder={allLabel}>{selected?.label ?? allLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className="[&>span:last-child]:flex-1">
              <span className="truncate">{o.label}</span>
              {o.count !== undefined && <span className="tabular ml-auto pl-2 text-xs text-muted-foreground">{o.count}</span>}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export default function AdminProductsPage() {
  const isMobile = useIsMobile()
  const { can } = useAuth()
  const canManage = can('product.manage')
  const { data: products, isLoading, isError, refetch, isFetching } = useProducts('', true)
  // No product-usage endpoint yet — derive "used in N proposals" from the full proposal list.
  const { data: proposals } = useProposals({ scope: 'all', status: 'ALL' })
  const update = productMutations.useUpdate()
  const remove = productMutations.useRemove()
  const [confirm, confirmDialog] = useConfirm()
  const [dialog, setDialog] = useState<{ open: boolean; product: Product | null }>({ open: false, product: null })

  const [q, setQ] = useState('')
  const [brand, setBrand] = useState(ALL)
  const [category, setCategory] = useState(ALL)
  const [status, setStatus] = useState<StatusFilter>('all')
  const needle = useDeferredValue(q.trim().toLowerCase())

  const all = useMemo(() => products ?? [], [products])
  const usage = useMemo(() => {
    if (!proposals) return undefined
    const out: Record<string, number> = {}
    for (const p of proposals) for (const id of p.productIds) out[id] = (out[id] ?? 0) + 1
    return out
  }, [proposals])
  const brands = useMemo(() => facet(all, (p) => p.brand), [all])
  const categories = useMemo(() => facet(all, (p) => p.category), [all])

  const filtered = useMemo(
    () =>
      all.filter(
        (p) =>
          (brand === ALL || p.brand === brand) &&
          (category === ALL || p.category === category) &&
          (status === 'all' || (status === 'active' ? p.isActive : !p.isActive)) &&
          matches(p, needle),
      ),
    [all, brand, category, status, needle],
  )

  const activeCount = all.filter((p) => p.isActive).length
  const hasFilters = !!q.trim() || brand !== ALL || category !== ALL || status !== 'all'
  const clearFilters = () => {
    setQ('')
    setBrand(ALL)
    setCategory(ALL)
    setStatus('all')
  }

  const actions: ProductRowActions = {
    usageOf: (id) => (usage ? (usage[id] ?? 0) : undefined),
    confirm,
    onEdit: (product) => setDialog({ open: true, product }),
    onSetActive: async (product, isActive) => {
      await update.mutateAsync({ id: product.id, patch: { isActive } })
    },
    onDelete: (product) => remove.mutateAsync(product.id),
  }

  const body = () => {
    if (isLoading) return <ProductListSkeleton mobile={isMobile} />
    if (isError)
      return (
        <EmptyState
          title="โหลดรายการสินค้าไม่สำเร็จ"
          description="ตรวจสอบการเชื่อมต่อแล้วลองใหม่อีกครั้ง"
          action={
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RotateCwIcon className={isFetching ? 'animate-spin' : undefined} /> ลองใหม่
            </Button>
          }
        />
      )
    if (all.length === 0)
      return (
        <EmptyState
          icon={<PackageIcon className="size-5" />}
          title="ยังไม่มีสินค้า"
          description="เพิ่มสินค้า (SKU) เพื่อให้ทีมเลือกได้ในขั้นตอนเสนอสินค้า"
          action={
            canManage && (
              <Button size="sm" onClick={() => setDialog({ open: true, product: null })}>
                <PlusIcon /> เพิ่มสินค้าแรก
              </Button>
            )
          }
        />
      )
    if (filtered.length === 0)
      return (
        <EmptyState
          icon={<SearchXIcon className="size-5" />}
          title="ไม่พบสินค้าที่ตรงกับเงื่อนไข"
          description={q.trim() ? `ไม่มีสินค้าที่ตรงกับ “${q.trim()}” — ลองค้นด้วย SKU หรือบาร์โค้ด หรือล้างตัวกรอง` : 'ลองเปลี่ยนแบรนด์ หมวดหมู่ หรือสถานะ'}
          action={
            <Button variant="outline" size="sm" onClick={clearFilters}>
              ล้างตัวกรองทั้งหมด
            </Button>
          }
        />
      )
    return isMobile ? <ProductCardList products={filtered} actions={actions} /> : <ProductTable products={filtered} actions={actions} />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="ข้อมูลหลัก"
        title="สินค้า"
        description="รายการสินค้า (SKU) ที่ทีมเลือกได้ตอนเสนอสินค้า — สินค้าที่อยู่ในการเสนอแล้วลบไม่ได้ แต่ปิดการใช้งานได้"
        actions={
          canManage && (
            <Button onClick={() => setDialog({ open: true, product: null })}>
              <PlusIcon /> เพิ่มสินค้า
            </Button>
          )
        }
      />

      {/* Summary */}
      {products && all.length > 0 && (
        <dl className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
          {[
            { label: 'สินค้าทั้งหมด', value: all.length, tone: 'text-foreground' },
            { label: 'ใช้งานอยู่', value: activeCount, tone: 'text-success' },
            { label: 'แบรนด์', value: brands.length, tone: 'text-foreground' },
            { label: 'หมวดหมู่', value: categories.length, tone: 'text-foreground' },
          ].map((s) => (
            <div key={s.label} className="flex items-baseline gap-2 rounded-lg border bg-card px-3 py-2">
              <dt className="text-xs text-muted-foreground">{s.label}</dt>
              <dd className={`tabular ml-auto text-base font-semibold sm:ml-0 ${s.tone}`}>{s.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="space-y-3">
        {/* Toolbar */}
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="lg:w-80">
            <Label htmlFor="product-search" className="sr-only">
              ค้นหาสินค้า
            </Label>
            <InputGroup>
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput id="product-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา SKU, ชื่อ, แบรนด์ หรือบาร์โค้ด" autoComplete="off" />
              {q && (
                <InputGroupAddon align="inline-end">
                  <InputGroupButton size="icon-xs" aria-label="ล้างคำค้นหา" onClick={() => setQ('')}>
                    <XIcon />
                  </InputGroupButton>
                </InputGroupAddon>
              )}
            </InputGroup>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <FilterSelect id="filter-brand" label="กรองตามแบรนด์" value={brand} onChange={setBrand} allLabel="ทุกแบรนด์" options={brands.map((b) => ({ value: b.value, label: b.value, count: b.count }))} />
            <FilterSelect id="filter-category" label="กรองตามหมวดหมู่" value={category} onChange={setCategory} allLabel="ทุกหมวด" options={categories.map((c) => ({ value: c.value, label: c.value, count: c.count }))} />
            <FilterSelect
              id="filter-status"
              label="กรองตามสถานะ"
              value={status === 'all' ? ALL : status}
              onChange={(v) => setStatus(v === 'active' || v === 'inactive' ? v : 'all')}
              allLabel="ทุกสถานะ"
              options={STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label, count: o.value === 'active' ? activeCount : all.length - activeCount }))}
            />
          </div>
          <div className="flex items-center justify-between gap-3 lg:ml-auto">
            {products && (
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {hasFilters ? (
                  <>
                    พบ <span className="tabular font-semibold text-foreground">{filtered.length}</span> จาก <span className="tabular">{all.length}</span> รายการ
                  </>
                ) : (
                  <>
                    <span className="tabular font-semibold text-foreground">{all.length}</span> รายการ
                  </>
                )}
              </p>
            )}
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <XIcon /> ล้างตัวกรอง
              </Button>
            )}
          </div>
        </div>

        {body()}
      </div>

      <ProductFormDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        product={dialog.product}
        products={all}
        brands={brands.map((b) => b.value)}
        categories={categories.map((c) => c.value)}
      />
      {confirmDialog}
    </div>
  )
}
