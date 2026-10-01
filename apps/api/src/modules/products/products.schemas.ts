import { z } from 'zod'
import { zBoolQuery } from '../../common/zod.js'

// Length limits mirror the admin form (apps/web/src/features/admin-master/product-form-dialog.tsx).
// Formats (SKU charset, barcode digits) are NOT enforced: the wizard quick-add accepts free text.
const SKU_AND_NAME_REQUIRED = 'กรุณาระบุรหัสและชื่อสินค้า'

/** Trimmed and upper-cased (stored upper-case). */
const zSku = z
  .string({ error: SKU_AND_NAME_REQUIRED })
  .trim()
  .min(1, SKU_AND_NAME_REQUIRED)
  .max(30, 'รหัสสินค้ายาวเกินไป (ไม่เกิน 30 ตัวอักษร)')
  .transform((v) => v.toUpperCase())
const zName = z.string({ error: SKU_AND_NAME_REQUIRED }).trim().min(1, SKU_AND_NAME_REQUIRED).max(120, 'ชื่อสินค้ายาวเกินไป (ไม่เกิน 120 ตัวอักษร)')
/** May be empty (the wizard quick-add leaves them blank). */
const zBrand = z.string({ error: 'แบรนด์ไม่ถูกต้อง' }).trim().max(60, 'ชื่อแบรนด์ยาวเกินไป')
const zCategory = z.string({ error: 'หมวดหมู่ไม่ถูกต้อง' }).trim().max(60, 'ชื่อหมวดหมู่ยาวเกินไป')
/** Empty string → null (normalised in the service). */
const zBarcode = z.string({ error: 'บาร์โค้ดไม่ถูกต้อง' }).trim().max(30, 'บาร์โค้ดยาวเกินไป (ไม่เกิน 30 ตัวอักษร)').nullable()
const zSize = z.string({ error: 'ขนาดไม่ถูกต้อง' }).trim().max(30, 'ขนาดยาวเกินไป (ไม่เกิน 30 ตัวอักษร)').nullable()

export const listProductsQuery = z.object({
  q: z.string({ error: 'คำค้นหาไม่ถูกต้อง' }).max(200, 'คำค้นหายาวเกินไป').optional(),
  includeInactive: zBoolQuery,
})
export type ListProductsQuery = z.output<typeof listProductsQuery>

export const createProductSchema = z.object(
  {
    sku: zSku,
    name: zName,
    brand: zBrand.optional(),
    category: zCategory.optional(),
    barcode: zBarcode.optional(),
    size: zSize.optional(),
  },
  { error: 'ข้อมูลไม่ถูกต้อง' },
)
export type CreateProductBody = z.output<typeof createProductSchema>

export const updateProductSchema = z.object(
  {
    sku: zSku.optional(),
    name: zName.optional(),
    brand: zBrand.optional(),
    category: zCategory.optional(),
    barcode: zBarcode.optional(),
    size: zSize.optional(),
    isActive: z.boolean({ error: 'สถานะการใช้งานไม่ถูกต้อง' }).optional(),
  },
  { error: 'ข้อมูลไม่ถูกต้อง' },
)
export type UpdateProductBody = z.output<typeof updateProductSchema>
