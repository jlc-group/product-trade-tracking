import { Injectable } from '@nestjs/common'
import type { Channel, Store, User } from '@flowtrade/shared'
import { ActivityService } from '../../common/activity.service.js'
import { conflict, invalid, notFound } from '../../common/errors.js'
import { toStore } from '../../common/mappers.js'
import { config } from '../../config.js'
import { Prisma } from '../../generated/prisma/client.js'
import { PrismaService, type Db } from '../../prisma/prisma.service.js'
import type { CreateStoreBody, UpdateStoreBody } from './stores.schemas.js'

const DUPLICATE_NAME = 'มีชื่อนี้อยู่แล้ว'

/** Schema-qualified table name for raw SQL (schema from config, never from input). */
const table = (name: string) => Prisma.raw(`"${config.dbSchema.replaceAll('"', '""')}"."${name}"`)

const isPrismaError = (e: unknown, code: string) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === code

/** The case-insensitive unique index (channel, lower(name)) is the backstop for concurrent writes. */
function mapDuplicate(e: unknown): unknown {
  return isPrismaError(e, 'P2002') ? invalid(DUPLICATE_NAME, { name: DUPLICATE_NAME }) : e
}

const inUse = (used: number, name: string) => conflict(`ลบไม่ได้ เพราะมีการเสนอสินค้า ${used} รายการใช้ ${name} อยู่ — ปิดการใช้งานแทนได้`, 'IN_USE')

/** Proposals that list the store, or keep a presentation track of it after it left the proposal (FK RESTRICT on both). */
const usedBy = (db: Db, storeId: string) =>
  db.proposal.count({ where: { OR: [{ stores: { some: { storeId } } }, { presentationTracks: { some: { storeId } } }] } })

@Injectable()
export class StoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  /** Sorted by channel (OFFLINE, ONLINE) then sortOrder. */
  async list(includeInactive: boolean): Promise<Store[]> {
    const rows = await this.prisma.store.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ channel: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    })
    return rows.map(toStore)
  }

  /**
   * { [storeId]: number of proposals } — only stores that are referenced appear. Counts what usedBy() counts (the
   * delete guard): proposals that list the store or keep a presentation track of it, each proposal once.
   */
  async usage(): Promise<Record<string, number>> {
    // Counted in the database: one row per store, however many proposals there are.
    const rows = await this.prisma.$queryRaw<{ store_id: string; n: number }[]>`
      SELECT u.store_id::text AS store_id, COUNT(DISTINCT u.proposal_id)::int AS n
      FROM (SELECT store_id, proposal_id FROM ${table('proposal_stores')}
            UNION ALL
            SELECT store_id, proposal_id FROM ${table('presentation_tracks')}) u
      GROUP BY u.store_id`
    return Object.fromEntries(rows.map((r) => [r.store_id, r.n]))
  }

  async create(actor: User, input: CreateStoreBody): Promise<Store> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const name = input.name
        await this.assertUniqueName(tx, input.channel, name)
        const max = await tx.store.aggregate({ where: { channel: input.channel }, _max: { sortOrder: true } })
        const row = await tx.store.create({
          data: {
            name,
            shortName: input.shortName || name.slice(0, 5),
            channel: input.channel,
            color: input.color,
            description: input.description || null,
            sortOrder: Math.max(0, max._max.sortOrder ?? 0) + 1,
          },
        })
        await this.activity.log(tx, actor, 'store.create', 'STORE', row.id, null, `เพิ่ม${row.channel === 'OFFLINE' ? 'ห้าง' : 'แพลตฟอร์ม'} ${row.name}`)
        return toStore(row)
      })
    } catch (e) {
      throw mapDuplicate(e)
    }
  }

  async update(actor: User, id: string, patch: UpdateStoreBody): Promise<Store> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const store = await tx.store.findUnique({ where: { id } })
        if (!store) throw notFound('ห้าง')
        const channel = patch.channel ?? store.channel
        if (channel !== store.channel && (await tx.proposalStore.count({ where: { storeId: id } })) > 0) {
          throw invalid('เปลี่ยนช่องทางไม่ได้ เพราะมีการเสนอสินค้าที่ใช้ห้างนี้อยู่', { channel: 'เปลี่ยนช่องทางไม่ได้ เพราะมีการเสนอสินค้าที่ใช้ห้างนี้อยู่' })
        }
        const name = patch.name ?? store.name
        if (patch.name !== undefined || channel !== store.channel) await this.assertUniqueName(tx, channel, name, id)
        const row = await tx.store.update({
          where: { id },
          data: {
            name: patch.name,
            shortName: patch.shortName === undefined ? undefined : patch.shortName || name.slice(0, 5),
            channel: patch.channel,
            color: patch.color,
            description: patch.description === undefined ? undefined : patch.description || null,
            isActive: patch.isActive,
          },
        })
        await this.activity.log(tx, actor, 'store.update', 'STORE', row.id, null, `แก้ไข ${row.name}`)
        return toStore(row)
      })
    } catch (e) {
      throw mapDuplicate(e)
    }
  }

  /** 409 IN_USE while any proposal references the store (or its presentation track). Templates scoped to it fall back to "every store" (FK SET NULL). */
  async remove(actor: User, id: string): Promise<true> {
    let name = ''
    try {
      await this.prisma.$transaction(async (tx) => {
        const store = await tx.store.findUnique({ where: { id } })
        if (!store) throw notFound('ห้าง')
        name = store.name
        const used = await usedBy(tx, id)
        if (used > 0) throw inUse(used, store.name)
        await tx.store.delete({ where: { id } })
        await this.activity.log(tx, actor, 'store.delete', 'STORE', id, null, `ลบ ${store.name}`)
      })
    } catch (e) {
      // A proposal was created between the count and the delete (FK RESTRICT).
      if (isPrismaError(e, 'P2003')) throw inUse(await usedBy(this.prisma, id), name)
      throw e
    }
    return true
  }

  /** sortOrder = position + 1 for the given ids; unknown ids are ignored. */
  async reorder(ids: string[]): Promise<true> {
    await this.prisma.$transaction(async (tx) => {
      for (const [index, id] of ids.entries()) {
        await tx.store.updateMany({ where: { id }, data: { sortOrder: index + 1 } })
      }
    })
    return true
  }

  /** Case-insensitive name check within a channel. */
  private async assertUniqueName(db: Db, channel: Channel, name: string, exceptId?: string) {
    const rows = await db.store.findMany({ where: { channel, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { name: true } })
    const needle = name.toLowerCase()
    if (rows.some((r) => r.name.toLowerCase() === needle)) throw invalid(DUPLICATE_NAME, { name: DUPLICATE_NAME })
  }
}
