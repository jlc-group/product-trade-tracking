import { Injectable } from '@nestjs/common'
import type { Channel, ShelfType, User } from '@flowtrade/shared'
import { ActivityService } from '../../common/activity.service.js'
import { conflict, invalid, notFound } from '../../common/errors.js'
import { toShelfType } from '../../common/mappers.js'
import { Prisma } from '../../generated/prisma/client.js'
import { PrismaService, type Db } from '../../prisma/prisma.service.js'
import type { CreateShelfTypeBody, UpdateShelfTypeBody } from './shelf-types.schemas.js'

const DUPLICATE_NAME = 'มีชื่อนี้อยู่แล้ว'
const NOT_FOUND = 'ประเภท Shelf'

const isPrismaError = (e: unknown, code: string) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === code

/** The case-insensitive unique index (channel, lower(name)) is the backstop for concurrent writes. */
function mapDuplicate(e: unknown): unknown {
  return isPrismaError(e, 'P2002') ? invalid(DUPLICATE_NAME, { name: DUPLICATE_NAME }) : e
}

const inUse = (used: number) => conflict(`ลบไม่ได้ เพราะมีการเสนอสินค้า ${used} รายการใช้ประเภทนี้อยู่ — ปิดการใช้งานแทนได้`, 'IN_USE')

@Injectable()
export class ShelfTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  /** Sorted by channel (OFFLINE, ONLINE) then sortOrder. */
  async list(includeInactive: boolean): Promise<ShelfType[]> {
    const rows = await this.prisma.shelfType.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ channel: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    })
    return rows.map(toShelfType)
  }

  /** { [shelfTypeId]: number of proposals } — only referenced shelf types appear. */
  async usage(): Promise<Record<string, number>> {
    const groups = await this.prisma.proposal.groupBy({ by: ['shelfTypeId'], _count: { _all: true } })
    return Object.fromEntries(groups.map((g) => [g.shelfTypeId, g._count._all]))
  }

  async create(actor: User, input: CreateShelfTypeBody): Promise<ShelfType> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.assertUniqueName(tx, input.channel, input.name)
        const max = await tx.shelfType.aggregate({ where: { channel: input.channel }, _max: { sortOrder: true } })
        const row = await tx.shelfType.create({
          data: {
            name: input.name,
            channel: input.channel,
            color: input.color,
            description: input.description || null,
            sortOrder: Math.max(0, max._max.sortOrder ?? 0) + 1,
          },
        })
        await this.activity.log(tx, actor, 'shelfType.create', 'SHELF_TYPE', row.id, null, `เพิ่มประเภท Shelf ${row.name}`)
        return toShelfType(row)
      })
    } catch (e) {
      throw mapDuplicate(e)
    }
  }

  async update(actor: User, id: string, patch: UpdateShelfTypeBody): Promise<ShelfType> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const shelf = await tx.shelfType.findUnique({ where: { id } })
        if (!shelf) throw notFound(NOT_FOUND)
        const channel = patch.channel ?? shelf.channel
        if (channel !== shelf.channel && (await tx.proposal.count({ where: { shelfTypeId: id } })) > 0) {
          throw invalid('เปลี่ยนช่องทางไม่ได้ เพราะมีการเสนอสินค้าที่ใช้ประเภทนี้อยู่', { channel: 'เปลี่ยนช่องทางไม่ได้ เพราะมีการเสนอสินค้าที่ใช้ประเภทนี้อยู่' })
        }
        if (patch.name !== undefined || channel !== shelf.channel) await this.assertUniqueName(tx, channel, patch.name ?? shelf.name, id)
        const row = await tx.shelfType.update({
          where: { id },
          data: {
            name: patch.name,
            channel: patch.channel,
            color: patch.color,
            description: patch.description === undefined ? undefined : patch.description || null,
            isActive: patch.isActive,
          },
        })
        await this.activity.log(tx, actor, 'shelfType.update', 'SHELF_TYPE', row.id, null, `แก้ไขประเภท Shelf ${row.name}`)
        return toShelfType(row)
      })
    } catch (e) {
      throw mapDuplicate(e)
    }
  }

  /** 409 IN_USE while referenced by proposals; templates scoped to it become "every shelf type". */
  async remove(actor: User, id: string): Promise<true> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const shelf = await tx.shelfType.findUnique({ where: { id } })
        if (!shelf) throw notFound(NOT_FOUND)
        const used = await tx.proposal.count({ where: { shelfTypeId: id } })
        if (used > 0) throw inUse(used)
        await tx.taskTemplate.updateMany({ where: { shelfTypeId: id }, data: { shelfTypeId: null } })
        await tx.shelfType.delete({ where: { id } })
        await this.activity.log(tx, actor, 'shelfType.delete', 'SHELF_TYPE', id, null, `ลบประเภท Shelf ${shelf.name}`)
      })
    } catch (e) {
      // A proposal was created between the count and the delete (FK RESTRICT).
      if (isPrismaError(e, 'P2003')) throw inUse(await this.prisma.proposal.count({ where: { shelfTypeId: id } }))
      throw e
    }
    return true
  }

  /** sortOrder = position + 1 for the given ids; unknown ids are ignored. */
  async reorder(ids: string[]): Promise<true> {
    await this.prisma.$transaction(async (tx) => {
      for (const [index, id] of ids.entries()) {
        await tx.shelfType.updateMany({ where: { id }, data: { sortOrder: index + 1 } })
      }
    })
    return true
  }

  /** Case-insensitive name check within a channel. */
  private async assertUniqueName(db: Db, channel: Channel, name: string, exceptId?: string) {
    const rows = await db.shelfType.findMany({ where: { channel, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { name: true } })
    const needle = name.toLowerCase()
    if (rows.some((r) => r.name.toLowerCase() === needle)) throw invalid(DUPLICATE_NAME, { name: DUPLICATE_NAME })
  }
}
