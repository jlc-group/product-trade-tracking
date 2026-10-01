import type { Product } from '@flowtrade/shared'
import { Loader2Icon, PackagePlusIcon } from 'lucide-react'
import { useId, useMemo, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { productMutations, useProducts } from '@/api/hooks'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface FormState {
  sku: string
  name: string
  brand: string
  category: string
  size: string
  barcode: string
}

const EMPTY: FormState = { sku: '', name: '', brand: '', category: '', size: '', barcode: '' }

export function QuickAddProductDialog({
  open,
  onOpenChange,
  initialName,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialName: string
  onCreated: (product: Product) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        {/* Remount the form each time so it starts from the current search text. */}
        {open && <QuickAddForm initialName={initialName} onCancel={() => onOpenChange(false)} onCreated={onCreated} />}
      </DialogContent>
    </Dialog>
  )
}

function QuickAddForm({ initialName, onCancel, onCreated }: { initialName: string; onCancel: () => void; onCreated: (product: Product) => void }) {
  const id = useId()
  const create = productMutations.useCreate()
  const { data: allProducts = [] } = useProducts('')
  const [form, setForm] = useState<FormState>(() => {
    const text = initialName.trim()
    // A search that looks like a code goes to SKU, anything else to the name.
    return /^[A-Za-z0-9-]+$/.test(text) && /\d/.test(text) ? { ...EMPTY, sku: text.toUpperCase() } : { ...EMPTY, name: text }
  })
  const [touched, setTouched] = useState(false)

  const brands = useMemo(() => [...new Set(allProducts.map((p) => p.brand).filter(Boolean))].sort(), [allProducts])
  const categories = useMemo(() => [...new Set(allProducts.map((p) => p.category).filter(Boolean))].sort(), [allProducts])
  const skuTaken = !!form.sku.trim() && allProducts.some((p) => p.sku === form.sku.trim().toUpperCase())

  const set = (key: keyof FormState) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const missingSku = !form.sku.trim()
  const missingName = !form.name.trim()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setTouched(true)
    if (missingSku || missingName || skuTaken) return
    try {
      const created = await create.mutateAsync({
        sku: form.sku,
        name: form.name,
        brand: form.brand,
        category: form.category,
        size: form.size || null,
        barcode: form.barcode || null,
      })
      toast.success(`เพิ่มสินค้า ${created.sku} แล้ว และเลือกไว้ให้เรียบร้อย`)
      onCreated(created)
    } catch {
      // Error toast comes from the mutation hook.
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <PackagePlusIcon className="size-4 text-primary" />
          เพิ่มสินค้าใหม่
        </DialogTitle>
        <DialogDescription>สินค้าจะถูกบันทึกในระบบและเลือกไว้ในการเสนอครั้งนี้ทันที</DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-sku`}>
            รหัสสินค้า (SKU) <span className="text-danger">*</span>
          </Label>
          <Input
            id={`${id}-sku`}
            value={form.sku}
            onChange={set('sku')}
            placeholder="เช่น SKN-SER-030"
            className="uppercase"
            autoFocus={!form.sku}
            aria-invalid={touched && (missingSku || skuTaken)}
            aria-describedby={`${id}-sku-hint`}
          />
          <p id={`${id}-sku-hint`} className={touched && (missingSku || skuTaken) ? 'text-xs text-danger' : 'text-xs text-muted-foreground'}>
            {skuTaken ? 'รหัสนี้มีอยู่แล้ว ค้นหาด้วยรหัสนี้แล้วเลือกจากรายการได้เลย' : touched && missingSku ? 'กรุณาระบุรหัสสินค้า' : 'ระบบจะแปลงเป็นตัวพิมพ์ใหญ่ให้'}
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-barcode`}>บาร์โค้ด</Label>
          <Input id={`${id}-barcode`} value={form.barcode} onChange={set('barcode')} placeholder="เช่น 8851234567890" inputMode="numeric" />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor={`${id}-name`}>
            ชื่อสินค้า <span className="text-danger">*</span>
          </Label>
          <Input
            id={`${id}-name`}
            value={form.name}
            onChange={set('name')}
            placeholder="เช่น เซรั่มวิตามินซี 30 มล."
            autoFocus={!!form.sku}
            aria-invalid={touched && missingName}
          />
          {touched && missingName && <p className="text-xs text-danger">กรุณาระบุชื่อสินค้า</p>}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-brand`}>แบรนด์</Label>
          <Input id={`${id}-brand`} value={form.brand} onChange={set('brand')} list={`${id}-brands`} placeholder="เลือกหรือพิมพ์ใหม่" />
          <datalist id={`${id}-brands`}>
            {brands.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-category`}>หมวดหมู่</Label>
          <Input id={`${id}-category`} value={form.category} onChange={set('category')} list={`${id}-categories`} placeholder="เลือกหรือพิมพ์ใหม่" />
          <datalist id={`${id}-categories`}>
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-size`}>ขนาด / บรรจุ</Label>
          <Input id={`${id}-size`} value={form.size} onChange={set('size')} placeholder="เช่น 30 มล., 6 ขวด" />
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          ยกเลิก
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? <Loader2Icon className="animate-spin" /> : <PackagePlusIcon />}
          เพิ่มและเลือกสินค้านี้
        </Button>
      </DialogFooter>
    </form>
  )
}
