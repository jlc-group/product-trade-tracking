import { Injectable } from '@nestjs/common'
import type { Product, User } from '@flowtrade/shared'
import { ActivityService } from '../../common/activity.service.js'
import { conflict, invalid, notFound } from '../../common/errors.js'
import { toProduct } from '../../common/mappers.js'
import { Prisma } from '../../generated/prisma/client.js'
import { PrismaService } from '../../prisma/prisma.service.js'
import type { CreateProductBody, UpdateProductBody } from './products.schemas.js'

const DUPLICATE_SKU = 'รหัสสินค้า (SKU) นี้มีอยู่แล้ว'

const isPrismaError = (e: unknown, code: string) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === code

/** The unique index on sku is the backstop for concurrent writes. */
function mapDuplicate(e: unknown): unknown {
  return isPrismaError(e, 'P2002') ? invalid(DUPLICATE_SKU, { sku: DUPLICATE_SKU }) : e
}

const inUse = (used: number) => conflict(`ลบไม่ได้ เพราะสินค้านี้อยู่ในการเสนอ ${used} รายการ — ปิดการใช้งานแทนได้`, 'IN_USE')

/** trimmed, lower-cased substring over any field. */
function matchesQuery(q: string, ...fields: (string | null | undefined)[]) {
  const needle = q.trim().toLowerCase()
  return !needle || fields.some((f) => f?.toLowerCase().includes(needle))
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  /** Search name/sku/brand/category/barcode (case-insensitive); sorted by brand, then Thai name. */
  async list(q: string, includeInactive: boolean): Promise<Product[]> {
    const needle = q.trim()
    const contains = { contains: needle, mode: 'insensitive' } as const
    const rows = await this.prisma.product.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        ...(needle ? { OR: [{ name: contains }, { sku: contains }, { brand: contains }, { category: contains }, { barcode: contains }] } : {}),
      },
    })
    // Re-check in memory so LIKE wildcards (% _) in the query never widen the result.
    return rows
      .filter((p) => matchesQuery(needle, p.name, p.sku, p.brand, p.category, p.barcode))
      .sort((a, b) => a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name, 'th'))
      .map(toProduct)
  }

  async create(actor: User, input: CreateProductBody): Promise<Product> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (await tx.product.findUnique({ where: { sku: input.sku }, select: { id: true } })) throw invalid(DUPLICATE_SKU, { sku: DUPLICATE_SKU })
        const row = await tx.product.create({
          data: {
            sku: input.sku,
            name: input.name,
            brand: input.brand ?? '',
            category: input.category ?? '',
            barcode: input.barcode || null,
            size: input.size || null,
          },
        })
        await this.activity.log(tx, actor, 'product.create', 'PRODUCT', row.id, null, `เพิ่มสินค้า ${row.sku} ${row.name}`)
        return toProduct(row)
      })
    } catch (e) {
      throw mapDuplicate(e)
    }
  }

  async update(actor: User, id: string, patch: UpdateProductBody): Promise<Product> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const product = await tx.product.findUnique({ where: { id } })
        if (!product) throw notFound('สินค้า')
        if (patch.sku !== undefined && patch.sku !== product.sku) {
          if (await tx.product.findFirst({ where: { sku: patch.sku, id: { not: id } }, select: { id: true } })) throw invalid(DUPLICATE_SKU, { sku: DUPLICATE_SKU })
        }
        const row = await tx.product.update({
          where: { id },
          data: {
            sku: patch.sku,
            name: patch.name,
            brand: patch.brand,
            category: patch.category,
            barcode: patch.barcode === undefined ? undefined : patch.barcode || null,
            size: patch.size === undefined ? undefined : patch.size || null,
            isActive: patch.isActive,
          },
        })
        await this.activity.log(tx, actor, 'product.update', 'PRODUCT', row.id, null, `แก้ไขสินค้า ${row.sku}`)
        return toProduct(row)
      })
    } catch (e) {
      throw mapDuplicate(e)
    }
  }

  /** 409 IN_USE while any proposal lists the product. */
  async remove(actor: User, id: string): Promise<true> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const product = await tx.product.findUnique({ where: { id } })
        if (!product) throw notFound('สินค้า')
        const used = await tx.proposalProduct.count({ where: { productId: id } })
        if (used > 0) throw inUse(used)
        await tx.product.delete({ where: { id } })
        await this.activity.log(tx, actor, 'product.delete', 'PRODUCT', id, null, `ลบสินค้า ${product.sku}`)
      })
    } catch (e) {
      // A proposal picked the product between the count and the delete (FK RESTRICT).
      if (isPrismaError(e, 'P2003')) throw inUse(await this.prisma.proposalProduct.count({ where: { productId: id } }))
      throw e
    }
    return true
  }
}
