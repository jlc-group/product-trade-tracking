import { zodResolver } from '@hookform/resolvers/zod'
import type { Product } from '@flowtrade/shared'
import { Loader2Icon } from 'lucide-react'
import { useId } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { ApiError, type ProductInput } from '@/api'
import { productMutations } from '@/api/hooks'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { fieldAria, FormField } from './form-field'

const schema = z.object({
  sku: z
    .string()
    .trim()
    .min(1, 'กรุณาระบุรหัสสินค้า (SKU)')
    .max(30, 'รหัสสินค้ายาวเกินไป (ไม่เกิน 30 ตัวอักษร)')
    .regex(/^[A-Z0-9][A-Z0-9._-]*$/, 'ใช้ได้เฉพาะ A–Z, 0–9 และ - _ . (ขึ้นต้นด้วยตัวอักษรหรือตัวเลข)'),
  name: z.string().trim().min(1, 'กรุณาระบุชื่อสินค้า').max(120, 'ชื่อสินค้ายาวเกินไป (ไม่เกิน 120 ตัวอักษร)'),
  brand: z.string().trim().min(1, 'กรุณาระบุแบรนด์').max(60, 'ชื่อแบรนด์ยาวเกินไป'),
  category: z.string().trim().min(1, 'กรุณาระบุหมวดหมู่').max(60, 'ชื่อหมวดหมู่ยาวเกินไป'),
  size: z.string().trim().max(30, 'ขนาดยาวเกินไป (ไม่เกิน 30 ตัวอักษร)'),
  barcode: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{8,14}$/.test(v), 'บาร์โค้ดต้องเป็นตัวเลข 8–14 หลัก (EAN-8, EAN-13 หรือ GTIN-14)'),
})
type Values = z.infer<typeof schema>

export function ProductFormDialog({
  open,
  onOpenChange,
  product,
  products,
  brands,
  categories,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null = create */
  product: Product | null
  /** All products (incl. inactive) — for the duplicate SKU / barcode check. */
  products: Product[]
  brands: string[]
  categories: string[]
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <ProductForm key={product?.id ?? 'new'} product={product} products={products} brands={brands} categories={categories} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function ProductForm({ product, products, brands, categories, onDone }: { product: Product | null; products: Product[]; brands: string[]; categories: string[]; onDone: () => void }) {
  const uid = useId()
  const create = productMutations.useCreate()
  const update = productMutations.useUpdate()
  const isEdit = !!product
  const { register, control, handleSubmit, setError, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      sku: product?.sku ?? '',
      name: product?.name ?? '',
      brand: product?.brand ?? '',
      category: product?.category ?? '',
      size: product?.size ?? '',
      barcode: product?.barcode ?? '',
    },
  })
  const { errors, isSubmitting, isDirty } = formState

  const onSubmit = handleSubmit(async (values) => {
    const sku = values.sku.trim().toUpperCase()
    const barcode = values.barcode.trim()
    const dupSku = products.find((p) => p.id !== product?.id && p.sku === sku)
    if (dupSku) {
      setError('sku', { message: `SKU นี้ใช้กับ “${dupSku.name}” อยู่แล้ว${dupSku.isActive ? '' : ' (ปิดใช้งานอยู่)'}` })
      return
    }
    const dupBarcode = barcode ? products.find((p) => p.id !== product?.id && p.barcode === barcode) : undefined
    if (dupBarcode) {
      setError('barcode', { message: `บาร์โค้ดนี้ใช้กับ ${dupBarcode.sku} อยู่แล้ว — ตรวจสอบตัวเลขอีกครั้ง` })
      return
    }
    const input: ProductInput = {
      sku,
      name: values.name.trim(),
      brand: values.brand.trim(),
      category: values.category.trim(),
      size: values.size.trim() || null,
      barcode: barcode || null,
    }
    try {
      if (product) {
        await update.mutateAsync({ id: product.id, patch: input })
      } else {
        await create.mutateAsync(input)
      }
      onDone()
    } catch (error) {
      if (error instanceof ApiError && error.status === 422 && error.message.includes('SKU')) setError('sku', { message: error.message })
    }
  })

  const brandList = `${uid}-brands`
  const categoryList = `${uid}-categories`

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{product ? `แก้ไขสินค้า ${product.sku}` : 'เพิ่มสินค้าใหม่'}</DialogTitle>
        <DialogDescription>{isEdit ? 'การแก้ไขจะแสดงผลในทุกการเสนอสินค้าที่มีสินค้านี้' : 'สินค้าที่เพิ่มจะเลือกได้ในขั้นตอนเสนอสินค้าทันที'}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="product-sku" label="รหัสสินค้า (SKU)" required error={errors.sku?.message} hint="ระบบแปลงเป็นตัวพิมพ์ใหญ่ให้อัตโนมัติ">
          <Controller
            control={control}
            name="sku"
            render={({ field }) => (
              <Input
                {...field}
                onChange={(e) => field.onChange(e.target.value.toUpperCase().replace(/\s+/g, '-'))}
                {...fieldAria('product-sku', errors.sku?.message, true)}
                placeholder="เช่น HB-SR-030"
                autoComplete="off"
                spellCheck={false}
                className="font-mono tracking-wide"
                autoFocus
              />
            )}
          />
        </FormField>
        <FormField id="product-size" label="ขนาด / ปริมาณ" optional error={errors.size?.message}>
          <Input {...register('size')} {...fieldAria('product-size', errors.size?.message)} placeholder="เช่น 30 มล., 100 ก." autoComplete="off" />
        </FormField>
      </div>

      <FormField id="product-name" label="ชื่อสินค้า" required error={errors.name?.message}>
        <Input {...register('name')} {...fieldAria('product-name', errors.name?.message)} placeholder="เช่น เซรั่มบำรุงผิวหน้า สูตรใบบัวบก" autoComplete="off" />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="product-brand" label="แบรนด์" required error={errors.brand?.message} hint={brands.length > 0 ? 'พิมพ์เพื่อเลือกจากแบรนด์ที่มีอยู่' : undefined}>
          <Input {...register('brand')} {...fieldAria('product-brand', errors.brand?.message, brands.length > 0)} list={brandList} placeholder="เช่น ชื่อแบรนด์ของสินค้า" autoComplete="off" />
          <datalist id={brandList}>
            {brands.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </FormField>
        <FormField id="product-category" label="หมวดหมู่" required error={errors.category?.message} hint={categories.length > 0 ? 'พิมพ์เพื่อเลือกจากหมวดที่มีอยู่' : undefined}>
          <Input {...register('category')} {...fieldAria('product-category', errors.category?.message, categories.length > 0)} list={categoryList} placeholder="เช่น Skincare" autoComplete="off" />
          <datalist id={categoryList}>
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </FormField>
      </div>

      <FormField id="product-barcode" label="บาร์โค้ด" optional error={errors.barcode?.message} hint="ตัวเลข 8–14 หลัก" className="sm:max-w-[50%] sm:pr-2">
        <Input {...register('barcode')} {...fieldAria('product-barcode', errors.barcode?.message, true)} inputMode="numeric" placeholder="เช่น 8850123456789" autoComplete="off" className="tabular font-mono" />
      </FormField>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            ยกเลิก
          </Button>
        </DialogClose>
        <Button type="submit" disabled={isSubmitting || (isEdit && !isDirty)}>
          {isSubmitting && <Loader2Icon className="animate-spin" />}
          {isEdit ? 'บันทึกการแก้ไข' : 'เพิ่มสินค้า'}
        </Button>
      </DialogFooter>
    </form>
  )
}
