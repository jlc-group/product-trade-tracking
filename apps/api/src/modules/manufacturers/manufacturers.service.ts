import { Injectable } from '@nestjs/common'
import type { Manufacturer, User } from '@flowtrade/shared'
import { ActivityService } from '../../common/activity.service.js'
import { conflict, invalid, notFound } from '../../common/errors.js'
import { toManufacturer } from '../../common/mappers.js'
import { Prisma } from '../../generated/prisma/client.js'
import { PrismaService, type Db } from '../../prisma/prisma.service.js'
import { normalizeManufacturerName, type CreateManufacturerBody, type UpdateManufacturerBody } from './manufacturers.schemas.js'

// Every change is written to the activity log (entity type MANUFACTURER) in the same transaction. Production orders
// embed the name they show, so a rename or a deactivation is seen on old orders at once.

const DUPLICATE_NAME = 'มีบริษัทชื่อนี้อยู่แล้ว'
/** The confirm dialog's inline add can't see inactive rows: say who can bring it back. */
const DUPLICATE_INACTIVE = 'มีบริษัทชื่อนี้อยู่แล้วแต่ถูกปิดใช้งาน — ให้ผู้ดูแลเปิดใช้งานในหน้าบริษัทรับผลิต'

const isPrismaError = (e: unknown, code: string) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === code

const duplicate = (existingActive: boolean) => {
  const message = existingActive ? DUPLICATE_NAME : DUPLICATE_INACTIVE
  return invalid(message, { name: message })
}

const inUse = () => conflict('ลบไม่ได้ เพราะมีใบสั่งผลิตใช้บริษัทนี้อยู่ — ปิดการใช้งานแทนได้', 'IN_USE')

const ORDER: Prisma.ManufacturerOrderByWithRelationInput[] = [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }]

@Injectable()
export class ManufacturersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  /** Ordered by sortOrder (admin-defined). */
  async list(includeInactive: boolean): Promise<Manufacturer[]> {
    const rows = await this.prisma.manufacturer.findMany({ where: includeInactive ? {} : { isActive: true }, orderBy: ORDER })
    return rows.map(toManufacturer)
  }

  /** { [manufacturerId]: number of proposals with a production order naming it } — every manufacturer appears, 0 when unused. */
  async usage(): Promise<Record<string, number>> {
    const [manufacturers, pairs] = await Promise.all([
      this.prisma.manufacturer.findMany({ select: { id: true } }),
      // One row per (manufacturer, proposal): a proposal counts once however many of its orders name it.
      this.prisma.productionOrder.groupBy({ by: ['manufacturerId', 'proposalId'] }),
    ])
    const counts = new Map<string, number>()
    for (const p of pairs) counts.set(p.manufacturerId, (counts.get(p.manufacturerId) ?? 0) + 1)
    return Object.fromEntries(manufacturers.map((m) => [m.id, counts.get(m.id) ?? 0]))
  }

  /** New manufacturers go last. Admins (manufacturer.manage) and the confirm dialog's inline add both come here. */
  async create(actor: User, input: CreateManufacturerBody): Promise<Manufacturer> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.assertUniqueName(tx, input.name)
        const max = await tx.manufacturer.aggregate({ _max: { sortOrder: true } })
        const row = await tx.manufacturer.create({
          data: { name: input.name, note: input.note || null, sortOrder: Math.max(0, max._max.sortOrder ?? 0) + 1 },
        })
        await this.activity.log(tx, actor, 'manufacturer.create', 'MANUFACTURER', row.id, null, `เพิ่มบริษัทรับผลิต “${row.name}”`)
        return toManufacturer(row)
      })
    } catch (e) {
      throw await this.mapDuplicate(e, input.name)
    }
  }

  /**
   * Rename, note and/or (de)activate; nothing changed writes nothing. Deactivating keeps the manufacturer on the
   * orders that already name it, but it can no longer be newly picked.
   */
  async update(actor: User, id: string, patch: UpdateManufacturerBody): Promise<Manufacturer> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.manufacturer.findUnique({ where: { id } })
        if (!current) throw notFound('บริษัทรับผลิต')
        const rename = patch.name !== undefined && patch.name !== current.name
        const note = patch.note === undefined ? current.note : patch.note || null
        const noteChanged = note !== current.note
        const activeChanged = patch.isActive !== undefined && patch.isActive !== current.isActive
        if (!rename && !noteChanged && !activeChanged) return toManufacturer(current)
        if (rename) await this.assertUniqueName(tx, patch.name!, id)
        const row = await tx.manufacturer.update({
          where: { id },
          data: { name: rename ? patch.name : undefined, note: noteChanged ? note : undefined, isActive: activeChanged ? patch.isActive : undefined },
        })
        const changes: string[] = []
        if (rename) changes.push(`เปลี่ยนชื่อบริษัทรับผลิต “${current.name}” เป็น “${row.name}”`)
        if (noteChanged) changes.push(`แก้หมายเหตุบริษัทรับผลิต “${row.name}”`)
        if (activeChanged) changes.push(`${row.isActive ? 'เปิด' : 'ปิด'}การใช้งานบริษัทรับผลิต “${row.name}”`)
        await this.activity.log(tx, actor, 'manufacturer.update', 'MANUFACTURER', row.id, null, changes.join(' และ'))
        return toManufacturer(row)
      })
    } catch (e) {
      throw await this.mapDuplicate(e, patch.name, id)
    }
  }

  /** 409 IN_USE while any production order names it (FK ON DELETE RESTRICT). */
  async remove(actor: User, id: string): Promise<true> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const manufacturer = await tx.manufacturer.findUnique({ where: { id } })
        if (!manufacturer) throw notFound('บริษัทรับผลิต')
        if ((await tx.productionOrder.count({ where: { manufacturerId: id } })) > 0) throw inUse()
        await tx.manufacturer.delete({ where: { id } })
        await this.activity.log(tx, actor, 'manufacturer.delete', 'MANUFACTURER', id, null, `ลบบริษัทรับผลิต “${manufacturer.name}”`)
      })
    } catch (e) {
      // An order named it between the count and the delete (FK RESTRICT).
      if (isPrismaError(e, 'P2003')) throw inUse()
      throw e
    }
    return true
  }

  /** sortOrder = position + 1 for the given ids; unknown ids are ignored. */
  async reorder(actor: User, ids: string[]): Promise<true> {
    await this.prisma.$transaction(async (tx) => {
      for (const [index, id] of ids.entries()) {
        await tx.manufacturer.updateMany({ where: { id }, data: { sortOrder: index + 1 } })
      }
      await this.activity.log(tx, actor, 'manufacturer.reorder', 'MANUFACTURER', ids[0] ?? '', null, 'จัดลำดับบริษัทรับผลิต')
    })
    return true
  }

  /** Another manufacturer with this name ignoring case, active or not (compared in JS so "_" / "%" are never wildcards). */
  private async sameName(db: Db, name: string, exceptId?: string) {
    const rows = await db.manufacturer.findMany({ where: exceptId ? { id: { not: exceptId } } : {}, select: { name: true, isActive: true } })
    const needle = normalizeManufacturerName(name).toLowerCase()
    return rows.find((r) => normalizeManufacturerName(r.name).toLowerCase() === needle) ?? null
  }

  private async assertUniqueName(db: Db, name: string, exceptId?: string) {
    const other = await this.sameName(db, name, exceptId)
    if (other) throw duplicate(other.isActive)
  }

  /** The unique index on lower(name) is the backstop for concurrent writes: answer as assertUniqueName would. */
  private async mapDuplicate(e: unknown, name: string | undefined, exceptId?: string): Promise<unknown> {
    if (!isPrismaError(e, 'P2002')) return e
    const other = name === undefined ? null : await this.sameName(this.prisma, name, exceptId)
    return duplicate(other?.isActive ?? true)
  }
}
