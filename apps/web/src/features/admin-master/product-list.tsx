import type { Product } from '@flowtrade/shared'
import { BarcodeIcon } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { ActiveSwitch, DeleteButton, EditButton, InactiveBadge, UsageLabel, useActiveToggle, type ConfirmFn } from './row-controls'

export interface ProductRowActions {
  usageOf: (id: string) => number | undefined
  confirm: ConfirmFn
  onEdit: (product: Product) => void
  /** Resolve after the list has refetched. */
  onSetActive: (product: Product, active: boolean) => Promise<unknown>
  onDelete: (product: Product) => Promise<unknown>
}

function useProductRow(product: Product, actions: ProductRowActions) {
  const { checked, pending, toggle } = useActiveToggle({ name: product.sku, isActive: product.isActive, setActive: (v) => actions.onSetActive(product, v) })
  const del = (
    <DeleteButton
      name={product.sku}
      noun="สินค้า"
      usage={actions.usageOf(product.id)}
      isActive={checked}
      confirm={actions.confirm}
      onDelete={() => actions.onDelete(product)}
      onDeactivate={() => toggle(false)}
    />
  )
  return { checked, pending, toggle, del }
}

// ---------- desktop table ----------

export function ProductTable({ products, actions }: { products: Product[]; actions: ProductRowActions }) {
  return (
    <div className="rounded-xl border bg-card">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4 text-xs font-medium text-muted-foreground">SKU</TableHead>
            <TableHead className="text-xs font-medium text-muted-foreground">ชื่อสินค้า</TableHead>
            <TableHead className="text-xs font-medium text-muted-foreground">แบรนด์</TableHead>
            <TableHead className="text-xs font-medium text-muted-foreground">หมวดหมู่</TableHead>
            <TableHead className="text-xs font-medium text-muted-foreground">ขนาด</TableHead>
            <TableHead className="text-xs font-medium text-muted-foreground">บาร์โค้ด</TableHead>
            <TableHead className="text-xs font-medium text-muted-foreground">การใช้งาน</TableHead>
            <TableHead className="text-xs font-medium text-muted-foreground">สถานะ</TableHead>
            <TableHead className="pr-4 text-right text-xs font-medium text-muted-foreground">
              <span className="sr-only">จัดการ</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((p) => (
            <ProductTableRow key={p.id} product={p} actions={actions} />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function ProductTableRow({ product: p, actions }: { product: Product; actions: ProductRowActions }) {
  const { checked, pending, toggle, del } = useProductRow(p, actions)
  const muted = !checked
  return (
    <TableRow className={cn(muted && 'bg-muted/30')}>
      <TableCell className="pl-4">
        <span className={cn('font-mono text-xs font-medium tracking-wide', muted && 'text-muted-foreground')}>{p.sku}</span>
      </TableCell>
      <TableCell className="max-w-80 min-w-56 whitespace-normal">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn('leading-snug font-medium', muted && 'text-muted-foreground')}>{p.name}</span>
          {muted && <InactiveBadge />}
        </div>
      </TableCell>
      <TableCell className={cn(muted && 'text-muted-foreground')}>{p.brand}</TableCell>
      <TableCell>
        <span className="inline-flex h-5 items-center rounded-md bg-muted px-1.5 text-xs text-muted-foreground">{p.category}</span>
      </TableCell>
      <TableCell className="text-muted-foreground">{p.size ?? '—'}</TableCell>
      <TableCell className="tabular font-mono text-xs text-muted-foreground">{p.barcode ?? '—'}</TableCell>
      <TableCell>
        <UsageLabel count={actions.usageOf(p.id)} />
      </TableCell>
      <TableCell>
        <ActiveSwitch name={p.sku} checked={checked} pending={pending} onCheckedChange={toggle} />
      </TableCell>
      <TableCell className="pr-4">
        <div className="flex items-center justify-end gap-0.5">
          <EditButton name={p.sku} onClick={() => actions.onEdit(p)} />
          {del}
        </div>
      </TableCell>
    </TableRow>
  )
}

// ---------- mobile cards ----------

export function ProductCardList({ products, actions }: { products: Product[]; actions: ProductRowActions }) {
  return (
    <ul className="space-y-2" aria-label="รายการสินค้า">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} actions={actions} />
      ))}
    </ul>
  )
}

function ProductCard({ product: p, actions }: { product: Product; actions: ProductRowActions }) {
  const { checked, pending, toggle, del } = useProductRow(p, actions)
  const muted = !checked
  return (
    <li className={cn('rounded-xl border bg-card p-3', muted && 'bg-muted/30')}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="font-mono font-medium tracking-wide text-foreground">{p.sku}</span>
            {p.size && <span>· {p.size}</span>}
            {muted && <InactiveBadge />}
          </div>
          <p className={cn('leading-snug font-medium', muted && 'text-muted-foreground')}>{p.name}</p>
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span className="inline-flex h-5 items-center rounded-md border px-1.5 text-xs">{p.brand}</span>
            <span className="inline-flex h-5 items-center rounded-md bg-muted px-1.5 text-xs text-muted-foreground">{p.category}</span>
            {p.barcode && (
              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground tabular">
                <BarcodeIcon className="size-3.5" aria-label="บาร์โค้ด" />
                {p.barcode}
              </span>
            )}
          </div>
        </div>
        <ActiveSwitch name={p.sku} checked={checked} pending={pending} onCheckedChange={toggle} showState={false} />
      </div>
      <div className="mt-2.5 flex items-center justify-between border-t pt-2">
        <UsageLabel count={actions.usageOf(p.id)} />
        <div className="flex items-center gap-0.5">
          <EditButton name={p.sku} onClick={() => actions.onEdit(p)} />
          {del}
        </div>
      </div>
    </li>
  )
}

// ---------- loading ----------

export function ProductListSkeleton({ mobile }: { mobile: boolean }) {
  if (mobile)
    return (
      <div className="space-y-2" aria-busy="true" aria-label="กำลังโหลดสินค้า">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="space-y-2 rounded-xl border bg-card p-3">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-4 w-56 max-w-full" />
            <div className="flex gap-1.5">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-16" />
            </div>
          </div>
        ))}
      </div>
    )
  return (
    <div className="rounded-xl border bg-card" aria-busy="true" aria-label="กำลังโหลดสินค้า">
      <div className="flex gap-6 border-b bg-muted/40 px-4 py-3">
        {[16, 40, 16, 16, 12, 24, 16, 12].map((w, i) => (
          <Skeleton key={i} className="h-3" style={{ width: `${w * 4}px` }} />
        ))}
      </div>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex items-center gap-6 border-b px-4 py-3.5 last:border-0">
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-3.5 w-56" />
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-3.5 w-12" />
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="ml-auto h-5 w-9 rounded-full" />
        </div>
      ))}
    </div>
  )
}
